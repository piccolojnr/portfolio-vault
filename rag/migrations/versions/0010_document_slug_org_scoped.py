"""Make document slug unique per org instead of globally."""

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        -- Drop the global unique index on slug
        DROP INDEX IF EXISTS ix_documents_slug;
        ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_slug_key;
        ALTER TABLE documents DROP CONSTRAINT IF EXISTS uq_documents_slug;

        -- Add compound unique constraint scoped to (org_id, slug)
        ALTER TABLE documents
            ADD CONSTRAINT uq_documents_org_slug UNIQUE (org_id, slug);
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE documents DROP CONSTRAINT IF EXISTS uq_documents_org_slug;
        ALTER TABLE documents ADD CONSTRAINT documents_slug_key UNIQUE (slug);
    """)
