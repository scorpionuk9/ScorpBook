"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Account, Supplier } from "@/lib/accounting/service";
import { saveSupplierAction } from "@/app/actions/accounting";

export function SupplierForm({ supplier, expenseAccounts, onSaved, onCancel }: {
  supplier?: Supplier;
  expenseAccounts: Account[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    setHasError(false);
    try {
      const result = await saveSupplierAction(formData);
      setMessage(result.message);
      setHasError(!result.ok);
      if (result.ok) {
        onSaved();
        router.refresh();
      }
    } catch {
      setHasError(true);
      setMessage("The supplier could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <form action={submit} className="space-y-3">
    {supplier && <input type="hidden" name="id" value={supplier.id} />}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
      <label className="block text-xs font-medium text-slate-600">Supplier code<input className="field mt-1" name="supplier_code" required maxLength={20} defaultValue={supplier?.supplier_code} readOnly={Boolean(supplier)} placeholder="e.g. SUP-001" /></label>
      <label className="block text-xs font-medium text-slate-600">Supplier name<input className="field mt-1" name="name" required maxLength={150} defaultValue={supplier?.name} /></label>
      <label className="block text-xs font-medium text-slate-600">Email<input className="field mt-1" name="email" type="email" maxLength={254} defaultValue={supplier?.email ?? ""} /></label>
      <label className="block text-xs font-medium text-slate-600">Phone<input className="field mt-1" name="phone" maxLength={50} defaultValue={supplier?.phone ?? ""} /></label>
      <label className="block text-xs font-medium text-slate-600">Tax reference<input className="field mt-1" name="tax_number" maxLength={100} defaultValue={supplier?.tax_number ?? ""} /></label>
      <label className="block text-xs font-medium text-slate-600">Default expense account<select className="field mt-1" name="default_expense_account_id" defaultValue={supplier?.default_expense_account_id ?? ""}><option value="">Choose when entering a bill</option>{expenseAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select><span className="mt-1 block font-normal text-slate-400">A convenient default for future bills; it does not post transactions.</span></label>
    </div>
    <label className="block text-xs font-medium text-slate-600">Address<textarea className="field mt-1 min-h-20" name="address" maxLength={1000} defaultValue={supplier?.address ?? ""} /></label>
    {supplier && <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="is_active" defaultChecked={supplier.is_active} />Active</label>}
    {message && <p role="status" className={`text-xs ${hasError ? "text-red-700" : "text-emerald-700"}`}>{message}</p>}
    <div className="flex gap-2"><button disabled={busy} className="button flex-1" type="submit">{busy ? "Saving…" : supplier ? "Save changes" : "Add supplier"}</button>{supplier && <button type="button" disabled={busy} className="button-secondary" onClick={onCancel}>Cancel</button>}</div>
  </form>;
}
