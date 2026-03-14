"""
STAGE 0A: Database Migration
==============================

Applies migrations/001_init.sql then calls SQLModel.metadata.create_all()
as a safety net for any models not covered by the SQL file.

Run:
  cd rag
  .venv/Scripts/python.exe scripts/00_migrate_db.py
"""

from pathlib import Path

from sqlalchemy import create_engine, text
from sqlmodel import SQLModel

# Import models so SQLModel.metadata is populated
import app.models  # noqa: F401
from app.config import get_settings

MIGRATIONS_DIR = Path(__file__).parent.parent / "migrations"


def apply_sql_file(engine, filepath: Path) -> None:
    sql = filepath.read_text(encoding="utf-8")
    with engine.connect() as conn:
        conn.execute(text(sql))
        conn.commit()
    print(f"Applied {filepath.name}")


if __name__ == "__main__":
    settings = get_settings()
    if not settings.database_url:
        raise SystemExit("DATABASE_URL is not set in .env")

    engine = create_engine(settings.database_url)

    # Step 1: apply reference DDL
    sql_file = MIGRATIONS_DIR / "001_init.sql"
    apply_sql_file(engine, sql_file)

    # Step 2: safety net — create any model tables not in the SQL file
    SQLModel.metadata.create_all(engine)
    print("SQLModel.metadata.create_all() complete")

    print("\nMigration complete.")
