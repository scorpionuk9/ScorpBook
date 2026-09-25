import Link from "next/link";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { listAccounts } from "@/lib/accounting/service";
import { JournalComposer } from "@/components/journal/journal-composer";

export const dynamic = "force-dynamic";

export default async function NewJournalPage() {
  await requireAccountingUser();
  const accounts = await listAccounts();
  return <div className="space-y-6">
    <div><Link href="/journal" className="text-sm font-medium text-accent">← 返回日記帳</Link><p className="mt-5 text-sm font-semibold text-accent">日記帳</p><h1 className="mt-1 text-3xl font-bold">建立憑證</h1><p className="mt-2 text-sm text-slate-500">儲存後先成為草稿；檢查借貸相等後才可過帳。</p></div>
    <section className="card p-5 sm:p-7"><JournalComposer accounts={accounts} /></section>
  </div>;
}
