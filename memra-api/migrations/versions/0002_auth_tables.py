"""Auth tables: users, refresh_tokens, magic_link_tokens, password_reset_tokens."""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE users (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email           TEXT UNIQUE NOT NULL,
            password_hash   TEXT,
            email_verified  BOOLEAN NOT NULL DEFAULT false,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE refresh_tokens (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash    TEXT UNIQUE,
            expires_at    TIMESTAMPTZ,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_used_at  TIMESTAMPTZ,
            revoked       BOOLEAN NOT NULL DEFAULT false,
            user_agent    TEXT,
            ip_address    TEXT
        );

        CREATE TABLE magic_link_tokens (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email       TEXT NOT NULL,
            token_hash  TEXT UNIQUE,
            expires_at  TIMESTAMPTZ,
            used        BOOLEAN NOT NULL DEFAULT false,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE password_reset_tokens (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash  TEXT UNIQUE,
            expires_at  TIMESTAMPTZ,
            used        BOOLEAN NOT NULL DEFAULT false,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX idx_refresh_tokens_user
            ON refresh_tokens(user_id) WHERE revoked = false;

        CREATE INDEX idx_magic_link_tokens_email
            ON magic_link_tokens(email) WHERE used = false;
    """)


def downgrade() -> None:
    op.execute("""
        DROP TABLE IF EXISTS password_reset_tokens CASCADE;
        DROP TABLE IF EXISTS magic_link_tokens CASCADE;
        DROP TABLE IF EXISTS refresh_tokens CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
    """)
