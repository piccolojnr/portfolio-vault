"""
Portfolio Vault RAG — management CLI
======================================

Registered as `rag` in pyproject.toml [project.scripts].
After `pip install -e .` (or the venv is already set up) run:

  rag migrate        # apply all pending SQL migrations
  rag seed           # upsert vault markdown files into the DB
  rag migrate seed   # run both in sequence (just run both commands)

All commands resolve settings from rag/.env regardless of cwd.
"""

from __future__ import annotations

from pathlib import Path

import typer

app = typer.Typer(name="rag", help="Portfolio Vault RAG management commands.", add_completion=False)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_engine():
    from sqlalchemy import create_engine
    from portfolio_rag.app.core.config import get_settings

    settings = get_settings()
    if not settings.database_url:
        typer.echo("ERROR: DATABASE_URL is not set in rag/.env", err=True)
        raise typer.Exit(1)
    return create_engine(settings.database_url), settings


# ---------------------------------------------------------------------------
# migrate
# ---------------------------------------------------------------------------

@app.command()
def migrate():
    """Apply all SQL migration files in rag/migrations/ then sync SQLModel metadata."""
    from sqlalchemy import text
    from sqlmodel import SQLModel
    import portfolio_rag.infrastructure.db  # noqa: F401 — populate SQLModel.metadata

    engine, _ = _get_engine()

    # cli.py is at src/portfolio_rag/app/core/cli.py — 4 parents reaches rag/
    migrations_dir = Path(__file__).parents[4] / "migrations"
    sql_files = sorted(migrations_dir.glob("*.sql"))

    if not sql_files:
        typer.echo("No migration files found.")
        raise typer.Exit(0)

    with engine.connect() as conn:
        for sql_file in sql_files:
            sql = sql_file.read_text(encoding="utf-8")
            conn.execute(text(sql))
            conn.commit()
            typer.echo(f"  applied  {sql_file.name}")

    SQLModel.metadata.create_all(engine)
    typer.echo("  synced   SQLModel.metadata")
    typer.echo(typer.style("\nMigration complete.", fg=typer.colors.GREEN, bold=True))


# ---------------------------------------------------------------------------
# seed
# ---------------------------------------------------------------------------

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

_UPSERT_SQL = """
    INSERT INTO vault_documents (id, type, slug, title, content, metadata, updated_at, created_at)
    VALUES (gen_random_uuid(), :type, :slug, :title, :content, CAST(:metadata AS jsonb), now(), now())
    ON CONFLICT (slug) DO UPDATE
        SET type       = EXCLUDED.type,
            title      = EXCLUDED.title,
            content    = EXCLUDED.content,
            metadata   = EXCLUDED.metadata,
            updated_at = now()
    RETURNING (xmax = 0) AS inserted
"""


@app.command()
def seed():
    """Upsert all vault markdown documents into the database."""
    from sqlalchemy import text

    engine, settings = _get_engine()

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
                {"type": meta["type"], "slug": meta["slug"], "title": meta["title"],
                 "content": content, "metadata": "{}"},
            ).fetchone()
            action = "inserted" if row[0] else "updated"
            typer.echo(f"  {action:8s} {meta['slug']:30s}  ({meta['type']})")
        conn.commit()

    typer.echo(typer.style(f"\nSeeded {len(vault_files)} documents.", fg=typer.colors.GREEN, bold=True))


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def main():
    app()


if __name__ == "__main__":
    main()
