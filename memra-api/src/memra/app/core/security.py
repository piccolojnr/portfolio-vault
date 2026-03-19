"""
JWT utilities
=============

Stateless JWT creation and verification. No DB access, no side-effects.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone


class InvalidTokenError(Exception):
    """Raised when a JWT is missing, malformed, expired, or has wrong type."""


def create_access_token(
    user_id: str,
    org_id: str,
    role: str,
    email: str,
    settings,
    *,
    org_name: str = "",
    onboarding_completed_at=None,
    email_verified: bool = True,
    display_name: str | None = None,
) -> str:
    """Create a signed HS256 access JWT."""
    import jwt

    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "org_id": org_id,
        "org_name": org_name,
        "role": role,
        "email": email,
        "email_verified": email_verified,
        "display_name": display_name,
        "onboarding_completed_at": (
            onboarding_completed_at if isinstance(onboarding_completed_at, str)
            else onboarding_completed_at.isoformat()
            if onboarding_completed_at is not None else None
        ),
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_access_expiry_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def create_refresh_token() -> tuple[str, str]:
    """Return (raw_token, sha256_hash). Store only the hash in DB."""
    raw = secrets.token_bytes(32).hex()  # 64-char hex string
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    return raw, token_hash


def hash_token(raw: str) -> str:
    """SHA-256 hash a raw token string."""
    return hashlib.sha256(raw.encode()).hexdigest()


def verify_access_token(token: str, settings) -> dict:
    """
    Decode and validate an access JWT.

    Returns the payload dict (sub, org_id, role, email, type, iat, exp).
    Raises InvalidTokenError on any problem.
    """
    import jwt
    from jwt.exceptions import DecodeError, ExpiredSignatureError

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            options={"require": ["exp", "iat", "sub"]},
        )
    except ExpiredSignatureError as exc:
        raise InvalidTokenError("Token has expired") from exc
    except DecodeError as exc:
        raise InvalidTokenError("Token is invalid") from exc

    if payload.get("type") != "access":
        raise InvalidTokenError("Wrong token type")

    return payload
