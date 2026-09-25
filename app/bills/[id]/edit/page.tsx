import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { listAccounts, listSupplierBills, listSuppliers } from "@/lib/accounting/service";
import { SupplierBillForm } from "@/components/bills/supplier-bill-form";

export const dynamic = "force-dynamic";

export default async function EditSupplierBillPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccountingUser();
  const { id } = await params;
  const [bills, suppliers, accounts] = await Promise.all([listSupplierBills(), listSuppliers(), listAccounts()]);
  const bill = bills.find((item) => item.id === id);
  if (!bill) notFound();
  if (bill.status !== "DRAFT") redirect("/bills");
  const expenseAccounts = accounts.filter((account) => account.type === "EXPENSE" && account.is_active);
  return <main className="mx-auto w-full max-w-7xl px-5 py-8"><div className="space-y-6">
    <div><Link href="/bills" className="text-sm font-medium text-accent">← Back to bills</Link><p className="mt-5 text-sm font-semibold text-accent">PURCHASES · DRAFT</p><h1 className="mt-1 text-3xl font-bold">Edit bill {bill.bill_number}</h1><p className="mt-2 text-sm text-slate-500">Only draft bills can be edited.</p></div>
    <section className="card p-5 sm:p-7"><SupplierBillForm suppliers={suppliers.filter((supplier) => supplier.is_active)} expenseAccounts={expenseAccounts} initialDate={bill.bill_date} bill={bill} /></section>
  </div></main>;
}
