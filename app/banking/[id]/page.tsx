import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { getBankReconciliationDetail } from "@/lib/accounting/service";
import { BankReconciliationWorkspace } from "@/components/banking/bank-reconciliation-workspace";

export const dynamic = "force-dynamic";

export default async function BankReconciliationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccountingUser();
  const { id } = await params;
  const detail = await getBankReconciliationDetail(id);
  if (!detail) notFound();
  return <main className="mx-auto w-full max-w-7xl px-5 py-8"><div className="space-y-6">
    <div><Link href="/banking" className="text-sm font-medium text-accent">← Back to reconciliations</Link><p className="mt-5 text-sm font-semibold text-accent">CASH MANAGEMENT</p><h1 className="mt-1 text-3xl font-bold">{detail.reconciliation.bank_account_name}</h1><p className="mt-2 text-sm text-slate-500">{detail.reconciliation.period_start} to {detail.reconciliation.period_end} · {detail.reconciliation.status === "COMPLETED" ? "Completed" : "In progress"}</p></div>
    <BankReconciliationWorkspace detail={detail} />
  </div></main>;
}
