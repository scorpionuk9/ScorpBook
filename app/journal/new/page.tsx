import Link from "next/link";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { listAccounts } from "@/lib/accounting/service";
import { JournalComposer } from "@/components/journal/journal-composer";

export const dynamic = "force-dynamic";

export default async function NewJournalPage() {
  await requireAccountingUser();
  const accounts = await listAccounts();
  return <main className="mx-auto w-full max-w-7xl px-5 py-8"><div className="space-y-6">
    <div><Link href="/journal" className="text-sm font-medium text-accent">← Back to journal</Link><p className="mt-5 text-sm font-semibold text-accent">JOURNAL</p><h1 className="mt-1 text-3xl font-bold">New journal entry</h1><p className="mt-2 text-sm text-slate-500">Save as a draft first. Debits and credits must balance before posting.</p></div>
    <section className="card p-5 sm:p-7"><JournalComposer accounts={accounts} /></section>
  </div></main>;
}
