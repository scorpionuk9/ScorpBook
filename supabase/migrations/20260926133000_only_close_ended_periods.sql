CREATE OR REPLACE FUNCTION public.guard_only_ended_periods_can_close()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
    IF NEW.status = 'CLOSED' AND NEW.status IS DISTINCT FROM OLD.status
       AND NEW.period_end >= (NOW() AT TIME ZONE 'Europe/London')::DATE THEN
        RAISE EXCEPTION 'A period can only be closed after its end date'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_only_ended_accounting_periods_can_close
BEFORE UPDATE OF status ON public.accounting_periods
FOR EACH ROW EXECUTE FUNCTION public.guard_only_ended_periods_can_close();
