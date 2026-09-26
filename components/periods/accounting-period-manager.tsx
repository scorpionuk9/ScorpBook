"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AccountingPeriod } from "@/lib/accounting/service";
import { closeAccountingPeriodAction } from "@/app/actions/accounting";

function periodLabel(start: string): string {
  return new Date(`${start}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function AccountingPeriodManager({ periods, currentDate }: { periods: AccountingPeriod[]; currentDate: string }) {
  const router = useRouter();
  const [busyPeriod, setBusyPeriod] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);

  async function closePeriod(period: AccountingPeriod) {
    if (!window.confirm(`Close ${periodLabel(period.period_start)}? This is permanent and prevents new postings in the period.`)) return;
    setBusyPeriod(period.id); setMessage(""); setHasError(false);
    const result = await closeAccountingPeriodAction(period.id);
    setBusyPeriod(null); setMessage(result.message); setHasError(!result.ok);
    if (result.ok) router.refresh();
  }

  return <section className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm">
    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Period</th><th className="px-5 py-3">Start</th><th className="px-5 py-3">End</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Closed at</th><th className="px-5 py-3">Action</th></tr></thead>
    <tbody className="divide-y divide-slate-100">{periods.map((period) => <tr key={period.id} className="hover:bg-slate-50/70">
      <td className="px-5 py-3 font-medium">{periodLabel(period.period_start)}</td><td className="px-5 py-3 text-xs text-slate-500">{period.period_start}</td><td className="px-5 py-3 text-xs text-slate-500">{period.period_end}</td>
      <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${period.status === "CLOSED" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>{period.status === "CLOSED" ? "Closed · Locked" : "Open"}</span></td>
      <td className="px-5 py-3 text-xs text-slate-500">{period.closed_at ? new Date(period.closed_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }) : "—"}</td>
      <td className="px-5 py-3">{period.status === "OPEN" && (period.period_end < currentDate ? <button type="button" className="button-secondary px-3 py-1.5 text-xs" disabled={busyPeriod !== null} onClick={() => void closePeriod(period)}>{busyPeriod === period.id ? "Checking…" : "Close period"}</button> : <span className="text-xs text-slate-400">Available after period end</span>)}</td>
    </tr>)}
    {!periods.length && <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">No accounting periods are available.</td></tr>}</tbody>
  </table></div>
    {message && <p role="status" className={`border-t border-slate-200 px-5 py-3 text-sm ${hasError ? "text-red-700" : "text-emerald-700"}`}>{message}</p>}
  </section>;
}
