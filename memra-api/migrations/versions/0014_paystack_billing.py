"""Paystack subscription billing schema.

Adds:
  - subscriptions: per-org Paystack subscription tracking
  - payment_events: immutable webhook audit log (idempotency + debugging)
  - plan_limits: configurable plan tier limits
  - organisations: paystack_customer_code + plan_source (self_service vs admin_override)
  - platform_settings: Paystack keys and plan codes
"""

from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        -- ───────────────────────────────────────────────────────────────────────
        -- Subscriptions (per org)
        -- ───────────────────────────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS subscriptions (
            id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id                    UUID UNIQUE NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,

            paystack_subscription_code TEXT,
            paystack_customer_code     TEXT,
            paystack_plan_code          TEXT,
            paystack_email_token        TEXT,

            status TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','cancelled','non_renewing','attention')),

            current_period_start TIMESTAMPTZ,
            current_period_end   TIMESTAMPTZ,
            cancelled_at         TIMESTAMPTZ,

            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_subscriptions_org_status
            ON subscriptions(org_id, status);

        -- ───────────────────────────────────────────────────────────────────────
        -- Paystack webhook audit log (idempotency)
        -- ───────────────────────────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS payment_events (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            paystack_event     TEXT NOT NULL,
            paystack_reference TEXT NOT NULL UNIQUE,
            org_id              UUID REFERENCES organisations(id) ON DELETE SET NULL,

            raw_payload JSONB NOT NULL,
            processed  BOOLEAN NOT NULL DEFAULT false,
            error      TEXT,

            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_payment_events_org_processed
            ON payment_events(org_id, processed);

        -- ───────────────────────────────────────────────────────────────────────
        -- Plan limits (replace old free/pro token limit settings)
        -- - NULL means "unlimited" for caps
        -- - monthly_token_limit NULL means "unlimited"
        -- ───────────────────────────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS plan_limits (
            plan_tier TEXT PRIMARY KEY
                CHECK (plan_tier IN ('free','pro','enterprise')),

            monthly_token_limit BIGINT,
            max_documents       INTEGER,
            max_corpora         INTEGER,
            max_members         INTEGER,

            -- Overage rate: USD per 500k tokens (for pro-like billing policies)
            overage_rate_per_500k_tokens NUMERIC(10,6) NOT NULL DEFAULT 0
        );

        -- Seed default limits (safe if called once in a fresh DB)
        INSERT INTO plan_limits (plan_tier, monthly_token_limit, max_documents, max_corpora, max_members, overage_rate_per_500k_tokens)
        VALUES
            ('free', 50000, 10, 1, 2, 0),
            ('pro', 2000000, NULL, 5, 20, 5),
            ('enterprise', NULL, NULL, NULL, NULL, 0)
        ON CONFLICT (plan_tier) DO UPDATE SET
            monthly_token_limit = EXCLUDED.monthly_token_limit,
            max_documents = EXCLUDED.max_documents,
            max_corpora = EXCLUDED.max_corpora,
            max_members = EXCLUDED.max_members,
            overage_rate_per_500k_tokens = EXCLUDED.overage_rate_per_500k_tokens;

        -- ───────────────────────────────────────────────────────────────────────
        -- Extend organisations
        -- ───────────────────────────────────────────────────────────────────────
        ALTER TABLE organisations
            ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT;

        ALTER TABLE organisations
            ADD COLUMN IF NOT EXISTS plan_source TEXT NOT NULL DEFAULT 'self_service'
                CHECK (plan_source IN ('self_service','admin_override'));

        -- ───────────────────────────────────────────────────────────────────────
        -- Seed Paystack settings (values are filled from admin UI later)
        -- ───────────────────────────────────────────────────────────────────────
        INSERT INTO platform_settings (key, is_secret, description) VALUES
            ('paystack_secret_key', true,  'Paystack webhook HMAC secret key'),
            ('paystack_public_key', false, 'Paystack public key for checkout'),
            ('paystack_pro_plan_code', false, 'Paystack plan code for pro'),
            ('paystack_enterprise_plan_code', false, 'Paystack plan code for enterprise')
        ON CONFLICT (key) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS payment_events;
        DROP TABLE IF EXISTS subscriptions;
        DROP TABLE IF EXISTS plan_limits;

        -- Note: removing columns is potentially destructive; keep backward compat.
        -- The platform will still run if those columns exist.
        """
    )

