"""LightRAG management commands: clear-lightrag."""

from __future__ import annotations

from pathlib import Path

import typer

app = typer.Typer(help="LightRAG knowledge-graph management.")


@app.command("clear-lightrag")
def clear_lightrag(
    corpus_id: str = typer.Option("default", help="Corpus to clear."),
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
    from memra.app.core.cli.db import get_engine

    if not yes:
        confirmed = typer.confirm(
            f"WARNING: This will wipe the LightRAG graph and vectors for corpus '{corpus_id}'. Continue?",
            default=False,
        )
        if not confirmed:
            typer.echo("Aborted.")
            raise typer.Exit(0)

    engine, settings = get_engine()

    # 1. GraphML files
    graphs_dir = Path(__file__).parents[5] / "data" / "graphs" / corpus_id
    if graphs_dir.exists():
        shutil.rmtree(graphs_dir)
        typer.echo(f"  deleted  {graphs_dir}")
    else:
        typer.echo(f"  skipped  {graphs_dir}  (not found)")

    # 2. Qdrant collections
    try:
        from qdrant_client import QdrantClient

        qdrant_url = settings.qdrant_url
        qdrant_key = settings.qdrant_api_key
        if qdrant_url:
            client = QdrantClient(url=qdrant_url, api_key=qdrant_key or None)
        else:
            qdrant_local = Path(__file__).parents[5] / "data" / "qdrant_local"
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
    lightrag_tables = ["LIGHTRAG_DOC_STATUS", "LIGHTRAG_LLM_CACHE", "LIGHTRAG_DOC_CHUNKS"]
    with engine.connect() as conn:
        for table in lightrag_tables:
            try:
                conn.execute(text(f'TRUNCATE TABLE "{table}" CASCADE'))
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
