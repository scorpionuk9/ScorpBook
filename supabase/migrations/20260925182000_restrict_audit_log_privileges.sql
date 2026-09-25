-- Keep the audit table readable by the trusted backend, but prevent even the
-- service_role from inserting, changing, deleting, or truncating audit rows.
-- SECURITY DEFINER audit triggers write as their table owner.
REVOKE ALL ON public.accounting_journal_entry_events
    FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.accounting_journal_entry_events TO service_role;
