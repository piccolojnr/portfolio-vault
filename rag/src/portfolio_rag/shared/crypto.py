"""
Encryption helpers for sensitive settings stored in Postgres.

Uses Fernet symmetric encryption. The key is derived from SECRET_KEY in .env.
If SECRET_KEY is empty (dev mode), values are stored as plaintext with a
"plain:" prefix so decryption always works safely.
"""

from __future__ import annotations

import base64
import hashlib


def _make_fernet(secret_key: str):
    from cryptography.fernet import Fernet

    derived = hashlib.sha256(secret_key.encode()).digest()
    fernet_key = base64.urlsafe_b64encode(derived)
    return Fernet(fernet_key)


def encrypt(value: str, secret_key: str) -> str:
    """Encrypt value. Falls back to 'plain:<value>' if no secret_key."""
    if not value:
        return ""
    if not secret_key:
        return f"plain:{value}"
    return _make_fernet(secret_key).encrypt(value.encode()).decode()


def decrypt(stored: str, secret_key: str) -> str:
    """Decrypt value. Handles both encrypted and 'plain:' prefix forms."""
    if not stored:
        return ""
    if stored.startswith("plain:"):
        return stored[len("plain:"):]
    if not secret_key:
        return stored  # can't decrypt — return raw (misconfiguration)
    try:
        return _make_fernet(secret_key).decrypt(stored.encode()).decode()
    except Exception:
        return ""  # bad key or corrupted — return empty rather than crash
