"""
Platform Admin Authentication
==============================

JWT creation/verification and FastAPI dependency for platform admin routes.
Completely separate from org user auth — different token type, different secret.
"""

from __future__ import annotations

import hashlib
import secrets
import time
import threading
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request

from memra.app.core.config import Settings, get_settings


class InvalidAdminTokenError(Exception):
    """Raised when a platform admin JWT is invalid."""


# ── JWT helpers ────────────────────────────────────────────────────────────────

def create_admin_access_token(
    admin_id: str,
    email: str,
    name: str,
    settings: Settings,
) -> str:
    import jwt

    secret = settings.admin_jwt_secret or settings.jwt_secret
    now = datetime.now(timezone.utc)
    payload = {
        "sub": admin_id,
        "email": email,
        "name": name,
        "type": "platform_admin",
        "iat": now,
        "exp": now + timedelta(minutes=15),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def verify_admin_access_token(token: str, settings: Settings) -> dict:
    import jwt
    from jwt.exceptions import DecodeError, ExpiredSignatureError

    secret = settings.admin_jwt_secret or settings.jwt_secret
    try:
        payload = jwt.decode(
            token, secret, algorithms=["HS256"],
            options={"require": ["exp", "iat", "sub"]},
        )
    except ExpiredSignatureError as exc:
        raise InvalidAdminTokenError("Token has expired") from exc
    except DecodeError as exc:
        raise InvalidAdminTokenError("Token is invalid") from exc

    if payload.get("type") != "platform_admin":
        raise InvalidAdminTokenError("Not a platform admin token")

    return payload


def create_admin_refresh_token() -> tuple[str, str]:
    """Return (raw_token, sha256_hash)."""
    raw = secrets.token_bytes(32).hex()
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    return raw, token_hash


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ── FastAPI dependency ─────────────────────────────────────────────────────────

async def get_platform_admin(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> dict:
    """
    Verify Bearer JWT has type=platform_admin.
    Explicitly rejects org user tokens.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")

    token = auth_header[len("Bearer "):]
    try:
        payload = verify_admin_access_token(token, settings)
    except InvalidAdminTokenError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    return payload


# ── Login rate limiter (in-memory) ─────────────────────────────────────────────

_login_attempts: dict[str, list[float]] = {}
_lock = threading.Lock()

MAX_ATTEMPTS = 5
WINDOW_SECONDS = 900  # 15 minutes


def check_login_rate_limit(ip: str) -> None:
    """Raise HTTP 429 if IP has exceeded login attempt limit."""
    now = time.time()
    with _lock:
        attempts = _login_attempts.get(ip, [])
        # Prune old attempts
        attempts = [t for t in attempts if now - t < WINDOW_SECONDS]
        _login_attempts[ip] = attempts

        if len(attempts) >= MAX_ATTEMPTS:
            oldest = min(attempts)
            retry_after = int(WINDOW_SECONDS - (now - oldest)) + 1
            raise HTTPException(
                status_code=429,
                detail="Too many login attempts",
                headers={"Retry-After": str(retry_after)},
            )


def record_failed_login(ip: str) -> None:
    """Record a failed login attempt for rate limiting."""
    now = time.time()
    with _lock:
        if ip not in _login_attempts:
            _login_attempts[ip] = []
        _login_attempts[ip].append(now)


def clear_login_attempts(ip: str) -> None:
    """Clear rate limit counter on successful login."""
    with _lock:
        _login_attempts.pop(ip, None)
