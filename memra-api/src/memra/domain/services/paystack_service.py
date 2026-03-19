"""Paystack client/service wrapper.

This wraps Paystack REST API (https://api.paystack.co) and centralises:
  - Initialize subscription transactions
  - Fetch subscription details
  - Disable/cancel subscriptions
  - Verify transactions
  - Webhook signature verification (HMAC SHA-512)

Paystack secret key is read from platform_settings via platform_settings_service
(with its existing decrypt/caching behaviour), not environment variables.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from memra.app.core.config import Settings
from memra.domain.services import platform_settings_service as pss


@dataclass(frozen=True)
class PaystackTransactionInitResult:
    authorization_url: str


class PaystackService:
    BASE_URL = "https://api.paystack.co"

    def __init__(self, *, session: AsyncSession, settings: Settings):
        self._session = session
        self._settings = settings

    async def _get_secret(self) -> str:
        val = await pss.get_value(
            self._session, "paystack_secret_key", self._settings.secret_key
        )
        if not val:
            raise RuntimeError("Missing platform_settings: paystack_secret_key")
        return val

    async def _get_public(self) -> str:
        val = await pss.get_value(
            self._session, "paystack_public_key", self._settings.secret_key
        )
        if not val:
            raise RuntimeError("Missing platform_settings: paystack_public_key")
        return val

    async def _get_plan_code(self, tier: str) -> str:
        key = (
            "paystack_pro_plan_code"
            if tier == "pro"
            else "paystack_enterprise_plan_code"
        )
        val = await pss.get_value(
            self._session, key, self._settings.secret_key
        )
        if not val:
            raise RuntimeError(f"Missing platform_settings: {key}")
        return val

    @staticmethod
    def verify_webhook_signature(*, secret_key: str, raw_body: bytes, signature_header: str) -> bool:
        # Paystack signs the raw request body using HMAC-SHA512 and sends the
        # hex digest in `x-paystack-signature`. We also tolerate "sha512=" prefix.
        sig = signature_header.strip()
        if sig.lower().startswith("sha512="):
            sig = sig.split("=", 1)[1]

        digest = hmac.new(secret_key.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
        return hmac.compare_digest(digest, sig)

    async def verify_incoming_webhook_signature(
        self,
        *,
        raw_body: bytes,
        signature_header: str,
    ) -> bool:
        secret_key = await self._get_secret()
        return self.verify_webhook_signature(
            secret_key=secret_key, raw_body=raw_body, signature_header=signature_header
        )

    async def _api_call(self, *, method: str, path: str, secret_key: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{self.BASE_URL}{path}"

        headers: dict[str, str] = {
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/json",
        }

        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")

        req = urllib.request.Request(url, method=method, headers=headers, data=data)

        def _run() -> dict[str, Any]:
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    resp_text = resp.read().decode("utf-8")
                    return json.loads(resp_text)
            except urllib.error.HTTPError as exc:
                # Paystack returns JSON in the body even for non-2xx.
                try:
                    payload = exc.read().decode("utf-8")
                    return {"status": exc.code, "body": json.loads(payload)}
                except Exception:
                    return {"status": exc.code, "body": {"error": str(exc)}}

        result = await asyncio.to_thread(_run)
        return result

    async def initialize_subscription_transaction(
        self,
        *,
        email: str,
        tier: str,
        callback_url: str,
        metadata: dict[str, Any] | None = None,
    ) -> PaystackTransactionInitResult:
        secret_key = await self._get_secret()
        plan_code = await self._get_plan_code(tier)

        payload = {
            "email": email,
            # Paystack subscriptions use plan_code stored in the dashboard.
            # Paystack expects the request field name `plan`.
            "plan": plan_code,
            "callback_url": callback_url,
            # Keep the tier in metadata for webhook processing.
            "metadata": {"tier": tier, "plan_code": plan_code, **(metadata or {})},
        }

        result = await self._api_call(
            method="POST",
            path="/transaction/initialize",
            secret_key=secret_key,
            body=payload,
        )
        # Successful response shape is typically: {status: true, data: {authorization_url: ...}}
        if isinstance(result, dict) and result.get("status") is False:
            raise RuntimeError(f"Paystack transaction initialize failed: {result}")

        data = result.get("data") if isinstance(result, dict) else None
        auth_url = data.get("authorization_url") if data else None
        if not auth_url:
            raise RuntimeError(f"Paystack did not return authorization_url: {result}")

        return PaystackTransactionInitResult(authorization_url=auth_url)

    async def fetch_subscription(self, *, subscription_code: str) -> dict[str, Any]:
        secret_key = await self._get_secret()
        result = await self._api_call(
            method="GET",
            path=f"/subscription/{subscription_code}",
            secret_key=secret_key,
            body=None,
        )
        data = result.get("data") if isinstance(result, dict) else None
        if not data:
            raise RuntimeError(f"Paystack subscription fetch failed: {result}")
        return data

    async def disable_subscription(
        self,
        *,
        subscription_code: str,
        email_token: str,
    ) -> dict[str, Any]:
        secret_key = await self._get_secret()
        payload = {"code": subscription_code, "token": email_token}
        result = await self._api_call(
            method="POST",
            path="/subscription/disable",
            secret_key=secret_key,
            body=payload,
        )
        return result.get("data") if isinstance(result, dict) else {}

    async def verify_transaction(self, *, reference: str) -> dict[str, Any]:
        secret_key = await self._get_secret()
        result = await self._api_call(
            method="GET",
            path=f"/transaction/verify/{reference}",
            secret_key=secret_key,
            body=None,
        )
        data = result.get("data") if isinstance(result, dict) else None
        if not data:
            raise RuntimeError(f"Paystack transaction verify failed: {result}")
        return data

