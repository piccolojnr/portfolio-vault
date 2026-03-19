"""Default org: insert default workspace, backfill org_id, enforce NOT NULL."""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    op.execute(f"""
        INSERT INTO organisations (id, name, slug, plan)
        VALUES ('{DEFAULT_ORG_ID}', 'Default Workspace', 'default', 'free');

        UPDATE documents     SET org_id = '{DEFAULT_ORG_ID}' WHERE org_id IS NULL;
        UPDATE conversations SET org_id = '{DEFAULT_ORG_ID}' WHERE org_id IS NULL;
        UPDATE jobs          SET org_id = '{DEFAULT_ORG_ID}' WHERE org_id IS NULL;

        ALTER TABLE documents     ALTER COLUMN org_id SET NOT NULL;
        ALTER TABLE conversations ALTER COLUMN org_id SET NOT NULL;
        ALTER TABLE jobs          ALTER COLUMN org_id SET NOT NULL;
    """)


def downgrade() -> None:
    op.execute(f"""
        ALTER TABLE jobs          ALTER COLUMN org_id DROP NOT NULL;
        ALTER TABLE conversations ALTER COLUMN org_id DROP NOT NULL;
        ALTER TABLE documents     ALTER COLUMN org_id DROP NOT NULL;

        DELETE FROM organisations WHERE id = '{DEFAULT_ORG_ID}';
    """)
