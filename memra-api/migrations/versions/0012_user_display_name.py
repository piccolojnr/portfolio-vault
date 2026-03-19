"""Add display_name to users table."""

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(128);")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS display_name;")
