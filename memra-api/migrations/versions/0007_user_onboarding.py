"""Add onboarding fields to users."""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE users
          ADD COLUMN onboarding_completed_at TIMESTAMPTZ,
          ADD COLUMN use_case TEXT;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE users
          DROP COLUMN IF EXISTS onboarding_completed_at,
          DROP COLUMN IF EXISTS use_case;
    """)
