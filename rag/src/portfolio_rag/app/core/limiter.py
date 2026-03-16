"""
Global rate-limiter singleton (slowapi / limits).

Imported by app.main (middleware wiring) and individual routers
(per-endpoint overrides). Routes that don't have an explicit decorator
fall under default_limits = ["60/minute"].

Tier map (mirrors the Next.js middleware that was removed):
  POST /api/v1/chat/stream      — 10/minute
  POST /api/v1/pipeline/run     — 3/5minutes
  POST /api/v1/export/*         — 10/minute
  everything else               — 60/minute (default)
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
