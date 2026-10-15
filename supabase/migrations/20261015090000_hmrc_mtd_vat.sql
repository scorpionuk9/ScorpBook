-- MTD VAT: each business can connect its HMRC account (OAuth tokens, encrypted
-- by the app with HMRC_TOKEN_KEY before they reach the database) and submit
-- VAT returns, keeping HMRC's receipt with the filed return.

CREATE TABLE public.accounting_hmrc_connections (
    tenant_id UUID PRIMARY KEY REFERENCES public.accounting_tenants (id) ON DELETE CASCADE,
    environment VARCHAR(10) NOT NULL CHECK (environment IN ('sandbox', 'production')),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    access_expires_at TIMESTAMPTZ NOT NULL,
    scope TEXT NOT NULL,
    connected_by UUID NOT NULL,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.accounting_hmrc_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accounting_hmrc_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_hmrc_connections TO service_role;

-- Returns submitted through MTD carry HMRC's period key and receipt; returns
-- only "marked as filed" keep these empty.
ALTER TABLE public.accounting_vat_returns
    ADD COLUMN period_key VARCHAR(4),
    ADD COLUMN submitted_at TIMESTAMPTZ,
    ADD COLUMN submission_environment VARCHAR(10) CHECK (submission_environment IN ('sandbox', 'production')),
    ADD COLUMN hmrc_receipt JSONB;

GRANT INSERT, UPDATE ON public.accounting_vat_returns TO service_role;
