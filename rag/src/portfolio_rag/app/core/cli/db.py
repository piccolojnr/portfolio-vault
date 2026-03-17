"""Database management commands: create-migration, migrate, migrate-fresh, seed."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import typer

app = typer.Typer(help="Database management commands.")


# ── Shared helpers ─────────────────────────────────────────────────────────────

def get_engine():
    from sqlalchemy import create_engine
    from portfolio_rag.app.core.config import get_settings

    settings = get_settings()
    if not settings.database_url:
        typer.echo("ERROR: DATABASE_URL is not set in rag/.env", err=True)
        raise typer.Exit(1)
    return create_engine(settings.database_url), settings


def migrations_dir() -> Path:
    # cli/db.py is at src/portfolio_rag/app/core/cli/db.py — 5 parents up reaches rag/
    return Path(__file__).parents[5] / "migrations"


def run_migrations(engine) -> None:
    """Apply every *.sql file in rag/migrations/ in alphabetical order."""
    from sqlalchemy import text
    from sqlmodel import SQLModel
    import portfolio_rag.infrastructure.db  # noqa: F401 — populate SQLModel.metadata

    sql_files = sorted(migrations_dir().glob("*.sql"))
    if not sql_files:
        typer.echo("No migration files found.")
        return

    with engine.connect() as conn:
        for sql_file in sql_files:
            sql = sql_file.read_text(encoding="utf-8")
            conn.execute(text(sql))
            conn.commit()
            typer.echo(f"  applied  {sql_file.name}")

    SQLModel.metadata.create_all(engine)
    typer.echo("  synced   SQLModel.metadata")


# ── Commands ───────────────────────────────────────────────────────────────────

@app.command("create-migration")
def create_migration(name: str):
    """Scaffold a new empty SQL migration file in rag/migrations/."""
    mdir = migrations_dir()
    mdir.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"{timestamp}_{name}.sql"
    filepath = mdir / filename
    filepath.write_text(f"-- Migration: {name}\n\nBEGIN;\n\n-- TODO\n\nCOMMIT;\n", encoding="utf-8")
    typer.echo(f"  created  {filepath}")


@app.command()
def migrate():
    """Apply all SQL migration files in rag/migrations/ then sync SQLModel metadata."""
    engine, _ = get_engine()
    run_migrations(engine)
    typer.echo(typer.style("\nMigration complete.", fg=typer.colors.GREEN, bold=True))


_DROP_SQL = """
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
"""


@app.command("migrate-fresh")
def migrate_fresh():
    """DROP all tables and re-apply migrations from scratch. DESTROYS ALL DATA."""
    from sqlalchemy import text

    confirmed = typer.confirm(
        "WARNING: This will DROP ALL TABLES and destroy all data. Continue?",
        default=False,
    )
    if not confirmed:
        typer.echo("Aborted.")
        raise typer.Exit(0)

    engine, _ = get_engine()

    with engine.connect() as conn:
        conn.execute(text(_DROP_SQL))
        conn.commit()
    typer.echo("  dropped  all tables")

    run_migrations(engine)
    typer.echo(typer.style("\nFresh migration complete.", fg=typer.colors.GREEN, bold=True))


_UPSERT_SQL = """
    INSERT INTO documents (id, corpus_id, type, slug, title, extracted_text, metadata, updated_at, created_at)
    VALUES (gen_random_uuid(), :corpus_id, :type, :slug, :title, :extracted_text, CAST(:metadata AS jsonb), now(), now())
    ON CONFLICT (slug) DO UPDATE
        SET corpus_id      = EXCLUDED.corpus_id,
            type           = EXCLUDED.type,
            title          = EXCLUDED.title,
            extracted_text = EXCLUDED.extracted_text,
            metadata       = EXCLUDED.metadata,
            updated_at     = now()
    RETURNING (xmax = 0) AS inserted
"""

_DOC_META = {
    "bio":                   {"slug": "bio",                  "type": "bio",        "title": "Bio"},
    "skills":                {"slug": "skills",               "type": "skills",     "title": "Skills"},
    "experience":            {"slug": "experience",           "type": "experience", "title": "Experience"},
    "brag_sheet":            {"slug": "brag-sheet",           "type": "brag",       "title": "Brag Sheet"},
    "project_src_permit":    {"slug": "src-permit-system",    "type": "project",    "title": "SRC Permit System"},
    "project_laundry_kiosk": {"slug": "laundry-kiosk",        "type": "project",    "title": "Laundry Kiosk"},
    "project_laundry_pos":   {"slug": "laundry-pos",          "type": "project",    "title": "Laundry POS"},
    "project_kgl":           {"slug": "kgl-group-website",    "type": "project",    "title": "KGL Group Website"},
    "project_allied":        {"slug": "allied-ghana-website", "type": "project",    "title": "Allied Ghana Website"},
    "project_kitchen":       {"slug": "kitchen-comfort",      "type": "project",    "title": "Kitchen Comfort"},
    "project_csir":          {"slug": "csir-noise-dashboard", "type": "project",    "title": "CSIR Noise Dashboard"},
}

_CORPUS_ID = "portfolio_vault"


@app.command()
def seed():
    """Upsert all vault markdown documents into the database."""
    from sqlalchemy import text

    engine, settings = get_engine()

    vault_files = {
        "bio":                   settings.project_dir / "bio.md",
        "skills":                settings.project_dir / "skills.md",
        "experience":            settings.project_dir / "experience.md",
        "brag_sheet":            settings.project_dir / "brag_sheet.md",
        "project_src_permit":    settings.project_dir / "02_projects/src-permit-system/overview.md",
        "project_laundry_kiosk": settings.project_dir / "02_projects/laundry-kiosk/overview.md",
        "project_laundry_pos":   settings.project_dir / "02_projects/laundry-pos/overview.md",
        "project_kgl":           settings.project_dir / "02_projects/kgl-group-website/overview.md",
        "project_allied":        settings.project_dir / "02_projects/allied-ghana-website/overview.md",
        "project_kitchen":       settings.project_dir / "02_projects/kitchen-comfort/overview.md",
        "project_csir":          settings.project_dir / "02_projects/csir-noise-dashboard/overview.md",
    }

    with engine.connect() as conn:
        for key, filepath in vault_files.items():
            meta = _DOC_META[key]
            if not Path(filepath).exists():
                typer.echo(f"  missing  {filepath}", err=True)
                continue
            content = Path(filepath).read_text(encoding="utf-8")
            row = conn.execute(
                text(_UPSERT_SQL),
                {"corpus_id": _CORPUS_ID, "type": meta["type"], "slug": meta["slug"],
                 "title": meta["title"], "extracted_text": content, "metadata": "{}"},
            ).fetchone()
            action = "inserted" if row[0] else "updated"
            typer.echo(f"  {action:8s} {meta['slug']:30s}  ({meta['type']})")
        conn.commit()

    typer.echo(typer.style(f"\nSeeded {len(vault_files)} documents.", fg=typer.colors.GREEN, bold=True))
