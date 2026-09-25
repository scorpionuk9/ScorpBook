-- ScorpBook's Phase 1 company tenant and starter chart of accounts.
-- Keep this ID stable in ScorpInvoice and application configuration.
CREATE TABLE public.accounting_tenants (
    id UUID PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stable single-company tenant ID for Scorpia Tech Ltd.
INSERT INTO public.accounting_tenants (id, name)
VALUES ('00000000-0000-4000-8000-000000000001', 'Scorpia Tech Ltd')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.accounting_accounts
    ADD CONSTRAINT fk_accounting_accounts_tenant
    FOREIGN KEY (tenant_id) REFERENCES public.accounting_tenants (id)
    ON DELETE RESTRICT;

ALTER TABLE public.accounting_journal_entries
    ADD CONSTRAINT fk_accounting_entries_tenant
    FOREIGN KEY (tenant_id) REFERENCES public.accounting_tenants (id)
    ON DELETE RESTRICT;

ALTER TABLE public.webhook_events
    ADD CONSTRAINT fk_webhook_events_tenant
    FOREIGN KEY (tenant_id) REFERENCES public.accounting_tenants (id)
    ON DELETE RESTRICT;

INSERT INTO public.accounting_accounts (tenant_id, code, name, type)
VALUES
    ('00000000-0000-4000-8000-000000000001', '1000', 'Bank Current Account', 'ASSET'),
    ('00000000-0000-4000-8000-000000000001', '1010', 'Stripe Clearing Account', 'ASSET'),
    ('00000000-0000-4000-8000-000000000001', '1100', 'Accounts Receivable', 'ASSET'),
    ('00000000-0000-4000-8000-000000000001', '1200', 'VAT Recoverable', 'ASSET'),
    ('00000000-0000-4000-8000-000000000001', '2000', 'Accounts Payable', 'LIABILITY'),
    ('00000000-0000-4000-8000-000000000001', '2100', 'VAT Payable', 'LIABILITY'),
    ('00000000-0000-4000-8000-000000000001', '2200', 'Corporation Tax Payable', 'LIABILITY'),
    ('00000000-0000-4000-8000-000000000001', '3000', 'Ordinary Share Capital', 'EQUITY'),
    ('00000000-0000-4000-8000-000000000001', '3100', 'Retained Earnings', 'EQUITY'),
    ('00000000-0000-4000-8000-000000000001', '4000', 'Sales Revenue', 'REVENUE'),
    ('00000000-0000-4000-8000-000000000001', '4100', 'Other Income', 'REVENUE'),
    ('00000000-0000-4000-8000-000000000001', '5000', 'Cost of Sales', 'EXPENSE'),
    ('00000000-0000-4000-8000-000000000001', '6000', 'Wages and Salaries', 'EXPENSE'),
    ('00000000-0000-4000-8000-000000000001', '6100', 'Professional Fees', 'EXPENSE'),
    ('00000000-0000-4000-8000-000000000001', '6200', 'Software and Subscriptions', 'EXPENSE'),
    ('00000000-0000-4000-8000-000000000001', '6300', 'Bank Charges', 'EXPENSE'),
    ('00000000-0000-4000-8000-000000000001', '6400', 'Travel and Subsistence', 'EXPENSE'),
    ('00000000-0000-4000-8000-000000000001', '6500', 'Office and Administration', 'EXPENSE'),
    ('00000000-0000-4000-8000-000000000001', '6600', 'Insurance', 'EXPENSE'),
    ('00000000-0000-4000-8000-000000000001', '6700', 'Depreciation', 'EXPENSE'),
    ('00000000-0000-4000-8000-000000000001', '7000', 'Corporation Tax Expense', 'EXPENSE')
ON CONFLICT (tenant_id, code) DO NOTHING;
