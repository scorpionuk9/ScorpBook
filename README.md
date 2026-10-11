# ScorpBook

ScorpBook is the single-company accounting app for Scorpia Tech Ltd. Its journal actions use the database's atomic draft, post and reversal RPCs; posted entries remain immutable. Invoices, payments and expenses from ScorpInvoice post automatically through a signed webhook (see below).

## Run locally

1. Install Node.js 20.9 or later and run `npm install`.
2. Copy `.env.example` to `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the Supabase project API settings.
   - `SUPABASE_SERVICE_ROLE_KEY` from the project API settings. Keep this secret server-side; never use a `NEXT_PUBLIC_` name for it.
   - `SCORPBOOK_ALLOWED_USER_IDS` to the UUID(s) of authorized users from Supabase Auth. Multiple UUIDs can be comma-separated.
   - `SCORPINVOICE_WEBHOOK_SECRET` to a long random value shared with ScorpInvoice's `SCORPBOOK_WEBHOOK_SECRET` (optional; sync is off without it).
3. Create the operator account in Supabase Auth (email/password sign-in must be enabled), then add its user UUID to the allowlist above.
4. Add the local and deployed callback URLs (`http://localhost:3000/auth/callback` and your deployed `/auth/callback`) to Supabase Auth's allowed redirect URLs for email confirmation.
5. Ensure the ledger migrations in `supabase/migrations` have been applied to the Supabase project.
6. Run `npm run dev` and open `http://localhost:3000`.

The service-role key is used only in server modules. Each page and server action requires a valid Supabase Auth session and an allowlisted user ID. Direct browser access to the ledger remains blocked by RLS. The current app is intentionally tied to tenant `00000000-0000-4000-8000-000000000001`.

## Deploy

Production runs on Cloudflare Workers at <https://scorpbook.scorpiatech.com> (Worker `scorpbook`) via OpenNext. Deploy from a machine with a complete `.env.local`:

```bash
npm run deploy
```

`.env.local` values are bundled into the Worker at build time, so never leave `SCORPINVOICE_WEBHOOK_SECRET` in it when deploying; that secret is set with `npx wrangler secret put SCORPINVOICE_WEBHOOK_SECRET`. Keep `next` on a version that `@opennextjs/cloudflare` supports (16.3.x as of Oct 2026; 16.4 fails at runtime). If a deploy breaks, `npx wrangler rollback` restores the previous version.

## Implemented workflows

- Land on a dashboard after sign-in showing money in the bank, receivables, payables, net VAT, profit this month/year, and outstanding tasks. A Simple/Accountant toggle (per-browser cookie) switches between plain-language labels and standard accounting terms.
- Record common events through guided "What happened?" forms at `/record` (money in, costs, equipment, owner money in/out, transfers, HMRC payments). The server rebuilds the balanced lines from the answers and `record_guided_transaction` saves and posts them atomically. Accounts that features depend on are found by `system_role`, never by code.
- Browse and maintain the chart of accounts. New accounts can be added; existing accounts can be renamed or activated/deactivated. Accounts are never deleted, and their code/type are immutable through the app.
- Maintain a tenant-isolated supplier directory with atomically generated immutable `SUP-000001` codes, contact/tax details, optional default expense accounts, deactivation, and append-only audit events. Supplier master records do not post accounting transactions.
- Record supplier bills with expense and VAT lines, save editable drafts, post bills atomically to Accounts Payable, and record full or partial payments against bank/clearing accounts. Posted bill details and payment events are immutable and auditable.
- Reconcile 10xx bank, cash, or clearing accounts from a normalized CSV statement (`Date,Description,Amount,Reference`), match statement movements to posted journal lines, and complete only when statement balances and all period ledger lines agree.
- Manage calendar-month accounting periods. Closing checks for draft journals/bills, unfinished bank reconciliations, and missing reconciliations for active 10xx accounts with posted activity; closed months reject further journal, bill, and bank-reconciliation changes and retain an append-only audit event.
- Create and revise journal drafts using exact decimal strings; show debit and credit totals with `decimal.js`.
- Suggest editable journal numbers in `JE-YYYY-000001` format, with sequences scoped to the entry's calendar year. The database allocates numbers atomically when a draft or reversal is saved; manual values remain subject to tenant-wide uniqueness, and standard-format overrides advance the matching year counter.
- Post drafts through `post_journal_entry`; the database enforces final balance, active accounts, and immutability.
- Reverse posted entries through `reverse_journal_entry`; the database creates and posts the inverse entry atomically and prevents duplicate reversals.
- Browse the most recent 100 entries and inspect their lines.
- Run a date-based trial balance from posted entries with exact decimal totals and a debit/credit balance check; inactive accounts remain visible for historical reporting.
- Run a period-based income statement using posted revenue and expense entries, with exact decimal net income or loss calculations.
- Run an as-of-date balance sheet with cumulative unclosed earnings included in equity and an assets-equal-liabilities-plus-equity check.

## ScorpInvoice sync

ScorpInvoice database triggers queue a snapshot of each changed invoice or expense (connected users only) in its `scorpbook_outbox`; its Worker cron posts them every 5 minutes to `POST /api/integrations/scorpinvoice`, signed with `x-scorpbook-signature: t=<unix>,v1=<hex HMAC-SHA256 of "t.body">` (5-minute tolerance).

`receive_scorpinvoice_event` compares the postings a snapshot implies with those already made (`scorpinvoice_postings`) and reverses/posts only the difference, in one transaction:

| ScorpInvoice state | Entry |
|---|---|
| Invoice sent/overdue | Dr Accounts Receivable / Cr Sales (GBP amount) |
| Invoice paid | Dr Stripe or GoCardless clearing (bank for manual payments) / Cr Accounts Receivable |
| Bad debt | Dr Bad Debts / Cr Accounts Receivable |
| Void, or amount changed | Reverse the earlier entries, then post the new state |
| Expense added/edited/deleted | Dr mapped cost account / Cr the configured paid-from account (company bank by default) |

Duplicates are ignored by event ID and older snapshots by `snapshot_at`. Entries dated in a locked month post on today's date with a note. Failures roll back, are kept as `NEEDS_ATTENTION`, appear on the dashboard and can be retried from **Setup → ScorpInvoice sync**. Not yet handled: card/Pay by Bank processing fees, payouts from clearing to bank (record them as a transfer or via bank reconciliation), VAT on invoices, and exchange gains/losses on non-GBP invoices.
