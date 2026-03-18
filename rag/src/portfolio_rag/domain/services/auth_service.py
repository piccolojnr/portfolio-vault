"""
Auth Service
============

All authentication business logic. Each function takes an AsyncSession as first
argument. Raises ValueError for bad input, LookupError for not-found rows.
"""

from __future__ import annotations

import re
import secrets
from datetime import timedelta
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from portfolio_rag.app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_token,
)
from portfolio_rag.infrastructure.db.models.auth_tokens import (
    MagicLinkToken,
    PasswordResetToken,
    RefreshToken,
)
from portfolio_rag.infrastructure.db.models.base import utcnow
from portfolio_rag.infrastructure.db.models.corpus import Corpus
from portfolio_rag.infrastructure.db.models.org import (
    Organisation,
    OrganisationMember,
    OrganisationSetting,
)
from portfolio_rag.infrastructure.db.models.user import User


# ── Helpers ────────────────────────────────────────────────────────────────────

def _slugify(text: str) -> str:
    """Lowercase, replace non-alnum with '-', collapse runs, strip edges."""
    slug = text.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug or "workspace"


async def _create_org_for_user(
    session: AsyncSession,
    user_id,
    email: str,
) -> Organisation:
    """Create an Organisation + OrganisationMember (owner) + default Corpus."""
    prefix = email.split("@")[0]
    org = Organisation(
        name=f"{prefix}'s Workspace",
        slug=_slugify(prefix) + "-" + secrets.token_hex(3),
        plan="free",
    )
    session.add(org)
    await session.flush()  # populate org.id

    member = OrganisationMember(user_id=user_id, org_id=org.id, role="owner")
    session.add(member)

    # Create a default corpus; corpus_key = org.id (unique per org, isolates Qdrant/LightRAG data)
    corpus = Corpus(
        org_id=org.id,
        name=f"{prefix}'s Knowledge Base",
        corpus_key=str(org.id),
    )
    session.add(corpus)
    await session.flush()  # populate corpus.id

    org.active_corpus_id = corpus.id
    session.add(org)

    return org


# ── Public service functions ───────────────────────────────────────────────────

async def register(
    session: AsyncSession,
    email: str,
    password: Optional[str],
    settings,
) -> tuple[User, str, str]:
    """
    Create a new user with a personal workspace.

    Returns (user, access_token, refresh_token_raw).
    Raises ValueError if email already exists.
    """
    from portfolio_rag.domain.services import job_queue

    existing = (
        await session.execute(select(User).where(User.email == email))
    ).scalars().first()
    if existing:
        raise ValueError("Email already registered")

    password_hash = None
    if password:
        import bcrypt
        password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    user = User(email=email, password_hash=password_hash, email_verified=False)
    session.add(user)
    await session.flush()  # populate user.id

    org = await _create_org_for_user(session, user.id, email)

    # Email verification token (stored in magic_link_tokens)
    raw_verify, verify_hash = create_refresh_token()  # reuse same random-bytes helper
    verify_expires = utcnow() + timedelta(hours=24)
    verify_token = MagicLinkToken(
        email=email,
        token_hash=verify_hash,
        used=False,
        expires_at=verify_expires,
    )
    session.add(verify_token)

    # Refresh token
    raw_refresh, refresh_hash = create_refresh_token()
    refresh_expires = utcnow() + timedelta(days=settings.jwt_refresh_expiry_days)
    refresh_token = RefreshToken(
        user_id=user.id,
        token_hash=refresh_hash,
        revoked=False,
        expires_at=refresh_expires,
    )
    session.add(refresh_token)

    await session.commit()
    await session.refresh(user)

    # Enqueue verification email (best-effort — don't fail registration if job fails)
    try:
        async with session.bind.connect() as _conn:  # type: ignore[attr-defined]
            pass
    except Exception:
        pass

    verify_url = f"{settings.app_url}/auth/verify?token={raw_verify}"
    try:
        await job_queue.enqueue(
            session,
            "send_verify_email",
            {"email": email, "verify_url": verify_url, "expiry_hours": 24},
            org_id=org.id,
        )
        await session.commit()
    except Exception:
        pass

    access_token = create_access_token(
        str(user.id), str(org.id), "owner", email, settings,
        org_name=org.name,
        onboarding_completed_at=user.onboarding_completed_at,
        email_verified=user.email_verified,
        display_name=user.display_name,
    )
    return user, access_token, raw_refresh


async def verify_email(
    session: AsyncSession,
    token: str,
    settings,
) -> tuple[User, str, str]:
    """
    Mark a user's email as verified via magic-link token.

    Returns (user, access_token, refresh_token_raw).
    Raises ValueError if token not found or expired.
    """
    from portfolio_rag.domain.services import job_queue

    token_hash = hash_token(token)
    now = utcnow()

    row = (
        await session.execute(
            select(MagicLinkToken).where(
                MagicLinkToken.token_hash == token_hash,
                MagicLinkToken.used == False,  # noqa: E712
                MagicLinkToken.expires_at > now,
            )
        )
    ).scalars().first()

    if row is None:
        raise ValueError("Token not found or expired")

    row.used = True
    session.add(row)

    user = (
        await session.execute(select(User).where(User.email == row.email))
    ).scalars().first()
    if user is None:
        raise ValueError("User not found")

    user.email_verified = True
    session.add(user)

    # Issue a refresh token
    raw_refresh, refresh_hash = create_refresh_token()
    refresh_expires = utcnow() + timedelta(days=settings.jwt_refresh_expiry_days)
    refresh_token = RefreshToken(
        user_id=user.id,
        token_hash=refresh_hash,
        revoked=False,
        expires_at=refresh_expires,
    )
    session.add(refresh_token)

    await session.commit()
    await session.refresh(user)

    # Look up org for token
    member = (
        await session.execute(
            select(OrganisationMember).where(OrganisationMember.user_id == user.id)
        )
    ).scalars().first()
    org_id = str(member.org_id) if member else ""

    try:
        await job_queue.enqueue(
            session,
            "send_welcome_email",
            {
                "email": user.email,
                "user_email": user.email,
                "app_url": settings.app_url,
                "app_name": settings.app_name,
            },
            org_id=member.org_id if member else None,
        )
        await session.commit()
    except Exception:
        pass
    role = member.role if member else "member"
    org_name = ""
    if member:
        _org = (await session.execute(
            select(Organisation).where(Organisation.id == member.org_id)
        )).scalars().first()
        if _org:
            org_name = _org.name

    access_token = create_access_token(
        str(user.id), org_id, role, user.email, settings,
        org_name=org_name,
        onboarding_completed_at=user.onboarding_completed_at,
        email_verified=True,
        display_name=user.display_name,
    )
    return user, access_token, raw_refresh


async def login(
    session: AsyncSession,
    email: str,
    password: str,
    settings,
) -> tuple[str, str]:
    """
    Verify credentials and issue tokens.

    Returns (access_token, refresh_token_raw).
    Raises LookupError if user not found, ValueError for bad credentials.
    """
    import bcrypt

    user = (
        await session.execute(select(User).where(User.email == email))
    ).scalars().first()
    if user is None:
        raise LookupError("User not found")

    if user.password_hash is None:
        raise ValueError("Invalid credentials")

    if not bcrypt.checkpw(password.encode(), user.password_hash.encode()):
        raise ValueError("Invalid credentials")

    # Get user's org + role
    member = (
        await session.execute(
            select(OrganisationMember).where(OrganisationMember.user_id == user.id)
        )
    ).scalars().first()
    org_id = str(member.org_id) if member else ""
    role = member.role if member else "member"
    org_name = ""
    if member:
        _org = (await session.execute(
            select(Organisation).where(Organisation.id == member.org_id)
        )).scalars().first()
        if _org:
            org_name = _org.name

    raw_refresh, refresh_hash = create_refresh_token()
    refresh_expires = utcnow() + timedelta(days=settings.jwt_refresh_expiry_days)
    refresh_token = RefreshToken(
        user_id=user.id,
        token_hash=refresh_hash,
        revoked=False,
        expires_at=refresh_expires,
    )
    session.add(refresh_token)
    await session.commit()

    access_token = create_access_token(str(user.id), org_id, role, email, settings,
        org_name=org_name,
        onboarding_completed_at=user.onboarding_completed_at,
        email_verified=user.email_verified,
        display_name=user.display_name,
    )
    return access_token, raw_refresh


async def send_magic_link(
    session: AsyncSession,
    email: str,
    settings,
    *,
    redirect_url: str | None = None,
) -> None:
    """
    Enqueue a magic-link email (rate-limited to 3 per 15 min per email).

    Always returns None — no indication of whether the email exists.
    Raises ValueError("Too many requests") if rate limit exceeded.
    """
    from portfolio_rag.domain.services import job_queue

    now = utcnow()
    window_start = now - timedelta(minutes=15)

    count_result = await session.execute(
        select(MagicLinkToken).where(
            MagicLinkToken.email == email,
            MagicLinkToken.created_at > window_start,
            MagicLinkToken.used == False,  # noqa: E712
        )
    )
    recent = count_result.scalars().all()
    if len(recent) >= 3:
        raise ValueError("Too many requests")

    raw, token_hash = create_refresh_token()
    expires = utcnow() + timedelta(minutes=15)
    ml_token = MagicLinkToken(
        email=email,
        token_hash=token_hash,
        used=False,
        expires_at=expires,
    )
    session.add(ml_token)

    magic_link_url = f"{settings.app_url}/auth/magic-link?token={raw}"
    if redirect_url:
        from urllib.parse import quote
        magic_link_url += f"&redirect={quote(redirect_url, safe='')}"
    await job_queue.enqueue(
        session,
        "send_magic_link_email",
        {"email": email, "magic_link_url": magic_link_url, "expiry_minutes": 15},
    )
    await session.commit()


async def verify_magic_link(
    session: AsyncSession,
    token: str,
    settings,
) -> tuple[User, str, str]:
    """
    Verify a magic-link token and return tokens (creating user if needed).

    Returns (user, access_token, refresh_token_raw).
    Raises ValueError if token not found or expired.
    """
    token_hash = hash_token(token)
    now = utcnow()

    row = (
        await session.execute(
            select(MagicLinkToken).where(
                MagicLinkToken.token_hash == token_hash,
                MagicLinkToken.used == False,  # noqa: E712
                MagicLinkToken.expires_at > now,
            )
        )
    ).scalars().first()

    if row is None:
        raise ValueError("Token not found or expired")

    row.used = True
    session.add(row)

    email = row.email
    user = (
        await session.execute(select(User).where(User.email == email))
    ).scalars().first()

    if user is None:
        user = User(email=email, email_verified=True)
        session.add(user)
        await session.flush()
        org = await _create_org_for_user(session, user.id, email)
        org_id = str(org.id)
        org_name = org.name
        role = "owner"
    else:
        member = (
            await session.execute(
                select(OrganisationMember).where(OrganisationMember.user_id == user.id)
            )
        ).scalars().first()
        org_id = str(member.org_id) if member else ""
        role = member.role if member else "member"
        org_name = ""
        if member:
            _org = (await session.execute(
                select(Organisation).where(Organisation.id == member.org_id)
            )).scalars().first()
            if _org:
                org_name = _org.name

    raw_refresh, refresh_hash = create_refresh_token()
    refresh_expires = utcnow() + timedelta(days=settings.jwt_refresh_expiry_days)
    refresh_token = RefreshToken(
        user_id=user.id,
        token_hash=refresh_hash,
        revoked=False,
        expires_at=refresh_expires,
    )
    session.add(refresh_token)
    await session.commit()
    await session.refresh(user)

    access_token = create_access_token(str(user.id), org_id, role, email, settings,
        org_name=org_name,
        onboarding_completed_at=user.onboarding_completed_at,
        email_verified=user.email_verified,
        display_name=user.display_name,
    )
    return user, access_token, raw_refresh


async def refresh(
    session: AsyncSession,
    refresh_token_raw: str,
    settings,
) -> tuple[str, str]:
    """
    Rotate a refresh token and return new (access_token, refresh_token_raw).

    Raises ValueError if token not found, revoked, or expired.
    """
    token_hash = hash_token(refresh_token_raw)
    now = utcnow()

    old = (
        await session.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == token_hash,
                RefreshToken.revoked == False,  # noqa: E712
                RefreshToken.expires_at > now,
            )
        )
    ).scalars().first()

    if old is None:
        raise ValueError("Invalid or expired token")

    old.revoked = True
    old.last_used_at = now
    session.add(old)

    user = (
        await session.execute(select(User).where(User.id == old.user_id))
    ).scalars().first()
    if user is None:
        raise ValueError("User not found")

    member = (
        await session.execute(
            select(OrganisationMember).where(OrganisationMember.user_id == user.id)
        )
    ).scalars().first()
    org_id = str(member.org_id) if member else ""
    role = member.role if member else "member"
    org_name = ""
    if member:
        _org = (await session.execute(
            select(Organisation).where(Organisation.id == member.org_id)
        )).scalars().first()
        if _org:
            org_name = _org.name

    raw_new, hash_new = create_refresh_token()
    new_token = RefreshToken(
        user_id=user.id,
        token_hash=hash_new,
        revoked=False,
        expires_at=utcnow() + timedelta(days=settings.jwt_refresh_expiry_days),
    )
    session.add(new_token)
    await session.commit()

    access_token = create_access_token(str(user.id), org_id, role, user.email, settings,
        org_name=org_name,
        onboarding_completed_at=user.onboarding_completed_at,
        email_verified=user.email_verified,
        display_name=user.display_name,
    )
    return access_token, raw_new


async def logout(session: AsyncSession, refresh_token_raw: str) -> None:
    """Revoke a single refresh token."""
    token_hash = hash_token(refresh_token_raw)
    row = (
        await session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
    ).scalars().first()
    if row:
        row.revoked = True
        session.add(row)
        await session.commit()


async def logout_all(session: AsyncSession, user_id: str) -> None:
    """Revoke all active refresh tokens for a user."""
    import uuid as _uuid
    from sqlalchemy import update

    await session.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == _uuid.UUID(user_id),
            RefreshToken.revoked == False,  # noqa: E712
        )
        .values(revoked=True)
    )
    await session.commit()


async def send_password_reset(session: AsyncSession, email: str, settings) -> None:
    """
    Enqueue a password-reset email. Silently returns if email not found.
    """
    from portfolio_rag.domain.services import job_queue

    user = (
        await session.execute(select(User).where(User.email == email))
    ).scalars().first()
    if user is None:
        return  # no email-existence leak

    raw, token_hash = create_refresh_token()
    expires = utcnow() + timedelta(minutes=30)
    reset_token = PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        used=False,
        expires_at=expires,
    )
    session.add(reset_token)

    reset_url = f"{settings.app_url}/auth/reset-password?token={raw}"
    await job_queue.enqueue(
        session,
        "send_password_reset_email",
        {"email": email, "reset_url": reset_url, "expiry_minutes": 30},
    )
    await session.commit()


async def reset_password(session: AsyncSession, token: str, new_password: str) -> None:
    """
    Apply a password reset. Revokes all existing refresh tokens (force re-login).

    Raises ValueError if token not found or expired.
    """
    import uuid as _uuid
    import bcrypt
    from sqlalchemy import update

    token_hash = hash_token(token)
    now = utcnow()

    row = (
        await session.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.used == False,  # noqa: E712
                PasswordResetToken.expires_at > now,
            )
        )
    ).scalars().first()

    if row is None:
        raise ValueError("Token not found or expired")

    row.used = True
    session.add(row)

    new_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()

    user = (
        await session.execute(select(User).where(User.id == row.user_id))
    ).scalars().first()
    if user is None:
        raise ValueError("User not found")

    user.password_hash = new_hash
    user.updated_at = now
    session.add(user)

    # Revoke all refresh tokens so user must re-login everywhere
    await session.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == row.user_id,
            RefreshToken.revoked == False,  # noqa: E712
        )
        .values(revoked=True)
    )
    await session.commit()
