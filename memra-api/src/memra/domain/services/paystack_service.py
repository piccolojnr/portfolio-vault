"""Paystack client/service wrapper.

This wraps Paystack REST API (https://api.paystack.co) and centralises:
  - Initialize subscription transactions
  - Fetch subscription details
  - Disable/cancel subscriptions
  - Verify transactions
  - Webhook signature verification (HMAC SHA-512)

Values are loaded from platform_settings first, with environment-variable
fallback via platform_settings_service.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from memra.app.core.config import Settings
from memra.domain.services import platform_settings_service as pss

logger = logging.getLogger(__name__)


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
            self._session,
            "paystack_secret_key",
            self._settings.secret_key,
            fallback_settings=self._settings,
        )
        if not val:
            raise RuntimeError("Missing paystack_secret_key (platform_settings/env)")
        return val

    async def _get_public(self) -> str:
        val = await pss.get_value(
            self._session,
            "paystack_public_key",
            self._settings.secret_key,
            fallback_settings=self._settings,
        )
        if not val:
            raise RuntimeError("Missing paystack_public_key (platform_settings/env)")
        return val

    async def _get_plan_code(self, tier: str) -> str:
        key = (
            "paystack_pro_plan_code"
            if tier == "pro"
            else "paystack_enterprise_plan_code"
        )
        val = await pss.get_value(
            self._session,
            key,
            self._settings.secret_key,
            fallback_settings=self._settings,
        )
        if not val:
            raise RuntimeError(f"Missing {key} (platform_settings/env)")
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
            "Accept": "application/json",
            # Some edge providers are stricter with default urllib user-agents.
            "User-Agent": "memra-api/1.0 (+https://memra.local)",
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
        normalized_callback_url = callback_url.replace(" ", "").strip()

        payload = {
            "amount": 10000, # will be overridden by the plan code
            "email": email,
            # Paystack subscriptions use plan_code stored in the dashboard.
            # Paystack expects the request field name `plan`.
            "plan": plan_code,
            "callback_url": normalized_callback_url,
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
            raise RuntimeError(f"Paystack transaction initialize failed: {result}, payload: {payload}")

        data = result.get("data") if isinstance(result, dict) else None
        auth_url = data.get("authorization_url") if data else None
        if not auth_url:
            raise RuntimeError(f"Paystack did not return authorization_url: {result}, payload: {payload}")

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
        logger.info(
            "[paystack.disable_subscription] response subscription_code=%s result=%s",
            subscription_code,
            result,
        )

        # Typical success shape: {"status": true, "data": {...}}
        if isinstance(result, dict) and result.get("status") is True:
            data = result.get("data")
            return data if isinstance(data, dict) else {}

        # HTTPError shape from _api_call: {"status": 404, "body": {...}}
        if isinstance(result, dict):
            status_code = result.get("status")
            body = result.get("body")
            body_code = body.get("code") if isinstance(body, dict) else None
            body_message = body.get("message") if isinstance(body, dict) else None
            if status_code == 404 and body_code == "not_found":
                # Treat as idempotent cancel state for callers.
                return {"already_inactive": True, "message": body_message}

        raise RuntimeError(f"Paystack subscription disable failed: {result}")

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

    async def preflight_check(self) -> dict[str, Any]:
        """Validate Paystack configuration and plan-code reachability.

        Returns a structured diagnostic payload intended for admin tooling.
        It does not raise for validation failures; caller can inspect `ok`.
        """
        diagnostics: dict[str, Any] = {
            "ok": False,
            "checks": {
                "secret_key_present": False,
                "public_key_present": False,
                "pro_plan_code_present": False,
                "enterprise_plan_code_present": False,
                "key_mode_match": None,
                "pro_plan_reachable": False,
                "enterprise_plan_reachable": False,
            },
            "details": {
                "key_mode": None,
                "pro_plan_response": None,
                "enterprise_plan_response": None,
                "errors": [],
            },
        }

        secret_key = await pss.get_value(
            self._session,
            "paystack_secret_key",
            self._settings.secret_key,
            fallback_settings=self._settings,
        )
        public_key = await pss.get_value(
            self._session,
            "paystack_public_key",
            self._settings.secret_key,
            fallback_settings=self._settings,
        )
        pro_plan_code = await pss.get_value(
            self._session,
            "paystack_pro_plan_code",
            self._settings.secret_key,
            fallback_settings=self._settings,
        )
        enterprise_plan_code = await pss.get_value(
            self._session,
            "paystack_enterprise_plan_code",
            self._settings.secret_key,
            fallback_settings=self._settings,
        )

        diagnostics["checks"]["secret_key_present"] = bool(secret_key)
        diagnostics["checks"]["public_key_present"] = bool(public_key)
        diagnostics["checks"]["pro_plan_code_present"] = bool(pro_plan_code)
        diagnostics["checks"]["enterprise_plan_code_present"] = bool(enterprise_plan_code)

        if not secret_key:
            diagnostics["details"]["errors"].append("Missing paystack_secret_key")
            return diagnostics

        if not public_key:
            diagnostics["details"]["errors"].append("Missing paystack_public_key")
        if not pro_plan_code:
            diagnostics["details"]["errors"].append("Missing paystack_pro_plan_code")
        if not enterprise_plan_code:
            diagnostics["details"]["errors"].append("Missing paystack_enterprise_plan_code")

        # Best-effort mode consistency check based on key prefixes.
        # Paystack test keys typically start with sk_test/pk_test.
        # Live keys typically start with sk_live/pk_live.
        key_mode = None
        if secret_key.startswith("sk_test"):
            key_mode = "test"
        elif secret_key.startswith("sk_live"):
            key_mode = "live"
        diagnostics["details"]["key_mode"] = key_mode

        if public_key:
            mode_match = (
                (secret_key.startswith("sk_test") and public_key.startswith("pk_test"))
                or (secret_key.startswith("sk_live") and public_key.startswith("pk_live"))
            )
            diagnostics["checks"]["key_mode_match"] = mode_match
            if not mode_match:
                diagnostics["details"]["errors"].append(
                    "Secret/public key mode mismatch (test vs live)"
                )

        async def _check_plan(plan_code: str) -> dict[str, Any]:
            return await self._api_call(
                method="GET",
                path=f"/plan/{plan_code}",
                secret_key=secret_key,
                body=None,
            )

        if pro_plan_code:
            pro_res = await _check_plan(pro_plan_code)
            diagnostics["details"]["pro_plan_response"] = pro_res
            pro_ok = isinstance(pro_res, dict) and bool(pro_res.get("data"))
            diagnostics["checks"]["pro_plan_reachable"] = pro_ok
            if not pro_ok:
                diagnostics["details"]["errors"].append(
                    f"Pro plan code not reachable: {pro_res}"
                )

        if enterprise_plan_code:
            ent_res = await _check_plan(enterprise_plan_code)
            diagnostics["details"]["enterprise_plan_response"] = ent_res
            ent_ok = isinstance(ent_res, dict) and bool(ent_res.get("data"))
            diagnostics["checks"]["enterprise_plan_reachable"] = ent_ok
            if not ent_ok:
                diagnostics["details"]["errors"].append(
                    f"Enterprise plan code not reachable: {ent_res}"
                )

        checks = diagnostics["checks"]
        diagnostics["ok"] = bool(
            checks["secret_key_present"]
            and checks["public_key_present"]
            and checks["pro_plan_code_present"]
            and checks["enterprise_plan_code_present"]
            and (checks["key_mode_match"] is not False)
            and checks["pro_plan_reachable"]
            and checks["enterprise_plan_reachable"]
        )
        return diagnostics

