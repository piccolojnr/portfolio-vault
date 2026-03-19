"""Make jobs.org_id nullable — system-level jobs (auth emails) have no org context."""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE jobs ALTER COLUMN org_id DROP NOT NULL;")


def downgrade() -> None:
    # Re-enforcing NOT NULL requires all rows to have a value; only safe if data is clean.
    op.execute("ALTER TABLE jobs ALTER COLUMN org_id SET NOT NULL;")
