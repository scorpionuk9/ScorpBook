import { requireAccountingUser } from "@/lib/accounting/auth";
import { listAccounts, listSuppliers, suggestSupplierCode } from "@/lib/accounting/service";
import { SupplierManager } from "@/components/suppliers/supplier-manager";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  await requireAccountingUser();
  const [suppliers, accounts, suggestedCode] = await Promise.all([listSuppliers(), listAccounts(), suggestSupplierCode()]);
  const expenseAccounts = accounts.filter((account) => account.type === "EXPENSE" && account.is_active);
  return <main className="mx-auto w-full max-w-7xl px-5 py-8"><div className="space-y-6">
    <div><p className="text-sm font-semibold text-accent">PURCHASES</p><h1 className="mt-1 text-3xl font-bold">Suppliers</h1><p className="mt-2 text-sm text-slate-500">Manage supplier contacts and default expense accounts for upcoming bills.</p></div>
    <SupplierManager suppliers={suppliers} expenseAccounts={expenseAccounts} suggestedCode={suggestedCode} />
  </div></main>;
}
