import Link from "next/link";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { listAccounts, listJournalEntries } from "@/lib/accounting/service";
import { ENTRY_STATUS_LABELS } from "@/lib/accounting/constants";
import { PostButton, ReverseForm } from "@/components/journal/journal-operations";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  await requireAccountingUser();
  const [entries, accounts] = await Promise.all([listJournalEntries(), listAccounts()]);
  const names = new Map(accounts.map((account) => [account.id, `${account.code} · ${account.name}`]));
  const reversedIds = new Set(entries.flatMap((entry) => entry.reverses_entry_id ? [entry.reverses_entry_id] : []));
  return <main className="mx-auto w-full max-w-7xl px-5 py-8"><div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-semibold text-accent">GENERAL LEDGER</p><h1 className="mt-1 text-3xl font-bold">Journal</h1><p className="mt-2 text-sm text-slate-500">Showing the latest 100 entries. Posted entries are immutable; create a reversal to correct one.</p></div>
      <Link className="button" href="/journal/new">＋ New entry</Link>
    </div>
    <section className="card overflow-hidden">
      <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Date / Number</th><th className="px-5 py-3">Description</th><th className="px-5 py-3">Source</th><th className="px-5 py-3">Lines</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Actions</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{entries.map((entry) => <tr key={entry.id} className="align-top hover:bg-slate-50/70">
          <td className="whitespace-nowrap px-5 py-4"><div>{entry.entry_date}</div><div className="mt-1 font-mono text-xs text-slate-500">{entry.entry_number}</div></td>
          <td className="max-w-56 px-5 py-4">{entry.description || <span className="text-slate-400">—</span>}{entry.reverses_entry_id && <div className="mt-1 text-xs text-amber-700">Reversal entry</div>}</td>
          <td className="px-5 py-4 text-xs text-slate-600">{entry.source_type}</td>
          <td className="px-5 py-4"><details><summary className="cursor-pointer text-xs font-semibold text-accent">{entry.lines.length} lines</summary><div className="mt-2 space-y-1.5">{entry.lines.map((line) => <div key={line.id} className="grid grid-cols-[minmax(9rem,1fr)_auto_auto] gap-3 text-xs"><span>{names.get(line.account_id) ?? "Unknown account"}</span><span className="text-right tabular-nums">{line.debit !== "0.0000" ? line.debit : "—"}</span><span className="text-right tabular-nums">{line.credit !== "0.0000" ? line.credit : "—"}</span></div>)}</div></details></td>
          <td className="px-5 py-4"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${entry.status === "POSTED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{ENTRY_STATUS_LABELS[entry.status] ?? entry.status}</span></td>
          <td className="px-5 py-4"><div className="flex flex-wrap items-center gap-2">{entry.status === "DRAFT" && <><Link className="button-secondary px-3 py-1.5 text-xs" href={`/journal/${entry.id}/edit`}>Edit</Link><PostButton entryId={entry.id} /></>}{entry.status === "POSTED" && !reversedIds.has(entry.id) && <ReverseForm entryId={entry.id} suggestedNumber={`REV-${entry.entry_number}`} />}{entry.status === "POSTED" && reversedIds.has(entry.id) && <span className="text-xs text-slate-400">Reversed</span>}</div></td>
        </tr>)}
        {!entries.length && <tr><td colSpan={6} className="px-5 py-14 text-center"><p className="font-medium">No journal entries yet</p><p className="mt-1 text-sm text-slate-500">Create your first draft to start recording transactions.</p><Link className="button mt-4" href="/journal/new">New entry</Link></td></tr>}
        </tbody>
      </table></div>
    </section>
  </div></main>;
}
