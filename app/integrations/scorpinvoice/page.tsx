import Link from "next/link";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { listScorpInvoiceEvents } from "@/lib/integrations/scorpinvoice";
import { getViewMode } from "@/lib/ui/view-mode-server";
import { formatMoney } from "@/lib/ui/format";
import { RetryEventButton } from "@/components/integrations/retry-event-button";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  PROCESSED: "bg-emerald-50 text-emerald-700",
  STALE: "bg-slate-100 text-slate-500",
  NEEDS_ATTENTION: "bg-red-50 text-red-700",
};

function describe(payload: unknown): string {
  const snapshot = (payload ?? {}) as Record<string, unknown>;
  if (snapshot.type === "invoice") {
    const amount = typeof snapshot.amount_gbp_pence === "number" ? ` · ${formatMoney(snapshot.amount_gbp_pence / 100)}` : "";
    return `Invoice ${snapshot.number ?? ""}${snapshot.client_name ? ` to ${snapshot.client_name}` : ""} · ${String(snapshot.status ?? "").replace("_", " ")}${amount}`;
  }
  if (snapshot.type === "expense") {
    const amount = typeof snapshot.amount_pence === "number" ? ` · ${formatMoney(snapshot.amount_pence / 100)}` : "";
    return `Expense${snapshot.description ? `: ${snapshot.description}` : ""}${snapshot.deleted ? " · deleted" : amount}`;
  }
  return "Unknown update";
}

export default async function ScorpInvoiceSyncPage() {
  await requireAccountingUser();
  const simple = (await getViewMode()) === "simple";
  const configured = Boolean(process.env.SCORPINVOICE_WEBHOOK_SECRET);
  const events = await listScorpInvoiceEvents();
  const failing = events.filter((event) => event.status === "NEEDS_ATTENTION");
  return <main className="mx-auto w-full max-w-6xl px-5 py-8"><div className="space-y-6">
    <div><Link href="/dashboard" className="text-sm font-medium text-accent">← Home</Link><p className="mt-5 text-sm font-semibold text-accent">CONNECTIONS</p><h1 className="mt-1 text-3xl font-bold">ScorpInvoice sync</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-500">Invoices you send, payments you receive and expenses you log in ScorpInvoice are recorded here automatically, usually within a few minutes. Draft invoices and quotes aren&apos;t recorded until they&apos;re sent.</p></div>

    <section className="card p-5 text-sm">
      <p className="font-semibold">{configured ? "✓ Ready to receive updates from ScorpInvoice" : "Not set up yet"}</p>
      <p className="mt-1 text-slate-500">{configured
        ? "Updates are signed by ScorpInvoice and checked before anything is recorded."
        : "Set SCORPINVOICE_WEBHOOK_SECRET on this server and the same secret in ScorpInvoice to turn on syncing."}</p>
      {!simple && <dl className="mt-3 grid gap-1 text-xs text-slate-600 sm:grid-cols-[10rem_1fr]">
        <dt className="font-semibold">Webhook path</dt><dd className="font-mono">/api/integrations/scorpinvoice</dd>
        <dt className="font-semibold">Invoice sent</dt><dd>Debit Accounts Receivable, credit Sales</dd>
        <dt className="font-semibold">Invoice paid</dt><dd>Debit Stripe / GoCardless clearing (or bank for manual payments), credit Accounts Receivable</dd>
        <dt className="font-semibold">Bad debt / void</dt><dd>Write-off to Bad Debts / reversal of the original entries</dd>
        <dt className="font-semibold">Expense</dt><dd>Debit the mapped cost account, credit the company bank account</dd>
      </dl>}
    </section>

    {failing.length > 0 && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{failing.length} update{failing.length === 1 ? "" : "s"} couldn&apos;t be recorded. Fix the problem described below (for example a missing account), then try again.</p>}

    <section className="card overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Recent updates</h2></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Received</th><th className="px-5 py-3">What changed</th><th className="px-5 py-3">Result</th><th className="px-5 py-3" /></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {events.map((event) => <tr key={event.id} className="align-top">
            <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-500">{new Date(event.updated_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })}</td>
            <td className="px-5 py-3">{describe(event.payload)}{event.error && <p className="mt-1 text-xs text-red-700">{event.error}</p>}</td>
            <td className="px-5 py-3"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[event.status] ?? ""}`}>{event.status === "PROCESSED" ? "Recorded" : event.status === "STALE" ? "Superseded" : "Needs attention"}</span></td>
            <td className="px-5 py-3">{event.status === "NEEDS_ATTENTION" && <RetryEventButton id={event.id} />}</td>
          </tr>)}
          {!events.length && <tr><td colSpan={4} className="px-5 py-12 text-center text-slate-500">No updates received from ScorpInvoice yet.</td></tr>}
        </tbody>
      </table></div>
    </section>
  </div></main>;
}
