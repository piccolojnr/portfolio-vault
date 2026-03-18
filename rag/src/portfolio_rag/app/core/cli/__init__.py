"""
Portfolio Vault RAG — management CLI
======================================

Registered as `rag` in pyproject.toml [project.scripts].
After `pip install -e .` (or the venv is already set up) run:

  # Database migrations — use Alembic directly (run from rag/):
  alembic upgrade head                        # apply all pending migrations
  alembic downgrade -1                        # roll back one revision
  alembic revision --autogenerate -m "name"  # scaffold a new migration
  alembic stamp head                          # mark DB up-to-date without running
  alembic current                             # show current revision
  alembic history                             # list all revisions

  # App commands:
  rag migrate-fresh             # DROP all tables + re-apply from scratch (wipes data)
  rag seed                      # upsert vault markdown files into the DB
  rag clear-lightrag            # wipe graph, Qdrant vectors, LightRAG PG tables
  rag worker                    # start the background job-queue worker
"""

import typer

from portfolio_rag.app.core.cli.db import migrate_fresh, seed
from portfolio_rag.app.core.cli.lightrag import clear_lightrag
from portfolio_rag.app.core.cli.worker import worker

app = typer.Typer(
    name="rag",
    help="Portfolio Vault RAG management commands.",
    add_completion=False,
)

app.command("migrate-fresh")(migrate_fresh)
app.command("seed")(seed)
app.command("clear-lightrag")(clear_lightrag)
app.command("worker")(worker)


def main() -> None:
    app()


if __name__ == "__main__":
    main()
