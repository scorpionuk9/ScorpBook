-- Multi-company ScorpBook: any signed-up user can create a company (limited
-- company or sole trader), invite others as Owner, Accountant or View-only,
-- and link a ScorpInvoice account. The original Scorpia Tech tenant keeps its
-- data; its previously allowlisted user becomes its Owner.

ALTER TABLE public.accounting_tenants
    ADD COLUMN business_type VARCHAR(20) NOT NULL DEFAULT 'LIMITED_COMPANY'
        CHECK (business_type IN ('LIMITED_COMPANY', 'SOLE_TRADER')),
    ADD COLUMN vat_registered BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN year_end_month SMALLINT NOT NULL DEFAULT 12 CHECK (year_end_month BETWEEN 1 AND 12),
    ADD COLUMN year_end_day SMALLINT NOT NULL DEFAULT 31 CHECK (year_end_day BETWEEN 1 AND 31),
    ADD COLUMN created_by UUID;
-- Company names are not globally unique once anyone can sign up.
ALTER TABLE public.accounting_tenants DROP CONSTRAINT IF EXISTS accounting_tenants_name_key;

-- Scorpia Tech Ltd charges VAT (it has VAT accounts in use) and has a 31 Dec year end.
UPDATE public.accounting_tenants SET vat_registered = TRUE WHERE id = '00000000-0000-4000-8000-000000000001';

CREATE TABLE public.accounting_memberships (
    tenant_id UUID NOT NULL REFERENCES public.accounting_tenants (id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('OWNER', 'ACCOUNTANT', 'VIEWER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX idx_accounting_memberships_user ON public.accounting_memberships (user_id);

CREATE TABLE public.accounting_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.accounting_tenants (id) ON DELETE CASCADE,
    email VARCHAR(254) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('OWNER', 'ACCOUNTANT', 'VIEWER')),
    token_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hex of the secret link token
    invited_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',
    accepted_by UUID,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

-- ScorpInvoice accounts allowed to post into a company.
CREATE TABLE public.scorpinvoice_links (
    tenant_id UUID NOT NULL REFERENCES public.accounting_tenants (id) ON DELETE CASCADE,
    scorpinvoice_user_id UUID NOT NULL UNIQUE,
    scorpinvoice_email VARCHAR(254),
    linked_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, scorpinvoice_user_id)
);

ALTER TABLE public.accounting_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scorpinvoice_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accounting_memberships, public.accounting_invitations, public.scorpinvoice_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.accounting_memberships, public.accounting_invitations, public.scorpinvoice_links TO service_role;

INSERT INTO public.accounting_memberships (tenant_id, user_id, role)
SELECT '00000000-0000-4000-8000-000000000001', owner_id::UUID, 'OWNER'
  FROM unnest(string_to_array('3829dc32-2d68-480b-81d0-3934f1b1a6c8', ',')) AS owner_id
ON CONFLICT DO NOTHING;

-- Sole-trader equity roles.
ALTER TABLE public.accounting_accounts DROP CONSTRAINT IF EXISTS accounting_accounts_system_role_check;
ALTER TABLE public.accounting_accounts ADD CONSTRAINT accounting_accounts_system_role_check
    CHECK (system_role IS NULL OR system_role IN (
        'BANK_CURRENT', 'STRIPE_CLEARING', 'GOCARDLESS_CLEARING', 'RECEIVABLES',
        'VAT_RECOVERABLE', 'ACCUMULATED_DEPRECIATION', 'PAYABLES', 'VAT_PAYABLE',
        'PAYE_PAYABLE', 'CORPORATION_TAX_PAYABLE', 'DIRECTORS_LOAN', 'SHARE_CAPITAL',
        'RETAINED_EARNINGS', 'DIVIDENDS', 'SALES', 'BANK_CHARGES', 'BAD_DEBTS',
        'FX_GAINS_LOSSES', 'WAGES', 'DEPRECIATION', 'CORPORATION_TAX_EXPENSE',
        'OWNER_CAPITAL', 'DRAWINGS'
    ));

-- Starter chart of accounts for a new company, by business type.
CREATE OR REPLACE FUNCTION public.seed_chart_of_accounts(p_tenant_id UUID, p_business_type VARCHAR)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
    INSERT INTO public.accounting_accounts (tenant_id, code, name, type, system_role)
    SELECT p_tenant_id, template.code, template.name, template.type, template.system_role
      FROM (VALUES
        ('1000', 'Bank Current Account', 'ASSET', 'BANK_CURRENT', 'ALL'),
        ('1010', 'Stripe Clearing Account', 'ASSET', 'STRIPE_CLEARING', 'ALL'),
        ('1020', 'GoCardless Clearing Account', 'ASSET', 'GOCARDLESS_CLEARING', 'ALL'),
        ('1100', 'Accounts Receivable', 'ASSET', 'RECEIVABLES', 'ALL'),
        ('1200', 'VAT Recoverable', 'ASSET', 'VAT_RECOVERABLE', 'ALL'),
        ('1500', 'Computer Equipment', 'ASSET', NULL, 'ALL'),
        ('1510', 'Office Furniture and Equipment', 'ASSET', NULL, 'ALL'),
        ('1520', 'Tools and Vehicles', 'ASSET', NULL, 'ALL'),
        ('1590', 'Accumulated Depreciation', 'ASSET', 'ACCUMULATED_DEPRECIATION', 'ALL'),
        ('2000', 'Accounts Payable', 'LIABILITY', 'PAYABLES', 'ALL'),
        ('2100', 'VAT Payable', 'LIABILITY', 'VAT_PAYABLE', 'ALL'),
        ('2150', 'PAYE and NI Payable', 'LIABILITY', 'PAYE_PAYABLE', 'ALL'),
        ('2200', 'Corporation Tax Payable', 'LIABILITY', 'CORPORATION_TAX_PAYABLE', 'LIMITED_COMPANY'),
        ('2300', 'Director''s Loan Account', 'LIABILITY', 'DIRECTORS_LOAN', 'LIMITED_COMPANY'),
        ('3000', 'Ordinary Share Capital', 'EQUITY', 'SHARE_CAPITAL', 'LIMITED_COMPANY'),
        ('3100', 'Retained Earnings', 'EQUITY', 'RETAINED_EARNINGS', 'LIMITED_COMPANY'),
        ('3200', 'Dividends', 'EQUITY', 'DIVIDENDS', 'LIMITED_COMPANY'),
        ('3000', 'Owner''s Capital', 'EQUITY', 'OWNER_CAPITAL', 'SOLE_TRADER'),
        ('3100', 'Profit Brought Forward', 'EQUITY', 'RETAINED_EARNINGS', 'SOLE_TRADER'),
        ('3200', 'Drawings', 'EQUITY', 'DRAWINGS', 'SOLE_TRADER'),
        ('4000', 'Sales Revenue', 'REVENUE', 'SALES', 'ALL'),
        ('4100', 'Other Income', 'REVENUE', NULL, 'ALL'),
        ('5000', 'Cost of Sales', 'EXPENSE', NULL, 'ALL'),
        ('6000', 'Wages and Salaries', 'EXPENSE', 'WAGES', 'ALL'),
        ('6100', 'Professional Fees', 'EXPENSE', NULL, 'ALL'),
        ('6200', 'Software and Subscriptions', 'EXPENSE', NULL, 'ALL'),
        ('6300', 'Bank Charges', 'EXPENSE', 'BANK_CHARGES', 'ALL'),
        ('6400', 'Travel and Subsistence', 'EXPENSE', NULL, 'ALL'),
        ('6500', 'Office and Administration', 'EXPENSE', NULL, 'ALL'),
        ('6600', 'Insurance', 'EXPENSE', NULL, 'ALL'),
        ('6700', 'Depreciation', 'EXPENSE', 'DEPRECIATION', 'ALL'),
        ('6800', 'Bad Debts', 'EXPENSE', 'BAD_DEBTS', 'ALL'),
        ('6850', 'Advertising and Marketing', 'EXPENSE', NULL, 'ALL'),
        ('7000', 'Corporation Tax Expense', 'EXPENSE', 'CORPORATION_TAX_EXPENSE', 'LIMITED_COMPANY'),
        ('7100', 'Foreign Exchange Gains and Losses', 'EXPENSE', 'FX_GAINS_LOSSES', 'ALL')
      ) AS template (code, name, type, system_role, applies_to)
     WHERE template.applies_to IN ('ALL', p_business_type);

    INSERT INTO public.scorpinvoice_expense_accounts (tenant_id, category, account_id)
    SELECT p_tenant_id, mapping.category, account.id
      FROM (VALUES
          ('office_costs', '6500'), ('travel', '6400'), ('staff_costs', '6000'),
          ('stock_materials', '5000'), ('professional_fees', '6100'), ('marketing', '6850'),
          ('financial_costs', '6300'), ('other', '6500')
      ) AS mapping (category, code)
      JOIN public.accounting_accounts AS account ON account.tenant_id = p_tenant_id AND account.code = mapping.code;

    INSERT INTO public.scorpinvoice_settings (tenant_id, expense_paid_from_account_id)
    SELECT p_tenant_id, id FROM public.accounting_accounts WHERE tenant_id = p_tenant_id AND system_role = 'BANK_CURRENT';
END;
$$;

CREATE OR REPLACE FUNCTION public.create_accounting_tenant(
    p_user_id UUID, p_name VARCHAR, p_business_type VARCHAR, p_vat_registered BOOLEAN,
    p_year_end_month SMALLINT, p_year_end_day SMALLINT
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE new_id UUID := gen_random_uuid();
BEGIN
    IF p_user_id IS NULL OR NULLIF(BTRIM(p_name), '') IS NULL THEN
        RAISE EXCEPTION 'A business name is required' USING ERRCODE = 'check_violation';
    END IF;
    -- Rejects impossible dates such as 31 June.
    PERFORM make_date(2023, p_year_end_month, p_year_end_day);
    INSERT INTO public.accounting_tenants (id, name, business_type, vat_registered, year_end_month, year_end_day, created_by)
    VALUES (new_id, LEFT(BTRIM(p_name), 150), p_business_type, COALESCE(p_vat_registered, FALSE), p_year_end_month, p_year_end_day, p_user_id);
    INSERT INTO public.accounting_memberships (tenant_id, user_id, role) VALUES (new_id, p_user_id, 'OWNER');
    PERFORM public.seed_chart_of_accounts(new_id, p_business_type);
    RETURN new_id;
EXCEPTION WHEN datetime_field_overflow THEN
    RAISE EXCEPTION 'Choose a real year-end date' USING ERRCODE = 'check_violation';
END;
$$;

-- Accepts an invitation for the signed-in user, whose email must match it.
CREATE OR REPLACE FUNCTION public.accept_accounting_invitation(p_token_hash VARCHAR, p_user_id UUID, p_email VARCHAR)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE invite public.accounting_invitations%ROWTYPE;
BEGIN
    SELECT * INTO invite FROM public.accounting_invitations WHERE token_hash = p_token_hash FOR UPDATE;
    IF NOT FOUND OR invite.revoked_at IS NOT NULL OR invite.accepted_at IS NOT NULL OR invite.expires_at < NOW() THEN
        RAISE EXCEPTION 'This invitation is no longer valid' USING ERRCODE = 'check_violation';
    END IF;
    IF LOWER(BTRIM(invite.email)) <> LOWER(BTRIM(p_email)) THEN
        RAISE EXCEPTION 'This invitation was sent to a different email address' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.accounting_memberships (tenant_id, user_id, role)
    VALUES (invite.tenant_id, p_user_id, invite.role)
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;
    UPDATE public.accounting_invitations SET accepted_by = p_user_id, accepted_at = NOW() WHERE id = invite.id;
    RETURN invite.tenant_id;
END;
$$;

-- Changes or removes a member, keeping at least one Owner per company.
CREATE OR REPLACE FUNCTION public.set_accounting_member_role(p_tenant_id UUID, p_user_id UUID, p_role VARCHAR)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
    PERFORM 1 FROM public.accounting_memberships WHERE tenant_id = p_tenant_id FOR UPDATE;
    IF p_role IS NULL THEN
        DELETE FROM public.accounting_memberships WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
    ELSE
        UPDATE public.accounting_memberships SET role = p_role WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
    END IF;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'That person is not a member of this company' USING ERRCODE = 'no_data_found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.accounting_memberships WHERE tenant_id = p_tenant_id AND role = 'OWNER') THEN
        RAISE EXCEPTION 'A company must keep at least one Owner' USING ERRCODE = 'check_violation';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_chart_of_accounts(UUID, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_accounting_tenant(UUID, VARCHAR, VARCHAR, BOOLEAN, SMALLINT, SMALLINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_accounting_invitation(VARCHAR, UUID, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_accounting_member_role(UUID, UUID, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_accounting_tenant(UUID, VARCHAR, VARCHAR, BOOLEAN, SMALLINT, SMALLINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_accounting_invitation(VARCHAR, UUID, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_accounting_member_role(UUID, UUID, VARCHAR) TO service_role;
