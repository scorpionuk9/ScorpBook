-- Deny direct public/authenticated API access until tenant-membership policies
-- are added. Trusted server-side service_role operations remain available.
ALTER TABLE public.accounting_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal_entry_events ENABLE ROW LEVEL SECURITY;
