import Link from "next/link";
import type { BankReconciliation } from "@/lib/accounting/service";

export function BankReconciliationList({ sessions }: { sessions: BankReconciliation[] }) {
  return <section className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Bank account</th><th className="px-5 py-3">Period</th><th className="px-5 py-3 text-right">Opening</th><th className="px-5 py-3 text-right">Closing</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Manage</th></tr></thead>
    <tbody className="divide-y divide-slate-100">{sessions.map((session) => <tr key={session.id} className="hover:bg-slate-50/70">
      <td className="px-5 py-4 font-medium">{session.bank_account_name}</td><td className="whitespace-nowrap px-5 py-4 text-xs">{session.period_start} – {session.period_end}</td>
      <td className="px-5 py-4 text-right tabular-nums">{session.opening_balance}</td><td className="px-5 py-4 text-right tabular-nums">{session.closing_balance}</td>
      <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${session.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{session.status === "COMPLETED" ? "Completed" : "In progress"}</span></td>
      <td className="px-5 py-4"><Link className="text-xs font-semibold text-accent" href={`/banking/${session.id}`}>{session.status === "COMPLETED" ? "View" : "Continue"}</Link></td>
    </tr>)}
    {!sessions.length && <tr><td colSpan={6} className="px-5 py-14 text-center"><p className="font-medium">No bank reconciliations yet</p><p className="mt-1 text-sm text-slate-500">Start a period to import and match a bank statement.</p><Link className="button mt-4" href="/banking/new">Start reconciliation</Link></td></tr>}
    </tbody></table></div></section>;
}
