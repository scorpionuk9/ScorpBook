"use client";

import { useState } from "react";
import type { Account, Supplier } from "@/lib/accounting/service";
import { SupplierForm } from "@/components/suppliers/supplier-form";

export function SupplierManager({ suppliers, expenseAccounts, suggestedCode }: { suppliers: Supplier[]; expenseAccounts: Account[]; suggestedCode: string }) {
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const expenseNames = new Map(expenseAccounts.map((account) => [account.id, `${account.code} · ${account.name}`]));

  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">Suppliers <span className="ml-1 text-sm font-normal text-slate-400">{suppliers.length}</span></h2><button type="button" className="text-xs font-semibold text-accent" onClick={() => setEditing(null)}>＋ Add supplier</button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Code</th><th className="px-5 py-3">Supplier</th><th className="px-5 py-3">Contact</th><th className="px-5 py-3">Default expense</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Manage</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{suppliers.map((supplier) => <tr key={supplier.id} className="hover:bg-slate-50/70">
          <td className="px-5 py-3 font-mono text-xs">{supplier.supplier_code}</td>
          <td className="px-5 py-3 font-medium">{supplier.name}{supplier.tax_number && <div className="mt-1 text-xs font-normal text-slate-500">Tax ref. {supplier.tax_number}</div>}</td>
          <td className="px-5 py-3 text-xs text-slate-600">{supplier.email || supplier.phone ? <>{supplier.email}{supplier.email && supplier.phone && <br />}{supplier.phone}</> : <span className="text-slate-400">—</span>}</td>
          <td className="px-5 py-3 text-xs text-slate-600">{supplier.default_expense_account_id ? expenseNames.get(supplier.default_expense_account_id) ?? "Inactive account" : <span className="text-slate-400">Not set</span>}</td>
          <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${supplier.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{supplier.is_active ? "Active" : "Inactive"}</span></td>
          <td className="px-5 py-3"><button type="button" className="text-xs font-semibold text-accent" onClick={() => setEditing(supplier)}>Edit</button></td>
        </tr>)}
        {!suppliers.length && <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">No suppliers yet. Add a supplier to prepare for bill entry.</td></tr>}</tbody>
      </table></div>
    </section>
    <section className="card h-fit p-5"><h2 className="font-semibold">{editing ? "Edit supplier" : "Add supplier"}</h2><p className="mt-1 text-sm text-slate-500">Supplier codes stay fixed after creation. Deactivate a supplier to keep historical references.</p><div className="mt-4"><SupplierForm key={`${editing?.id ?? "new"}-${suggestedCode}-${formVersion}`} supplier={editing ?? undefined} suggestedCode={suggestedCode} expenseAccounts={expenseAccounts} onSaved={() => { setEditing(null); setFormVersion((version) => version + 1); }} onCancel={() => setEditing(null)} /></div></section>
  </div>;
}
