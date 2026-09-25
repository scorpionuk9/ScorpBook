import Link from "next/link";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { listAccounts, listSupplierBills } from "@/lib/accounting/service";
import { SupplierBillManager } from "@/components/bills/supplier-bill-manager";
import { accountingToday } from "@/lib/accounting/dates";

export const dynamic = "force-dynamic";

export default async function SupplierBillsPage() {
  await requireAccountingUser();
  const [bills, accounts] = await Promise.all([listSupplierBills(), listAccounts()]);
  const bankAccounts = accounts.filter((account) => account.type === "ASSET" && account.is_active && account.code.startsWith("10"));
  const expenseNames = new Map(accounts.map((account) => [account.id, `${account.code} · ${account.name}`]));
  return <main className="mx-auto w-full max-w-7xl px-5 py-8"><div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-accent">PURCHASES</p><h1 className="mt-1 text-3xl font-bold">Supplier bills</h1><p className="mt-2 text-sm text-slate-500">Record supplier invoices, post payables, and apply full or partial payments.</p></div><Link className="button" href="/bills/new">＋ New bill</Link></div>
    <SupplierBillManager bills={bills} bankAccounts={bankAccounts} expenseNames={expenseNames} initialDate={accountingToday()} />
  </div></main>;
}
