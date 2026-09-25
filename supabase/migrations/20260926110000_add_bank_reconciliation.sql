-- Bank statements are reconciled against immutable, posted ledger lines.
CREATE TABLE public.accounting_bank_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.accounting_tenants(id) ON DELETE RESTRICT,
    bank_account_id UUID NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    opening_balance NUMERIC(15,4) NOT NULL,
    closing_balance NUMERIC(15,4) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
    created_by UUID NOT NULL,
    completed_by UUID,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_bank_reconciliation_period CHECK (period_start <= period_end),
    CONSTRAINT uq_bank_reconciliation_period UNIQUE (tenant_id, bank_account_id, period_start, period_end),
    CONSTRAINT uq_bank_reconciliation_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_bank_reconciliation_account FOREIGN KEY (tenant_id, bank_account_id)
        REFERENCES public.accounting_accounts(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_bank_reconciliation_tenant_period
    ON public.accounting_bank_reconciliations(tenant_id, bank_account_id, period_end DESC);

CREATE TABLE public.accounting_bank_statement_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    reconciliation_id UUID NOT NULL,
    line_number INTEGER NOT NULL CHECK (line_number > 0),
    transaction_date DATE NOT NULL,
    description VARCHAR(500) NOT NULL,
    bank_reference VARCHAR(150),
    amount NUMERIC(15,4) NOT NULL CHECK (amount <> 0),
    matched_journal_line_id UUID REFERENCES public.accounting_journal_lines(id) ON DELETE RESTRICT,
    matched_by UUID,
    matched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_bank_statement_line_number UNIQUE (tenant_id, reconciliation_id, line_number),
    CONSTRAINT fk_bank_statement_line_reconciliation FOREIGN KEY (tenant_id, reconciliation_id)
        REFERENCES public.accounting_bank_reconciliations(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_bank_statement_lines_reconciliation
    ON public.accounting_bank_statement_lines(tenant_id, reconciliation_id, transaction_date, line_number);
CREATE UNIQUE INDEX uq_bank_statement_matched_journal_line
    ON public.accounting_bank_statement_lines(tenant_id, matched_journal_line_id)
    WHERE matched_journal_line_id IS NOT NULL;

CREATE TABLE public.accounting_bank_reconciliation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.accounting_tenants(id) ON DELETE RESTRICT,
    reconciliation_id UUID NOT NULL,
    event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('CREATED', 'LINES_IMPORTED', 'LINE_MATCHED', 'LINE_UNMATCHED', 'COMPLETED')),
    actor_id UUID,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(details) = 'object')
);
CREATE INDEX idx_bank_reconciliation_events_session
    ON public.accounting_bank_reconciliation_events(tenant_id, reconciliation_id, occurred_at);

ALTER TABLE public.accounting_bank_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_bank_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_bank_reconciliation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accounting_bank_reconciliations, public.accounting_bank_statement_lines,
    public.accounting_bank_reconciliation_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.accounting_bank_reconciliations,
    public.accounting_bank_statement_lines TO service_role;
GRANT SELECT ON public.accounting_bank_reconciliation_events TO service_role;

CREATE OR REPLACE FUNCTION public.guard_bank_reconciliation_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Bank reconciliations cannot be deleted' USING ERRCODE = 'check_violation'; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'COMPLETED' THEN RAISE EXCEPTION 'Completed reconciliations are immutable' USING ERRCODE = 'check_violation'; END IF;
        IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.bank_account_id <> OLD.bank_account_id
           OR NEW.period_start <> OLD.period_start OR NEW.period_end <> OLD.period_end
           OR NEW.opening_balance <> OLD.opening_balance OR NEW.closing_balance <> OLD.closing_balance
           OR NEW.created_by <> OLD.created_by THEN
            RAISE EXCEPTION 'Reconciliation identity and statement balances cannot be changed' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_bank_reconciliation_mutation BEFORE UPDATE OR DELETE
ON public.accounting_bank_reconciliations FOR EACH ROW EXECUTE FUNCTION public.guard_bank_reconciliation_mutation();

CREATE OR REPLACE FUNCTION public.guard_bank_statement_line_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE state VARCHAR(20); start_date DATE; end_date DATE;
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Imported bank statement lines cannot be deleted' USING ERRCODE = 'check_violation'; END IF;
    SELECT status, period_start, period_end INTO state, start_date, end_date
     FROM public.accounting_bank_reconciliations
     WHERE tenant_id = CASE WHEN TG_OP = 'UPDATE' THEN OLD.tenant_id ELSE NEW.tenant_id END
       AND id = CASE WHEN TG_OP = 'UPDATE' THEN OLD.reconciliation_id ELSE NEW.reconciliation_id END FOR UPDATE;
    IF NOT FOUND OR state <> 'IN_PROGRESS' THEN
        RAISE EXCEPTION 'Imported bank statement lines can only change within an open reconciliation' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.reconciliation_id <> OLD.reconciliation_id
           OR NEW.line_number <> OLD.line_number OR NEW.transaction_date <> OLD.transaction_date
           OR NEW.description <> OLD.description OR NEW.bank_reference IS DISTINCT FROM OLD.bank_reference
           OR NEW.amount <> OLD.amount OR NEW.created_at <> OLD.created_at THEN
            RAISE EXCEPTION 'Imported statement content is immutable; only a match can change' USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.transaction_date < start_date OR NEW.transaction_date > end_date THEN
        RAISE EXCEPTION 'Statement lines must be imported into an open reconciliation within its period' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_bank_statement_line_mutation BEFORE INSERT OR UPDATE OR DELETE
ON public.accounting_bank_statement_lines FOR EACH ROW EXECUTE FUNCTION public.guard_bank_statement_line_mutation();

CREATE OR REPLACE FUNCTION public.guard_bank_reconciliation_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN RAISE EXCEPTION 'Bank reconciliation events are append-only' USING ERRCODE = 'check_violation'; END;
$$;
CREATE TRIGGER trg_guard_bank_reconciliation_event_mutation BEFORE UPDATE OR DELETE
ON public.accounting_bank_reconciliation_events FOR EACH ROW EXECUTE FUNCTION public.guard_bank_reconciliation_event_mutation();

CREATE OR REPLACE FUNCTION public.log_bank_reconciliation_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE action_name VARCHAR(30); session_id UUID; tenant UUID;
BEGIN
    IF TG_OP = 'INSERT' THEN
        session_id := NEW.id; tenant := NEW.tenant_id; action_name := 'CREATED';
    ELSE
        IF NEW.status = 'COMPLETED' AND OLD.status <> 'COMPLETED' THEN
            session_id := NEW.id; tenant := NEW.tenant_id; action_name := 'COMPLETED';
        ELSE RETURN NEW;
        END IF;
    END IF;
    INSERT INTO public.accounting_bank_reconciliation_events(tenant_id, reconciliation_id, event_type, actor_id, details)
    VALUES(tenant, session_id, action_name,
           NULLIF(current_setting('scorpbook.actor_id', TRUE), '')::UUID,
           jsonb_build_object('snapshot', to_jsonb(NEW)));
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_log_bank_reconciliation_event AFTER INSERT OR UPDATE
ON public.accounting_bank_reconciliations FOR EACH ROW EXECUTE FUNCTION public.log_bank_reconciliation_event();

CREATE OR REPLACE FUNCTION public.log_bank_statement_match_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE action_name VARCHAR(30);
BEGIN
    action_name := CASE WHEN NEW.matched_journal_line_id IS NULL THEN 'LINE_UNMATCHED' ELSE 'LINE_MATCHED' END;
    IF TG_OP = 'UPDATE' AND NEW.matched_journal_line_id IS NOT DISTINCT FROM OLD.matched_journal_line_id THEN RETURN NEW; END IF;
    INSERT INTO public.accounting_bank_reconciliation_events(tenant_id, reconciliation_id, event_type, actor_id, details)
    VALUES(NEW.tenant_id, NEW.reconciliation_id, action_name,
           NULLIF(current_setting('scorpbook.actor_id', TRUE), '')::UUID,
           jsonb_build_object('statement_line_id', NEW.id, 'journal_line_id', NEW.matched_journal_line_id,
                              'transaction_date', NEW.transaction_date, 'amount', NEW.amount::TEXT));
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_log_bank_statement_match_event AFTER UPDATE OF matched_journal_line_id
ON public.accounting_bank_statement_lines FOR EACH ROW EXECUTE FUNCTION public.log_bank_statement_match_event();

CREATE OR REPLACE FUNCTION public.import_bank_statement_lines(
    p_tenant_id UUID, p_actor_id UUID, p_reconciliation_id UUID, p_rows JSONB
)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE session public.accounting_bank_reconciliations%ROWTYPE; row_item JSONB; row_count INTEGER := 0;
        transaction_date DATE; description_text VARCHAR(500); reference_text VARCHAR(150); amount_value NUMERIC(15,4);
BEGIN
    PERFORM set_config('scorpbook.actor_id', p_actor_id::TEXT, TRUE);
    SELECT * INTO session FROM public.accounting_bank_reconciliations
     WHERE tenant_id = p_tenant_id AND id = p_reconciliation_id FOR UPDATE;
    IF NOT FOUND OR session.status <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'Reconciliation is not open' USING ERRCODE = 'check_violation'; END IF;
    IF EXISTS (SELECT 1 FROM public.accounting_bank_statement_lines WHERE tenant_id = p_tenant_id AND reconciliation_id = p_reconciliation_id) THEN
        RAISE EXCEPTION 'This reconciliation already has imported statement lines' USING ERRCODE = 'unique_violation';
    END IF;
    IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) < 1 OR jsonb_array_length(p_rows) > 5000 THEN
        RAISE EXCEPTION 'Import between 1 and 5000 bank statement rows' USING ERRCODE = 'check_violation';
    END IF;
    FOR row_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
        transaction_date := (row_item->>'transaction_date')::DATE;
        description_text := NULLIF(BTRIM(row_item->>'description'), '');
        reference_text := NULLIF(BTRIM(row_item->>'reference'), '');
        amount_value := (row_item->>'amount')::NUMERIC(15,4);
        IF transaction_date IS NULL OR transaction_date < session.period_start OR transaction_date > session.period_end
           OR description_text IS NULL OR amount_value = 0 THEN
            RAISE EXCEPTION 'Each imported line needs an in-period date, description, and non-zero signed amount'
                USING ERRCODE = 'check_violation';
        END IF;
        row_count := row_count + 1;
        INSERT INTO public.accounting_bank_statement_lines(tenant_id, reconciliation_id, line_number, transaction_date, description, bank_reference, amount)
        VALUES(p_tenant_id, p_reconciliation_id, row_count, transaction_date, description_text, reference_text, amount_value);
    END LOOP;
    INSERT INTO public.accounting_bank_reconciliation_events(tenant_id, reconciliation_id, event_type, actor_id, details)
    VALUES(p_tenant_id, p_reconciliation_id, 'LINES_IMPORTED', p_actor_id, jsonb_build_object('line_count', row_count));
    RETURN row_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.match_bank_statement_line(
    p_tenant_id UUID, p_actor_id UUID, p_statement_line_id UUID, p_journal_line_id UUID
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE line public.accounting_bank_statement_lines%ROWTYPE; session public.accounting_bank_reconciliations%ROWTYPE;
        journal_account UUID; journal_entry UUID; journal_date DATE; journal_status VARCHAR(20); signed_amount NUMERIC(30,4);
BEGIN
    PERFORM set_config('scorpbook.actor_id', p_actor_id::TEXT, TRUE);
    SELECT * INTO line FROM public.accounting_bank_statement_lines
     WHERE tenant_id = p_tenant_id AND id = p_statement_line_id FOR UPDATE;
    IF NOT FOUND OR line.matched_journal_line_id IS NOT NULL THEN RAISE EXCEPTION 'Statement line is missing or already matched' USING ERRCODE = 'check_violation'; END IF;
    SELECT * INTO session FROM public.accounting_bank_reconciliations
     WHERE tenant_id = p_tenant_id AND id = line.reconciliation_id FOR UPDATE;
    IF NOT FOUND OR session.status <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'Reconciliation is not open' USING ERRCODE = 'check_violation'; END IF;
    SELECT journal.account_id, journal.entry_id, entry.entry_date, entry.status, journal.debit - journal.credit
      INTO journal_account, journal_entry, journal_date, journal_status, signed_amount
      FROM public.accounting_journal_lines AS journal
      JOIN public.accounting_journal_entries AS entry ON entry.tenant_id = journal.tenant_id AND entry.id = journal.entry_id
     WHERE journal.tenant_id = p_tenant_id AND journal.id = p_journal_line_id;
    IF NOT FOUND OR journal_account <> session.bank_account_id OR journal_status <> 'POSTED'
       OR journal_date < session.period_start OR journal_date > session.period_end OR signed_amount <> line.amount THEN
        RAISE EXCEPTION 'Select a posted line for this bank account, date range, and exact signed amount'
            USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.accounting_bank_statement_lines SET matched_journal_line_id = p_journal_line_id,
        matched_by = p_actor_id, matched_at = NOW()
     WHERE tenant_id = p_tenant_id AND id = p_statement_line_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unmatch_bank_statement_line(
    p_tenant_id UUID, p_actor_id UUID, p_statement_line_id UUID
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE session public.accounting_bank_reconciliations%ROWTYPE;
BEGIN
    PERFORM set_config('scorpbook.actor_id', p_actor_id::TEXT, TRUE);
    SELECT reconciliation.* INTO session FROM public.accounting_bank_statement_lines AS line
    JOIN public.accounting_bank_reconciliations AS reconciliation
      ON reconciliation.tenant_id = line.tenant_id AND reconciliation.id = line.reconciliation_id
    WHERE line.tenant_id = p_tenant_id AND line.id = p_statement_line_id FOR UPDATE OF line, reconciliation;
    IF NOT FOUND OR session.status <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'Reconciliation is not open' USING ERRCODE = 'check_violation'; END IF;
    UPDATE public.accounting_bank_statement_lines SET matched_journal_line_id = NULL, matched_by = NULL, matched_at = NULL
     WHERE tenant_id = p_tenant_id AND id = p_statement_line_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_bank_reconciliation(
    p_tenant_id UUID, p_actor_id UUID, p_reconciliation_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE session public.accounting_bank_reconciliations%ROWTYPE; statement_count BIGINT; unmatched_statement_count BIGINT;
        unmatched_book_count BIGINT; book_opening NUMERIC(30,4); statement_activity NUMERIC(30,4);
BEGIN
    PERFORM set_config('scorpbook.actor_id', p_actor_id::TEXT, TRUE);
    SELECT * INTO session FROM public.accounting_bank_reconciliations
     WHERE tenant_id = p_tenant_id AND id = p_reconciliation_id FOR UPDATE;
    IF NOT FOUND OR session.status <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'Reconciliation is not open' USING ERRCODE = 'check_violation'; END IF;
    SELECT COUNT(*), COUNT(*) FILTER (WHERE matched_journal_line_id IS NULL), COALESCE(SUM(amount),0)
      INTO statement_count, unmatched_statement_count, statement_activity
      FROM public.accounting_bank_statement_lines WHERE tenant_id = p_tenant_id AND reconciliation_id = p_reconciliation_id;
    IF statement_count = 0 OR unmatched_statement_count > 0 THEN
        RAISE EXCEPTION 'Import statement activity and match every bank line before completion (unmatched %)', unmatched_statement_count
            USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(SUM(line.debit - line.credit), 0) INTO book_opening
      FROM public.accounting_journal_lines AS line
      JOIN public.accounting_journal_entries AS entry ON entry.tenant_id = line.tenant_id AND entry.id = line.entry_id
     WHERE line.tenant_id = p_tenant_id AND line.account_id = session.bank_account_id
       AND entry.status = 'POSTED' AND entry.entry_date < session.period_start;
    IF book_opening <> session.opening_balance THEN
        RAISE EXCEPTION 'Opening balance does not match the posted ledger balance before this period (ledger %, statement %)',
            book_opening, session.opening_balance USING ERRCODE = 'check_violation';
    END IF;
    IF session.opening_balance + statement_activity <> session.closing_balance THEN
        RAISE EXCEPTION 'Opening balance plus statement activity does not equal the closing balance'
            USING ERRCODE = 'check_violation';
    END IF;
    SELECT COUNT(*) INTO unmatched_book_count
      FROM public.accounting_journal_lines AS line
      JOIN public.accounting_journal_entries AS entry ON entry.tenant_id = line.tenant_id AND entry.id = line.entry_id
     WHERE line.tenant_id = p_tenant_id AND line.account_id = session.bank_account_id
       AND entry.status = 'POSTED' AND entry.entry_date BETWEEN session.period_start AND session.period_end
       AND NOT EXISTS (SELECT 1 FROM public.accounting_bank_statement_lines AS statement_line
                        WHERE statement_line.tenant_id = p_tenant_id
                          AND statement_line.reconciliation_id = p_reconciliation_id
                          AND statement_line.matched_journal_line_id = line.id);
    IF unmatched_book_count > 0 THEN
        RAISE EXCEPTION 'There are % posted bank ledger lines not matched to this statement', unmatched_book_count
            USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.accounting_bank_reconciliations SET status = 'COMPLETED', completed_by = p_actor_id, completed_at = NOW()
     WHERE tenant_id = p_tenant_id AND id = p_reconciliation_id;
    RETURN jsonb_build_object('statement_lines', statement_count, 'opening_balance', session.opening_balance::TEXT,
                              'activity', statement_activity::TEXT, 'closing_balance', session.closing_balance::TEXT);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_bank_reconciliation(
    p_tenant_id UUID, p_actor_id UUID, p_bank_account_id UUID, p_period_start DATE, p_period_end DATE,
    p_opening_balance NUMERIC(15,4), p_closing_balance NUMERIC(15,4)
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE account_type VARCHAR(20); account_code VARCHAR(20); result_id UUID;
BEGIN
    IF p_tenant_id IS NULL OR p_actor_id IS NULL OR p_period_start IS NULL OR p_period_end IS NULL
       OR p_period_start > p_period_end OR p_opening_balance IS NULL OR p_closing_balance IS NULL THEN
        RAISE EXCEPTION 'Bank account, period, and statement balances are required' USING ERRCODE = 'check_violation';
    END IF;
    SELECT type, code INTO account_type, account_code FROM public.accounting_accounts
     WHERE tenant_id = p_tenant_id AND id = p_bank_account_id AND is_active FOR KEY SHARE;
    IF NOT FOUND OR account_type <> 'ASSET' OR account_code NOT LIKE '10%' THEN
        RAISE EXCEPTION 'Choose an active bank, cash, or clearing asset account (code 10xx)' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM set_config('scorpbook.actor_id', p_actor_id::TEXT, TRUE);
    INSERT INTO public.accounting_bank_reconciliations(tenant_id, bank_account_id, period_start, period_end, opening_balance, closing_balance, created_by)
    VALUES(p_tenant_id, p_bank_account_id, p_period_start, p_period_end, p_opening_balance, p_closing_balance, p_actor_id)
    RETURNING id INTO result_id;
    RETURN result_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_bank_reconciliation(UUID, UUID, UUID, DATE, DATE, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.import_bank_statement_lines(UUID, UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_bank_statement_line(UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unmatch_bank_statement_line(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_bank_reconciliation(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_bank_reconciliation(UUID, UUID, UUID, DATE, DATE, NUMERIC, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_bank_statement_lines(UUID, UUID, UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_bank_statement_line(UUID, UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.unmatch_bank_statement_line(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_bank_reconciliation(UUID, UUID, UUID) TO service_role;
