-- Reserve journal numbers atomically at save time. A preview is read-only, so
-- opening or abandoning a form does not create gaps in the sequence.

CREATE TABLE public.accounting_journal_number_counters (
    tenant_id UUID NOT NULL
        REFERENCES public.accounting_tenants (id) ON DELETE RESTRICT,
    entry_year INTEGER NOT NULL CHECK (entry_year BETWEEN 1 AND 9999),
    last_number BIGINT NOT NULL DEFAULT 0 CHECK (last_number >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, entry_year)
);

ALTER TABLE public.accounting_journal_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accounting_journal_number_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.accounting_journal_number_counters TO service_role;

-- Keep the counter in step with existing entries using the new JE-YYYY-NNNNNN format.
INSERT INTO public.accounting_journal_number_counters AS counters (tenant_id, entry_year, last_number)
SELECT tenant_id,
       split_part(entry_number, '-', 2)::INTEGER,
       MAX(split_part(entry_number, '-', 3)::BIGINT)
  FROM public.accounting_journal_entries
 WHERE entry_number ~ '^JE-[0-9]{4}-[0-9]{6,18}$'
 GROUP BY tenant_id, split_part(entry_number, '-', 2)::INTEGER
ON CONFLICT (tenant_id, entry_year) DO UPDATE
   SET last_number = GREATEST(
           counters.last_number,
           EXCLUDED.last_number
       ),
       updated_at = NOW();

CREATE OR REPLACE FUNCTION public.suggest_journal_entry_number(
    p_tenant_id UUID,
    p_entry_date DATE
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_entry_year INTEGER;
    v_next_number BIGINT;
BEGIN
    IF p_tenant_id IS NULL OR p_entry_date IS NULL THEN
        RAISE EXCEPTION 'Tenant and entry date are required'
            USING ERRCODE = 'check_violation';
    END IF;

    v_entry_year := EXTRACT(YEAR FROM p_entry_date)::INTEGER;
    SELECT GREATEST(
               COALESCE((
                   SELECT counter.last_number
                     FROM public.accounting_journal_number_counters AS counter
                    WHERE counter.tenant_id = p_tenant_id
                      AND counter.entry_year = v_entry_year
               ), 0),
               COALESCE((
                   SELECT MAX(split_part(entry.entry_number, '-', 3)::BIGINT)
                     FROM public.accounting_journal_entries AS entry
                    WHERE entry.tenant_id = p_tenant_id
                      AND entry.entry_number ~ ('^JE-' || v_entry_year::TEXT || '-[0-9]{6,18}$')
               ), 0)
           ) + 1
      INTO v_next_number;

    RETURN 'JE-' || v_entry_year::TEXT || '-' ||
           LPAD(v_next_number::TEXT, GREATEST(6, LENGTH(v_next_number::TEXT)), '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_journal_entry_number(
    p_tenant_id UUID,
    p_entry_date DATE,
    p_requested_number VARCHAR DEFAULT NULL
)
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_entry_year INTEGER;
    v_counter_year INTEGER;
    v_current_number BIGINT;
    v_highest_used_number BIGINT;
    v_next_number BIGINT;
    v_requested_number VARCHAR;
BEGIN
    IF p_tenant_id IS NULL OR p_entry_date IS NULL THEN
        RAISE EXCEPTION 'Tenant and entry date are required'
            USING ERRCODE = 'check_violation';
    END IF;

    v_requested_number := NULLIF(BTRIM(p_requested_number), '');
    IF v_requested_number IS NOT NULL THEN
        -- Manual values in our standard format also advance their year's counter.
        IF v_requested_number ~ '^JE-[0-9]{4}-[0-9]{6,18}$' THEN
            v_counter_year := split_part(v_requested_number, '-', 2)::INTEGER;
            v_current_number := split_part(v_requested_number, '-', 3)::BIGINT;
            INSERT INTO public.accounting_journal_number_counters AS counters
                (tenant_id, entry_year, last_number)
            VALUES (p_tenant_id, v_counter_year, v_current_number)
            ON CONFLICT (tenant_id, entry_year) DO UPDATE
               SET last_number = GREATEST(
                       counters.last_number,
                       EXCLUDED.last_number
                   ),
                   updated_at = NOW();
        END IF;
        RETURN v_requested_number;
    END IF;

    v_entry_year := EXTRACT(YEAR FROM p_entry_date)::INTEGER;
    INSERT INTO public.accounting_journal_number_counters
        (tenant_id, entry_year, last_number)
    VALUES (p_tenant_id, v_entry_year, 0)
    ON CONFLICT (tenant_id, entry_year) DO NOTHING;

    -- Serialize generation per tenant and year, including concurrent form submits.
    SELECT counter.last_number
      INTO v_current_number
      FROM public.accounting_journal_number_counters AS counter
     WHERE counter.tenant_id = p_tenant_id AND counter.entry_year = v_entry_year
     FOR UPDATE;

    SELECT COALESCE(MAX(split_part(entry.entry_number, '-', 3)::BIGINT), 0)
      INTO v_highest_used_number
      FROM public.accounting_journal_entries AS entry
     WHERE entry.tenant_id = p_tenant_id
       AND entry.entry_number ~ ('^JE-' || v_entry_year::TEXT || '-[0-9]{6,18}$');

    v_next_number := GREATEST(v_current_number, v_highest_used_number) + 1;
    UPDATE public.accounting_journal_number_counters AS counters
       SET last_number = v_next_number,
           updated_at = NOW()
     WHERE counters.tenant_id = p_tenant_id AND counters.entry_year = v_entry_year;

    RETURN 'JE-' || v_entry_year::TEXT || '-' ||
           LPAD(v_next_number::TEXT, GREATEST(6, LENGTH(v_next_number::TEXT)), '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.save_draft_journal_entry_numbered(
    p_tenant_id UUID,
    p_entry_date DATE,
    p_source_type VARCHAR,
    p_lines JSONB,
    p_requested_entry_number VARCHAR DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_source_id VARCHAR DEFAULT NULL,
    p_source_event VARCHAR DEFAULT NULL,
    p_entry_id UUID DEFAULT NULL,
    p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    assigned_number VARCHAR(50);
    saved_entry_id UUID;
BEGIN
    assigned_number := public.allocate_journal_entry_number(
        p_tenant_id, p_entry_date, p_requested_entry_number
    );
    saved_entry_id := public.save_draft_journal_entry(
        p_tenant_id,
        assigned_number,
        p_entry_date,
        p_source_type,
        p_lines,
        p_description,
        p_source_id,
        p_source_event,
        p_entry_id,
        p_actor_id
    );

    RETURN jsonb_build_object('id', saved_entry_id, 'entry_number', assigned_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_journal_entry_numbered(
    p_tenant_id UUID,
    p_entry_id UUID,
    p_reversal_date DATE DEFAULT CURRENT_DATE,
    p_requested_entry_number VARCHAR DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    assigned_number VARCHAR(50);
    reversal_entry_id UUID;
BEGIN
    assigned_number := public.allocate_journal_entry_number(
        p_tenant_id, p_reversal_date, p_requested_entry_number
    );
    reversal_entry_id := public.reverse_journal_entry(
        p_tenant_id,
        p_entry_id,
        assigned_number,
        p_reversal_date,
        p_description,
        p_actor_id
    );

    RETURN jsonb_build_object('id', reversal_entry_id, 'entry_number', assigned_number);
END;
$$;

REVOKE ALL ON FUNCTION public.suggest_journal_entry_number(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.allocate_journal_entry_number(UUID, DATE, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_draft_journal_entry_numbered(UUID, DATE, VARCHAR, JSONB, VARCHAR, TEXT, VARCHAR, VARCHAR, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_journal_entry_numbered(UUID, UUID, DATE, VARCHAR, TEXT, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.suggest_journal_entry_number(UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_draft_journal_entry_numbered(UUID, DATE, VARCHAR, JSONB, VARCHAR, TEXT, VARCHAR, VARCHAR, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_journal_entry_numbered(UUID, UUID, DATE, VARCHAR, TEXT, UUID) TO service_role;
