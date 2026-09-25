-- Trial balance as of a date, based only on immutable posted ledger activity.
CREATE OR REPLACE FUNCTION public.get_trial_balance(
    p_tenant_id UUID,
    p_as_of_date DATE
)
RETURNS TABLE (
    account_id UUID,
    account_code VARCHAR,
    account_name VARCHAR,
    account_type VARCHAR,
    is_active BOOLEAN,
    debit_activity TEXT,
    credit_activity TEXT,
    debit_balance TEXT,
    credit_balance TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
    IF p_tenant_id IS NULL OR p_as_of_date IS NULL THEN
        RAISE EXCEPTION 'Tenant and report date are required'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN QUERY
    WITH account_activity AS (
        SELECT account.id,
               account.code,
               account.name,
               account.type,
               account.is_active,
               COALESCE(SUM(line.debit) FILTER (WHERE entry.id IS NOT NULL), 0)::NUMERIC(30, 4) AS debits,
               COALESCE(SUM(line.credit) FILTER (WHERE entry.id IS NOT NULL), 0)::NUMERIC(30, 4) AS credits
          FROM public.accounting_accounts AS account
          LEFT JOIN public.accounting_journal_lines AS line
            ON line.tenant_id = account.tenant_id
           AND line.account_id = account.id
          LEFT JOIN public.accounting_journal_entries AS entry
            ON entry.tenant_id = line.tenant_id
           AND entry.id = line.entry_id
           AND entry.status = 'POSTED'
           AND entry.entry_date <= p_as_of_date
         WHERE account.tenant_id = p_tenant_id
         GROUP BY account.id, account.code, account.name, account.type, account.is_active
    )
    SELECT activity.id,
           activity.code,
           activity.name,
           activity.type,
           activity.is_active,
           activity.debits::TEXT,
           activity.credits::TEXT,
           GREATEST(activity.debits - activity.credits, 0)::TEXT,
           GREATEST(activity.credits - activity.debits, 0)::TEXT
      FROM account_activity AS activity
     ORDER BY activity.code;
END;
$$;

REVOKE ALL ON FUNCTION public.get_trial_balance(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_trial_balance(UUID, DATE) TO service_role;
