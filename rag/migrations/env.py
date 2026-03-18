"""Alembic environment configuration.

Reads DATABASE_URL from portfolio_rag Settings (rag/.env) and targets
SQLModel.metadata populated by all infrastructure db models.

Run from the rag/ directory:
    alembic upgrade head
    alembic downgrade -1
    alembic revision --autogenerate -m "description"
    alembic stamp head
    alembic current
"""
from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

# ── Populate SQLModel.metadata by importing all models ────────────────────────
import portfolio_rag.infrastructure.db  # noqa: F401 — side-effect: registers all tables

# ── Alembic Config object (gives access to alembic.ini values) ────────────────
config = context.config

# ── Set up Python logging from alembic.ini ────────────────────────────────────
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── Inject DATABASE_URL from Settings ─────────────────────────────────────────
# This runs before any migration command, in both --autogenerate and upgrade paths.
from portfolio_rag.app.core.config import get_settings as _get_settings  # noqa: E402

_settings = _get_settings()
if _settings.database_url:
    config.set_main_option("sqlalchemy.url", _settings.database_url)

# ── Target metadata for --autogenerate ────────────────────────────────────────
target_metadata = SQLModel.metadata


# ── Offline migration (generates SQL without a live DB connection) ─────────────
def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# ── Online migration (runs against a live DB connection) ──────────────────────
def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
