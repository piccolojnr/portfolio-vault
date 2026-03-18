"""Scope conversations to individual users (user_id NOT NULL + composite index)."""

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        -- Delete orphaned rows (no user_id set; dev data only)
        DELETE FROM conversations WHERE user_id IS NULL;

        ALTER TABLE conversations ALTER COLUMN user_id SET NOT NULL;

        -- Replace the org-only index with a composite one
        DROP INDEX IF EXISTS idx_conversations_org;
        CREATE INDEX idx_conversations_org_user ON conversations(org_id, user_id);
    """)


def downgrade() -> None:
    op.execute("""
        DROP INDEX IF EXISTS idx_conversations_org_user;
        CREATE INDEX idx_conversations_org ON conversations(org_id);
        ALTER TABLE conversations ALTER COLUMN user_id DROP NOT NULL;
    """)
