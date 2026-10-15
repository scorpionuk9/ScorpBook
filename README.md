# ScorpBook

ScorpBook is plain-English, multi-company bookkeeping for UK limited companies and sole traders (free beta). Its journal actions use the database's atomic draft, post and reversal RPCs; posted entries remain immutable. Invoices, payments and expenses from ScorpInvoice post automatically through a signed webhook (see below).

## Run locally

1. Install Node.js 20.9 or later and run `npm install`.
2. Copy `.env.example` to `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the Supabase project API settings.
   - `SUPABASE_SERVICE_ROLE_KEY` from the project API settings. Keep this secret server-side; never use a `NEXT_PUBLIC_` name for it.
   - `SCORPINVOICE_WEBHOOK_SECRET` to a long random value shared with ScorpInvoice's `SCORPBOOK_WEBHOOK_SECRET` (optional; sync is off without it).
3. Enable email/password sign-up in Supabase Auth. Anyone can sign up; after confirming their email they set up a business at `/onboarding`.
4. Add the local and deployed callback URLs (`http://localhost:3000/auth/callback` and your deployed `/auth/callback`) to Supabase Auth's allowed redirect URLs for email confirmation.
5. Ensure the ledger migrations in `supabase/migrations` have been applied to the Supabase project.
6. Run `npm run dev` and open `http://localhost:3000`.

The service-role key is used only in server modules. Every page and action resolves the signed-in user's company from `accounting_memberships` (`lib/accounting/auth.ts`); the selected company is kept in a cookie and each query is filtered by it. Roles: **Owner** (everything, including business details and the team), **Accountant** (all bookkeeping), **Viewer** (read-only); actions that change the books require Accountant. Direct browser access to the ledger remains blocked by RLS.

## Deploy

Production runs on Cloudflare Workers at <https://scorpbook.scorpiatech.com> (Worker `scorpbook`) via OpenNext. Deploy from a machine with a complete `.env.local`:

```bash
npm run deploy
```

`.env.local` values are bundled into the Worker at build time, so never leave `SCORPINVOICE_WEBHOOK_SECRET` in it when deploying; that secret is set with `npx wrangler secret put SCORPINVOICE_WEBHOOK_SECRET`. Keep `next` on a version that `@opennextjs/cloudflare` supports (16.3.x as of Oct 2026; 16.4 fails at runtime). If a deploy breaks, `npx wrangler rollback` restores the previous version.

## Implemented workflows

- Two-step verification: users can add an authenticator-app (TOTP) factor at `/settings/security` (Supabase MFA). Once enabled, sign-in continues at `/login/verify`, and `lib/accounting/auth.ts` refuses every page and action until the session reaches AAL2.
- Businesses can store their VAT registration number (9 digits, validated with HMRC's check-digit rules) in **Business details**; it is needed for MTD VAT later.
- Public `/privacy` and `/terms` pages, linked from the footer, sign-in screens and sign-up.
- Sign up, then create a business (sole trader or limited company, VAT status, financial year end); `create_accounting_tenant` seeds the matching chart of accounts. Users can belong to several businesses and switch between them. Owners invite people by link (`/settings/team`; the link is shown once, only its hash is stored, valid 14 days, must be accepted with the invited email).
- ScorpInvoice users choose **Settings → Connect to ScorpBook**: a signed 30-minute link brings them to `/connect/scorpinvoice`, where they sign in, pick a business they own and optionally import existing records. ScorpBook then calls ScorpInvoice's signed `/api/scorpbook/connect` to start the sync, and only accepts webhook events from linked ScorpInvoice accounts (`scorpinvoice_links`).
- Land on a dashboard after sign-in showing money in the bank, receivables, payables, net VAT, profit this month/year, and outstanding tasks. A Simple/Accountant toggle (per-browser cookie) switches between plain-language labels and standard accounting terms.
- Upload bank statement CSVs at `/banking/inbox` (column mapping auto-detects common UK bank exports, including separate paid-in/paid-out columns; re-uploads skip lines already imported). Each line is categorised through the guided-entry builder, matched to an entry already posted on that account (same amount, within 7 days), or ignored. "Always treat … like this" saves a text rule that pre-fills future lines; rules only suggest, and "Save all suggested" confirms them in bulk.
- Calculate the 9-box VAT return for any period at `/reports/vat-return` (standard/accrual scheme from posted entries; HMRC settlements, wages, depreciation, Corporation Tax, bad debts and FX are excluded), download it as CSV and mark it as filed, which stores the figures. Submitting to HMRC through Making Tax Digital is not implemented.
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

## MTD VAT (HMRC)

VAT-registered businesses with a VAT number can connect HMRC on the VAT return page and submit returns through the VAT (MTD) API (`lib/hmrc/`, `app/actions/hmrc.ts`).

- **Environment variables** (server-only; never in `.env.local`, which is bundled into the Worker): `HMRC_ENV` (`sandbox` or `production`), `HMRC_CLIENT_ID`, `HMRC_CLIENT_SECRET`, `HMRC_TOKEN_KEY` (32 random bytes, base64; encrypts stored tokens with AES-256-GCM) and optional `HMRC_ENABLED_TENANTS` (comma-separated tenant IDs that may use MTD; empty means all). Locally they live in `.hmrc.dev.env`, which `npm run dev` loads through `scripts/dev.mjs`. It is deliberately not a `.env*` file, because OpenNext bundles every `.env*` file, development ones included, into the Worker. In production use `wrangler secret put`.
- **OAuth**: `/integrations/hmrc/connect` → HMRC → `/integrations/hmrc/callback` (both URLs must be registered as redirect URIs on the Developer Hub application). Access tokens are refreshed automatically; refresh tokens last 18 months.
- **Submitting**: periods come from HMRC's obligations endpoint. Boxes are calculated by `get_vat_return` for the obligation's dates. The user must tick HMRC's legal declaration. HMRC's receipt (form bundle number, receipt ID) is stored on `accounting_vat_returns`.
- **Fraud prevention headers** (`lib/hmrc/fraud.ts`, WEB_APP_VIA_SERVER) are sent on every call. Browser values come from `components/hmrc/client-info.ts`; network values from Cloudflare request headers. In the sandbox, the VAT page has a developer check that calls HMRC's Test Fraud Prevention Headers API. From `localhost` the network headers are necessarily missing; test them on the deployed site.
