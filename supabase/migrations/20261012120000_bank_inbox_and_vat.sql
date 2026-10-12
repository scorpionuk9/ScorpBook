-- Bank inbox (imported bank lines to categorise or match), remembered
-- categorisation rules, and a 9-box VAT return calculated from the ledger.

-- Roles for accounts the VAT return and guided entry must recognise.
ALTER TABLE public.accounting_accounts DROP CONSTRAINT IF EXISTS accounting_accounts_system_role_check;
ALTER TABLE public.accounting_accounts ADD CONSTRAINT accounting_accounts_system_role_check
    CHECK (system_role IS NULL OR system_role IN (
        'BANK_CURRENT', 'STRIPE_CLEARING', 'GOCARDLESS_CLEARING', 'RECEIVABLES',
        'VAT_RECOVERABLE', 'ACCUMULATED_DEPRECIATION', 'PAYABLES', 'VAT_PAYABLE',
        'PAYE_PAYABLE', 'CORPORATION_TAX_PAYABLE', 'DIRECTORS_LOAN', 'SHARE_CAPITAL',
        'RETAINED_EARNINGS', 'DIVIDENDS', 'SALES', 'BANK_CHARGES', 'BAD_DEBTS',
        'FX_GAINS_LOSSES', 'WAGES', 'DEPRECIATION', 'CORPORATION_TAX_EXPENSE'
    ));

UPDATE public.accounting_accounts AS account
SET system_role = role_map.system_role
FROM (VALUES
    ('6000', 'EXPENSE', 'WAGES'),
    ('6700', 'EXPENSE', 'DEPRECIATION'),
    ('7000', 'EXPENSE', 'CORPORATION_TAX_EXPENSE')
) AS role_map (code, type, system_role)
WHERE account.tenant_id = '00000000-0000-4000-8000-000000000001'
  AND account.code = role_map.code AND account.type = role_map.type
  AND account.system_role IS NULL;

CREATE TABLE public.accounting_bank_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.accounting_tenants (id) ON DELETE RESTRICT,
    match_text VARCHAR(100) NOT NULL CHECK (LENGTH(BTRIM(match_text)) >= 2),
    direction VARCHAR(3) NOT NULL CHECK (direction IN ('IN', 'OUT')),
    scenario VARCHAR(20) NOT NULL,
    -- Category for money in/out/equipment/HMRC; the other bank account for transfers.
    account_id UUID,
    owner_choice VARCHAR(20),
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id, account_id) REFERENCES public.accounting_accounts (tenant_id, id)
);
CREATE UNIQUE INDEX uq_accounting_bank_rules_text
    ON public.accounting_bank_rules (tenant_id, LOWER(BTRIM(match_text)), direction);

CREATE TABLE public.accounting_bank_feed_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.accounting_tenants (id) ON DELETE RESTRICT,
    bank_account_id UUID NOT NULL,
    transaction_date DATE NOT NULL,
    description VARCHAR(500) NOT NULL,
    reference VARCHAR(150),
    amount NUMERIC(15, 4) NOT NULL CHECK (amount <> 0),
    -- Identifies the same statement line across overlapping imports.
    fingerprint VARCHAR(700) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'DONE', 'IGNORED')),
    journal_entry_id UUID,
    matched_journal_line_id UUID,
    imported_by UUID,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    CONSTRAINT uq_bank_feed_fingerprint UNIQUE (tenant_id, bank_account_id, fingerprint),
    CONSTRAINT chk_bank_feed_resolution CHECK (
        (status = 'DONE') = (journal_entry_id IS NOT NULL)
    ),
    FOREIGN KEY (tenant_id, bank_account_id) REFERENCES public.accounting_accounts (tenant_id, id),
    FOREIGN KEY (tenant_id, journal_entry_id) REFERENCES public.accounting_journal_entries (tenant_id, id)
);
CREATE INDEX idx_bank_feed_status ON public.accounting_bank_feed_lines (tenant_id, status, transaction_date DESC);
CREATE UNIQUE INDEX uq_bank_feed_matched_line
    ON public.accounting_bank_feed_lines (tenant_id, matched_journal_line_id) WHERE matched_journal_line_id IS NOT NULL;

CREATE TABLE public.accounting_vat_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.accounting_tenants (id) ON DELETE RESTRICT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL CHECK (period_end >= period_start),
    boxes JSONB NOT NULL,
    filed_by UUID,
    filed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_vat_return_period UNIQUE (tenant_id, period_start, period_end)
);

ALTER TABLE public.accounting_bank_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_bank_feed_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_vat_returns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accounting_bank_rules, public.accounting_bank_feed_lines, public.accounting_vat_returns
    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.accounting_bank_rules TO service_role;
GRANT SELECT ON public.accounting_bank_feed_lines, public.accounting_vat_returns TO service_role;

CREATE OR REPLACE FUNCTION public.import_bank_feed_lines(
    p_tenant_id UUID, p_actor_id UUID, p_bank_account_id UUID, p_rows JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
    item JSONB;
    inserted INTEGER := 0;
    total INTEGER := 0;
    row_count INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.accounting_accounts
         WHERE tenant_id = p_tenant_id AND id = p_bank_account_id AND type = 'ASSET'
           AND code LIKE '10%' AND is_active
    ) THEN
        RAISE EXCEPTION 'Choose an active bank or payment account' USING ERRCODE = 'check_violation';
    END IF;
    IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
        RAISE EXCEPTION 'The statement has no transactions' USING ERRCODE = 'check_violation';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
        total := total + 1;
        INSERT INTO public.accounting_bank_feed_lines
            (tenant_id, bank_account_id, transaction_date, description, reference, amount, fingerprint, imported_by)
        VALUES (p_tenant_id, p_bank_account_id, (item->>'transaction_date')::DATE,
                LEFT(BTRIM(item->>'description'), 500), NULLIF(LEFT(BTRIM(item->>'reference'), 150), ''),
                (item->>'amount')::NUMERIC, item->>'fingerprint', p_actor_id)
        ON CONFLICT (tenant_id, bank_account_id, fingerprint) DO NOTHING;
        GET DIAGNOSTICS row_count = ROW_COUNT;
        inserted := inserted + row_count;
    END LOOP;
    RETURN jsonb_build_object('imported', inserted, 'skipped', total - inserted);
END;
$$;

-- Records a bank line as a new guided transaction and optionally remembers a rule.
CREATE OR REPLACE FUNCTION public.categorise_bank_feed_line(
    p_tenant_id UUID, p_actor_id UUID, p_line_id UUID, p_lines JSONB,
    p_description TEXT, p_scenario VARCHAR, p_rule JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
    feed public.accounting_bank_feed_lines%ROWTYPE;
    saved JSONB;
BEGIN
    SELECT * INTO feed FROM public.accounting_bank_feed_lines
     WHERE tenant_id = p_tenant_id AND id = p_line_id FOR UPDATE;
    IF NOT FOUND OR feed.status <> 'NEW' THEN
        RAISE EXCEPTION 'This bank transaction has already been dealt with' USING ERRCODE = 'check_violation';
    END IF;
    -- The entry must move exactly the statement amount through this bank account.
    IF (SELECT COALESCE(SUM((line->>'debit')::NUMERIC - (line->>'credit')::NUMERIC), 0)
          FROM jsonb_array_elements(p_lines) AS line
         WHERE (line->>'account_id')::UUID = feed.bank_account_id) <> feed.amount THEN
        RAISE EXCEPTION 'The entry does not match the bank transaction amount' USING ERRCODE = 'check_violation';
    END IF;

    saved := public.record_guided_transaction(p_tenant_id, feed.transaction_date, p_lines, p_description, p_scenario, p_actor_id);
    UPDATE public.accounting_bank_feed_lines
       SET status = 'DONE', journal_entry_id = (saved->>'id')::UUID, resolved_by = p_actor_id, resolved_at = NOW()
     WHERE id = feed.id;

    IF p_rule IS NOT NULL AND NULLIF(BTRIM(p_rule->>'match_text'), '') IS NOT NULL THEN
        INSERT INTO public.accounting_bank_rules
            (tenant_id, match_text, direction, scenario, account_id, owner_choice, created_by)
        VALUES (p_tenant_id, BTRIM(p_rule->>'match_text'), CASE WHEN feed.amount > 0 THEN 'IN' ELSE 'OUT' END,
                p_scenario, NULLIF(p_rule->>'account_id', '')::UUID, NULLIF(p_rule->>'owner_choice', ''), p_actor_id)
        ON CONFLICT (tenant_id, LOWER(BTRIM(match_text)), direction) DO UPDATE
            SET scenario = EXCLUDED.scenario, account_id = EXCLUDED.account_id, owner_choice = EXCLUDED.owner_choice;
    END IF;
    RETURN saved;
END;
$$;

-- Links a bank line to an existing posted entry on the same account (for example
-- a payment already recorded from a bill or ScorpInvoice) instead of posting again.
CREATE OR REPLACE FUNCTION public.match_bank_feed_line(
    p_tenant_id UUID, p_actor_id UUID, p_line_id UUID, p_journal_line_id UUID
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
    feed public.accounting_bank_feed_lines%ROWTYPE;
    ledger RECORD;
BEGIN
    SELECT * INTO feed FROM public.accounting_bank_feed_lines
     WHERE tenant_id = p_tenant_id AND id = p_line_id FOR UPDATE;
    IF NOT FOUND OR feed.status <> 'NEW' THEN
        RAISE EXCEPTION 'This bank transaction has already been dealt with' USING ERRCODE = 'check_violation';
    END IF;
    SELECT line.entry_id, line.account_id, line.debit - line.credit AS amount, entry.status
      INTO ledger
      FROM public.accounting_journal_lines AS line
      JOIN public.accounting_journal_entries AS entry ON entry.tenant_id = line.tenant_id AND entry.id = line.entry_id
     WHERE line.tenant_id = p_tenant_id AND line.id = p_journal_line_id;
    IF NOT FOUND OR ledger.status <> 'POSTED' OR ledger.account_id <> feed.bank_account_id OR ledger.amount <> feed.amount THEN
        RAISE EXCEPTION 'That entry does not match this bank transaction' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.accounting_bank_feed_lines
       SET status = 'DONE', journal_entry_id = ledger.entry_id, matched_journal_line_id = p_journal_line_id,
           resolved_by = p_actor_id, resolved_at = NOW()
     WHERE id = feed.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_bank_feed_line_ignored(
    p_tenant_id UUID, p_actor_id UUID, p_line_id UUID, p_ignored BOOLEAN
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
    UPDATE public.accounting_bank_feed_lines
       SET status = CASE WHEN p_ignored THEN 'IGNORED' ELSE 'NEW' END,
           resolved_by = CASE WHEN p_ignored THEN p_actor_id END,
           resolved_at = CASE WHEN p_ignored THEN NOW() END
     WHERE tenant_id = p_tenant_id AND id = p_line_id
       AND status = CASE WHEN p_ignored THEN 'NEW' ELSE 'IGNORED' END;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'This bank transaction can no longer be changed' USING ERRCODE = 'check_violation';
    END IF;
END;
$$;

-- 9-box VAT return on the accrual basis (invoice/bill dates) for posted entries.
-- Boxes 1 and 4 come from movements on the VAT accounts, excluding settlements
-- with HMRC (entries that only touch VAT and bank/payment accounts). Boxes 6
-- and 7 are net sales and purchases in whole pounds; box 7 leaves out wages,
-- depreciation, corporation tax, bad debts and exchange differences, which are
-- outside the scope of VAT. Boxes 2, 8 and 9 (Northern Ireland/EU goods) are 0.
CREATE OR REPLACE FUNCTION public.get_vat_return(p_tenant_id UUID, p_start DATE, p_end DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
    box1 NUMERIC; box4 NUMERIC; box6 NUMERIC; box7 NUMERIC;
BEGIN
    IF p_start IS NULL OR p_end IS NULL OR p_start > p_end THEN
        RAISE EXCEPTION 'A valid VAT period is required' USING ERRCODE = 'check_violation';
    END IF;
    WITH period_lines AS (
        SELECT line.entry_id, line.debit, line.credit, account.type, account.code, account.system_role
          FROM public.accounting_journal_lines AS line
          JOIN public.accounting_journal_entries AS entry
            ON entry.tenant_id = line.tenant_id AND entry.id = line.entry_id
          JOIN public.accounting_accounts AS account
            ON account.tenant_id = line.tenant_id AND account.id = line.account_id
         WHERE line.tenant_id = p_tenant_id AND entry.status = 'POSTED'
           AND entry.entry_date BETWEEN p_start AND p_end
    ), settlements AS (
        SELECT entry_id FROM period_lines
         GROUP BY entry_id
        -- COALESCE matters: BOOL_AND skips NULLs, which would misclassify purchases.
        HAVING BOOL_AND(COALESCE(system_role, '') IN ('VAT_PAYABLE', 'VAT_RECOVERABLE') OR (type = 'ASSET' AND code LIKE '10%'))
           AND BOOL_OR(COALESCE(system_role, '') IN ('VAT_PAYABLE', 'VAT_RECOVERABLE'))
    ), relevant AS (
        SELECT * FROM period_lines WHERE entry_id NOT IN (SELECT entry_id FROM settlements)
    )
    SELECT
        COALESCE(SUM(credit - debit) FILTER (WHERE system_role = 'VAT_PAYABLE'), 0),
        COALESCE(SUM(debit - credit) FILTER (WHERE system_role = 'VAT_RECOVERABLE'), 0),
        COALESCE(SUM(credit - debit) FILTER (WHERE type = 'REVENUE'), 0),
        COALESCE(SUM(debit - credit) FILTER (WHERE
            (type = 'EXPENSE' AND COALESCE(system_role, '') NOT IN
                ('WAGES', 'DEPRECIATION', 'CORPORATION_TAX_EXPENSE', 'BAD_DEBTS', 'FX_GAINS_LOSSES'))
            OR (type = 'ASSET' AND code LIKE '15%' AND system_role IS NULL)), 0)
      INTO box1, box4, box6, box7
      FROM relevant;

    RETURN jsonb_build_object(
        'box1', ROUND(box1, 2)::TEXT, 'box2', '0.00', 'box3', ROUND(box1, 2)::TEXT,
        'box4', ROUND(box4, 2)::TEXT, 'box5', ROUND(box1 - box4, 2)::TEXT,
        'box6', TRUNC(box6)::TEXT, 'box7', TRUNC(box7)::TEXT, 'box8', '0', 'box9', '0'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.file_vat_return(p_tenant_id UUID, p_actor_id UUID, p_start DATE, p_end DATE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE boxes JSONB;
BEGIN
    IF p_end >= (NOW() AT TIME ZONE 'Europe/London')::DATE THEN
        RAISE EXCEPTION 'A VAT return can only be marked as filed after its period has ended' USING ERRCODE = 'check_violation';
    END IF;
    boxes := public.get_vat_return(p_tenant_id, p_start, p_end);
    INSERT INTO public.accounting_vat_returns (tenant_id, period_start, period_end, boxes, filed_by)
    VALUES (p_tenant_id, p_start, p_end, boxes, p_actor_id);
    RETURN boxes;
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This VAT period has already been marked as filed' USING ERRCODE = 'unique_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.import_bank_feed_lines(UUID, UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.categorise_bank_feed_line(UUID, UUID, UUID, JSONB, TEXT, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_bank_feed_line(UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_bank_feed_line_ignored(UUID, UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_vat_return(UUID, DATE, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.file_vat_return(UUID, UUID, DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_bank_feed_lines(UUID, UUID, UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.categorise_bank_feed_line(UUID, UUID, UUID, JSONB, TEXT, VARCHAR, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_bank_feed_line(UUID, UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_bank_feed_line_ignored(UUID, UUID, UUID, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_vat_return(UUID, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.file_vat_return(UUID, UUID, DATE, DATE) TO service_role;
