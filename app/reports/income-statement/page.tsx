import Link from "next/link";
import Decimal from "decimal.js";
import { z } from "zod";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { getIncomeStatement } from "@/lib/accounting/service";
import { accountingToday } from "@/lib/accounting/dates";

export const dynamic = "force-dynamic";

type IncomeStatementPageProps = {
  searchParams: Promise<{ from?: string | string[]; to?: string | string[] }>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function IncomeStatementPage({ searchParams }: IncomeStatementPageProps) {
  await requireAccountingUser();
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
  const format = (value: Decimal) => value.toFixed(4);

  function rowsFor(items: typeof rows) {
    return items.map((row) => <tr key={row.account_id} className="hover:bg-slate-50/70"><td className="px-5 py-3 font-mono text-xs">{row.account_code}</td><td className="px-5 py-3">{row.account_name}</td><td className="px-5 py-3 text-right tabular-nums">{format(new Decimal(row.amount))}</td></tr>);
  }

  return <main className="mx-auto w-full max-w-5xl px-5 py-8"><div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><Link href="/reports/trial-balance" className="text-sm font-medium text-accent">← Trial balance</Link><p className="mt-5 text-sm font-semibold text-accent">FINANCIAL REPORTS</p><h1 className="mt-1 text-3xl font-bold">Income statement</h1><p className="mt-2 text-sm text-slate-500">Revenue and expenses from posted entries in the selected period.</p></div>
      <form method="get" className="flex flex-wrap items-end gap-2"><label className="text-xs font-semibold text-slate-600">From<input type="date" name="from" required defaultValue={from} className="field mt-1.5" /></label><label className="text-xs font-semibold text-slate-600">To<input type="date" name="to" required defaultValue={to} className="field mt-1.5" /></label><button className="button" type="submit">Run report</button></form>
    </div>
    {!validRange ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">The start date must be on or before the end date.</p> : <>
      <section className="card overflow-hidden"><div className="border-b border-slate-100 px-5 py-4 text-sm font-medium text-slate-500">{from} to {to}</div>
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Code</th><th className="px-5 py-3">Account</th><th className="px-5 py-3 text-right">Amount</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            <tr className="bg-slate-50/70"><th colSpan={3} className="px-5 py-3 text-left text-xs uppercase tracking-wide text-slate-600">Revenue</th></tr>
            {rowsFor(revenueRows)}
            <tr className="border-t border-slate-200 font-semibold"><td colSpan={2} className="px-5 py-3">Total revenue</td><td className="px-5 py-3 text-right tabular-nums">{format(revenueTotal)}</td></tr>
            <tr className="bg-slate-50/70"><th colSpan={3} className="px-5 py-3 text-left text-xs uppercase tracking-wide text-slate-600">Expenses</th></tr>
            {rowsFor(expenseRows)}
            <tr className="border-t border-slate-200 font-semibold"><td colSpan={2} className="px-5 py-3">Total expenses</td><td className="px-5 py-3 text-right tabular-nums">{format(expenseTotal)}</td></tr>
            {!rows.length && <tr><td colSpan={3} className="px-5 py-8 text-center text-slate-500">No posted revenue or expense activity in this period.</td></tr>}
          </tbody>
          <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold"><tr><td colSpan={2} className="px-5 py-4">{netIncome.isNegative() ? "Net loss" : "Net income"}</td><td className="px-5 py-4 text-right tabular-nums">{format(netIncome.abs())}</td></tr></tfoot>
        </table></div>
      </section>
      <p className="text-xs text-slate-500">Revenue is shown as credit minus debit; expenses are shown as debit minus credit. Negative account values represent contra activity.</p>
    </>}
  </div></main>;
}
