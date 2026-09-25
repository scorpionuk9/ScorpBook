"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Account, SupplierBill } from "@/lib/accounting/service";
import { postSupplierBillAction, recordSupplierBillPaymentAction } from "@/app/actions/accounting";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: "bg-amber-50 text-amber-800", OPEN: "bg-blue-50 text-blue-700",
    PARTIAL: "bg-violet-50 text-violet-700", PAID: "bg-emerald-50 text-emerald-700",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status] ?? "bg-slate-100 text-slate-600"}`}>{status === "PARTIAL" ? "Part paid" : status[0] + status.slice(1).toLowerCase()}</span>;
}

function BillActions({ bill, bankAccounts, expenseNames, initialDate }: { bill: SupplierBill; bankAccounts: Account[]; expenseNames: Map<string, string>; initialDate: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);
  const [busy, setBusy] = useState(false);
  async function post(formData: FormData) {
    setBusy(true); setMessage(""); setHasError(false);
    const result = await postSupplierBillAction(formData);
    setMessage(result.message); setHasError(!result.ok); setBusy(false);
    if (result.ok) router.refresh();
  }
  async function pay(formData: FormData) {
    setBusy(true); setMessage(""); setHasError(false);
    const result = await recordSupplierBillPaymentAction(formData);
    setMessage(result.message); setHasError(!result.ok); setBusy(false);
    if (result.ok) router.refresh();
  }
  return <div className="space-y-2">
    {bill.status === "DRAFT" && <div className="flex flex-wrap items-center gap-2"><Link className="button-secondary px-3 py-1.5 text-xs" href={`/bills/${bill.id}/edit`}>Edit</Link><form action={post}><input type="hidden" name="bill_id" value={bill.id} /><button className="button px-3 py-1.5 text-xs" disabled={busy} type="submit">{busy ? "Processing…" : "Post bill"}</button></form></div>}
    {(bill.status === "OPEN" || bill.status === "PARTIAL") && <details className="min-w-72"><summary className="cursor-pointer text-xs font-semibold text-accent">Record payment</summary><form action={pay} className="mt-3 grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
      <input type="hidden" name="bill_id" value={bill.id} />
      <label className="text-[11px] font-medium text-slate-600">Payment date<input className="field mt-1" type="date" name="payment_date" required defaultValue={initialDate} /></label>
      <label className="text-[11px] font-medium text-slate-600">Amount<input className="field mt-1 text-right tabular-nums" type="number" name="amount" min="0.0001" step="0.0001" max={bill.outstanding} required defaultValue={bill.outstanding} /></label>
      <label className="text-[11px] font-medium text-slate-600 sm:col-span-2">Bank or clearing account<select className="field mt-1" name="bank_account_id" required defaultValue=""><option value="">Select account</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
      <button className="button text-xs sm:col-span-2" type="submit" disabled={busy || !bankAccounts.length}>{busy ? "Processing…" : "Record and post payment"}</button>
    </form></details>}
    {message && <p role="status" className={`max-w-64 text-xs ${hasError ? "text-red-700" : "text-emerald-700"}`}>{message}</p>}
    {!!bill.lines.length && <details className="text-xs"><summary className="cursor-pointer text-slate-500">{bill.lines.length} line{bill.lines.length === 1 ? "" : "s"} · history</summary><div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
      {bill.lines.map((line) => <div key={line.id} className="flex justify-between gap-4"><span>{line.description}<span className="ml-1 text-slate-400">{expenseNames.get(line.expense_account_id) ?? "Inactive account"}</span></span><span className="shrink-0 tabular-nums">{line.net_amount}{line.vat_amount !== "0.0000" && line.vat_amount !== "0" ? ` + VAT ${line.vat_amount}` : ""}</span></div>)}
      {bill.journal_entry_id && <Link href="/journal" className="inline-block pt-1 font-medium text-accent">View journal entry</Link>}
      {bill.payments.map((payment) => <div key={payment.id} className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-slate-600"><span>Payment {payment.payment_date}</span><span className="tabular-nums">{payment.amount}</span></div>)}
    </div></details>}
  </div>;
}

export function SupplierBillManager({ bills, bankAccounts, expenseNames, initialDate }: { bills: SupplierBill[]; bankAccounts: Account[]; expenseNames: Map<string, string>; initialDate: string }) {
  return <section className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm">
    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Bill</th><th className="px-5 py-3">Supplier</th><th className="px-5 py-3">Due</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3 text-right">Outstanding</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Actions</th></tr></thead>
    <tbody className="divide-y divide-slate-100">{bills.map((bill) => <tr key={bill.id} className="align-top hover:bg-slate-50/70">
      <td className="px-5 py-4"><div className="font-mono text-xs font-semibold">{bill.bill_number}</div><div className="mt-1 text-xs text-slate-500">{bill.bill_date}</div></td>
      <td className="px-5 py-4 font-medium">{bill.supplier_name}{bill.description && <div className="mt-1 max-w-48 truncate text-xs font-normal text-slate-500">{bill.description}</div>}</td>
      <td className="whitespace-nowrap px-5 py-4 text-xs">{bill.due_date}</td>
      <td className="px-5 py-4 text-right tabular-nums">{bill.total}</td>
      <td className="px-5 py-4 text-right tabular-nums">{bill.outstanding}</td>
      <td className="px-5 py-4"><StatusBadge status={bill.status} /></td>
      <td className="px-5 py-4"><BillActions bill={bill} bankAccounts={bankAccounts} expenseNames={expenseNames} initialDate={initialDate} /></td>
    </tr>)}
    {!bills.length && <tr><td colSpan={7} className="px-5 py-14 text-center"><p className="font-medium">No supplier bills yet</p><p className="mt-1 text-sm text-slate-500">Create a draft bill to start tracking payables.</p><Link className="button mt-4" href="/bills/new">New bill</Link></td></tr>}
    </tbody></table></div></section>;
}
