"""
Portfolio Vault RAG — management CLI
======================================

Registered as `rag` in pyproject.toml [project.scripts].
After `pip install -e .` (or the venv is already set up) run:

  rag create-migration <name>   # scaffold a new SQL migration file
  rag migrate                   # apply all pending SQL migrations
  rag migrate-fresh             # DROP all tables, re-apply migrations (wipes data)
  rag seed                      # upsert vault markdown files into the DB
  rag clear-lightrag            # wipe graph, Qdrant vectors, and LightRAG PG tables

All commands resolve settings from rag/.env regardless of cwd.
"""

from __future__ import annotations

from datetime import datetime
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


def _migrations_dir() -> Path:
    # cli.py is at src/portfolio_rag/app/core/cli.py — 4 parents up reaches rag/
    return Path(__file__).parents[4] / "migrations"


def _run_migrations(engine) -> None:
    """Apply every *.sql file in rag/migrations/ in alphabetical order."""
    from sqlalchemy import text
    from sqlmodel import SQLModel
    import portfolio_rag.infrastructure.db  # noqa: F401 — populate SQLModel.metadata

    sql_files = sorted(_migrations_dir().glob("*.sql"))
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


# ---------------------------------------------------------------------------
# create-migration
# ---------------------------------------------------------------------------

@app.command()
def create_migration(name: str):
    """Scaffold a new empty SQL migration file in rag/migrations/."""
    migrations_dir = _migrations_dir()
    migrations_dir.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"{timestamp}_{name}.sql"
    filepath = migrations_dir / filename
    filepath.write_text(f"-- Migration: {name}\n\nBEGIN;\n\n-- TODO\n\nCOMMIT;\n", encoding="utf-8")
    typer.echo(f"  created  {filepath}")


# ---------------------------------------------------------------------------
# migrate
# ---------------------------------------------------------------------------

@app.command()
def migrate():
    """Apply all SQL migration files in rag/migrations/ then sync SQLModel metadata."""
    engine, _ = _get_engine()
    _run_migrations(engine)
    typer.echo(typer.style("\nMigration complete.", fg=typer.colors.GREEN, bold=True))


# ---------------------------------------------------------------------------
# migrate-fresh
# ---------------------------------------------------------------------------
# drop everything
_DROP_SQL = """
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
"""

@app.command()
def migrate_fresh():
    """DROP all tables and re-apply migrations from scratch. ⚠️  DESTROYS ALL DATA."""
    from sqlalchemy import text

    confirmed = typer.confirm(
        "⚠️  This will DROP ALL TABLES and destroy all data. Continue?",
        default=False,
    )
    if not confirmed:
        typer.echo("Aborted.")
        raise typer.Exit(0)

    engine, _ = _get_engine()

    with engine.connect() as conn:
        conn.execute(text(_DROP_SQL))
        conn.commit()
    typer.echo("  dropped  all tables")

    _run_migrations(engine)
    typer.echo(typer.style("\nFresh migration complete.", fg=typer.colors.GREEN, bold=True))


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

_CORPUS_ID = "portfolio_vault"


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
                {"corpus_id": _CORPUS_ID, "type": meta["type"], "slug": meta["slug"],
                 "title": meta["title"], "extracted_text": content, "metadata": "{}"},
            ).fetchone()
            action = "inserted" if row[0] else "updated"
            typer.echo(f"  {action:8s} {meta['slug']:30s}  ({meta['type']})")
        conn.commit()

    typer.echo(typer.style(f"\nSeeded {len(vault_files)} documents.", fg=typer.colors.GREEN, bold=True))


# ---------------------------------------------------------------------------
# clear-lightrag
# ---------------------------------------------------------------------------

@app.command()
def clear_lightrag(
    corpus_id: str = typer.Option("portfolio_vault", help="Corpus to clear."),
    yes: bool = typer.Option(False, "--yes", "-y", help="Skip confirmation prompt."),
):
    """Clear the LightRAG knowledge graph, vector DB, and PG tables for a corpus.

    Deletes:
      - data/graphs/<corpus_id>/*.graphml  (NetworkX graph files)
      - Qdrant collections: lightrag_vdb_entities/relationships/chunks
      - PostgreSQL tables: LIGHTRAG_DOC_STATUS, LIGHTRAG_LLM_CACHE, LIGHTRAG_DOC_CHUNKS
      - Resets lightrag_status on all documents in the corpus to NULL

    The documents themselves are NOT deleted.  Run `rag seed` + re-ingest
    afterwards to rebuild the graph from scratch.
    """
    import shutil
    from sqlalchemy import text

    if not yes:
        confirmed = typer.confirm(
            f"⚠️  This will wipe the LightRAG graph and vectors for corpus '{corpus_id}'. Continue?",
            default=False,
        )
        if not confirmed:
            typer.echo("Aborted.")
            raise typer.Exit(0)

    engine, settings = _get_engine()

    # 1. GraphML files
    graphs_dir = Path(__file__).parents[4] / "data" / "graphs" / corpus_id
    if graphs_dir.exists():
        shutil.rmtree(graphs_dir)
        typer.echo(f"  deleted  {graphs_dir}")
    else:
        typer.echo(f"  skipped  {graphs_dir}  (not found)")

    # 2. Qdrant collections
    try:
        from qdrant_client import QdrantClient
        from qdrant_client.models import Distance, VectorParams

        qdrant_url = settings.qdrant_url
        qdrant_key = settings.qdrant_api_key
        if qdrant_url:
            client = QdrantClient(url=qdrant_url, api_key=qdrant_key or None)
        else:
            qdrant_local = Path(__file__).parents[4] / "data" / "qdrant_local"
            client = QdrantClient(path=str(qdrant_local))

        lightrag_collections = [
            "lightrag_vdb_entities",
            "lightrag_vdb_relationships",
            "lightrag_vdb_chunks",
        ]
        existing = {c.name for c in client.get_collections().collections}
        for name in lightrag_collections:
            if name in existing:
                client.delete_collection(name)
                typer.echo(f"  deleted  Qdrant collection '{name}'")
            else:
                typer.echo(f"  skipped  Qdrant collection '{name}'  (not found)")
    except Exception as exc:
        typer.echo(f"  WARNING  Qdrant cleanup failed: {exc}", err=True)

    # 3. LightRAG PostgreSQL tables
    lightrag_tables = [
        "LIGHTRAG_DOC_STATUS",
        "LIGHTRAG_LLM_CACHE",
        "LIGHTRAG_DOC_CHUNKS",
    ]
    with engine.connect() as conn:
        for table in lightrag_tables:
            try:
                result = conn.execute(text(f'TRUNCATE TABLE "{table}" CASCADE'))
                conn.commit()
                typer.echo(f"  truncated  {table}")
            except Exception as exc:
                conn.rollback()
                typer.echo(f"  skipped  {table}  ({exc})", err=True)

        # 4. Reset lightrag_status on all documents in this corpus
        conn.execute(
            text(
                "UPDATE documents SET metadata = metadata - 'lightrag_status' - 'error' - 'encoding_warning'"
                " WHERE corpus_id = :corpus_id"
            ),
            {"corpus_id": corpus_id},
        )
        conn.commit()
        typer.echo(f"  reset    lightrag_status on all documents in corpus '{corpus_id}'")

    typer.echo(typer.style(f"\nLightRAG cleared for corpus '{corpus_id}'.", fg=typer.colors.GREEN, bold=True))
    typer.echo("Restart the server before re-ingesting (clears the in-memory LightRAG registry).")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def main():
    app()


if __name__ == "__main__":
    main()
