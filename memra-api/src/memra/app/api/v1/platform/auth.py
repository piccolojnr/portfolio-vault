"""
Platform Admin Auth Router
===========================

POST /auth/login, /auth/refresh, /auth/logout, /auth/change-password
GET  /auth/me
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from memra.app.core.config import Settings, get_settings
from memra.app.core.db import get_db_conn
from memra.app.core.platform_auth import (
    check_login_rate_limit,
    clear_login_attempts,
    create_admin_access_token,
    create_admin_refresh_token,
    get_platform_admin,
    hash_token,
    record_failed_login,
)
from memra.infrastructure.db.models.admin_refresh_token import AdminRefreshToken
from memra.infrastructure.db.models.platform_admin import PlatformAdmin

router = APIRouter(prefix="/auth", tags=["platform-admin-auth"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]


class LoginRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


def _set_admin_refresh_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        key="admin_refresh_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.admin_jwt_refresh_expiry_days * 86400,
        path="/",
    )


def _delete_admin_refresh_cookie(response: Response) -> None:
    response.delete_cookie("admin_refresh_token", path="/")


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/login")
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    session: DBSession,
    settings: Settings = Depends(get_settings),
):
    ip = _get_client_ip(request)
    check_login_rate_limit(ip)

    admin = (
        await session.execute(
            select(PlatformAdmin).where(PlatformAdmin.email == body.email)
        )
    ).scalars().first()

    if admin is None or not bcrypt.checkpw(
        body.password.encode(), admin.password_hash.encode()
    ):
        record_failed_login(ip)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    clear_login_attempts(ip)

    # Update last_login_at
    admin.last_login_at = datetime.now(timezone.utc)
    session.add(admin)

    # Issue tokens
    access_token = create_admin_access_token(
        str(admin.id), admin.email, admin.name, settings
    )
    raw_refresh, refresh_hash = create_admin_refresh_token()
    refresh_expires = datetime.now(timezone.utc) + timedelta(
        days=settings.admin_jwt_refresh_expiry_days
    )
    refresh_row = AdminRefreshToken(
        admin_id=admin.id,
        token_hash=refresh_hash,
        expires_at=refresh_expires,
        ip_address=ip,
    )
    session.add(refresh_row)
    await session.commit()

    _set_admin_refresh_cookie(response, raw_refresh, settings)

    result: dict = {"access_token": access_token}
    if admin.must_change_password:
        result["must_change_password"] = True
    return result


@router.post("/refresh")
async def refresh_tokens(
    response: Response,
    session: DBSession,
    settings: Settings = Depends(get_settings),
    admin_refresh_token: str | None = Cookie(default=None),
):
    if not admin_refresh_token:
        raise HTTPException(status_code=401, detail="Missing admin refresh token")

    token_hash = hash_token(admin_refresh_token)
    row = (
        await session.execute(
            select(AdminRefreshToken).where(
                AdminRefreshToken.token_hash == token_hash,
                AdminRefreshToken.revoked == False,
            )
        )
    ).scalars().first()

    if row is None or row.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    # Revoke old token
    row.revoked = True
    session.add(row)

    # Load admin
    admin = await session.get(PlatformAdmin, row.admin_id)
    if admin is None:
        raise HTTPException(status_code=401, detail="Admin not found")

    # Issue new pair
    access_token = create_admin_access_token(
        str(admin.id), admin.email, admin.name, settings
    )
    new_raw, new_hash = create_admin_refresh_token()
    new_refresh = AdminRefreshToken(
        admin_id=admin.id,
        token_hash=new_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.admin_jwt_refresh_expiry_days),
    )
    session.add(new_refresh)
    await session.commit()

    _set_admin_refresh_cookie(response, new_raw, settings)
    return {"access_token": access_token}


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    session: DBSession,
    admin_refresh_token: str | None = Cookie(default=None),
):
    if admin_refresh_token:
        token_hash = hash_token(admin_refresh_token)
        row = (
            await session.execute(
                select(AdminRefreshToken).where(
                    AdminRefreshToken.token_hash == token_hash
                )
            )
        ).scalars().first()
        if row:
            row.revoked = True
            session.add(row)
            await session.commit()

    _delete_admin_refresh_cookie(response)


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    session: DBSession,
    current_admin: dict = Depends(get_platform_admin),
):
    import uuid

    admin = await session.get(PlatformAdmin, uuid.UUID(current_admin["sub"]))
    if admin is None:
        raise HTTPException(status_code=404, detail="Admin not found")

    if not bcrypt.checkpw(body.current_password.encode(), admin.password_hash.encode()):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    admin.password_hash = bcrypt.hashpw(
        body.new_password.encode(), bcrypt.gensalt(12)
    ).decode()
    admin.must_change_password = False
    session.add(admin)
    await session.commit()

    return {"message": "Password updated"}


@router.get("/me")
async def me(
    session: DBSession,
    current_admin: dict = Depends(get_platform_admin),
):
    import uuid

    admin = await session.get(PlatformAdmin, uuid.UUID(current_admin["sub"]))
    if admin is None:
        raise HTTPException(status_code=404, detail="Admin not found")

    return {
        "admin_id": str(admin.id),
        "email": admin.email,
        "name": admin.name,
        "last_login_at": admin.last_login_at.isoformat() if admin.last_login_at else None,
        "must_change_password": admin.must_change_password,
    }
