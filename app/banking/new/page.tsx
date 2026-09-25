import Link from "next/link";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { listAccounts } from "@/lib/accounting/service";
import { accountingToday } from "@/lib/accounting/dates";
import { NewBankReconciliationForm } from "@/components/banking/new-bank-reconciliation-form";

export const dynamic = "force-dynamic";

export default async function NewBankReconciliationPage() {
  await requireAccountingUser();
  const accounts = await listAccounts();
  const bankAccounts = accounts.filter((account) => account.type === "ASSET" && account.is_active && account.code.startsWith("10"));
  const today = accountingToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  return <main className="mx-auto w-full max-w-3xl px-5 py-8"><div className="space-y-6">
    <div><Link href="/banking" className="text-sm font-medium text-accent">← Back to reconciliations</Link><p className="mt-5 text-sm font-semibold text-accent">CASH MANAGEMENT</p><h1 className="mt-1 text-3xl font-bold">Start a reconciliation</h1><p className="mt-2 text-sm text-slate-500">Enter statement balances first. You can import and match transactions on the next screen.</p></div>
    <section className="card p-5 sm:p-7"><NewBankReconciliationForm bankAccounts={bankAccounts} initialStart={monthStart} initialEnd={today} /></section>
  </div></main>;
}
