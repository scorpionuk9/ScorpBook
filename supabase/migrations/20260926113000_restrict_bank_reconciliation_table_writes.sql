-- All bank reconciliation writes must pass through the validated RPC functions.
REVOKE INSERT, UPDATE, DELETE ON public.accounting_bank_reconciliations,
    public.accounting_bank_statement_lines FROM service_role;
GRANT SELECT ON public.accounting_bank_reconciliations,
    public.accounting_bank_statement_lines, public.accounting_bank_reconciliation_events TO service_role;
