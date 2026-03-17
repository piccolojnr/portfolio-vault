"""
Portfolio Vault RAG — management CLI
======================================

Registered as `rag` in pyproject.toml [project.scripts].
After `pip install -e .` (or the venv is already set up) run:

  rag migrate                   # apply all pending SQL migrations
  rag migrate-fresh             # DROP all tables, re-apply (wipes data)
  rag create-migration <name>   # scaffold a new SQL migration file
  rag seed                      # upsert vault markdown files into the DB
  rag clear-lightrag            # wipe graph, Qdrant vectors, LightRAG PG tables
  rag worker                    # start the background job-queue worker
"""

import typer

from portfolio_rag.app.core.cli.db import (
    create_migration,
    migrate,
    migrate_fresh,
    seed,
)
from portfolio_rag.app.core.cli.lightrag import clear_lightrag
from portfolio_rag.app.core.cli.worker import worker

app = typer.Typer(
    name="rag",
    help="Portfolio Vault RAG management commands.",
    add_completion=False,
)

app.command("create-migration")(create_migration)
app.command("migrate")(migrate)
app.command("migrate-fresh")(migrate_fresh)
app.command("seed")(seed)
app.command("clear-lightrag")(clear_lightrag)
app.command("worker")(worker)


def main() -> None:
    app()


if __name__ == "__main__":
    main()
