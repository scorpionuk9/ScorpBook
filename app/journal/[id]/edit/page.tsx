import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { SCORPBOOK_TENANT_ID } from "@/lib/accounting/constants";
import { listAccounts } from "@/lib/accounting/service";
import type { ExactJournalLine, JournalEntry } from "@/lib/accounting/service";
import { JournalComposer } from "@/components/journal/journal-composer";

export const dynamic = "force-dynamic";

export default async function EditJournalPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccountingUser();
  const { id } = await params;
  const client = createAdminClient();
  const [{ data: entry, error }, { data: lines, error: linesError }, accounts] = await Promise.all([
    client.from("accounting_journal_entries").select("*").eq("tenant_id", SCORPBOOK_TENANT_ID).eq("id", id).maybeSingle(),
    client.from("accounting_journal_lines").select("id, tenant_id, entry_id, account_id, description, created_at, debit::text, credit::text").eq("tenant_id", SCORPBOOK_TENANT_ID).eq("entry_id", id),
    listAccounts(),
  ]);
  if (error || linesError || !entry) notFound();
  if (entry.status !== "DRAFT") redirect("/journal");
  const draft = { ...(entry as JournalEntry), lines: (lines ?? []) as ExactJournalLine[] };
  return <main className="mx-auto w-full max-w-7xl px-5 py-8"><div className="space-y-6">
    <div><Link href="/journal" className="text-sm font-medium text-accent">← Back to journal</Link><p className="mt-5 text-sm font-semibold text-accent">JOURNAL DRAFT</p><h1 className="mt-1 text-3xl font-bold">Edit {entry.entry_number}</h1><p className="mt-2 text-sm text-slate-500">Only draft entries can be edited.</p></div>
    <section className="card p-5 sm:p-7"><JournalComposer accounts={accounts} draft={draft} /></section>
  </div></main>;
}
