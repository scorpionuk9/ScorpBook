-- ScorpBook accounting ledger: exact decimal amounts, tenant-scoped references,
-- balanced posting, and immutable posted entries.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.accounting_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL
        CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_accounting_accounts_tenant_code UNIQUE (tenant_id, code),
    CONSTRAINT uq_accounting_accounts_tenant_id UNIQUE (tenant_id, id)
);

CREATE TABLE public.accounting_journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    entry_number VARCHAR(50) NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    source_type VARCHAR(50) NOT NULL,
    source_id VARCHAR(100),
    source_event VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'POSTED', 'VOIDED')),
    -- Set on a correcting entry to preserve an explicit link to the entry reversed.
    reverses_entry_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_accounting_entries_tenant_number UNIQUE (tenant_id, entry_number),
    CONSTRAINT uq_accounting_entries_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_accounting_entries_reversed_entry
        FOREIGN KEY (tenant_id, reverses_entry_id)
        REFERENCES public.accounting_journal_entries (tenant_id, id),
    CONSTRAINT chk_accounting_entries_not_self_reversal
        CHECK (reverses_entry_id IS NULL OR reverses_entry_id <> id)
);

CREATE TABLE public.accounting_journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    entry_id UUID NOT NULL,
    account_id UUID NOT NULL,
    description TEXT,
    debit NUMERIC(15, 4) NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit NUMERIC(15, 4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_accounting_line_one_sided CHECK (
        (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
    ),
    CONSTRAINT fk_accounting_lines_entry
        FOREIGN KEY (tenant_id, entry_id)
        REFERENCES public.accounting_journal_entries (tenant_id, id),
    CONSTRAINT fk_accounting_lines_account
        FOREIGN KEY (tenant_id, account_id)
        REFERENCES public.accounting_accounts (tenant_id, id)
);

CREATE TABLE public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    event_id VARCHAR(100) NOT NULL,
    source_system VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_webhook_events_tenant_source_event
        UNIQUE (tenant_id, source_system, event_id)
);

CREATE INDEX idx_accounting_entries_tenant_date
    ON public.accounting_journal_entries (tenant_id, entry_date);
CREATE INDEX idx_accounting_lines_entry
    ON public.accounting_journal_lines (tenant_id, entry_id);
CREATE INDEX idx_accounting_lines_account
    ON public.accounting_journal_lines (tenant_id, account_id);

CREATE OR REPLACE FUNCTION public.set_accounting_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_accounting_accounts_updated_at
BEFORE UPDATE ON public.accounting_accounts
FOR EACH ROW EXECUTE FUNCTION public.set_accounting_updated_at();

CREATE TRIGGER trg_accounting_entries_updated_at
BEFORE UPDATE ON public.accounting_journal_entries
FOR EACH ROW EXECUTE FUNCTION public.set_accounting_updated_at();

-- A posted entry and its lines are immutable. Correct it by posting a separate
-- entry with reversed debit/credit values and reverses_entry_id populated.
CREATE OR REPLACE FUNCTION public.guard_accounting_entry_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'POSTED' THEN
            RAISE EXCEPTION 'Posted journal entries cannot be deleted; create a reversing entry'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.status = 'POSTED' THEN
        RAISE EXCEPTION 'Posted journal entries cannot be changed; create a reversing entry'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'VOIDED' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Voided journal entries cannot be changed'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_accounting_entry_mutation
BEFORE UPDATE OR DELETE ON public.accounting_journal_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_entry_mutation();

CREATE OR REPLACE FUNCTION public.guard_accounting_line_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_tenant UUID;
    target_entry UUID;
    entry_status VARCHAR(20);
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.entry_id <> OLD.entry_id OR NEW.tenant_id <> OLD.tenant_id) THEN
        RAISE EXCEPTION 'Journal lines cannot be moved between entries or tenants'
            USING ERRCODE = 'check_violation';
    END IF;

    target_tenant := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
    target_entry := CASE WHEN TG_OP = 'DELETE' THEN OLD.entry_id ELSE NEW.entry_id END;

    SELECT status INTO entry_status
      FROM public.accounting_journal_entries
     WHERE tenant_id = target_tenant AND id = target_entry
     FOR UPDATE;

    IF entry_status IS NULL THEN
        RAISE EXCEPTION 'Journal entry does not exist'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF entry_status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Journal lines can only be changed while the entry is DRAFT'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER trg_guard_accounting_line_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.accounting_journal_lines
FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_line_mutation();

-- Deferred so clients can create the header and all its lines in one transaction.
-- The check runs at commit whenever a header or line is inserted/changed/deleted.
CREATE OR REPLACE FUNCTION public.assert_posted_entry_balanced()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_tenant UUID;
    target_entry UUID;
    entry_status VARCHAR(20);
    line_count BIGINT;
    debit_total NUMERIC(30, 4);
    credit_total NUMERIC(30, 4);
BEGIN
    IF TG_TABLE_NAME = 'accounting_journal_entries' THEN
        target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
        target_entry := COALESCE(NEW.id, OLD.id);
    ELSE
        target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
        target_entry := COALESCE(NEW.entry_id, OLD.entry_id);
    END IF;

    SELECT status INTO entry_status
      FROM public.accounting_journal_entries
     WHERE tenant_id = target_tenant AND id = target_entry;

    IF entry_status = 'POSTED' THEN
        SELECT COUNT(*), COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
          INTO line_count, debit_total, credit_total
          FROM public.accounting_journal_lines
         WHERE tenant_id = target_tenant AND entry_id = target_entry;

        IF line_count < 2 OR debit_total <> credit_total THEN
            RAISE EXCEPTION 'Cannot commit posted journal entry %: requires at least two lines and equal debit/credit totals (debit %, credit %)',
                target_entry, debit_total, credit_total
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_assert_posted_entry_balanced_header
AFTER INSERT OR UPDATE ON public.accounting_journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.assert_posted_entry_balanced();

CREATE CONSTRAINT TRIGGER trg_assert_posted_entry_balanced_lines
AFTER INSERT OR UPDATE OR DELETE ON public.accounting_journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.assert_posted_entry_balanced();
