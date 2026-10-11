import Link from "next/link";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { getViewMode } from "@/lib/ui/view-mode-server";
import { LABELS } from "@/lib/ui/view-mode";
import { listAccounts, listBankReconciliations } from "@/lib/accounting/service";
import { BankReconciliationList } from "@/components/banking/bank-reconciliation-list";

export const dynamic = "force-dynamic";

export default async function BankingPage() {
  await requireAccountingUser();
  const t = LABELS[await getViewMode()];
  const [sessions, accounts] = await Promise.all([listBankReconciliations(), listAccounts()]);
  const bankAccounts = accounts.filter((account) => account.type === "ASSET" && account.is_active && account.code.startsWith("10"));
  return <main className="mx-auto w-full max-w-7xl px-5 py-8"><div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-accent">CASH MANAGEMENT</p><h1 className="mt-1 text-3xl font-bold">{t.banking}</h1><p className="mt-2 text-sm text-slate-500">{t.bankingIntro}</p></div><Link className="button" href="/banking/new">＋ Start reconciliation</Link></div>
    <BankReconciliationList sessions={sessions} />
    {!bankAccounts.length && <p className="text-sm text-amber-800">Add an active bank, cash, or clearing asset account with a 10xx code before reconciling.</p>}
  </div></main>;
}
