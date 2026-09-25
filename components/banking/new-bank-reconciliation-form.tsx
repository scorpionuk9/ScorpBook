"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Account } from "@/lib/accounting/service";
import { createBankReconciliationAction } from "@/app/actions/accounting";

export function NewBankReconciliationForm({ bankAccounts, initialStart, initialEnd }: { bankAccounts: Account[]; initialStart: string; initialEnd: string }) {
  const router = useRouter();
  const [periodStart, setPeriodStart] = useState(initialStart);
  const [periodEnd, setPeriodEnd] = useState(initialEnd);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(formData: FormData) {
    setBusy(true); setMessage("");
    const result = await createBankReconciliationAction({
      bank_account_id: String(formData.get("bank_account_id") || ""),
      period_start: periodStart,
      period_end: periodEnd,
      opening_balance: String(formData.get("opening_balance") || ""),
      closing_balance: String(formData.get("closing_balance") || ""),
    });
    setBusy(false);
    if (result.ok && result.id) { router.push(`/banking/${result.id}`); router.refresh(); }
    else setMessage(result.message);
  }
  return <form action={submit} className="space-y-4">
    <label className="block text-xs font-semibold text-slate-600">Bank, cash, or clearing account<select required name="bank_account_id" className="field mt-1.5" defaultValue=""><option value="">Select account</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-semibold text-slate-600">Period start<input required type="date" className="field mt-1.5" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
      <label className="text-xs font-semibold text-slate-600">Period end<input required type="date" className="field mt-1.5" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
      <label className="text-xs font-semibold text-slate-600">Statement opening balance<input required name="opening_balance" inputMode="decimal" className="field mt-1.5 text-right tabular-nums" placeholder="0.0000" /></label>
      <label className="text-xs font-semibold text-slate-600">Statement closing balance<input required name="closing_balance" inputMode="decimal" className="field mt-1.5 text-right tabular-nums" placeholder="0.0000" /></label>
    </div>
    <p className="text-xs text-slate-500">Use signed balances from the bank statement. Deposits increase the balance; withdrawals reduce it. The opening balance must match the posted ledger before the period.</p>
    <div className="flex justify-end"><button className="button" type="submit" disabled={busy || !bankAccounts.length}>{busy ? "Creating…" : "Continue to statement import"}</button></div>
    {message && <p role="status" className="text-sm text-red-700">{message}</p>}
  </form>;
}
