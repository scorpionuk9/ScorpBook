CREATE OR REPLACE FUNCTION public.guard_bank_reconciliation_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Bank reconciliations cannot be deleted' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF EXISTS (
            SELECT 1 FROM public.accounting_bank_reconciliations AS existing
             WHERE existing.tenant_id = NEW.tenant_id AND existing.bank_account_id = NEW.bank_account_id
               AND daterange(existing.period_start, existing.period_end, '[]')
                   && daterange(NEW.period_start, NEW.period_end, '[]')
        ) THEN
            RAISE EXCEPTION 'A reconciliation period already overlaps these dates for this bank account'
                USING ERRCODE = 'exclusion_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF OLD.status = 'COMPLETED' THEN RAISE EXCEPTION 'Completed reconciliations are immutable' USING ERRCODE = 'check_violation'; END IF;
    IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.bank_account_id <> OLD.bank_account_id
       OR NEW.period_start <> OLD.period_start OR NEW.period_end <> OLD.period_end
       OR NEW.opening_balance <> OLD.opening_balance OR NEW.closing_balance <> OLD.closing_balance
       OR NEW.created_by <> OLD.created_by THEN
        RAISE EXCEPTION 'Reconciliation identity and statement balances cannot be changed' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER trg_guard_bank_reconciliation_mutation ON public.accounting_bank_reconciliations;
CREATE TRIGGER trg_guard_bank_reconciliation_mutation BEFORE INSERT OR UPDATE OR DELETE
ON public.accounting_bank_reconciliations FOR EACH ROW EXECUTE FUNCTION public.guard_bank_reconciliation_mutation();
