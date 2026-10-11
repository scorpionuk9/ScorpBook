import Link from "next/link";
import Decimal from "decimal.js";
import { z } from "zod";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { getIncomeStatement } from "@/lib/accounting/service";
import { accountingToday } from "@/lib/accounting/dates";
import { getViewMode } from "@/lib/ui/view-mode-server";
import { LABELS } from "@/lib/ui/view-mode";
import { formatMoney } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type IncomeStatementPageProps = {
  searchParams: Promise<{ from?: string | string[]; to?: string | string[] }>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function IncomeStatementPage({ searchParams }: IncomeStatementPageProps) {
  await requireAccountingUser();
  const mode = await getViewMode();
  const simple = mode === "simple";
  const t = LABELS[mode];
  const params = await searchParams;
  const today = accountingToday();
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const requestedFrom = first(params.from);
  const requestedTo = first(params.to);
  const from = requestedFrom && z.iso.date().safeParse(requestedFrom).success ? requestedFrom : yearStart;
  const to = requestedTo && z.iso.date().safeParse(requestedTo).success ? requestedTo : today;
  const validRange = from <= to;
  const rows = validRange ? await getIncomeStatement(from, to) : [];
  const revenueRows = rows.filter((row) => row.account_type === "REVENUE");
  const expenseRows = rows.filter((row) => row.account_type === "EXPENSE");
  const revenueTotal = revenueRows.reduce((total, row) => total.plus(row.amount), new Decimal(0));
  const expenseTotal = expenseRows.reduce((total, row) => total.plus(row.amount), new Decimal(0));
  const netIncome = revenueTotal.minus(expenseTotal);
  const cols = simple ? 2 : 3;
  const format = (value: Decimal) => simple ? formatMoney(value) : value.toFixed(4);

  function rowsFor(items: typeof rows) {
    return items.filter((row) => !simple || !new Decimal(row.amount).isZero()).map((row) => <tr key={row.account_id} className="hover:bg-slate-50/70">{!simple && <td className="px-5 py-3 font-mono text-xs">{row.account_code}</td>}<td className="px-5 py-3">{row.account_name}</td><td className="px-5 py-3 text-right tabular-nums">{format(new Decimal(row.amount))}</td></tr>);
  }

  return <main className="mx-auto w-full max-w-5xl px-5 py-8"><div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>{simple ? <Link href="/dashboard" className="text-sm font-medium text-accent">← {t.home}</Link> : <Link href="/reports/trial-balance" className="text-sm font-medium text-accent">← Trial balance</Link>}<p className="mt-5 text-sm font-semibold text-accent">{simple ? "REPORTS" : "FINANCIAL REPORTS"}</p><h1 className="mt-1 text-3xl font-bold">{t.incomeStatement}</h1><p className="mt-2 text-sm text-slate-500">{t.incomeStatementIntro}</p></div>
      <form method="get" className="flex flex-wrap items-end gap-2"><label className="text-xs font-semibold text-slate-600">From<input type="date" name="from" required defaultValue={from} className="field mt-1.5" /></label><label className="text-xs font-semibold text-slate-600">To<input type="date" name="to" required defaultValue={to} className="field mt-1.5" /></label><button className="button" type="submit">Run report</button></form>
    </div>
    {!validRange ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">The start date must be on or before the end date.</p> : <>
      <section className="card overflow-hidden"><div className="border-b border-slate-100 px-5 py-4 text-sm font-medium text-slate-500">{from} to {to}</div>
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{!simple && <th className="px-5 py-3">Code</th>}<th className="px-5 py-3">{simple ? "Category" : "Account"}</th><th className="px-5 py-3 text-right">Amount</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            <tr className="bg-slate-50/70"><th colSpan={cols} className="px-5 py-3 text-left text-xs uppercase tracking-wide text-slate-600">{simple ? "Money in" : "Revenue"}</th></tr>
            {rowsFor(revenueRows)}
            <tr className="border-t border-slate-200 font-semibold"><td colSpan={cols - 1} className="px-5 py-3">{simple ? "Total money in" : "Total revenue"}</td><td className="px-5 py-3 text-right tabular-nums">{format(revenueTotal)}</td></tr>
            <tr className="bg-slate-50/70"><th colSpan={cols} className="px-5 py-3 text-left text-xs uppercase tracking-wide text-slate-600">{simple ? "Costs" : "Expenses"}</th></tr>
            {rowsFor(expenseRows)}
            <tr className="border-t border-slate-200 font-semibold"><td colSpan={cols - 1} className="px-5 py-3">{simple ? "Total costs" : "Total expenses"}</td><td className="px-5 py-3 text-right tabular-nums">{format(expenseTotal)}</td></tr>
            {!rows.length && <tr><td colSpan={cols} className="px-5 py-8 text-center text-slate-500">No posted revenue or expense activity in this period.</td></tr>}
          </tbody>
          <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold"><tr><td colSpan={cols - 1} className="px-5 py-4">{simple ? (netIncome.isNegative() ? "Loss for the period" : "Profit for the period") : (netIncome.isNegative() ? "Net loss" : "Net income")}</td><td className="px-5 py-4 text-right tabular-nums">{format(netIncome.abs())}</td></tr></tfoot>
        </table></div>
      </section>
      <p className="text-xs text-slate-500">{simple ? "Only confirmed transactions are included. A negative amount in a category means refunds or corrections outweighed the original amounts." : "Revenue is shown as credit minus debit; expenses are shown as debit minus credit. Negative account values represent contra activity."}</p>
    </>}
  </div></main>;
}
