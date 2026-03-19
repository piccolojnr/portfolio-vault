"""Org scoping: add org_id/user_id to documents/conversations/jobs + organisation_settings table."""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE documents     ADD COLUMN org_id UUID REFERENCES organisations(id);
        ALTER TABLE conversations ADD COLUMN user_id UUID REFERENCES users(id);
        ALTER TABLE conversations ADD COLUMN org_id  UUID REFERENCES organisations(id);
        ALTER TABLE jobs          ADD COLUMN org_id  UUID REFERENCES organisations(id);

        CREATE TABLE organisation_settings (
            org_id      UUID    NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
            key         TEXT    NOT NULL,
            value       TEXT,
            is_secret   BOOLEAN NOT NULL DEFAULT false,
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (org_id, key)
        );

        CREATE INDEX idx_documents_org     ON documents(org_id);
        CREATE INDEX idx_conversations_org ON conversations(org_id);
    """)


def downgrade() -> None:
    op.execute("""
        DROP INDEX IF EXISTS idx_conversations_org;
        DROP INDEX IF EXISTS idx_documents_org;
        DROP TABLE IF EXISTS organisation_settings CASCADE;
        ALTER TABLE jobs          DROP COLUMN IF EXISTS org_id;
        ALTER TABLE conversations DROP COLUMN IF EXISTS org_id;
        ALTER TABLE conversations DROP COLUMN IF EXISTS user_id;
        ALTER TABLE documents     DROP COLUMN IF EXISTS org_id;
    """)
