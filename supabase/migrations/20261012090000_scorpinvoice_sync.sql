-- ScorpInvoice → ScorpBook sync. ScorpInvoice sends the latest snapshot of an
-- invoice or expense whenever it changes; ScorpBook compares the postings that
-- snapshot implies with what it has already posted and reverses/posts only the
-- difference. Replays, duplicates and out-of-order deliveries are therefore safe.

ALTER TABLE public.webhook_events
    ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'PROCESSED'
        CHECK (status IN ('PROCESSED', 'STALE', 'NEEDS_ATTENTION')),
    ADD COLUMN error TEXT,
    ADD COLUMN attempts INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX idx_webhook_events_tenant_status ON public.webhook_events (tenant_id, status, processed_at DESC);

-- Latest snapshot applied per ScorpInvoice record, used to ignore stale deliveries.
CREATE TABLE public.scorpinvoice_sync_state (
    tenant_id UUID NOT NULL REFERENCES public.accounting_tenants (id) ON DELETE RESTRICT,
    aggregate_type VARCHAR(20) NOT NULL CHECK (aggregate_type IN ('INVOICE', 'EXPENSE')),
    aggregate_id UUID NOT NULL,
    last_snapshot_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tenant_id, aggregate_type, aggregate_id)
);

-- Journal entries posted on behalf of a ScorpInvoice record. Only one active
-- posting exists per record and kind; superseded postings keep their reversal link.
CREATE TABLE public.scorpinvoice_postings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    aggregate_type VARCHAR(20) NOT NULL CHECK (aggregate_type IN ('INVOICE', 'EXPENSE')),
    aggregate_id UUID NOT NULL,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('ISSUE', 'SETTLE', 'BAD_DEBT', 'EXPENSE')),
    journal_entry_id UUID NOT NULL,
    debit_account_id UUID NOT NULL,
    credit_account_id UUID NOT NULL,
    amount NUMERIC(15, 4) NOT NULL CHECK (amount > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    reversed_by_entry_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id, journal_entry_id) REFERENCES public.accounting_journal_entries (tenant_id, id),
    FOREIGN KEY (tenant_id, reversed_by_entry_id) REFERENCES public.accounting_journal_entries (tenant_id, id)
);
CREATE UNIQUE INDEX uq_scorpinvoice_postings_active
    ON public.scorpinvoice_postings (tenant_id, aggregate_type, aggregate_id, kind) WHERE is_active;

-- Which ScorpBook account each ScorpInvoice expense category posts to.
CREATE TABLE public.scorpinvoice_expense_accounts (
    tenant_id UUID NOT NULL,
    category VARCHAR(40) NOT NULL,
    account_id UUID NOT NULL,
    PRIMARY KEY (tenant_id, category),
    FOREIGN KEY (tenant_id, account_id) REFERENCES public.accounting_accounts (tenant_id, id)
);

-- Per-tenant sync settings. ScorpInvoice expenses don't say how they were paid,
-- so they are credited to this account (the company bank account by default).
CREATE TABLE public.scorpinvoice_settings (
    tenant_id UUID PRIMARY KEY REFERENCES public.accounting_tenants (id) ON DELETE RESTRICT,
    expense_paid_from_account_id UUID NOT NULL,
    FOREIGN KEY (tenant_id, expense_paid_from_account_id) REFERENCES public.accounting_accounts (tenant_id, id)
);

INSERT INTO public.scorpinvoice_expense_accounts (tenant_id, category, account_id)
SELECT account.tenant_id, mapping.category, account.id
  FROM (VALUES
      ('office_costs', '6500'), ('travel', '6400'), ('staff_costs', '6000'),
      ('stock_materials', '5000'), ('professional_fees', '6100'), ('marketing', '6850'),
      ('financial_costs', '6300'), ('other', '6500')
  ) AS mapping (category, code)
  JOIN public.accounting_accounts AS account
    ON account.tenant_id = '00000000-0000-4000-8000-000000000001'
   AND account.code = mapping.code AND account.type = 'EXPENSE'
ON CONFLICT DO NOTHING;

INSERT INTO public.scorpinvoice_settings (tenant_id, expense_paid_from_account_id)
SELECT tenant_id, id FROM public.accounting_accounts
 WHERE tenant_id = '00000000-0000-4000-8000-000000000001' AND system_role = 'BANK_CURRENT'
ON CONFLICT DO NOTHING;

ALTER TABLE public.scorpinvoice_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scorpinvoice_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scorpinvoice_expense_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scorpinvoice_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scorpinvoice_sync_state, public.scorpinvoice_postings,
    public.scorpinvoice_expense_accounts, public.scorpinvoice_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.scorpinvoice_sync_state, public.scorpinvoice_postings,
    public.scorpinvoice_expense_accounts, public.scorpinvoice_settings TO service_role;

CREATE OR REPLACE FUNCTION public.scorpbook_role_account(p_tenant_id UUID, p_role VARCHAR)
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE found_id UUID;
BEGIN
    SELECT id INTO found_id FROM public.accounting_accounts
     WHERE tenant_id = p_tenant_id AND system_role = p_role AND is_active;
    IF found_id IS NULL THEN
        RAISE EXCEPTION 'No active account is set up for %', p_role USING ERRCODE = 'no_data_found';
    END IF;
    RETURN found_id;
END;
$$;

-- Today in the UK, or the given date when its month is still open. Postings for
-- a locked month land on today's date instead of failing.
CREATE OR REPLACE FUNCTION public.scorpbook_open_posting_date(p_tenant_id UUID, p_date DATE)
RETURNS DATE LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
    SELECT CASE WHEN EXISTS (
        SELECT 1 FROM public.accounting_periods
         WHERE tenant_id = p_tenant_id AND status = 'CLOSED'
           AND p_date BETWEEN period_start AND period_end
    ) THEN (NOW() AT TIME ZONE 'Europe/London')::DATE ELSE p_date END;
$$;

-- Makes the active posting for one record/kind match the desired one: reverses
-- it if it differs or is no longer wanted, then posts the desired entry.
CREATE OR REPLACE FUNCTION public.sync_scorpinvoice_posting(
    p_tenant_id UUID, p_aggregate_type VARCHAR, p_aggregate_id UUID, p_kind VARCHAR,
    p_debit_account_id UUID, p_credit_account_id UUID, p_amount NUMERIC,
    p_entry_date DATE, p_description TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
    current_posting public.scorpinvoice_postings%ROWTYPE;
    wanted BOOLEAN := p_amount IS NOT NULL AND p_amount > 0;
    posting_date DATE;
    saved JSONB;
    reversal JSONB;
BEGIN
    SELECT * INTO current_posting FROM public.scorpinvoice_postings
     WHERE tenant_id = p_tenant_id AND aggregate_type = p_aggregate_type
       AND aggregate_id = p_aggregate_id AND kind = p_kind AND is_active
     FOR UPDATE;

    IF FOUND THEN
        IF wanted AND current_posting.debit_account_id = p_debit_account_id
           AND current_posting.credit_account_id = p_credit_account_id
           AND current_posting.amount = p_amount THEN
            RETURN;
        END IF;
        reversal := public.reverse_journal_entry_numbered(
            p_tenant_id, current_posting.journal_entry_id,
            (NOW() AT TIME ZONE 'Europe/London')::DATE, NULL,
            'ScorpInvoice update: ' || COALESCE(p_description, 'record changed or cancelled'), NULL
        );
        UPDATE public.scorpinvoice_postings
           SET is_active = FALSE, reversed_by_entry_id = (reversal->>'id')::UUID
         WHERE id = current_posting.id;
    END IF;

    IF NOT wanted THEN RETURN; END IF;

    posting_date := public.scorpbook_open_posting_date(p_tenant_id, p_entry_date);
    saved := public.save_draft_journal_entry_numbered(
        p_tenant_id, posting_date, 'SCORPINVOICE',
        jsonb_build_array(
            jsonb_build_object('account_id', p_debit_account_id, 'debit', p_amount::TEXT, 'credit', '0'),
            jsonb_build_object('account_id', p_credit_account_id, 'debit', '0', 'credit', p_amount::TEXT)
        ),
        NULL,
        p_description || CASE WHEN posting_date <> p_entry_date
            THEN ' (dated ' || TO_CHAR(p_entry_date, 'DD Mon YYYY') || ' in ScorpInvoice; that month is locked)' ELSE '' END,
        p_aggregate_id::TEXT, p_kind, NULL, NULL
    );
    PERFORM public.post_journal_entry(p_tenant_id, (saved->>'id')::UUID, NULL);
    INSERT INTO public.scorpinvoice_postings
        (tenant_id, aggregate_type, aggregate_id, kind, journal_entry_id, debit_account_id, credit_account_id, amount)
    VALUES (p_tenant_id, p_aggregate_type, p_aggregate_id, p_kind, (saved->>'id')::UUID,
            p_debit_account_id, p_credit_account_id, p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_scorpinvoice_snapshot(p_tenant_id UUID, p_snapshot JSONB)
RETURNS VARCHAR LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
    record_type VARCHAR := UPPER(p_snapshot->>'type');
    record_id UUID := (p_snapshot->>'id')::UUID;
    snapshot_at TIMESTAMPTZ := (p_snapshot->>'snapshot_at')::TIMESTAMPTZ;
    last_applied TIMESTAMPTZ;
    invoice_status TEXT;
    amount NUMERIC;
    label TEXT;
    receivables UUID;
    settlement_account UUID;
    expense_account UUID;
    paid_from UUID;
BEGIN
    IF record_type NOT IN ('INVOICE', 'EXPENSE') OR record_id IS NULL OR snapshot_at IS NULL THEN
        RAISE EXCEPTION 'Snapshot must include type, id and snapshot_at' USING ERRCODE = 'check_violation';
    END IF;

    -- Serialise work per record and drop snapshots older than the last one applied.
    -- Equal timestamps are re-applied; that is harmless because applying is idempotent.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT || record_id::TEXT, 0));
    SELECT last_snapshot_at INTO last_applied FROM public.scorpinvoice_sync_state
     WHERE tenant_id = p_tenant_id AND aggregate_type = record_type AND aggregate_id = record_id;
    IF last_applied IS NOT NULL AND snapshot_at < last_applied THEN
        RETURN 'STALE';
    END IF;

    IF record_type = 'INVOICE' THEN
        invoice_status := p_snapshot->>'status';
        amount := ROUND((p_snapshot->>'amount_gbp_pence')::NUMERIC / 100, 2);
        label := 'Invoice ' || COALESCE(p_snapshot->>'number', '') ||
                 COALESCE(' to ' || NULLIF(p_snapshot->>'client_name', ''), '');
        receivables := public.scorpbook_role_account(p_tenant_id, 'RECEIVABLES');

        PERFORM public.sync_scorpinvoice_posting(p_tenant_id, 'INVOICE', record_id, 'ISSUE',
            receivables, public.scorpbook_role_account(p_tenant_id, 'SALES'),
            CASE WHEN invoice_status IN ('sent', 'overdue', 'paid', 'bad_debt') THEN amount END,
            (p_snapshot->>'issued_on')::DATE, label);

        IF invoice_status = 'paid' THEN
            settlement_account := public.scorpbook_role_account(p_tenant_id,
                CASE p_snapshot->>'payment_provider'
                    WHEN 'stripe' THEN 'STRIPE_CLEARING'
                    WHEN 'gocardless' THEN 'GOCARDLESS_CLEARING'
                    ELSE 'BANK_CURRENT' END);
        END IF;
        PERFORM public.sync_scorpinvoice_posting(p_tenant_id, 'INVOICE', record_id, 'SETTLE',
            settlement_account, receivables,
            CASE WHEN invoice_status = 'paid' THEN amount END,
            COALESCE((p_snapshot->>'paid_on')::DATE, (snapshot_at AT TIME ZONE 'Europe/London')::DATE),
            'Payment received for ' || label);

        PERFORM public.sync_scorpinvoice_posting(p_tenant_id, 'INVOICE', record_id, 'BAD_DEBT',
            CASE WHEN invoice_status = 'bad_debt' THEN public.scorpbook_role_account(p_tenant_id, 'BAD_DEBTS') END,
            receivables,
            CASE WHEN invoice_status = 'bad_debt' THEN amount END,
            (snapshot_at AT TIME ZONE 'Europe/London')::DATE,
            'Written off as bad debt: ' || label);
    ELSE
        amount := CASE WHEN COALESCE((p_snapshot->>'deleted')::BOOLEAN, FALSE) THEN NULL
                       ELSE ROUND((p_snapshot->>'amount_pence')::NUMERIC / 100, 2) END;
        IF amount IS NOT NULL THEN
            SELECT account_id INTO expense_account FROM public.scorpinvoice_expense_accounts
             WHERE tenant_id = p_tenant_id AND category = p_snapshot->>'category';
            IF expense_account IS NULL THEN
                RAISE EXCEPTION 'No account is mapped for ScorpInvoice expense category %', p_snapshot->>'category'
                    USING ERRCODE = 'no_data_found';
            END IF;
            SELECT expense_paid_from_account_id INTO paid_from FROM public.scorpinvoice_settings
             WHERE tenant_id = p_tenant_id;
            IF paid_from IS NULL THEN
                RAISE EXCEPTION 'Choose which account ScorpInvoice expenses are paid from' USING ERRCODE = 'no_data_found';
            END IF;
        END IF;
        PERFORM public.sync_scorpinvoice_posting(p_tenant_id, 'EXPENSE', record_id, 'EXPENSE',
            expense_account, paid_from, amount, (p_snapshot->>'spent_on')::DATE,
            'Expense: ' || COALESCE(NULLIF(p_snapshot->>'description', ''), REPLACE(p_snapshot->>'category', '_', ' ')));
    END IF;

    INSERT INTO public.scorpinvoice_sync_state (tenant_id, aggregate_type, aggregate_id, last_snapshot_at)
    VALUES (p_tenant_id, record_type, record_id, snapshot_at)
    ON CONFLICT (tenant_id, aggregate_type, aggregate_id) DO UPDATE SET last_snapshot_at = EXCLUDED.last_snapshot_at;
    RETURN 'PROCESSED';
END;
$$;

-- Entry point for the webhook. Records every delivery in webhook_events; a
-- failure rolls back its postings and is kept as NEEDS_ATTENTION for retry.
CREATE OR REPLACE FUNCTION public.receive_scorpinvoice_event(p_tenant_id UUID, p_event_id VARCHAR, p_snapshot JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
    previous_status VARCHAR;
    outcome VARCHAR;
    failure TEXT;
BEGIN
    IF NULLIF(BTRIM(p_event_id), '') IS NULL THEN
        RAISE EXCEPTION 'An event ID is required' USING ERRCODE = 'check_violation';
    END IF;
    SELECT status INTO previous_status FROM public.webhook_events
     WHERE tenant_id = p_tenant_id AND source_system = 'SCORPINVOICE' AND event_id = p_event_id
     FOR UPDATE;
    IF previous_status IN ('PROCESSED', 'STALE') THEN
        RETURN jsonb_build_object('status', 'DUPLICATE');
    END IF;

    BEGIN
        outcome := public.apply_scorpinvoice_snapshot(p_tenant_id, p_snapshot);
    EXCEPTION WHEN OTHERS THEN
        outcome := 'NEEDS_ATTENTION';
        failure := SQLERRM;
    END;

    INSERT INTO public.webhook_events (tenant_id, event_id, source_system, payload, status, error)
    VALUES (p_tenant_id, p_event_id, 'SCORPINVOICE', p_snapshot, outcome, failure)
    ON CONFLICT (tenant_id, source_system, event_id) DO UPDATE
        -- A concurrent duplicate must not downgrade an event that was already recorded.
        SET status = CASE WHEN public.webhook_events.status = 'PROCESSED' THEN 'PROCESSED' ELSE EXCLUDED.status END,
            error = CASE WHEN public.webhook_events.status = 'PROCESSED' THEN NULL ELSE EXCLUDED.error END,
            payload = EXCLUDED.payload,
            attempts = public.webhook_events.attempts + 1, updated_at = NOW();

    -- A newer snapshot supersedes earlier failures for the same record.
    IF outcome = 'PROCESSED' THEN
        UPDATE public.webhook_events
           SET status = 'STALE', updated_at = NOW()
         WHERE tenant_id = p_tenant_id AND source_system = 'SCORPINVOICE' AND status = 'NEEDS_ATTENTION'
           AND payload->>'type' = p_snapshot->>'type' AND payload->>'id' = p_snapshot->>'id'
           AND (payload->>'snapshot_at')::TIMESTAMPTZ < (p_snapshot->>'snapshot_at')::TIMESTAMPTZ;
    END IF;
    RETURN jsonb_build_object('status', outcome, 'error', failure);
END;
$$;

REVOKE ALL ON FUNCTION public.scorpbook_role_account(UUID, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scorpbook_open_posting_date(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_scorpinvoice_posting(UUID, VARCHAR, UUID, VARCHAR, UUID, UUID, NUMERIC, DATE, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_scorpinvoice_snapshot(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.receive_scorpinvoice_event(UUID, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_scorpinvoice_event(UUID, VARCHAR, JSONB) TO service_role;
