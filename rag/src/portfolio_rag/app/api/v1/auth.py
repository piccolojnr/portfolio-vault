"""
Auth Router
===========

Thin HTTP layer over domain/services/auth_service.
All business logic lives in auth_service.

Prefix: /auth
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from portfolio_rag.app.core.db import get_db_conn
from portfolio_rag.app.core.dependencies import get_current_user, get_live_settings
from portfolio_rag.domain.models.auth import (
    LoginRequest,
    MagicLinkRequest,
    MeResponse,
    OnboardingRequest,
    OrgRead,
    RegisterRequest,
    ResetPasswordRequest,
    SwitchOrgRequest,
    TokenResponse,
    UserRead,
    VerifyTokenRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]


# ── Cookie helper ──────────────────────────────────────────────────────────────

def _set_refresh_cookie(response: Response, token: str, settings) -> None:
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=settings.jwt_refresh_expiry_days * 86400,
        path="/api/v1/auth",
    )


def _delete_refresh_cookie(response: Response) -> None:
    response.delete_cookie("refresh_token", path="/api/v1/auth")


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(
    body: RegisterRequest,
    response: Response,
    session: DBSession,
    settings=Depends(get_live_settings),
):
    from portfolio_rag.domain.services.auth_service import register as svc_register

    try:
        user, access_token, refresh_raw = await svc_register(
            session, body.email, body.password, settings
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    _set_refresh_cookie(response, refresh_raw, settings)
    return TokenResponse(access_token=access_token)


@router.post("/verify-email")
async def verify_email(
    body: VerifyTokenRequest,
    session: DBSession,
    settings=Depends(get_live_settings),
):
    from portfolio_rag.domain.services.auth_service import verify_email as svc_verify

    try:
        await svc_verify(session, body.token, settings)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"message": "Email verified"}


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    response: Response,
    session: DBSession,
    settings=Depends(get_live_settings),
):
    from portfolio_rag.domain.services.auth_service import login as svc_login

    try:
        access_token, refresh_raw = await svc_login(
            session, body.email, body.password, settings
        )
    except (LookupError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    _set_refresh_cookie(response, refresh_raw, settings)
    return TokenResponse(access_token=access_token)


@router.post("/magic-link")
async def request_magic_link(
    body: MagicLinkRequest,
    session: DBSession,
    settings=Depends(get_live_settings),
):
    from portfolio_rag.domain.services.auth_service import send_magic_link

    try:
        await send_magic_link(session, body.email, settings)
    except ValueError as exc:
        raise HTTPException(status_code=429, detail=str(exc))

    return {"message": "If that address exists, a magic link has been sent"}


@router.post("/magic-link/verify", response_model=TokenResponse)
async def verify_magic_link(
    body: VerifyTokenRequest,
    response: Response,
    session: DBSession,
    settings=Depends(get_live_settings),
):
    from portfolio_rag.domain.services.auth_service import verify_magic_link as svc_verify

    try:
        _user, access_token, refresh_raw = await svc_verify(session, body.token, settings)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    _set_refresh_cookie(response, refresh_raw, settings)
    return TokenResponse(access_token=access_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(
    response: Response,
    session: DBSession,
    settings=Depends(get_live_settings),
    refresh_token: str | None = Cookie(default=None),
):
    from portfolio_rag.domain.services.auth_service import refresh as svc_refresh

    if not refresh_token:
        raise HTTPException(status_code=401, detail="Missing refresh token cookie")

    try:
        access_token, new_refresh_raw = await svc_refresh(session, refresh_token, settings)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    _set_refresh_cookie(response, new_refresh_raw, settings)
    return TokenResponse(access_token=access_token)


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    session: DBSession,
    refresh_token: str | None = Cookie(default=None),
):
    from portfolio_rag.domain.services.auth_service import logout as svc_logout

    if refresh_token:
        await svc_logout(session, refresh_token)

    _delete_refresh_cookie(response)


@router.post("/logout-all", status_code=204)
async def logout_all(
    response: Response,
    session: DBSession,
    current_user: dict = Depends(get_current_user),
):
    from portfolio_rag.domain.services.auth_service import logout_all as svc_logout_all

    await svc_logout_all(session, current_user["sub"])
    _delete_refresh_cookie(response)


@router.post("/password-reset")
async def request_password_reset(
    body: MagicLinkRequest,
    session: DBSession,
    settings=Depends(get_live_settings),
):
    from portfolio_rag.domain.services.auth_service import send_password_reset

    await send_password_reset(session, body.email, settings)
    return {"message": "If that address exists, a reset link has been sent"}


@router.post("/password-reset/confirm")
async def confirm_password_reset(
    body: ResetPasswordRequest,
    session: DBSession,
):
    from portfolio_rag.domain.services.auth_service import reset_password

    try:
        await reset_password(session, body.token, body.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"message": "Password updated"}


@router.get("/me", response_model=MeResponse)
async def me(
    session: DBSession,
    current_user: dict = Depends(get_current_user),
):
    import uuid as _uuid
    from sqlmodel import select
    from portfolio_rag.infrastructure.db.models.user import User
    from portfolio_rag.infrastructure.db.models.org import Organisation, OrganisationMember

    user_id = _uuid.UUID(current_user["sub"])
    org_id_str = current_user.get("org_id", "")

    user = (
        await session.execute(select(User).where(User.id == user_id))
    ).scalars().first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    org = None
    role = current_user.get("role", "member")
    if org_id_str:
        try:
            org_uuid = _uuid.UUID(org_id_str)
            org = (
                await session.execute(
                    select(Organisation).where(Organisation.id == org_uuid)
                )
            ).scalars().first()
        except (ValueError, Exception):
            pass

    if org is None:
        raise HTTPException(status_code=404, detail="Organisation not found")

    return MeResponse(
        user=UserRead(
            id=str(user.id),
            email=user.email,
            email_verified=user.email_verified,
            onboarding_completed_at=user.onboarding_completed_at,
            created_at=user.created_at,
        ),
        org=OrgRead(
            id=str(org.id),
            name=org.name,
            slug=org.slug,
            plan=org.plan,
            role=role,
        ),
    )


@router.post("/switch-org", response_model=TokenResponse)
async def switch_org(
    body: SwitchOrgRequest,
    response: Response,
    session: DBSession,
    settings=Depends(get_live_settings),
    current_user: dict = Depends(get_current_user),
):
    import uuid as _uuid
    from sqlmodel import select
    from portfolio_rag.app.core.security import create_access_token
    from portfolio_rag.infrastructure.db.models.org import OrganisationMember

    try:
        org_uuid = _uuid.UUID(body.org_id)
        user_uuid = _uuid.UUID(current_user["sub"])
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid org_id")

    member = (
        await session.execute(
            select(OrganisationMember).where(
                OrganisationMember.user_id == user_uuid,
                OrganisationMember.org_id == org_uuid,
            )
        )
    ).scalars().first()

    if member is None:
        raise HTTPException(status_code=403, detail="Not a member of that organisation")

    access_token = create_access_token(
        current_user["sub"],
        str(org_uuid),
        member.role,
        current_user["email"],
        settings,
    )
    return TokenResponse(access_token=access_token)


@router.patch("/onboarding", response_model=MeResponse)
async def complete_onboarding(
    body: OnboardingRequest,
    session: DBSession,
    settings=Depends(get_live_settings),
    current_user: dict = Depends(get_current_user),
):
    import uuid as _uuid
    from sqlmodel import select
    from portfolio_rag.infrastructure.db.models.user import User
    from portfolio_rag.infrastructure.db.models.org import Organisation
    from portfolio_rag.infrastructure.db.models.base import utcnow

    user_id = _uuid.UUID(current_user["sub"])
    org_id_str = current_user.get("org_id", "")

    user = (
        await session.execute(select(User).where(User.id == user_id))
    ).scalars().first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user.use_case = body.use_case
    user.onboarding_completed_at = utcnow()
    user.updated_at = utcnow()
    session.add(user)
    await session.commit()
    await session.refresh(user)

    org = None
    role = current_user.get("role", "member")
    if org_id_str:
        try:
            org_uuid = _uuid.UUID(org_id_str)
            org = (
                await session.execute(
                    select(Organisation).where(Organisation.id == org_uuid)
                )
            ).scalars().first()
        except (ValueError, Exception):
            pass

    if org is None:
        raise HTTPException(status_code=404, detail="Organisation not found")

    return MeResponse(
        user=UserRead(
            id=str(user.id),
            email=user.email,
            email_verified=user.email_verified,
            onboarding_completed_at=user.onboarding_completed_at,
            created_at=user.created_at,
        ),
        org=OrgRead(
            id=str(org.id),
            name=org.name,
            slug=org.slug,
            plan=org.plan,
            role=role,
        ),
    )
