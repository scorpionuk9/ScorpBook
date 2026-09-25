-- Transactional journal-entry lifecycle and append-only audit history.

CREATE TABLE public.accounting_journal_entry_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL
        REFERENCES public.accounting_tenants (id) ON DELETE RESTRICT,
    -- Intentionally not an FK: retain audit history if a draft is deleted.
    entry_id UUID NOT NULL,
    event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
        'CREATED', 'UPDATED', 'STATUS_CHANGED', 'POSTED', 'VOIDED', 'DELETED',
        'REVERSAL_CREATED', 'LINE_CREATED', 'LINE_UPDATED', 'LINE_DELETED'
    )),
    actor_id UUID,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details JSONB NOT NULL DEFAULT '{}'::JSONB
        CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX idx_journal_entry_events_tenant_entry_time
    ON public.accounting_journal_entry_events (tenant_id, entry_id, occurred_at);

ALTER TABLE public.accounting_journal_entry_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accounting_journal_entry_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.accounting_journal_entry_events TO service_role;

CREATE OR REPLACE FUNCTION public.guard_journal_entry_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'Journal entry audit events are append-only'
        USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER trg_guard_journal_entry_event_mutation
BEFORE UPDATE OR DELETE ON public.accounting_journal_entry_events
FOR EACH ROW EXECUTE FUNCTION public.guard_journal_entry_event_mutation();

CREATE OR REPLACE FUNCTION public.log_journal_entry_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    event_tenant UUID;
    event_entry UUID;
    event_name VARCHAR(30);
    event_actor UUID;
    event_details JSONB;
BEGIN
    event_actor := COALESCE(
        NULLIF(current_setting('scorpbook.actor_id', TRUE), '')::UUID,
        auth.uid()
    );

    IF TG_OP = 'INSERT' THEN
        event_tenant := NEW.tenant_id;
        event_entry := NEW.id;
        event_name := CASE WHEN NEW.reverses_entry_id IS NULL
            THEN 'CREATED' ELSE 'REVERSAL_CREATED' END;
        event_details := jsonb_build_object('after', to_jsonb(NEW));
        INSERT INTO public.accounting_journal_entry_events
            (tenant_id, entry_id, event_type, actor_id, details)
        VALUES (event_tenant, event_entry, event_name, event_actor, event_details);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        event_tenant := OLD.tenant_id;
        event_entry := OLD.id;
        event_name := 'DELETED';
        event_details := jsonb_build_object('before', to_jsonb(OLD));
        INSERT INTO public.accounting_journal_entry_events
            (tenant_id, entry_id, event_type, actor_id, details)
        VALUES (event_tenant, event_entry, event_name, event_actor, event_details);
        RETURN OLD;
    END IF;

    IF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM
       (to_jsonb(OLD) - 'updated_at') THEN
        event_tenant := NEW.tenant_id;
        event_entry := NEW.id;
        event_name := CASE
            WHEN NEW.status = 'POSTED' AND OLD.status <> 'POSTED' THEN 'POSTED'
            WHEN NEW.status = 'VOIDED' AND OLD.status <> 'VOIDED' THEN 'VOIDED'
            WHEN NEW.status <> OLD.status THEN 'STATUS_CHANGED'
            ELSE 'UPDATED'
        END;
        event_details := jsonb_build_object(
            'before', to_jsonb(OLD),
            'after', to_jsonb(NEW)
        );
        INSERT INTO public.accounting_journal_entry_events
            (tenant_id, entry_id, event_type, actor_id, details)
        VALUES (event_tenant, event_entry, event_name, event_actor, event_details);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_journal_entry_event
AFTER INSERT OR UPDATE OR DELETE ON public.accounting_journal_entries
FOR EACH ROW EXECUTE FUNCTION public.log_journal_entry_event();

CREATE OR REPLACE FUNCTION public.log_journal_line_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    event_tenant UUID;
    event_entry UUID;
    event_actor UUID;
    event_name VARCHAR(30);
    event_details JSONB;
BEGIN
    event_actor := COALESCE(
        NULLIF(current_setting('scorpbook.actor_id', TRUE), '')::UUID,
        auth.uid()
    );

    IF TG_OP = 'INSERT' THEN
        event_tenant := NEW.tenant_id;
        event_entry := NEW.entry_id;
        event_name := 'LINE_CREATED';
        event_details := jsonb_build_object('after', to_jsonb(NEW));
        INSERT INTO public.accounting_journal_entry_events
            (tenant_id, entry_id, event_type, actor_id, details)
        VALUES (event_tenant, event_entry, event_name, event_actor, event_details);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        event_tenant := OLD.tenant_id;
        event_entry := OLD.entry_id;
        event_name := 'LINE_DELETED';
        event_details := jsonb_build_object('before', to_jsonb(OLD));
        INSERT INTO public.accounting_journal_entry_events
            (tenant_id, entry_id, event_type, actor_id, details)
        VALUES (event_tenant, event_entry, event_name, event_actor, event_details);
        RETURN OLD;
    END IF;

    event_tenant := NEW.tenant_id;
    event_entry := NEW.entry_id;
    event_name := 'LINE_UPDATED';
    event_details := jsonb_build_object(
        'before', to_jsonb(OLD),
        'after', to_jsonb(NEW)
    );
    INSERT INTO public.accounting_journal_entry_events
        (tenant_id, entry_id, event_type, actor_id, details)
    VALUES (event_tenant, event_entry, event_name, event_actor, event_details);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_journal_line_event
AFTER INSERT OR UPDATE OR DELETE ON public.accounting_journal_lines
FOR EACH ROW EXECUTE FUNCTION public.log_journal_line_event();

CREATE UNIQUE INDEX uq_accounting_entries_single_reversal
    ON public.accounting_journal_entries (tenant_id, reverses_entry_id)
    WHERE reverses_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.save_draft_journal_entry(
    p_tenant_id UUID,
    p_entry_number VARCHAR,
    p_entry_date DATE,
    p_source_type VARCHAR,
    p_lines JSONB,
    p_description TEXT DEFAULT NULL,
    p_source_id VARCHAR DEFAULT NULL,
    p_source_event VARCHAR DEFAULT NULL,
    p_entry_id UUID DEFAULT NULL,
    p_actor_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    saved_entry_id UUID;
    existing_status VARCHAR(20);
    line_item JSONB;
    item_account_id UUID;
    item_description TEXT;
    item_debit NUMERIC(15, 4);
    item_credit NUMERIC(15, 4);
    account_is_active BOOLEAN;
BEGIN
    PERFORM set_config('scorpbook.actor_id', COALESCE(p_actor_id::TEXT, ''), TRUE);

    IF p_tenant_id IS NULL OR p_entry_date IS NULL OR
       NULLIF(BTRIM(p_entry_number), '') IS NULL OR
       NULLIF(BTRIM(p_source_type), '') IS NULL THEN
        RAISE EXCEPTION 'Tenant, entry number, entry date, and source type are required'
            USING ERRCODE = 'check_violation';
    END IF;
    IF p_source_type NOT IN ('SCORPINVOICE', 'MANUAL', 'BANK_IMPORT') THEN
        RAISE EXCEPTION 'Unsupported journal entry source type: %', p_source_type
            USING ERRCODE = 'check_violation';
    END IF;
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR
       jsonb_array_length(p_lines) < 2 THEN
        RAISE EXCEPTION 'A journal entry draft requires at least two lines'
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_entry_id IS NULL THEN
        INSERT INTO public.accounting_journal_entries
            (tenant_id, entry_number, entry_date, description, source_type,
             source_id, source_event, created_by)
        VALUES
            (p_tenant_id, BTRIM(p_entry_number), p_entry_date, p_description,
             BTRIM(p_source_type), p_source_id, p_source_event,
             COALESCE(p_actor_id, auth.uid()))
        RETURNING id INTO saved_entry_id;
    ELSE
        SELECT status INTO existing_status
          FROM public.accounting_journal_entries
         WHERE tenant_id = p_tenant_id AND id = p_entry_id
         FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Journal entry % was not found for this tenant', p_entry_id
                USING ERRCODE = 'no_data_found';
        END IF;
        IF existing_status <> 'DRAFT' THEN
            RAISE EXCEPTION 'Only DRAFT journal entries can be edited'
                USING ERRCODE = 'check_violation';
        END IF;

        UPDATE public.accounting_journal_entries
           SET entry_number = BTRIM(p_entry_number),
               entry_date = p_entry_date,
               description = p_description,
               source_type = BTRIM(p_source_type),
               source_id = p_source_id,
               source_event = p_source_event
         WHERE tenant_id = p_tenant_id AND id = p_entry_id;
        saved_entry_id := p_entry_id;

        DELETE FROM public.accounting_journal_lines
         WHERE tenant_id = p_tenant_id AND entry_id = saved_entry_id;
    END IF;

    FOR line_item IN SELECT value FROM jsonb_array_elements(p_lines)
    LOOP
        item_account_id := NULLIF(line_item ->> 'account_id', '')::UUID;
        item_description := line_item ->> 'description';
        item_debit := COALESCE(NULLIF(line_item ->> 'debit', '')::NUMERIC, 0);
        item_credit := COALESCE(NULLIF(line_item ->> 'credit', '')::NUMERIC, 0);

        IF item_account_id IS NULL THEN
            RAISE EXCEPTION 'Every journal line must specify an account_id'
                USING ERRCODE = 'check_violation';
        END IF;
        SELECT is_active INTO account_is_active
          FROM public.accounting_accounts
         WHERE tenant_id = p_tenant_id AND id = item_account_id
         FOR KEY SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Account % does not belong to tenant %', item_account_id, p_tenant_id
                USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF NOT account_is_active THEN
            RAISE EXCEPTION 'Inactive account % cannot be used on a draft entry', item_account_id
                USING ERRCODE = 'check_violation';
        END IF;

        INSERT INTO public.accounting_journal_lines
            (tenant_id, entry_id, account_id, description, debit, credit)
        VALUES
            (p_tenant_id, saved_entry_id, item_account_id, item_description,
             item_debit, item_credit);
    END LOOP;

    RETURN saved_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_journal_entry(
    p_tenant_id UUID,
    p_entry_id UUID,
    p_actor_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    entry_status VARCHAR(20);
    line_count BIGINT;
    debit_total NUMERIC(30, 4);
    credit_total NUMERIC(30, 4);
BEGIN
    PERFORM set_config('scorpbook.actor_id', COALESCE(p_actor_id::TEXT, ''), TRUE);

    SELECT status INTO entry_status
      FROM public.accounting_journal_entries
     WHERE tenant_id = p_tenant_id AND id = p_entry_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Journal entry % was not found for this tenant', p_entry_id
            USING ERRCODE = 'no_data_found';
    END IF;
    IF entry_status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Only DRAFT journal entries can be posted'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT COUNT(*), COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
      INTO line_count, debit_total, credit_total
      FROM public.accounting_journal_lines
     WHERE tenant_id = p_tenant_id AND entry_id = p_entry_id;
    IF line_count < 2 OR debit_total = 0 OR debit_total <> credit_total THEN
        RAISE EXCEPTION 'Journal entry must have at least two lines and equal, non-zero debit/credit totals (debit %, credit %)',
            debit_total, credit_total
            USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM public.accounting_journal_lines AS line
          JOIN public.accounting_accounts AS account
            ON account.tenant_id = line.tenant_id AND account.id = line.account_id
         WHERE line.tenant_id = p_tenant_id AND line.entry_id = p_entry_id
           AND NOT account.is_active
    ) THEN
        RAISE EXCEPTION 'Journal entry contains an inactive account'
            USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.accounting_journal_entries
       SET status = 'POSTED'
     WHERE tenant_id = p_tenant_id AND id = p_entry_id;
    RETURN p_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_journal_entry(
    p_tenant_id UUID,
    p_entry_id UUID,
    p_reversal_entry_number VARCHAR,
    p_reversal_date DATE DEFAULT CURRENT_DATE,
    p_description TEXT DEFAULT NULL,
    p_actor_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    original_entry public.accounting_journal_entries%ROWTYPE;
    reversal_entry_id UUID;
    reversed_line_count BIGINT;
BEGIN
    PERFORM set_config('scorpbook.actor_id', COALESCE(p_actor_id::TEXT, ''), TRUE);

    IF NULLIF(BTRIM(p_reversal_entry_number), '') IS NULL OR p_reversal_date IS NULL THEN
        RAISE EXCEPTION 'Reversal entry number and date are required'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO original_entry
      FROM public.accounting_journal_entries
     WHERE tenant_id = p_tenant_id AND id = p_entry_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Journal entry % was not found for this tenant', p_entry_id
            USING ERRCODE = 'no_data_found';
    END IF;
    IF original_entry.status <> 'POSTED' THEN
        RAISE EXCEPTION 'Only POSTED journal entries can be reversed'
            USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.accounting_journal_entries
         WHERE tenant_id = p_tenant_id AND reverses_entry_id = p_entry_id
    ) THEN
        RAISE EXCEPTION 'Journal entry % already has a reversing entry', p_entry_id
            USING ERRCODE = 'unique_violation';
    END IF;

    INSERT INTO public.accounting_journal_entries
        (tenant_id, entry_number, entry_date, description, source_type,
         source_id, source_event, status, reverses_entry_id, created_by)
    VALUES
        (p_tenant_id, BTRIM(p_reversal_entry_number), p_reversal_date,
         COALESCE(p_description, 'Reversal of journal entry ' || original_entry.entry_number),
         'MANUAL', original_entry.id::TEXT, 'REVERSAL', 'DRAFT', original_entry.id,
         COALESCE(p_actor_id, auth.uid()))
    RETURNING id INTO reversal_entry_id;

    INSERT INTO public.accounting_journal_lines
        (tenant_id, entry_id, account_id, description, debit, credit)
    SELECT tenant_id, reversal_entry_id, account_id, description, credit, debit
      FROM public.accounting_journal_lines
     WHERE tenant_id = p_tenant_id AND entry_id = p_entry_id;
    GET DIAGNOSTICS reversed_line_count = ROW_COUNT;
    IF reversed_line_count < 2 THEN
        RAISE EXCEPTION 'Posted journal entry has fewer than two lines and cannot be reversed'
            USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.accounting_journal_entries
       SET status = 'POSTED'
     WHERE tenant_id = p_tenant_id AND id = reversal_entry_id;
    RETURN reversal_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_journal_entry_event_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_journal_entry_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_journal_line_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_draft_journal_entry(UUID, VARCHAR, DATE, VARCHAR, JSONB, TEXT, VARCHAR, VARCHAR, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_journal_entry(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_journal_entry(UUID, UUID, VARCHAR, DATE, TEXT, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_draft_journal_entry(UUID, VARCHAR, DATE, VARCHAR, JSONB, TEXT, VARCHAR, VARCHAR, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_journal_entry(UUID, UUID, VARCHAR, DATE, TEXT, UUID) TO service_role;
