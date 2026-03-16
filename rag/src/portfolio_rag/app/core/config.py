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

    # Feature flag: when True the query endpoint uses the legacy Qdrant retriever;
    # when False it routes through LightRAG.  Defaults to True so the existing
    # Qdrant index continues to serve queries while LightRAG ingestion catches up.
    # Flip to False (via the settings table) for a live, zero-downtime switchover.
    use_legacy_retrieval: bool = False

    @computed_field  # type: ignore[prop-decorator]
    @property
    def use_demo(self) -> bool:
        if self.demo_mode == "1":
            return True
        return not self.openai_api_key and not self.anthropic_api_key

    # Qdrant collection name
    qdrant_collection: str = "portfolio_vault"

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
