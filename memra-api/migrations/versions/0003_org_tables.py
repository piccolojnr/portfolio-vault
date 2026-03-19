"""Org tables: organisations, organisation_members, organisation_invites."""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE organisations (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name        TEXT NOT NULL,
            slug        TEXT UNIQUE NOT NULL,
            plan        TEXT NOT NULL DEFAULT 'free',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE organisation_members (
            user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            org_id     UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
            role       TEXT NOT NULL DEFAULT 'member',
            joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, org_id)
        );

        CREATE TABLE organisation_invites (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id           UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
            email            TEXT NOT NULL,
            role             TEXT NOT NULL DEFAULT 'member',
            token_hash       TEXT UNIQUE,
            invited_by       UUID REFERENCES users(id),
            expires_at       TIMESTAMPTZ,
            accepted         BOOLEAN NOT NULL DEFAULT false,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX idx_org_members_org
            ON organisation_members(org_id);

        CREATE INDEX idx_org_invites_email
            ON organisation_invites(email) WHERE accepted = false;
    """)


def downgrade() -> None:
    op.execute("""
        DROP TABLE IF EXISTS organisation_invites CASCADE;
        DROP TABLE IF EXISTS organisation_members CASCADE;
        DROP TABLE IF EXISTS organisations CASCADE;
    """)
