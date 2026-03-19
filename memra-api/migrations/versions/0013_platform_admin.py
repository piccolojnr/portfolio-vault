"""Platform admin: admins, settings, model restrictions, audit log, refresh tokens.

Also adds user_id/duration_ms to ai_calls, disabled to users, and performance indexes.
"""

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        -- Platform admins
        CREATE TABLE platform_admins (
            id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email                TEXT UNIQUE NOT NULL,
            password_hash        TEXT NOT NULL,
            name                 TEXT NOT NULL,
            must_change_password BOOLEAN NOT NULL DEFAULT true,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_login_at        TIMESTAMPTZ
        );

        -- Platform settings (API keys, model config)
        CREATE TABLE platform_settings (
            key         TEXT PRIMARY KEY,
            value       TEXT,
            is_secret   BOOLEAN NOT NULL DEFAULT false,
            description TEXT,
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by  UUID REFERENCES platform_admins(id)
        );

        -- Model plan restrictions
        CREATE TABLE model_plan_restrictions (
            model_id    TEXT PRIMARY KEY,
            model_name  TEXT NOT NULL,
            model_type  TEXT NOT NULL,
            provider    TEXT NOT NULL,
            min_plan    TEXT NOT NULL DEFAULT 'free',
            enabled     BOOLEAN NOT NULL DEFAULT true,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        -- Admin refresh tokens (separate from user refresh tokens)
        CREATE TABLE admin_refresh_tokens (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            admin_id    UUID NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
            token_hash  TEXT UNIQUE NOT NULL,
            expires_at  TIMESTAMPTZ NOT NULL,
            revoked     BOOLEAN NOT NULL DEFAULT false,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            ip_address  TEXT
        );

        -- Admin audit log
        CREATE TABLE admin_audit_log (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            admin_id    UUID NOT NULL REFERENCES platform_admins(id),
            action      TEXT NOT NULL,
            target_type TEXT,
            target_id   TEXT,
            metadata    JSONB DEFAULT '{}',
            ip_address  TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        -- Indexes for admin tables
        CREATE INDEX idx_admin_refresh_tokens_admin
            ON admin_refresh_tokens(admin_id) WHERE revoked = false;
        CREATE INDEX idx_admin_audit_log_admin
            ON admin_audit_log(admin_id, created_at DESC);

        -- Extend existing tables
        ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS user_id UUID;
        ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

        -- Performance indexes on ai_calls for analytics
        CREATE INDEX IF NOT EXISTS idx_ai_calls_created_at
            ON ai_calls(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_ai_calls_org_created
            ON ai_calls(org_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_ai_calls_type_created
            ON ai_calls(call_type, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_ai_calls_user_created
            ON ai_calls(user_id, created_at DESC);

        -- Seed platform settings keys
        INSERT INTO platform_settings (key, is_secret, description) VALUES
            ('openai_api_key',           true,  'OpenAI API key for embeddings'),
            ('anthropic_api_key',        true,  'Anthropic API key for chat and classification'),
            ('chat_model',               false, 'Model used for chat completions'),
            ('classifier_model',         false, 'Model used for intent classification (cheap/fast)'),
            ('summariser_model',         false, 'Model used for conversation summarisation'),
            ('embedding_model',          false, 'Model used for document embeddings'),
            ('entity_extraction_model',  false, 'Model used by LightRAG for entity extraction'),
            ('email_backend',            false, 'Email sending backend: resend | mailpit | console'),
            ('email_from',               false, 'From address for outgoing emails'),
            ('resend_api_key',           true,  'Resend API key for transactional email'),
            ('storage_provider',         false, 'Storage backend: supabase | local'),
            ('free_plan_token_limit',    false, 'Monthly token limit for free plan orgs'),
            ('pro_plan_token_limit',     false, 'Monthly token limit for pro plan orgs');

        -- Seed model plan restrictions
        INSERT INTO model_plan_restrictions (model_id, model_name, model_type, provider, min_plan) VALUES
            ('claude-haiku-4-5-20251001',  'Claude Haiku 4.5',  'classify', 'anthropic', 'free'),
            ('claude-sonnet-4-6',          'Claude Sonnet 4.6', 'chat',     'anthropic', 'free'),
            ('claude-opus-4-6',            'Claude Opus 4.6',   'chat',     'anthropic', 'pro'),
            ('text-embedding-3-small',     'Embedding 3 Small', 'embed',    'openai',    'free'),
            ('text-embedding-3-large',     'Embedding 3 Large', 'embed',    'openai',    'pro');

        -- Seed default platform admin (password: changeme, must_change_password = true)
        INSERT INTO platform_admins (email, password_hash, name)
        VALUES (
            'admin@memra.com',
            '$2b$12$MbIsfsXuyll87FOKKusmwO4aaJ1KPN3AKNcxHR9dFbz8iM0jQKvXW',
            'Platform Admin'
        );

        -- Migrate existing platform-level settings values from the old settings table
        INSERT INTO platform_settings (key, value, is_secret, description, updated_at)
        SELECT
            CASE s.key
                WHEN 'anthropic_model' THEN 'chat_model'
                WHEN 'classifier_anthropic_model' THEN 'classifier_model'
                WHEN 'summarizer_anthropic_model' THEN 'summariser_model'
                ELSE s.key
            END,
            s.value,
            s.is_secret,
            COALESCE(ps.description, ''),
            s.updated_at
        FROM settings s
        LEFT JOIN platform_settings ps ON ps.key = (
            CASE s.key
                WHEN 'anthropic_model' THEN 'chat_model'
                WHEN 'classifier_anthropic_model' THEN 'classifier_model'
                WHEN 'summarizer_anthropic_model' THEN 'summariser_model'
                ELSE s.key
            END
        )
        WHERE s.key IN (
            'openai_api_key', 'anthropic_api_key', 'embedding_model',
            'anthropic_model', 'classifier_anthropic_model', 'summarizer_anthropic_model',
            'resend_api_key', 'storage_provider', 'email_backend', 'email_from'
        )
        AND s.value IS NOT NULL AND s.value != ''
        ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = EXCLUDED.updated_at;
    """)


def downgrade() -> None:
    op.execute("""
        DROP TABLE IF EXISTS admin_audit_log CASCADE;
        DROP TABLE IF EXISTS admin_refresh_tokens CASCADE;
        DROP TABLE IF EXISTS model_plan_restrictions CASCADE;
        DROP TABLE IF EXISTS platform_settings CASCADE;
        DROP TABLE IF EXISTS platform_admins CASCADE;

        ALTER TABLE users DROP COLUMN IF EXISTS disabled;
        ALTER TABLE ai_calls DROP COLUMN IF EXISTS user_id;
        ALTER TABLE ai_calls DROP COLUMN IF EXISTS duration_ms;

        DROP INDEX IF EXISTS idx_ai_calls_created_at;
        DROP INDEX IF EXISTS idx_ai_calls_org_created;
        DROP INDEX IF EXISTS idx_ai_calls_type_created;
        DROP INDEX IF EXISTS idx_ai_calls_user_created;
    """)
