-- Supplier bills: auditable drafts, atomic posting to AP, and partial payments.
CREATE TABLE public.accounting_supplier_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.accounting_tenants(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL,
    bill_number VARCHAR(50) NOT NULL,
    bill_date DATE NOT NULL,
    due_date DATE NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'OPEN', 'PARTIAL', 'PAID')),
    journal_entry_id UUID,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_supplier_bill_number UNIQUE (tenant_id, supplier_id, bill_number),
    CONSTRAINT uq_supplier_bill_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_supplier_bill_supplier FOREIGN KEY (tenant_id, supplier_id)
        REFERENCES public.accounting_suppliers(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_supplier_bill_journal FOREIGN KEY (tenant_id, journal_entry_id)
        REFERENCES public.accounting_journal_entries(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_supplier_bills_tenant_due ON public.accounting_supplier_bills(tenant_id, status, due_date);

CREATE TABLE public.accounting_supplier_bill_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    bill_id UUID NOT NULL,
    expense_account_id UUID NOT NULL,
    description VARCHAR(500) NOT NULL,
    net_amount NUMERIC(15,4) NOT NULL CHECK (net_amount > 0),
    vat_amount NUMERIC(15,4) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_supplier_bill_line_bill FOREIGN KEY (tenant_id, bill_id)
        REFERENCES public.accounting_supplier_bills(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_supplier_bill_line_account FOREIGN KEY (tenant_id, expense_account_id)
        REFERENCES public.accounting_accounts(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_supplier_bill_lines_bill ON public.accounting_supplier_bill_lines(tenant_id, bill_id);

CREATE TABLE public.accounting_supplier_bill_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    bill_id UUID NOT NULL,
    payment_date DATE NOT NULL,
    bank_account_id UUID NOT NULL,
    amount NUMERIC(15,4) NOT NULL CHECK (amount > 0),
    journal_entry_id UUID NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_supplier_bill_payment_bill FOREIGN KEY (tenant_id, bill_id)
        REFERENCES public.accounting_supplier_bills(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_supplier_bill_payment_bank FOREIGN KEY (tenant_id, bank_account_id)
        REFERENCES public.accounting_accounts(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_supplier_bill_payment_journal FOREIGN KEY (tenant_id, journal_entry_id)
        REFERENCES public.accounting_journal_entries(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_supplier_bill_payments_bill ON public.accounting_supplier_bill_payments(tenant_id, bill_id, payment_date);

CREATE TABLE public.accounting_supplier_bill_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.accounting_tenants(id) ON DELETE RESTRICT,
    bill_id UUID NOT NULL,
    event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('CREATED', 'UPDATED', 'POSTED', 'PAYMENT_RECORDED')),
    actor_id UUID,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(details) = 'object')
);
CREATE INDEX idx_supplier_bill_events_tenant_bill_time
    ON public.accounting_supplier_bill_events(tenant_id, bill_id, occurred_at);

ALTER TABLE public.accounting_supplier_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_supplier_bill_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_supplier_bill_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_supplier_bill_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accounting_supplier_bills, public.accounting_supplier_bill_lines,
    public.accounting_supplier_bill_payments, public.accounting_supplier_bill_events
    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.accounting_supplier_bills,
    public.accounting_supplier_bill_lines, public.accounting_supplier_bill_payments TO service_role;
GRANT SELECT ON public.accounting_supplier_bill_events TO service_role;

CREATE TRIGGER trg_supplier_bills_updated_at BEFORE UPDATE ON public.accounting_supplier_bills
FOR EACH ROW EXECUTE FUNCTION public.set_accounting_updated_at();

CREATE OR REPLACE FUNCTION public.guard_supplier_bill_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Supplier bills cannot be deleted; retain the audit trail'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.supplier_id <> OLD.supplier_id
           OR NEW.created_by <> OLD.created_by THEN
            RAISE EXCEPTION 'Supplier bill identity fields cannot be changed' USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.status <> 'DRAFT' AND
           (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') AND
           NOT (OLD.status IN ('OPEN', 'PARTIAL') AND NEW.status IN ('PARTIAL', 'PAID')
                AND NEW.bill_number = OLD.bill_number AND NEW.bill_date = OLD.bill_date
                AND NEW.due_date = OLD.due_date AND NEW.description IS NOT DISTINCT FROM OLD.description
                AND NEW.journal_entry_id = OLD.journal_entry_id) THEN
            RAISE EXCEPTION 'Posted supplier bill details are immutable' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_supplier_bill_mutation BEFORE UPDATE OR DELETE ON public.accounting_supplier_bills
FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_bill_mutation();

CREATE OR REPLACE FUNCTION public.guard_supplier_bill_line_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE bill_status VARCHAR(20); selected_type VARCHAR(20); selected_active BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT status INTO bill_status FROM public.accounting_supplier_bills
         WHERE tenant_id = OLD.tenant_id AND id = OLD.bill_id FOR UPDATE;
        IF bill_status <> 'DRAFT' THEN RAISE EXCEPTION 'Lines on posted bills are immutable' USING ERRCODE = 'check_violation'; END IF;
        RETURN OLD;
    END IF;
    SELECT status INTO bill_status FROM public.accounting_supplier_bills
     WHERE tenant_id = NEW.tenant_id AND id = NEW.bill_id FOR UPDATE;
    IF bill_status <> 'DRAFT' THEN RAISE EXCEPTION 'Lines can only be added to draft bills' USING ERRCODE = 'check_violation'; END IF;
    SELECT type, is_active INTO selected_type, selected_active FROM public.accounting_accounts
     WHERE tenant_id = NEW.tenant_id AND id = NEW.expense_account_id;
    IF NOT FOUND OR selected_type <> 'EXPENSE' OR NOT selected_active THEN
        RAISE EXCEPTION 'Bill lines require an active expense account' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_supplier_bill_line_mutation BEFORE INSERT OR UPDATE OR DELETE
ON public.accounting_supplier_bill_lines FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_bill_line_mutation();

CREATE OR REPLACE FUNCTION public.guard_supplier_bill_payment_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
    RAISE EXCEPTION 'Supplier bill payments are immutable; correct them with a journal reversal'
        USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER trg_guard_supplier_bill_payment_mutation BEFORE UPDATE OR DELETE
ON public.accounting_supplier_bill_payments FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_bill_payment_mutation();

CREATE OR REPLACE FUNCTION public.guard_supplier_bill_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN RAISE EXCEPTION 'Supplier bill audit events are append-only' USING ERRCODE = 'check_violation'; END;
$$;
CREATE TRIGGER trg_guard_supplier_bill_event_mutation BEFORE UPDATE OR DELETE ON public.accounting_supplier_bill_events
FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_bill_event_mutation();

CREATE OR REPLACE FUNCTION public.log_supplier_bill_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE actor UUID; event_name VARCHAR(30);
BEGIN
    actor := NULLIF(current_setting('scorpbook.actor_id', TRUE), '')::UUID;
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.accounting_supplier_bill_events(tenant_id, bill_id, event_type, actor_id, details)
        VALUES(NEW.tenant_id, NEW.id, 'CREATED', actor, jsonb_build_object('after', to_jsonb(NEW)));
        RETURN NEW;
    END IF;
    IF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
        event_name := CASE WHEN NEW.status = 'OPEN' AND OLD.status = 'DRAFT' THEN 'POSTED'
                           WHEN NEW.status IN ('PARTIAL','PAID') AND OLD.status IN ('OPEN','PARTIAL') THEN 'PAYMENT_RECORDED'
                           ELSE 'UPDATED' END;
        INSERT INTO public.accounting_supplier_bill_events(tenant_id, bill_id, event_type, actor_id, details)
        VALUES(NEW.tenant_id, NEW.id, event_name, actor, jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW)));
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_log_supplier_bill_event AFTER INSERT OR UPDATE ON public.accounting_supplier_bills
FOR EACH ROW EXECUTE FUNCTION public.log_supplier_bill_event();

CREATE OR REPLACE FUNCTION public.save_supplier_bill(
    p_tenant_id UUID, p_actor_id UUID, p_supplier_id UUID, p_bill_number VARCHAR,
    p_bill_date DATE, p_due_date DATE, p_description TEXT, p_lines JSONB, p_bill_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE saved_id UUID; item JSONB; account UUID; line_description VARCHAR(500);
        net NUMERIC(15,4); vat NUMERIC(15,4); supplier_active BOOLEAN;
BEGIN
    IF p_tenant_id IS NULL OR p_actor_id IS NULL OR p_supplier_id IS NULL OR p_bill_date IS NULL OR
       p_due_date IS NULL OR NULLIF(BTRIM(p_bill_number), '') IS NULL OR
       p_due_date < p_bill_date OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'Supplier, invoice number, valid dates, and at least one bill line are required'
            USING ERRCODE = 'check_violation';
    END IF;
    SELECT is_active INTO supplier_active FROM public.accounting_suppliers
     WHERE tenant_id = p_tenant_id AND id = p_supplier_id FOR KEY SHARE;
    IF NOT FOUND OR NOT supplier_active THEN RAISE EXCEPTION 'Choose an active supplier' USING ERRCODE = 'check_violation'; END IF;
    PERFORM set_config('scorpbook.actor_id', p_actor_id::TEXT, TRUE);
    IF p_bill_id IS NULL THEN
        INSERT INTO public.accounting_supplier_bills(tenant_id, supplier_id, bill_number, bill_date, due_date, description, created_by)
        VALUES(p_tenant_id, p_supplier_id, BTRIM(p_bill_number), p_bill_date, p_due_date, NULLIF(BTRIM(p_description), ''), p_actor_id)
        RETURNING id INTO saved_id;
    ELSE
        SELECT id INTO saved_id FROM public.accounting_supplier_bills
         WHERE tenant_id = p_tenant_id AND id = p_bill_id AND status = 'DRAFT' FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Only existing draft bills can be updated' USING ERRCODE = 'check_violation'; END IF;
        UPDATE public.accounting_supplier_bills SET bill_number = BTRIM(p_bill_number), bill_date = p_bill_date,
            due_date = p_due_date, description = NULLIF(BTRIM(p_description), '')
         WHERE tenant_id = p_tenant_id AND id = saved_id;
        DELETE FROM public.accounting_supplier_bill_lines WHERE tenant_id = p_tenant_id AND bill_id = saved_id;
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
        account := NULLIF(item->>'expense_account_id', '')::UUID;
        line_description := NULLIF(BTRIM(item->>'description'), '');
        net := NULLIF(item->>'net_amount', '')::NUMERIC;
        vat := COALESCE(NULLIF(item->>'vat_amount', '')::NUMERIC, 0);
        IF account IS NULL OR line_description IS NULL OR net IS NULL OR net <= 0 OR vat < 0 THEN
            RAISE EXCEPTION 'Each bill line needs an expense account, description, positive net amount, and non-negative VAT'
                USING ERRCODE = 'check_violation';
        END IF;
        INSERT INTO public.accounting_supplier_bill_lines(tenant_id, bill_id, expense_account_id, description, net_amount, vat_amount)
        VALUES(p_tenant_id, saved_id, account, line_description, net, vat);
    END LOOP;
    RETURN saved_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_supplier_bill(p_tenant_id UUID, p_actor_id UUID, p_bill_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE bill public.accounting_supplier_bills%ROWTYPE; ap_account UUID; vat_account UUID;
        journal_lines JSONB; net_total NUMERIC(30,4); vat_total NUMERIC(30,4); total NUMERIC(30,4);
        journal JSONB; entry_id UUID;
BEGIN
    PERFORM set_config('scorpbook.actor_id', p_actor_id::TEXT, TRUE);
    SELECT * INTO bill FROM public.accounting_supplier_bills
     WHERE tenant_id = p_tenant_id AND id = p_bill_id FOR UPDATE;
    IF NOT FOUND OR bill.status <> 'DRAFT' THEN RAISE EXCEPTION 'Only draft bills can be posted' USING ERRCODE = 'check_violation'; END IF;
    SELECT jsonb_agg(jsonb_build_object('account_id', lines.expense_account_id, 'description', lines.description,
              'debit', lines.net_amount::TEXT, 'credit', '0')),
           SUM(lines.net_amount), SUM(lines.vat_amount)
      INTO journal_lines, net_total, vat_total
      FROM public.accounting_supplier_bill_lines AS lines
     WHERE lines.tenant_id = p_tenant_id AND lines.bill_id = p_bill_id;
    IF journal_lines IS NULL THEN RAISE EXCEPTION 'Bill requires at least one line' USING ERRCODE = 'check_violation'; END IF;
    total := net_total + vat_total;
    SELECT id INTO ap_account FROM public.accounting_accounts WHERE tenant_id = p_tenant_id AND code = '2000' AND type = 'LIABILITY' AND is_active;
    IF ap_account IS NULL THEN RAISE EXCEPTION 'Active Accounts Payable account 2000 is required' USING ERRCODE = 'check_violation'; END IF;
    IF vat_total > 0 THEN
        SELECT id INTO vat_account FROM public.accounting_accounts WHERE tenant_id = p_tenant_id AND code = '1200' AND type = 'ASSET' AND is_active;
        IF vat_account IS NULL THEN RAISE EXCEPTION 'Active VAT Recoverable account 1200 is required when VAT is entered' USING ERRCODE = 'check_violation'; END IF;
        journal_lines := journal_lines || jsonb_build_array(jsonb_build_object('account_id', vat_account, 'description', 'Recoverable VAT', 'debit', vat_total::TEXT, 'credit', '0'));
    END IF;
    journal_lines := journal_lines || jsonb_build_array(jsonb_build_object('account_id', ap_account, 'description', 'Accounts payable', 'debit', '0', 'credit', total::TEXT));
    journal := public.save_draft_journal_entry_numbered(p_tenant_id, bill.bill_date, 'MANUAL', journal_lines, NULL,
        COALESCE(bill.description, 'Supplier bill ' || bill.bill_number), 'BILL:' || bill.id::TEXT, 'BILL_POSTED', NULL, p_actor_id);
    entry_id := (journal->>'id')::UUID;
    PERFORM public.post_journal_entry(p_tenant_id, entry_id, p_actor_id);
    UPDATE public.accounting_supplier_bills SET status = 'OPEN', journal_entry_id = entry_id
     WHERE tenant_id = p_tenant_id AND id = p_bill_id;
    RETURN journal;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_supplier_bill_payment(
    p_tenant_id UUID, p_actor_id UUID, p_bill_id UUID, p_payment_date DATE,
    p_bank_account_id UUID, p_amount NUMERIC(15,4)
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE bill public.accounting_supplier_bills%ROWTYPE; ap_account UUID; account_type VARCHAR(20); active BOOLEAN;
        bill_total NUMERIC(30,4); paid_total NUMERIC(30,4); remaining NUMERIC(30,4); payment_id UUID := gen_random_uuid(); journal JSONB; entry_id UUID;
BEGIN
    PERFORM set_config('scorpbook.actor_id', p_actor_id::TEXT, TRUE);
    SELECT * INTO bill FROM public.accounting_supplier_bills
     WHERE tenant_id = p_tenant_id AND id = p_bill_id FOR UPDATE;
    IF NOT FOUND OR bill.status NOT IN ('OPEN', 'PARTIAL') THEN RAISE EXCEPTION 'Only unpaid posted bills can receive payments' USING ERRCODE = 'check_violation'; END IF;
    IF p_payment_date IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Payment date and positive amount are required' USING ERRCODE = 'check_violation'; END IF;
    SELECT type, is_active INTO account_type, active FROM public.accounting_accounts
     WHERE tenant_id = p_tenant_id AND id = p_bank_account_id FOR KEY SHARE;
    IF NOT FOUND OR account_type <> 'ASSET' OR NOT active THEN RAISE EXCEPTION 'Choose an active bank or cash asset account' USING ERRCODE = 'check_violation'; END IF;
    SELECT id INTO ap_account FROM public.accounting_accounts WHERE tenant_id = p_tenant_id AND code = '2000' AND type = 'LIABILITY' AND is_active;
    SELECT COALESCE(SUM(net_amount + vat_amount),0) INTO bill_total FROM public.accounting_supplier_bill_lines WHERE tenant_id = p_tenant_id AND bill_id = p_bill_id;
    SELECT COALESCE(SUM(amount),0) INTO paid_total FROM public.accounting_supplier_bill_payments WHERE tenant_id = p_tenant_id AND bill_id = p_bill_id;
    remaining := bill_total - paid_total;
    IF p_amount > remaining THEN RAISE EXCEPTION 'Payment exceeds the outstanding bill balance of %', remaining USING ERRCODE = 'check_violation'; END IF;
    journal := public.save_draft_journal_entry_numbered(p_tenant_id, p_payment_date, 'MANUAL',
        jsonb_build_array(jsonb_build_object('account_id', ap_account, 'description', 'Accounts payable settlement', 'debit', p_amount::TEXT, 'credit', '0'),
                          jsonb_build_object('account_id', p_bank_account_id, 'description', 'Supplier bill payment', 'debit', '0', 'credit', p_amount::TEXT)),
        NULL, 'Payment for supplier bill ' || bill.bill_number, 'BILLPAY:' || payment_id::TEXT, 'BILL_PAYMENT', NULL, p_actor_id);
    entry_id := (journal->>'id')::UUID;
    PERFORM public.post_journal_entry(p_tenant_id, entry_id, p_actor_id);
    INSERT INTO public.accounting_supplier_bill_payments(tenant_id, bill_id, payment_date, bank_account_id, amount, journal_entry_id, created_by)
    VALUES(p_tenant_id, p_bill_id, p_payment_date, p_bank_account_id, p_amount, entry_id, p_actor_id);
    UPDATE public.accounting_supplier_bills SET status = CASE WHEN p_amount = remaining THEN 'PAID' ELSE 'PARTIAL' END
     WHERE tenant_id = p_tenant_id AND id = p_bill_id;
    RETURN journal;
END;
$$;

REVOKE ALL ON FUNCTION public.save_supplier_bill(UUID, UUID, UUID, VARCHAR, DATE, DATE, TEXT, JSONB, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_supplier_bill(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_supplier_bill_payment(UUID, UUID, UUID, DATE, UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_supplier_bill(UUID, UUID, UUID, VARCHAR, DATE, DATE, TEXT, JSONB, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_supplier_bill(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_supplier_bill_payment(UUID, UUID, UUID, DATE, UUID, NUMERIC) TO service_role;
