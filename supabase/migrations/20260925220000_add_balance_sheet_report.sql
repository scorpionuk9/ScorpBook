-- Balance sheet as of a date, including cumulative unclosed profit or loss.
CREATE OR REPLACE FUNCTION public.get_balance_sheet(
    p_tenant_id UUID,
    p_as_of_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    result JSONB;
BEGIN
    IF p_tenant_id IS NULL OR p_as_of_date IS NULL THEN
        RAISE EXCEPTION 'Tenant and report date are required'
            USING ERRCODE = 'check_violation';
    END IF;

    WITH account_balances AS (
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
           AND account.type IN ('ASSET', 'LIABILITY', 'EQUITY')
         GROUP BY account.id, account.code, account.name, account.type, account.is_active
    ), current_earnings AS (
        SELECT COALESCE(SUM(
                   CASE account.type
                       WHEN 'REVENUE' THEN line.credit - line.debit
                       WHEN 'EXPENSE' THEN line.credit - line.debit
                       ELSE 0
                   END
               ), 0)::NUMERIC(30, 4) AS amount
          FROM public.accounting_journal_lines AS line
          JOIN public.accounting_journal_entries AS entry
            ON entry.tenant_id = line.tenant_id
           AND entry.id = line.entry_id
           AND entry.status = 'POSTED'
           AND entry.entry_date <= p_as_of_date
          JOIN public.accounting_accounts AS account
            ON account.tenant_id = line.tenant_id
           AND account.id = line.account_id
         WHERE line.tenant_id = p_tenant_id
           AND account.type IN ('REVENUE', 'EXPENSE')
    )
    SELECT jsonb_build_object(
               'accounts', COALESCE((
                   SELECT jsonb_agg(jsonb_build_object(
                              'account_id', balance.id,
                              'account_code', balance.code,
                              'account_name', balance.name,
                              'account_type', balance.type,
                              'is_active', balance.is_active,
                              'amount', (CASE WHEN balance.type = 'ASSET'
                                              THEN balance.debits - balance.credits
                                              ELSE balance.credits - balance.debits
                                         END)::TEXT
                          ) ORDER BY balance.code)
                     FROM account_balances AS balance
               ), '[]'::JSONB),
               'current_earnings', (SELECT earnings.amount::TEXT FROM current_earnings AS earnings)
           )
      INTO result;

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_balance_sheet(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_balance_sheet(UUID, DATE) TO service_role;
