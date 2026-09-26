-- Monthly accounting periods, auditable closure, and posting locks.
CREATE TABLE public.accounting_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.accounting_tenants(id) ON DELETE RESTRICT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    closed_by UUID,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_accounting_period_month CHECK (
        period_start = date_trunc('month', period_start)::DATE AND
        period_end = (date_trunc('month', period_start) + INTERVAL '1 month - 1 day')::DATE
    ),
    CONSTRAINT chk_accounting_period_closure CHECK (
        (status = 'OPEN' AND closed_by IS NULL AND closed_at IS NULL) OR
        (status = 'CLOSED' AND closed_by IS NOT NULL AND closed_at IS NOT NULL)
    ),
    CONSTRAINT uq_accounting_period_tenant_start UNIQUE (tenant_id, period_start),
    CONSTRAINT uq_accounting_period_tenant_id UNIQUE (tenant_id, id)
);
CREATE INDEX idx_accounting_periods_tenant_start
    ON public.accounting_periods(tenant_id, period_start DESC);

CREATE TABLE public.accounting_period_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.accounting_tenants(id) ON DELETE RESTRICT,
    period_id UUID NOT NULL,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('CREATED', 'CLOSED')),
    actor_id UUID,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(details) = 'object')
);
CREATE INDEX idx_accounting_period_events_session
    ON public.accounting_period_events(tenant_id, period_id, occurred_at);

ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_period_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accounting_periods, public.accounting_period_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.accounting_periods, public.accounting_period_events TO service_role;

-- Show several years of periods and a year ahead; older/newer periods are created lazily on first use.
INSERT INTO public.accounting_periods(tenant_id, period_start, period_end)
SELECT tenant.id, month_start::DATE, (month_start + INTERVAL '1 month - 1 day')::DATE
  FROM public.accounting_tenants AS tenant
 CROSS JOIN generate_series(
     date_trunc('month', CURRENT_DATE - INTERVAL '60 months'),
     date_trunc('month', CURRENT_DATE + INTERVAL '12 months'),
     INTERVAL '1 month'
 ) AS month_start
ON CONFLICT (tenant_id, period_start) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_accounting_period(p_tenant_id UUID, p_period_date DATE)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE month_start DATE; month_end DATE; current_status VARCHAR(20);
BEGIN
    IF p_tenant_id IS NULL OR p_period_date IS NULL THEN
        RAISE EXCEPTION 'Tenant and accounting date are required' USING ERRCODE = 'check_violation';
    END IF;
    month_start := date_trunc('month', p_period_date)::DATE;
    month_end := (date_trunc('month', p_period_date) + INTERVAL '1 month - 1 day')::DATE;
    INSERT INTO public.accounting_periods(tenant_id, period_start, period_end)
    VALUES(p_tenant_id, month_start, month_end)
    ON CONFLICT (tenant_id, period_start) DO NOTHING;
    SELECT status INTO current_status FROM public.accounting_periods
     WHERE tenant_id = p_tenant_id AND period_start = month_start FOR SHARE;
    IF current_status <> 'OPEN' THEN
        RAISE EXCEPTION 'Accounting period % is closed', TO_CHAR(month_start, 'YYYY-MM')
            USING ERRCODE = 'check_violation';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_accounting_period_range_open(
    p_tenant_id UUID, p_period_start DATE, p_period_end DATE
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE month_date DATE;
BEGIN
    IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end THEN
        RAISE EXCEPTION 'A valid date range is required' USING ERRCODE = 'check_violation';
    END IF;
    month_date := date_trunc('month', p_period_start)::DATE;
    WHILE month_date <= p_period_end LOOP
        PERFORM public.ensure_accounting_period(p_tenant_id, month_date);
        month_date := (month_date + INTERVAL '1 month')::DATE;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_accounting_period_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Accounting periods cannot be deleted' USING ERRCODE = 'check_violation'; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'CLOSED' THEN RAISE EXCEPTION 'Closed accounting periods are immutable' USING ERRCODE = 'check_violation'; END IF;
        IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.period_start <> OLD.period_start
           OR NEW.period_end <> OLD.period_end OR NEW.created_at <> OLD.created_at
           OR NEW.status <> 'CLOSED' THEN
            RAISE EXCEPTION 'Accounting period identity is immutable; periods may only be closed' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_accounting_period_mutation BEFORE UPDATE OR DELETE
ON public.accounting_periods FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_period_mutation();

CREATE OR REPLACE FUNCTION public.guard_journal_entry_period()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
    PERFORM public.ensure_accounting_period(NEW.tenant_id, NEW.entry_date);
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_journal_entry_accounting_period BEFORE INSERT OR UPDATE OF entry_date, tenant_id
ON public.accounting_journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_journal_entry_period();

CREATE OR REPLACE FUNCTION public.guard_supplier_bill_period()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
    IF NEW.status = 'DRAFT' THEN PERFORM public.ensure_accounting_period(NEW.tenant_id, NEW.bill_date); END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_supplier_bill_accounting_period BEFORE INSERT OR UPDATE OF bill_date, status
ON public.accounting_supplier_bills FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_bill_period();

CREATE OR REPLACE FUNCTION public.guard_bank_reconciliation_period()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM public.ensure_accounting_period_range_open(NEW.tenant_id, NEW.period_start, NEW.period_end);
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_bank_reconciliation_accounting_period BEFORE INSERT
ON public.accounting_bank_reconciliations FOR EACH ROW EXECUTE FUNCTION public.guard_bank_reconciliation_period();

CREATE OR REPLACE FUNCTION public.guard_accounting_period_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN RAISE EXCEPTION 'Accounting period events are append-only' USING ERRCODE = 'check_violation'; END;
$$;
CREATE TRIGGER trg_guard_accounting_period_event_mutation BEFORE UPDATE OR DELETE
ON public.accounting_period_events FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_period_event_mutation();

CREATE OR REPLACE FUNCTION public.log_accounting_period_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE event_type VARCHAR(20);
BEGIN
    event_type := CASE WHEN TG_OP = 'INSERT' THEN 'CREATED' ELSE 'CLOSED' END;
    INSERT INTO public.accounting_period_events(tenant_id, period_id, event_type, actor_id, details)
    VALUES(NEW.tenant_id, NEW.id, event_type,
           COALESCE(NEW.closed_by, NULLIF(current_setting('scorpbook.actor_id', TRUE), '')::UUID),
           jsonb_build_object('period_start', NEW.period_start, 'period_end', NEW.period_end,
                              'status', NEW.status, 'closed_at', NEW.closed_at));
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_log_accounting_period_event AFTER INSERT OR UPDATE OF status
ON public.accounting_periods FOR EACH ROW EXECUTE FUNCTION public.log_accounting_period_event();

CREATE OR REPLACE FUNCTION public.close_accounting_period(
    p_tenant_id UUID, p_actor_id UUID, p_period_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE period public.accounting_periods%ROWTYPE; draft_journals BIGINT; draft_bills BIGINT;
        pending_reconciliations BIGINT; missing_bank_reconciliations BIGINT;
BEGIN
    IF p_tenant_id IS NULL OR p_actor_id IS NULL OR p_period_id IS NULL THEN
        RAISE EXCEPTION 'Tenant, actor, and accounting period are required' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM set_config('scorpbook.actor_id', p_actor_id::TEXT, TRUE);
    SELECT * INTO period FROM public.accounting_periods
     WHERE tenant_id = p_tenant_id AND id = p_period_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Accounting period was not found' USING ERRCODE = 'no_data_found'; END IF;
    IF period.status <> 'OPEN' THEN RAISE EXCEPTION 'Accounting period is already closed' USING ERRCODE = 'check_violation'; END IF;

    SELECT COUNT(*) INTO draft_journals FROM public.accounting_journal_entries
     WHERE tenant_id = p_tenant_id AND status = 'DRAFT' AND entry_date BETWEEN period.period_start AND period.period_end;
    SELECT COUNT(*) INTO draft_bills FROM public.accounting_supplier_bills
     WHERE tenant_id = p_tenant_id AND status = 'DRAFT' AND bill_date BETWEEN period.period_start AND period.period_end;
    SELECT COUNT(*) INTO pending_reconciliations FROM public.accounting_bank_reconciliations
     WHERE tenant_id = p_tenant_id AND status = 'IN_PROGRESS'
       AND period_start <= period.period_end AND period_end >= period.period_start;
    SELECT COUNT(*) INTO missing_bank_reconciliations FROM public.accounting_accounts AS account
     WHERE account.tenant_id = p_tenant_id AND account.is_active AND account.type = 'ASSET' AND account.code LIKE '10%'
       AND EXISTS (
           SELECT 1 FROM public.accounting_journal_lines AS line
           JOIN public.accounting_journal_entries AS entry ON entry.tenant_id = line.tenant_id AND entry.id = line.entry_id
           WHERE line.tenant_id = p_tenant_id AND line.account_id = account.id
             AND entry.status = 'POSTED' AND entry.entry_date BETWEEN period.period_start AND period.period_end
       )
       AND NOT EXISTS (
           SELECT 1 FROM public.accounting_bank_reconciliations AS reconciliation
           WHERE reconciliation.tenant_id = p_tenant_id AND reconciliation.bank_account_id = account.id
             AND reconciliation.status = 'COMPLETED'
             AND reconciliation.period_start <= period.period_start AND reconciliation.period_end >= period.period_end
       );
    IF draft_journals + draft_bills + pending_reconciliations + missing_bank_reconciliations > 0 THEN
        RAISE EXCEPTION 'Cannot close period: % draft journal(s), % draft bill(s), % incomplete bank reconciliation(s), % active cash account(s) missing a completed reconciliation',
            draft_journals, draft_bills, pending_reconciliations, missing_bank_reconciliations
            USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.accounting_periods SET status = 'CLOSED', closed_by = p_actor_id, closed_at = NOW()
     WHERE tenant_id = p_tenant_id AND id = p_period_id;
    RETURN jsonb_build_object('period_start', period.period_start, 'period_end', period.period_end, 'status', 'CLOSED');
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_accounting_period(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_accounting_period_range_open(UUID, DATE, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_accounting_period(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_accounting_period(UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_accounting_period_range_open(UUID, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_accounting_period(UUID, UUID, UUID) TO service_role;
