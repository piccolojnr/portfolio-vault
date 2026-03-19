"""Add corpora table and active_corpus_id to organisations."""

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create corpora table
    op.execute("""
        CREATE TABLE IF NOT EXISTS corpora (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            corpus_key TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)

    # 2. Add active_corpus_id to organisations (nullable, FK added after seeding)
    op.execute("""
        ALTER TABLE organisations ADD COLUMN IF NOT EXISTS active_corpus_id UUID;
    """)

    # 3. Seed: create a default corpus for each existing org from their organisation_settings
    op.execute("""
        INSERT INTO corpora (id, org_id, name, corpus_key)
        SELECT gen_random_uuid(), s.org_id, 'Knowledge Base', s.value
        FROM organisation_settings s
        WHERE s.key = 'default_corpus_id'
        ON CONFLICT DO NOTHING;
    """)

    # 4. Set each org's active_corpus_id to their newly created corpus
    op.execute("""
        UPDATE organisations o
        SET active_corpus_id = c.id
        FROM corpora c
        WHERE c.org_id = o.id
          AND o.active_corpus_id IS NULL;
    """)

    # 5. Add FK constraint
    op.execute("""
        ALTER TABLE organisations
        ADD CONSTRAINT organisations_active_corpus_id_fkey
        FOREIGN KEY (active_corpus_id) REFERENCES corpora(id);
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE organisations DROP CONSTRAINT IF EXISTS organisations_active_corpus_id_fkey;")
    op.execute("ALTER TABLE organisations DROP COLUMN IF EXISTS active_corpus_id;")
    op.execute("DROP TABLE IF EXISTS corpora;")
