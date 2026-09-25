"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import type { Account, Supplier, SupplierBill } from "@/lib/accounting/service";
import { saveSupplierBillAction } from "@/app/actions/accounting";

type BillLineInput = { expense_account_id: string; description: string; net_amount: string; vat_amount: string };

export function SupplierBillForm({ suppliers, expenseAccounts, initialDate, bill }: {
  suppliers: Supplier[]; expenseAccounts: Account[]; initialDate: string; bill?: SupplierBill;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(bill?.supplier_id ?? "");
  const [billDate, setBillDate] = useState(bill?.bill_date ?? initialDate);
  const [dueDate, setDueDate] = useState(bill?.due_date ?? initialDate);
  const [lines, setLines] = useState<BillLineInput[]>(bill?.lines.map((line) => ({
    expense_account_id: line.expense_account_id, description: line.description,
    net_amount: line.net_amount, vat_amount: line.vat_amount,
  })) ?? [{ expense_account_id: "", description: "", net_amount: "0", vat_amount: "0" }]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const totals = useMemo(() => lines.reduce((sum, line) => ({
    net: sum.net.plus(line.net_amount || "0"), vat: sum.vat.plus(line.vat_amount || "0"),
  }), { net: new Decimal(0), vat: new Decimal(0) }), [lines]);

  function updateLine(index: number, key: keyof BillLineInput, value: string) {
    setLines((current) => current.map((line, row) => row === index ? { ...line, [key]: value } : line));
  }

  function selectSupplier(id: string) {
    setSupplierId(id);
    const supplier = suppliers.find((item) => item.id === id);
    const preferredAccount = supplier?.default_expense_account_id ?? "";
    setLines((current) => current.map((line, index) => index === 0 && !line.expense_account_id
      ? { ...line, expense_account_id: preferredAccount }
      : line));
  }

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    const result = await saveSupplierBillAction({
      id: bill?.id,
      supplier_id: supplierId,
      bill_number: String(formData.get("bill_number") || ""),
      bill_date: billDate,
      due_date: dueDate,
      description: String(formData.get("description") || ""),
      lines: lines.map((line) => ({ ...line, vat_amount: line.vat_amount || "0" })),
    });
    setMessage(result.message);
    setBusy(false);
    if (result.ok) {
      router.push("/bills");
      router.refresh();
    }
  }

  return <form action={submit} className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-semibold text-slate-600">Supplier<select required className="field mt-1.5" value={supplierId} onChange={(event) => selectSupplier(event.target.value)}><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplier_code} · {supplier.name}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-600">Supplier invoice number<input required name="bill_number" maxLength={50} className="field mt-1.5" defaultValue={bill?.bill_number ?? ""} /></label>
      <label className="text-xs font-semibold text-slate-600">Bill date<input required type="date" className="field mt-1.5" value={billDate} onChange={(event) => setBillDate(event.target.value)} /></label>
      <label className="text-xs font-semibold text-slate-600">Due date<input required type="date" className="field mt-1.5" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
      <label className="text-xs font-semibold text-slate-600 sm:col-span-2 lg:col-span-4">Description<input name="description" maxLength={2000} className="field mt-1.5" defaultValue={bill?.description ?? ""} placeholder="Optional bill description" /></label>
    </div>
    <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[800px] text-left text-sm">
      <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-3">Expense account</th><th className="px-3 py-3">Description</th><th className="px-3 py-3 text-right">Net amount</th><th className="px-3 py-3 text-right">VAT amount</th><th className="w-12" /></tr></thead>
      <tbody className="divide-y divide-slate-100">{lines.map((line, index) => <tr key={index}>
        <td className="px-3 py-2"><select required className="field min-w-52" value={line.expense_account_id} onChange={(event) => updateLine(index, "expense_account_id", event.target.value)}><option value="">Select account</option>{expenseAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></td>
        <td className="px-3 py-2"><input required className="field min-w-40" value={line.description} onChange={(event) => updateLine(index, "description", event.target.value)} placeholder="Goods or service" maxLength={500} /></td>
        <td className="px-3 py-2"><input required className="field min-w-32 text-right tabular-nums" type="number" min="0.0001" step="0.0001" value={line.net_amount} onChange={(event) => updateLine(index, "net_amount", event.target.value)} /></td>
        <td className="px-3 py-2"><input className="field min-w-32 text-right tabular-nums" type="number" min="0" step="0.0001" value={line.vat_amount} onChange={(event) => updateLine(index, "vat_amount", event.target.value)} /></td>
        <td className="px-2 py-2"><button type="button" className="text-slate-400 hover:text-red-600" aria-label="Remove bill line" disabled={lines.length <= 1} onClick={() => setLines((current) => current.filter((_, row) => row !== index))}>×</button></td>
      </tr>)}</tbody>
      <tfoot className="bg-slate-50 font-semibold"><tr><td className="px-3 py-3" colSpan={2}>Invoice total (GBP)</td><td className="px-3 py-3 text-right tabular-nums">{totals.net.toFixed(4)}</td><td className="px-3 py-3 text-right tabular-nums">{totals.vat.toFixed(4)}</td><td /></tr></tfoot>
    </table></div>
    <p className="text-xs text-slate-500">Enter VAT from the supplier invoice. VAT is posted to VAT Recoverable account 1200; the invoice total is credited to Accounts Payable account 2000.</p>
    <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" className="button-secondary" onClick={() => setLines((current) => [...current, { expense_account_id: expenseAccounts[0]?.id ?? "", description: "", net_amount: "0", vat_amount: "0" }])}>＋ Add line</button><div className="flex gap-3"><button type="button" className="button-secondary" onClick={() => router.push("/bills")}>Cancel</button><button disabled={busy || !suppliers.length || !expenseAccounts.length} className="button" type="submit">{busy ? "Saving…" : bill ? "Update draft" : "Save draft"}</button></div></div>
    {message && <p role="status" className="text-sm text-red-700">{message}</p>}
  </form>;
}
