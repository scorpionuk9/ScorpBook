-- Atomically allocate immutable supplier codes per tenant.
CREATE TABLE public.accounting_supplier_code_counters (
    tenant_id UUID PRIMARY KEY
        REFERENCES public.accounting_tenants (id) ON DELETE RESTRICT,
    last_number BIGINT NOT NULL DEFAULT 0 CHECK (last_number >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.accounting_supplier_code_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accounting_supplier_code_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.accounting_supplier_code_counters TO service_role;

INSERT INTO public.accounting_supplier_code_counters AS counters (tenant_id, last_number)
SELECT tenant_id, MAX(SUBSTRING(supplier_code FROM 5)::BIGINT)
  FROM public.accounting_suppliers
 WHERE supplier_code ~ '^SUP-[0-9]{6,18}$'
 GROUP BY tenant_id
ON CONFLICT (tenant_id) DO UPDATE
   SET last_number = GREATEST(counters.last_number, EXCLUDED.last_number),
       updated_at = NOW();

CREATE OR REPLACE FUNCTION public.suggest_supplier_code(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    next_number BIGINT;
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant is required' USING ERRCODE = 'check_violation';
    END IF;

    SELECT GREATEST(
               COALESCE((SELECT counter.last_number
                           FROM public.accounting_supplier_code_counters AS counter
                          WHERE counter.tenant_id = p_tenant_id), 0),
               COALESCE((SELECT MAX(SUBSTRING(supplier.supplier_code FROM 5)::BIGINT)
                           FROM public.accounting_suppliers AS supplier
                          WHERE supplier.tenant_id = p_tenant_id
                            AND supplier.supplier_code ~ '^SUP-[0-9]{6,18}$'), 0)
           ) + 1
      INTO next_number;
    RETURN 'SUP-' || LPAD(next_number::TEXT, GREATEST(6, LENGTH(next_number::TEXT)), '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_supplier_code(p_tenant_id UUID)
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    current_number BIGINT;
    highest_used_number BIGINT;
    next_number BIGINT;
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant is required' USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.accounting_supplier_code_counters (tenant_id, last_number)
    VALUES (p_tenant_id, 0)
    ON CONFLICT (tenant_id) DO NOTHING;

    SELECT counter.last_number INTO current_number
      FROM public.accounting_supplier_code_counters AS counter
     WHERE counter.tenant_id = p_tenant_id
     FOR UPDATE;

    SELECT COALESCE(MAX(SUBSTRING(supplier.supplier_code FROM 5)::BIGINT), 0)
      INTO highest_used_number
      FROM public.accounting_suppliers AS supplier
     WHERE supplier.tenant_id = p_tenant_id
       AND supplier.supplier_code ~ '^SUP-[0-9]{6,18}$';

    next_number := GREATEST(current_number, highest_used_number) + 1;
    UPDATE public.accounting_supplier_code_counters
       SET last_number = next_number, updated_at = NOW()
     WHERE tenant_id = p_tenant_id;

    RETURN 'SUP-' || LPAD(next_number::TEXT, GREATEST(6, LENGTH(next_number::TEXT)), '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.save_accounting_supplier(
    p_tenant_id UUID,
    p_actor_id UUID,
    p_supplier_code VARCHAR,
    p_name VARCHAR,
    p_email VARCHAR DEFAULT NULL,
    p_phone VARCHAR DEFAULT NULL,
    p_tax_number VARCHAR DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_default_expense_account_id UUID DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT TRUE,
    p_supplier_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    saved_supplier_id UUID;
    saved_supplier_code VARCHAR(20);
BEGIN
    IF p_tenant_id IS NULL OR p_actor_id IS NULL OR NULLIF(BTRIM(p_name), '') IS NULL THEN
        RAISE EXCEPTION 'Tenant, actor, and supplier name are required'
            USING ERRCODE = 'check_violation';
    END IF;

    PERFORM set_config('scorpbook.actor_id', p_actor_id::TEXT, TRUE);
    IF p_supplier_id IS NULL THEN
        saved_supplier_code := public.allocate_supplier_code(p_tenant_id);
        INSERT INTO public.accounting_suppliers (
            tenant_id, supplier_code, name, email, phone, tax_number, address,
            default_expense_account_id, is_active
        ) VALUES (
            p_tenant_id, saved_supplier_code, BTRIM(p_name), NULLIF(BTRIM(p_email), ''),
            NULLIF(BTRIM(p_phone), ''), NULLIF(BTRIM(p_tax_number), ''), NULLIF(BTRIM(p_address), ''),
            p_default_expense_account_id, COALESCE(p_is_active, TRUE)
        ) RETURNING id INTO saved_supplier_id;
    ELSE
        UPDATE public.accounting_suppliers
           SET name = BTRIM(p_name),
               email = NULLIF(BTRIM(p_email), ''),
               phone = NULLIF(BTRIM(p_phone), ''),
               tax_number = NULLIF(BTRIM(p_tax_number), ''),
               address = NULLIF(BTRIM(p_address), ''),
               default_expense_account_id = p_default_expense_account_id,
               is_active = COALESCE(p_is_active, TRUE)
         WHERE tenant_id = p_tenant_id AND id = p_supplier_id
        RETURNING id INTO saved_supplier_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Supplier % was not found for this tenant', p_supplier_id
                USING ERRCODE = 'no_data_found';
        END IF;
    END IF;
    RETURN saved_supplier_id;
END;
$$;

REVOKE ALL ON FUNCTION public.suggest_supplier_code(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.allocate_supplier_code(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_accounting_supplier(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, UUID, BOOLEAN, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_supplier_code(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_accounting_supplier(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, UUID, BOOLEAN, UUID)
    TO service_role;
