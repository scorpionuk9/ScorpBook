import Link from "next/link";
import Decimal from "decimal.js";
import { z } from "zod";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { getBalanceSheet, type BalanceSheetAccountRow } from "@/lib/accounting/service";
import { accountingToday } from "@/lib/accounting/dates";

export const dynamic = "force-dynamic";

type BalanceSheetPageProps = {
  searchParams: Promise<{ asOf?: string | string[] }>;
};

export default async function BalanceSheetPage({ searchParams }: BalanceSheetPageProps) {
  await requireAccountingUser();
  const params = await searchParams;
  const requestedDate = Array.isArray(params.asOf) ? params.asOf[0] : params.asOf;
  const today = accountingToday();
  const asOf = requestedDate && z.iso.date().safeParse(requestedDate).success ? requestedDate : today;
  const { accounts, current_earnings } = await getBalanceSheet(asOf);
  const assets = accounts.filter((account) => account.account_type === "ASSET");
  const liabilities = accounts.filter((account) => account.account_type === "LIABILITY");
  const equity = accounts.filter((account) => account.account_type === "EQUITY");
  const sum = (rows: BalanceSheetAccountRow[]) => rows.reduce((total, row) => total.plus(row.amount), new Decimal(0));
  const assetTotal = sum(assets);
  const liabilityTotal = sum(liabilities);
  const equityAccountTotal = sum(equity);
  const earnings = new Decimal(current_earnings);
  const equityTotal = equityAccountTotal.plus(earnings);
  const liabilitiesAndEquity = liabilityTotal.plus(equityTotal);
  const balanced = assetTotal.eq(liabilitiesAndEquity);
  const format = (value: Decimal) => value.toFixed(4);

  function accountRows(rows: BalanceSheetAccountRow[]) {
    return rows.map((row) => <tr key={row.account_id} className="hover:bg-slate-50/70"><td className="px-5 py-3 font-mono text-xs">{row.account_code}</td><td className="px-5 py-3">{row.account_name}{!row.is_active && <span className="ml-2 text-xs text-slate-400">Inactive</span>}</td><td className="px-5 py-3 text-right tabular-nums">{new Decimal(row.amount).isZero() ? "—" : format(new Decimal(row.amount))}</td></tr>);
  }

  return <main className="mx-auto w-full max-w-5xl px-5 py-8"><div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><Link href="/reports/trial-balance" className="text-sm font-medium text-accent">← Trial balance</Link><p className="mt-5 text-sm font-semibold text-accent">FINANCIAL REPORTS</p><h1 className="mt-1 text-3xl font-bold">Balance sheet</h1><p className="mt-2 text-sm text-slate-500">Assets, liabilities, and equity as of the selected date.</p></div>
      <form method="get" className="flex items-end gap-2"><label className="text-xs font-semibold text-slate-600">As of date<input type="date" name="asOf" required defaultValue={asOf} className="field mt-1.5" /></label><button className="button" type="submit">Run report</button></form>
    </div>
    <section className="card overflow-hidden"><div className="border-b border-slate-100 px-5 py-4 text-sm font-medium text-slate-500">As of {asOf}</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Code</th><th className="px-5 py-3">Account</th><th className="px-5 py-3 text-right">Balance</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          <tr className="bg-slate-50/70"><th colSpan={3} className="px-5 py-3 text-left text-xs uppercase tracking-wide text-slate-600">Assets</th></tr>
          {accountRows(assets)}
          <tr className="border-t border-slate-200 font-semibold"><td colSpan={2} className="px-5 py-3">Total assets</td><td className="px-5 py-3 text-right tabular-nums">{format(assetTotal)}</td></tr>
          <tr className="bg-slate-50/70"><th colSpan={3} className="px-5 py-3 text-left text-xs uppercase tracking-wide text-slate-600">Liabilities</th></tr>
          {accountRows(liabilities)}
          <tr className="border-t border-slate-200 font-semibold"><td colSpan={2} className="px-5 py-3">Total liabilities</td><td className="px-5 py-3 text-right tabular-nums">{format(liabilityTotal)}</td></tr>
          <tr className="bg-slate-50/70"><th colSpan={3} className="px-5 py-3 text-left text-xs uppercase tracking-wide text-slate-600">Equity</th></tr>
          {accountRows(equity)}
          <tr className="text-slate-700"><td className="px-5 py-3" /><td className="px-5 py-3">Current earnings (unclosed)</td><td className="px-5 py-3 text-right tabular-nums">{earnings.isZero() ? "—" : format(earnings)}</td></tr>
          <tr className="border-t border-slate-200 font-semibold"><td colSpan={2} className="px-5 py-3">Total equity</td><td className="px-5 py-3 text-right tabular-nums">{format(equityTotal)}</td></tr>
        </tbody>
        <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold"><tr><td colSpan={2} className="px-5 py-4">Total liabilities and equity</td><td className="px-5 py-4 text-right tabular-nums">{format(liabilitiesAndEquity)}</td></tr></tfoot>
      </table></div>
    </section>
    <p role="status" className={`text-sm font-medium ${balanced ? "text-emerald-700" : "text-red-700"}`}>{balanced ? "Assets equal liabilities and equity." : `Out of balance by ${format(assetTotal.minus(liabilitiesAndEquity).abs())}. Review posted entries before relying on this report.`}</p>
    <p className="text-xs text-slate-500">Current earnings include cumulative posted revenue and expenses through the report date. This calculation assumes those balances have not already been closed into retained earnings.</p>
  </div></main>;
}
