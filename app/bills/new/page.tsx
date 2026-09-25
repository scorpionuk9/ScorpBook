import Link from "next/link";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { listAccounts, listSuppliers } from "@/lib/accounting/service";
import { accountingToday } from "@/lib/accounting/dates";
import { SupplierBillForm } from "@/components/bills/supplier-bill-form";

export const dynamic = "force-dynamic";

export default async function NewSupplierBillPage() {
  await requireAccountingUser();
  const [suppliers, accounts] = await Promise.all([listSuppliers(), listAccounts()]);
  const activeSuppliers = suppliers.filter((supplier) => supplier.is_active);
  const expenseAccounts = accounts.filter((account) => account.type === "EXPENSE" && account.is_active);
  const today = accountingToday();
  return <main className="mx-auto w-full max-w-7xl px-5 py-8"><div className="space-y-6">
    <div><Link href="/bills" className="text-sm font-medium text-accent">← Back to bills</Link><p className="mt-5 text-sm font-semibold text-accent">PURCHASES</p><h1 className="mt-1 text-3xl font-bold">New supplier bill</h1><p className="mt-2 text-sm text-slate-500">Save a draft, then post it to recognize the expense and accounts payable.</p></div>
    <section className="card p-5 sm:p-7"><SupplierBillForm suppliers={activeSuppliers} expenseAccounts={expenseAccounts} initialDate={today} /></section>
    {!activeSuppliers.length && <p className="text-sm text-amber-800">Add an active supplier before creating a bill.</p>}
  </div></main>;
}
