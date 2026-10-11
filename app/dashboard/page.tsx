import Link from "next/link";
import Decimal from "decimal.js";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { getDashboardSummary, getIncomeStatement, listAccounts, type IncomeStatementRow, type TrialBalanceRow } from "@/lib/accounting/service";
import { isMoneyAccount } from "@/lib/accounting/guided";
import { accountingToday } from "@/lib/accounting/dates";
import { getViewMode } from "@/lib/ui/view-mode-server";
import { formatMoney } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

// Debit-positive balance: what the business owns. Credit-normal accounts read as the negative.
function balance(row: TrialBalanceRow): Decimal {
  return new Decimal(row.debit_balance).minus(row.credit_balance);
}

function profit(rows: IncomeStatementRow[]): Decimal {
  return rows.reduce((total, row) => row.account_type === "REVENUE" ? total.plus(row.amount) : total.minus(row.amount), new Decimal(0));
}

function monthLabel(start: string): string {
  return new Date(`${start}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

type CardProps = { title: string; amount: Decimal; explain: string; tone?: "good" | "bad" | "neutral"; href?: string; footer?: React.ReactNode };

function SummaryCard({ title, amount, explain, tone = "neutral", href, footer }: CardProps) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-ink";
  const body = <>
    <p className="text-sm font-semibold text-slate-600">{title}</p>
    <p className={`mt-2 text-3xl font-bold tabular-nums ${color}`}>{formatMoney(amount)}</p>
    <p className="mt-2 text-xs leading-5 text-slate-500">{explain}</p>
    {footer && <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">{footer}</div>}
  </>;
  return href ? <Link href={href} className="card block p-5 transition hover:border-accent hover:shadow-md">{body}</Link> : <section className="card p-5">{body}</section>;
}

export default async function DashboardPage() {
  await requireAccountingUser();
  const mode = await getViewMode();
  const simple = mode === "simple";
  const today = accountingToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const [summary, monthRows, yearRows, accounts] = await Promise.all([
    getDashboardSummary(today),
    getIncomeStatement(monthStart, today),
    getIncomeStatement(yearStart, today),
    listAccounts(),
  ]);

  const byId = new Map(summary.balances.map((row) => [row.account_id, row]));
  const roleAccount = new Map(accounts.flatMap((account) => account.system_role ? [[account.system_role, account] as const] : []));
  const roleBalance = (role: string) => { const account = roleAccount.get(role); const row = account && byId.get(account.id); return row ? balance(row) : new Decimal(0); };
  const roleCode = (role: string) => roleAccount.get(role)?.code ?? "—";
  const moneyIds = new Set(accounts.filter(isMoneyAccount).map((account) => account.id));
  const bankRows = summary.balances.filter((row) => moneyIds.has(row.account_id) && !balance(row).isZero());
  const cash = bankRows.reduce((total, row) => total.plus(balance(row)), new Decimal(0));
  const owedToYou = roleBalance("RECEIVABLES");
  const youOwe = roleBalance("PAYABLES").negated();
  const vatDue = roleBalance("VAT_PAYABLE").negated().minus(roleBalance("VAT_RECOVERABLE"));
  const monthProfit = profit(monthRows);
  const yearProfit = profit(yearRows);

  const todos: Array<{ text: string; href: string }> = [];
  if (summary.sync_attention_count) todos.push({ text: `${summary.sync_attention_count} ScorpInvoice update${summary.sync_attention_count === 1 ? "" : "s"} couldn't be recorded`, href: "/integrations/scorpinvoice" });
  if (summary.overdue_bill_count) todos.push({ text: `${summary.overdue_bill_count} bill${summary.overdue_bill_count === 1 ? " is" : "s are"} past the due date`, href: "/bills" });
  if (summary.draft_bill_count) todos.push({ text: `${summary.draft_bill_count} draft bill${summary.draft_bill_count === 1 ? "" : "s"} not yet confirmed`, href: "/bills" });
  if (summary.draft_journal_count) todos.push({ text: simple ? `${summary.draft_journal_count} unfinished transaction${summary.draft_journal_count === 1 ? "" : "s"} saved as draft` : `${summary.draft_journal_count} draft journal entr${summary.draft_journal_count === 1 ? "y" : "ies"} awaiting posting`, href: "/journal" });
  if (summary.open_reconciliation_count) todos.push({ text: simple ? `${summary.open_reconciliation_count} bank check${summary.open_reconciliation_count === 1 ? "" : "s"} in progress` : `${summary.open_reconciliation_count} bank reconciliation${summary.open_reconciliation_count === 1 ? "" : "s"} in progress`, href: "/banking" });
  const closable = summary.closable_periods;
  if (closable.length === 1) todos.push({ text: simple ? `${monthLabel(closable[0].period_start)} has ended and can be locked` : `${monthLabel(closable[0].period_start)} is ready to close`, href: "/periods" });
  else if (closable.length > 1) todos.push({ text: simple ? `${closable.length} finished months can be locked (${monthLabel(closable[0].period_start)} to ${monthLabel(closable[closable.length - 1].period_start)})` : `${closable.length} ended periods are still open (${monthLabel(closable[0].period_start)} – ${monthLabel(closable[closable.length - 1].period_start)})`, href: "/periods" });

  return <main className="mx-auto w-full max-w-7xl px-5 py-8"><div className="space-y-8">
    <div className="flex flex-wrap items-end justify-between gap-4"><div>
      <p className="text-sm font-semibold text-accent">{simple ? "YOUR BUSINESS TODAY" : "DASHBOARD"}</p>
      <h1 className="mt-1 text-3xl font-bold">{simple ? "How the business is doing" : "Financial overview"}</h1>
      <p className="mt-2 text-sm text-slate-500">Based on confirmed records up to {new Date(`${today}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}. Drafts are not included.</p>
    </div><Link className="button" href="/record">＋ Record something</Link></div>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryCard title={simple ? "Money in the bank" : "Cash and bank"} amount={cash} tone={cash.lt(0) ? "bad" : "neutral"} href="/banking"
        explain={simple ? "What your records say is in your bank and payment accounts. Run a bank check to make sure it matches your statement." : "Sum of 10xx bank and clearing account balances."}
        footer={bankRows.length > 1 ? <ul className="space-y-1">{bankRows.map((row) => <li key={row.account_id} className="flex justify-between gap-3"><span>{row.account_name}</span><span className="tabular-nums">{formatMoney(balance(row))}</span></li>)}</ul> : undefined} />
      <SummaryCard title={simple ? "Customers owe you" : "Accounts receivable"} amount={owedToYou}
        explain={simple ? "Invoices you've sent that haven't been paid yet. Fills in automatically from ScorpInvoice." : `Balance of account ${roleCode("RECEIVABLES")}.`} />
      <SummaryCard title={simple ? "You owe suppliers" : "Accounts payable"} amount={youOwe} href="/bills" tone={summary.overdue_bill_count ? "bad" : "neutral"}
        explain={simple ? "Bills you've received but not yet paid." : `Balance of account ${roleCode("PAYABLES")}.`}
        footer={summary.overdue_bill_count ? <span className="font-semibold text-red-700">{summary.overdue_bill_count} overdue</span> : undefined} />
      <SummaryCard title={simple ? (vatDue.lt(0) ? "VAT HMRC owes you" : "VAT to set aside") : "Net VAT position"} amount={vatDue.abs()}
        explain={simple ? (vatDue.lt(0) ? "You've paid more VAT on costs than you've charged, so you can reclaim the difference." : "VAT you've charged customers minus VAT you've paid on costs. Keep this aside for your VAT return.") : `Account ${roleCode("VAT_PAYABLE")} less account ${roleCode("VAT_RECOVERABLE")}${vatDue.lt(0) ? " (recoverable)" : " (payable)"}.`} />
    </div>

    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section className="card p-5">
        <h2 className="font-semibold">{simple ? "Profit" : "Net income"}</h2>
        <p className="mt-1 text-xs text-slate-500">{simple ? "Money earned minus costs. A negative number means a loss." : "Revenue less expenses from posted entries."}</p>
        <dl className="mt-4 grid grid-cols-2 gap-4">
          {[{ label: "This month", value: monthProfit, from: monthStart }, { label: `This year (${today.slice(0, 4)})`, value: yearProfit, from: yearStart }].map((item) =>
            <Link key={item.label} href={`/reports/income-statement?from=${item.from}&to=${today}`} className="rounded-lg bg-slate-50 p-4 transition hover:bg-emerald-50">
              <dt className="text-xs font-semibold text-slate-600">{item.label}</dt>
              <dd className={`mt-1 text-2xl font-bold tabular-nums ${item.value.lt(0) ? "text-red-700" : "text-emerald-700"}`}>{formatMoney(item.value)}</dd>
            </Link>)}
        </dl>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">{simple ? "Things to do" : "Outstanding tasks"}</h2>
        {todos.length ? <ul className="mt-3 divide-y divide-slate-100">{todos.map((todo) =>
          <li key={todo.text}><Link href={todo.href} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-accent"><span>{todo.text}</span><span aria-hidden className="text-slate-400">→</span></Link></li>)}
        </ul> : <p className="mt-3 rounded-lg bg-emerald-50 p-4 text-sm font-medium text-emerald-800">✓ All caught up. Nothing needs your attention right now.</p>}
      </section>
    </div>
  </div></main>;
}
