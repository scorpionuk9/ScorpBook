ALTER TABLE public.accounting_supplier_bill_events
    DROP CONSTRAINT accounting_supplier_bill_events_event_type_check;
ALTER TABLE public.accounting_supplier_bill_events
    ADD CONSTRAINT accounting_supplier_bill_events_event_type_check
    CHECK (event_type IN ('CREATED', 'UPDATED', 'POSTED', 'PAYMENT_RECORDED', 'LINE_CREATED', 'LINE_UPDATED', 'LINE_DELETED'));

CREATE OR REPLACE FUNCTION public.log_supplier_bill_line_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE actor UUID; bill UUID; tenant UUID; event_name VARCHAR(30); details JSONB;
BEGIN
    actor := NULLIF(current_setting('scorpbook.actor_id', TRUE), '')::UUID;
    IF TG_OP = 'INSERT' THEN
        tenant := NEW.tenant_id; bill := NEW.bill_id; event_name := 'LINE_CREATED';
        details := jsonb_build_object('after', to_jsonb(NEW));
    ELSIF TG_OP = 'DELETE' THEN
        tenant := OLD.tenant_id; bill := OLD.bill_id; event_name := 'LINE_DELETED';
        details := jsonb_build_object('before', to_jsonb(OLD));
    ELSE
        tenant := NEW.tenant_id; bill := NEW.bill_id; event_name := 'LINE_UPDATED';
        details := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
    END IF;
    INSERT INTO public.accounting_supplier_bill_events(tenant_id, bill_id, event_type, actor_id, details)
    VALUES(tenant, bill, event_name, actor, details);
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_log_supplier_bill_line_event
AFTER INSERT OR UPDATE OR DELETE ON public.accounting_supplier_bill_lines
FOR EACH ROW EXECUTE FUNCTION public.log_supplier_bill_line_event();

CREATE OR REPLACE FUNCTION public.guard_supplier_bill_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE bill_total NUMERIC(30,4); paid_total NUMERIC(30,4);
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Supplier bills cannot be deleted; retain the audit trail' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.supplier_id <> OLD.supplier_id OR NEW.created_by <> OLD.created_by THEN
        RAISE EXCEPTION 'Supplier bill identity fields cannot be changed' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status <> 'DRAFT' AND
       (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') AND
       NOT (OLD.status IN ('OPEN','PARTIAL') AND NEW.status IN ('PARTIAL','PAID')
            AND NEW.bill_number = OLD.bill_number AND NEW.bill_date = OLD.bill_date
            AND NEW.due_date = OLD.due_date AND NEW.description IS NOT DISTINCT FROM OLD.description
            AND NEW.journal_entry_id = OLD.journal_entry_id) THEN
        RAISE EXCEPTION 'Posted supplier bill details are immutable' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IN ('OPEN','PARTIAL','PAID') THEN
        SELECT COALESCE(SUM(net_amount + vat_amount), 0) INTO bill_total
          FROM public.accounting_supplier_bill_lines WHERE tenant_id = NEW.tenant_id AND bill_id = NEW.id;
        SELECT COALESCE(SUM(amount), 0) INTO paid_total
          FROM public.accounting_supplier_bill_payments WHERE tenant_id = NEW.tenant_id AND bill_id = NEW.id;
        IF bill_total <= 0 OR
           (NEW.status = 'OPEN' AND paid_total <> 0) OR
           (NEW.status = 'PARTIAL' AND (paid_total <= 0 OR paid_total >= bill_total)) OR
           (NEW.status = 'PAID' AND paid_total <> bill_total) THEN
            RAISE EXCEPTION 'Bill status must match its posted total and recorded payments' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
