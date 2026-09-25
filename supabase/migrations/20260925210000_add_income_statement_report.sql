-- Period income statement based only on posted journal activity.
CREATE OR REPLACE FUNCTION public.get_income_statement(
    p_tenant_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE (
    account_id UUID,
    account_code VARCHAR,
    account_name VARCHAR,
    account_type VARCHAR,
    amount TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
    IF p_tenant_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
        RAISE EXCEPTION 'Tenant and a valid report date range are required'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN QUERY
    WITH account_activity AS (
        SELECT account.id,
               account.code,
               account.name,
               account.type,
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
           AND entry.entry_date BETWEEN p_start_date AND p_end_date
         WHERE account.tenant_id = p_tenant_id
           AND account.type IN ('REVENUE', 'EXPENSE')
         GROUP BY account.id, account.code, account.name, account.type
    )
    SELECT activity.id,
           activity.code,
           activity.name,
           activity.type,
           (CASE WHEN activity.type = 'REVENUE'
                 THEN activity.credits - activity.debits
                 ELSE activity.debits - activity.credits
            END)::TEXT
      FROM account_activity AS activity
     WHERE activity.debits <> 0 OR activity.credits <> 0
     ORDER BY activity.type, activity.code;
END;
$$;

REVOKE ALL ON FUNCTION public.get_income_statement(UUID, DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_income_statement(UUID, DATE, DATE) TO service_role;
