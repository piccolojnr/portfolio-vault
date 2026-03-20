"""
Application Configuration
==========================

Single source of truth for all settings, loaded from the .env file.
Use get_settings() (cached) for dependency injection via FastAPI Depends().
"""

from functools import lru_cache
from pathlib import Path
from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Locate the rag/ directory regardless of where Python is invoked from
_RAG_DIR = Path(__file__).parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_RAG_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # API keys
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    qdrant_url: str = ""
    qdrant_api_key: str = ""
    database_url: str = ""

    # Secret key for encrypting sensitive DB settings (32+ char recommended)
    secret_key: str = ""

    # Optional override
    demo_mode: str = ""

    # Model selection — overridable from DB settings at runtime
    embedding_model: str = "text-embedding-3-small"
    anthropic_model: str = "claude-sonnet-4-6"
    openai_model: str = "gpt-4o"

    # Fast/cheap models for intent classification and summarisation
    classifier_anthropic_model: str = "claude-haiku-4-5-20251001"
    classifier_openai_model: str = "gpt-4o-mini"
    summarizer_anthropic_model: str = "claude-haiku-4-5-20251001"
    summarizer_openai_model: str = "gpt-4o-mini"

    # Cost guard — pipeline run is blocked if estimated cost exceeds this (0 = no limit)
    cost_limit_usd: float = 0.0

    # Storage backend for file uploads ("local" or "supabase")
    storage_provider: str = "local"
    supabase_storage_url: str = ""
    supabase_storage_key: str = ""
    storage_bucket: str = "documents"

    # Auth / JWT
    jwt_secret: str = ""
    jwt_access_expiry_minutes: int = 15
    jwt_refresh_expiry_days: int = 30

    # Platform admin JWT (falls back to jwt_secret if empty)
    admin_jwt_secret: str = ""
    admin_jwt_refresh_expiry_days: int = 7

    # Email
    email_backend: str = "mailpit"       # "console" | "mailpit" | "resend"
    email_from: str = "noreply@example.com"
    resend_api_key: str = ""
    mailpit_host: str = "localhost"
    mailpit_port: int = 1025

    # App metadata (used in email templates)
    app_name: str = "Memraiq"
    app_url: str = "http://app.memra.local"
    sales_email: str = "sales@memraiq.com"

    # Logging — set LOG_LEVEL=DEBUG to see memra.* debug lines (e.g. Paystack webhooks)
    log_level: str = "INFO"

    # Neo4j (graph storage for LightRAG)
    neo4j_uri: str = ""
    neo4j_username: str = "neo4j"
    neo4j_password: str = ""

    # Deployment / environment
    environment: str = "development"   # "development" | "production"
    gunicorn_workers: int = 4

    # CORS — comma-separated allowed origins (overrides allow_origins=["*"])
    cors_origins: str = ""

    # Billing / Paystack (can be overridden by platform settings DB)
    paystack_secret_key: str = ""
    paystack_public_key: str = ""
    paystack_pro_plan_code: str = ""
    paystack_enterprise_plan_code: str = ""

    @computed_field  # type: ignore[prop-decorator]
    @property
    def use_demo(self) -> bool:
        if self.demo_mode == "1":
            return True
        return not self.openai_api_key and not self.anthropic_api_key

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cookie_secure(self) -> bool:
        return self.is_production

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cookie_samesite(self) -> str:
        return "none" if self.is_production else "lax"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def allowed_origins(self) -> list[str]:
        if self.cors_origins:
            return [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        return ["*"]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def qdrant_local_path(self) -> Path:
        """Local Qdrant storage path used when qdrant_url is not set."""
        return _RAG_DIR / "data" / "qdrant_local"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def chunks_file(self) -> Path:
        return _RAG_DIR / "data" / "chunks.json"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def data_dir(self) -> Path:
        path = _RAG_DIR / "data"
        path.mkdir(exist_ok=True)
        return path

    @computed_field  # type: ignore[prop-decorator]
    @property
    def project_dir(self) -> Path:
        return _RAG_DIR.parent


@lru_cache
def get_settings() -> Settings:
    return Settings()
