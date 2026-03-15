# Vercel serverless entry point.
# Vercel looks for an ASGI app called `app` in files under api/.
from app.main import app  # noqa: F401
