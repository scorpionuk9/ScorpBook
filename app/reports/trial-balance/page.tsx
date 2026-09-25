import Link from "next/link";
import Decimal from "decimal.js";
import { z } from "zod";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { getTrialBalance } from "@/lib/accounting/service";
import { accountingToday } from "@/lib/accounting/dates";

export const dynamic = "force-dynamic";

type TrialBalancePageProps = {
  searchParams: Promise<{ asOf?: string | string[] }>;
};

export default async function TrialBalancePage({ searchParams }: TrialBalancePageProps) {
  await requireAccountingUser();
  const params = await searchParams;
  const requestedDate = Array.isArray(params.asOf) ? params.asOf[0] : params.asOf;
  const today = accountingToday();
  const asOf = requestedDate && z.iso.date().safeParse(requestedDate).success ? requestedDate : today;
  const rows = await getTrialBalance(asOf);
  const debitTotal = rows.reduce((total, row) => total.plus(row.debit_balance), new Decimal(0));
  const creditTotal = rows.reduce((total, row) => total.plus(row.credit_balance), new Decimal(0));
  const balanced = debitTotal.eq(creditTotal);
  const format = (value: string) => new Decimal(value).toFixed(4);

  return <main className="mx-auto w-full max-w-7xl px-5 py-8"><div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><Link href="/journal" className="text-sm font-medium text-accent">← Journal</Link><p className="mt-5 text-sm font-semibold text-accent">FINANCIAL REPORTS</p><h1 className="mt-1 text-3xl font-bold">Trial balance</h1><p className="mt-2 text-sm text-slate-500">Posted account balances as of the selected date. Draft entries are excluded.</p></div>
      <form method="get" className="flex items-end gap-2"><label className="text-xs font-semibold text-slate-600">As of date<input type="date" name="asOf" required defaultValue={asOf} className="field mt-1.5" /></label><button className="button" type="submit">Run report</button></form>
    </div>
    <section className="card overflow-hidden">
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Code</th><th className="px-5 py-3">Account</th><th className="px-5 py-3">Type</th><th className="px-5 py-3 text-right">Debit</th><th className="px-5 py-3 text-right">Credit</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.account_id} className="hover:bg-slate-50/70"><td className="px-5 py-3 font-mono text-xs">{row.account_code}</td><td className="px-5 py-3">{row.account_name}{!row.is_active && <span className="ml-2 text-xs text-slate-400">Inactive</span>}</td><td className="px-5 py-3 text-slate-500">{row.account_type.charAt(0) + row.account_type.slice(1).toLowerCase()}</td><td className="px-5 py-3 text-right tabular-nums">{new Decimal(row.debit_balance).isZero() ? "—" : format(row.debit_balance)}</td><td className="px-5 py-3 text-right tabular-nums">{new Decimal(row.credit_balance).isZero() ? "—" : format(row.credit_balance)}</td></tr>)}
        {!rows.length && <tr><td colSpan={5} className="px-5 py-14 text-center text-slate-500">No accounts are available for this report.</td></tr>}</tbody>
        <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold"><tr><td colSpan={3} className="px-5 py-4">Total</td><td className="px-5 py-4 text-right tabular-nums">{format(debitTotal.toString())}</td><td className="px-5 py-4 text-right tabular-nums">{format(creditTotal.toString())}</td></tr></tfoot>
      </table></div>
    </section>
    <p role="status" className={`text-sm font-medium ${balanced ? "text-emerald-700" : "text-red-700"}`}>{balanced ? "Debits and credits are in balance." : `Out of balance by ${format(debitTotal.minus(creditTotal).abs().toString())}. Review the posted ledger before relying on this report.`}</p>
  </div></main>;
}
