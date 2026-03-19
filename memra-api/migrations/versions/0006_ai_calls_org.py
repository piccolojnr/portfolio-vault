"""Add org_id to ai_calls for per-org cost correlation."""

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE ai_calls
          ADD COLUMN org_id UUID REFERENCES organisations(id);
        CREATE INDEX idx_ai_calls_org ON ai_calls(org_id);
    """)


def downgrade() -> None:
    op.execute("""
        DROP INDEX IF EXISTS idx_ai_calls_org;
        ALTER TABLE ai_calls DROP COLUMN IF EXISTS org_id;
    """)
