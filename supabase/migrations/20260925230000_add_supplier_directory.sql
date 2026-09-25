-- Tenant-scoped supplier master data for upcoming supplier bill workflows.
CREATE TABLE public.accounting_suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.accounting_tenants (id) ON DELETE RESTRICT,
    supplier_code VARCHAR(20) NOT NULL,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(254),
    phone VARCHAR(50),
    tax_number VARCHAR(100),
    address TEXT,
    default_expense_account_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_accounting_suppliers_tenant_code UNIQUE (tenant_id, supplier_code),
    CONSTRAINT uq_accounting_suppliers_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_accounting_suppliers_default_expense
        FOREIGN KEY (tenant_id, default_expense_account_id)
        REFERENCES public.accounting_accounts (tenant_id, id)
        ON DELETE RESTRICT
);

CREATE INDEX idx_accounting_suppliers_tenant_name
    ON public.accounting_suppliers (tenant_id, name);

ALTER TABLE public.accounting_suppliers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accounting_suppliers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_suppliers TO service_role;

CREATE TRIGGER trg_accounting_suppliers_updated_at
BEFORE UPDATE ON public.accounting_suppliers
FOR EACH ROW EXECUTE FUNCTION public.set_accounting_updated_at();

CREATE TABLE public.accounting_supplier_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.accounting_tenants (id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('CREATED', 'UPDATED')),
    actor_id UUID,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX idx_accounting_supplier_events_tenant_supplier_time
    ON public.accounting_supplier_events (tenant_id, supplier_id, occurred_at);

ALTER TABLE public.accounting_supplier_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accounting_supplier_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.accounting_supplier_events TO service_role;

CREATE OR REPLACE FUNCTION public.guard_accounting_supplier_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    selected_account_type VARCHAR(20);
    selected_account_active BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Suppliers cannot be deleted; deactivate them instead'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'UPDATE' AND (
        NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR
        NEW.supplier_code <> OLD.supplier_code
    ) THEN
        RAISE EXCEPTION 'Supplier ID, tenant, and code cannot be changed'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.default_expense_account_id IS NOT NULL THEN
        SELECT account.type, account.is_active
          INTO selected_account_type, selected_account_active
          FROM public.accounting_accounts AS account
         WHERE account.tenant_id = NEW.tenant_id
           AND account.id = NEW.default_expense_account_id;
        IF NOT FOUND OR selected_account_type <> 'EXPENSE' OR NOT selected_account_active THEN
            RAISE EXCEPTION 'Default account must be an active expense account for this tenant'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_accounting_supplier_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.accounting_suppliers
FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_supplier_mutation();

CREATE OR REPLACE FUNCTION public.guard_accounting_supplier_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'Supplier audit events are append-only'
        USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER trg_guard_accounting_supplier_event_mutation
BEFORE UPDATE OR DELETE ON public.accounting_supplier_events
FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_supplier_event_mutation();

CREATE OR REPLACE FUNCTION public.log_accounting_supplier_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    event_actor UUID;
BEGIN
    event_actor := COALESCE(
        NULLIF(current_setting('scorpbook.actor_id', TRUE), '')::UUID,
        auth.uid()
    );

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.accounting_supplier_events
            (tenant_id, supplier_id, event_type, actor_id, details)
        VALUES (NEW.tenant_id, NEW.id, 'CREATED', event_actor,
                jsonb_build_object('after', to_jsonb(NEW)));
        RETURN NEW;
    END IF;

    IF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
        INSERT INTO public.accounting_supplier_events
            (tenant_id, supplier_id, event_type, actor_id, details)
        VALUES (NEW.tenant_id, NEW.id, 'UPDATED', event_actor,
                jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW)));
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_accounting_supplier_event
AFTER INSERT OR UPDATE ON public.accounting_suppliers
FOR EACH ROW EXECUTE FUNCTION public.log_accounting_supplier_event();

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
BEGIN
    IF p_tenant_id IS NULL OR p_actor_id IS NULL OR
       NULLIF(BTRIM(p_supplier_code), '') IS NULL OR
       NULLIF(BTRIM(p_name), '') IS NULL THEN
        RAISE EXCEPTION 'Tenant, actor, supplier code, and name are required'
            USING ERRCODE = 'check_violation';
    END IF;

    PERFORM set_config('scorpbook.actor_id', p_actor_id::TEXT, TRUE);
    IF p_supplier_id IS NULL THEN
        INSERT INTO public.accounting_suppliers (
            tenant_id, supplier_code, name, email, phone, tax_number, address,
            default_expense_account_id, is_active
        ) VALUES (
            p_tenant_id, BTRIM(p_supplier_code), BTRIM(p_name), NULLIF(BTRIM(p_email), ''),
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

REVOKE ALL ON FUNCTION public.save_accounting_supplier(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, UUID, BOOLEAN, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_accounting_supplier(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, UUID, BOOLEAN, UUID)
    TO service_role;
