"""
Memra — management CLI
======================================

Registered as `memra` in pyproject.toml [project.scripts].
After `pip install -e .` (or the venv is already set up) run:

  # Database migrations — use Alembic directly (run from memra-api/):
  alembic upgrade head                        # apply all pending migrations
  alembic downgrade -1                        # roll back one revision
  alembic revision --autogenerate -m "name"  # scaffold a new migration
  alembic stamp head                          # mark DB up-to-date without running
  alembic current                             # show current revision
  alembic history                             # list all revisions

  # App commands:
  memra migrate-fresh             # DROP all tables + re-apply from scratch (wipes data)
  memra seed                      # upsert vault markdown files into the DB
  memra clear-lightrag            # wipe graph, Qdrant vectors, LightRAG PG tables
  memra worker                    # start the background job-queue worker

  # Platform admin commands:
  memra create-admin              # create a new platform admin account
  memra list-admins               # list all platform admins
  memra reset-admin-password      # reset a platform admin's password
"""

import typer

from memra.app.core.cli.db import migrate_fresh, seed
from memra.app.core.cli.lightrag import clear_lightrag
from memra.app.core.cli.worker import worker
from memra.app.core.cli.admin import create_admin, list_admins, reset_admin_password

app = typer.Typer(
    name="memra",
    help="Memra management commands.",
    add_completion=False,
)

app.command("migrate-fresh")(migrate_fresh)
app.command("seed")(seed)
app.command("clear-lightrag")(clear_lightrag)
app.command("worker")(worker)
app.command("create-admin")(create_admin)
app.command("list-admins")(list_admins)
app.command("reset-admin-password")(reset_admin_password)


def main() -> None:
    app()


if __name__ == "__main__":
    main()
