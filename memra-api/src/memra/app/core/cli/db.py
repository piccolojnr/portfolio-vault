"""Database management commands: migrate-fresh, seed.

For standard Alembic operations, use the Alembic CLI directly (run from rag/):

    alembic upgrade head                        # apply all pending migrations
    alembic downgrade -1                        # roll back one revision
    alembic revision --autogenerate -m "name"  # scaffold a new migration
    alembic stamp head                          # mark DB as up-to-date without running
    alembic current                             # show current revision
    alembic history                             # list all revisions
"""

from __future__ import annotations

from pathlib import Path

import typer

app = typer.Typer(help="Database management commands.")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_sync_engine():
    """Synchronous engine for raw DDL operations (migrate-fresh schema drop)."""
    from sqlalchemy import create_engine
    from memra.app.core.config import get_settings

    settings = get_settings()
    if not settings.database_url:
        typer.echo("ERROR: DATABASE_URL is not set in rag/.env", err=True)
        raise typer.Exit(1)
    return create_engine(settings.database_url)


def _alembic_cfg():
    """Return an Alembic Config with DATABASE_URL injected from Settings."""
    from alembic.config import Config
    from memra.app.core.config import get_settings

    ini_path = Path(__file__).parents[5] / "alembic.ini"
    cfg = Config(str(ini_path))

    settings = get_settings()
    if not settings.database_url:
        typer.echo("ERROR: DATABASE_URL is not set in rag/.env", err=True)
        raise typer.Exit(1)

    cfg.set_main_option("sqlalchemy.url", settings.database_url)
    return cfg


# ── Commands ───────────────────────────────────────────────────────────────────

@app.command("migrate-fresh")
def migrate_fresh():
    """DROP all tables then re-apply all migrations from scratch. DESTROYS ALL DATA."""
    from sqlalchemy import text

    confirmed = typer.confirm(
        "WARNING: This will DROP ALL TABLES and destroy all data. Continue?",
        default=False,
    )
    if not confirmed:
        typer.echo("Aborted.")
        raise typer.Exit(0)

    engine = _get_sync_engine()
    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
        conn.execute(text("GRANT ALL ON SCHEMA public TO postgres"))
        conn.execute(text("GRANT ALL ON SCHEMA public TO public"))
        conn.commit()
    typer.echo("  dropped  all tables")

    from alembic import command
    command.upgrade(_alembic_cfg(), "head")
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

_CORPUS_ID = "default"


@app.command()
def seed():
    """Upsert all vault markdown documents into the database."""
    from sqlalchemy import text

    engine = _get_sync_engine()
    settings_obj = None
    from memra.app.core.config import get_settings
    settings_obj = get_settings()

    vault_files = {
        "bio":                   settings_obj.project_dir / "bio.md",
        "skills":                settings_obj.project_dir / "skills.md",
        "experience":            settings_obj.project_dir / "experience.md",
        "brag_sheet":            settings_obj.project_dir / "brag_sheet.md",
        "project_src_permit":    settings_obj.project_dir / "02_projects/src-permit-system/overview.md",
        "project_laundry_kiosk": settings_obj.project_dir / "02_projects/laundry-kiosk/overview.md",
        "project_laundry_pos":   settings_obj.project_dir / "02_projects/laundry-pos/overview.md",
        "project_kgl":           settings_obj.project_dir / "02_projects/kgl-group-website/overview.md",
        "project_allied":        settings_obj.project_dir / "02_projects/allied-ghana-website/overview.md",
        "project_kitchen":       settings_obj.project_dir / "02_projects/kitchen-comfort/overview.md",
        "project_csir":          settings_obj.project_dir / "02_projects/csir-noise-dashboard/overview.md",
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
