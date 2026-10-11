-- Guided ("what happened?") transactions: system account roles, a fuller UK
-- limited-company chart of accounts, and an atomic record-and-post RPC.

-- A system role marks the one account each guided workflow and dashboard figure
-- relies on, so features never depend on a tenant's account codes.
ALTER TABLE public.accounting_accounts
    ADD COLUMN system_role VARCHAR(40)
        CHECK (system_role IS NULL OR system_role IN (
            'BANK_CURRENT', 'STRIPE_CLEARING', 'GOCARDLESS_CLEARING', 'RECEIVABLES',
            'VAT_RECOVERABLE', 'ACCUMULATED_DEPRECIATION', 'PAYABLES', 'VAT_PAYABLE',
            'PAYE_PAYABLE', 'CORPORATION_TAX_PAYABLE', 'DIRECTORS_LOAN', 'SHARE_CAPITAL',
            'RETAINED_EARNINGS', 'DIVIDENDS', 'SALES', 'BANK_CHARGES', 'BAD_DEBTS',
            'FX_GAINS_LOSSES'
        ));

CREATE UNIQUE INDEX uq_accounting_accounts_tenant_role
    ON public.accounting_accounts (tenant_id, system_role)
    WHERE system_role IS NOT NULL;

INSERT INTO public.accounting_accounts (tenant_id, code, name, type)
VALUES
    ('00000000-0000-4000-8000-000000000001', '1020', 'GoCardless Clearing Account', 'ASSET'),
    ('00000000-0000-4000-8000-000000000001', '1500', 'Computer Equipment', 'ASSET'),
    ('00000000-0000-4000-8000-000000000001', '1510', 'Office Furniture and Equipment', 'ASSET'),
    ('00000000-0000-4000-8000-000000000001', '1590', 'Accumulated Depreciation', 'ASSET'),
    ('00000000-0000-4000-8000-000000000001', '2150', 'PAYE and NI Payable', 'LIABILITY'),
    ('00000000-0000-4000-8000-000000000001', '2300', 'Director''s Loan Account', 'LIABILITY'),
    ('00000000-0000-4000-8000-000000000001', '3200', 'Dividends', 'EQUITY'),
    ('00000000-0000-4000-8000-000000000001', '6800', 'Bad Debts', 'EXPENSE'),
    ('00000000-0000-4000-8000-000000000001', '6850', 'Advertising and Marketing', 'EXPENSE'),
    ('00000000-0000-4000-8000-000000000001', '7100', 'Foreign Exchange Gains and Losses', 'EXPENSE')
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Assign roles only where the existing account still has the expected type, so a
-- tenant-created account that happens to share a code is never misclassified.
UPDATE public.accounting_accounts AS account
SET system_role = role_map.system_role
FROM (VALUES
    ('1000', 'ASSET', 'BANK_CURRENT'),
    ('1010', 'ASSET', 'STRIPE_CLEARING'),
    ('1020', 'ASSET', 'GOCARDLESS_CLEARING'),
    ('1100', 'ASSET', 'RECEIVABLES'),
    ('1200', 'ASSET', 'VAT_RECOVERABLE'),
    ('1590', 'ASSET', 'ACCUMULATED_DEPRECIATION'),
    ('2000', 'LIABILITY', 'PAYABLES'),
    ('2100', 'LIABILITY', 'VAT_PAYABLE'),
    ('2150', 'LIABILITY', 'PAYE_PAYABLE'),
    ('2200', 'LIABILITY', 'CORPORATION_TAX_PAYABLE'),
    ('2300', 'LIABILITY', 'DIRECTORS_LOAN'),
    ('3000', 'EQUITY', 'SHARE_CAPITAL'),
    ('3100', 'EQUITY', 'RETAINED_EARNINGS'),
    ('3200', 'EQUITY', 'DIVIDENDS'),
    ('4000', 'REVENUE', 'SALES'),
    ('6300', 'EXPENSE', 'BANK_CHARGES'),
    ('6800', 'EXPENSE', 'BAD_DEBTS'),
    ('7100', 'EXPENSE', 'FX_GAINS_LOSSES')
) AS role_map (code, type, system_role)
WHERE account.tenant_id = '00000000-0000-4000-8000-000000000001'
  AND account.code = role_map.code
  AND account.type = role_map.type
  AND account.system_role IS NULL;

-- Saves and posts a guided transaction in one database transaction, so a failed
-- posting never leaves a stray draft behind.
CREATE OR REPLACE FUNCTION public.record_guided_transaction(
    p_tenant_id UUID,
    p_entry_date DATE,
    p_lines JSONB,
    p_description TEXT,
    p_scenario VARCHAR,
    p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    saved JSONB;
BEGIN
    IF NULLIF(BTRIM(p_scenario), '') IS NULL THEN
        RAISE EXCEPTION 'A guided transaction scenario is required' USING ERRCODE = 'check_violation';
    END IF;
    saved := public.save_draft_journal_entry_numbered(
        p_tenant_id, p_entry_date, 'MANUAL', p_lines, NULL, p_description,
        NULL, LEFT('GUIDED_' || UPPER(p_scenario), 50), NULL, p_actor_id
    );
    PERFORM public.post_journal_entry(p_tenant_id, (saved->>'id')::UUID, p_actor_id);
    RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION public.record_guided_transaction(UUID, DATE, JSONB, TEXT, VARCHAR, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_guided_transaction(UUID, DATE, JSONB, TEXT, VARCHAR, UUID) TO service_role;
