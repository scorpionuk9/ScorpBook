"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkFraudHeadersAction, disconnectHmrcAction, loadVatObligationsAction, previewVatReturnAction, submitVatReturnAction } from "@/app/actions/hmrc";
import { collectClientInfo } from "@/components/hmrc/client-info";
import type { VatBoxes } from "@/lib/accounting/service";
import type { VatObligation, VatReceipt } from "@/lib/hmrc/vat";
import { formatMoney } from "@/lib/ui/format";

const BOX_LABELS: Array<[keyof VatBoxes, string, boolean]> = [
  ["box1", "VAT due on sales", false], ["box2", "VAT due on EU acquisitions", false], ["box3", "Total VAT due", false],
  ["box4", "VAT reclaimed on purchases", false], ["box5", "Net VAT to pay or reclaim", false], ["box6", "Total sales excluding VAT", true],
  ["box7", "Total purchases excluding VAT", true], ["box8", "Goods supplied to the EU", true], ["box9", "Goods acquired from the EU", true],
];

const DECLARATION = "When you submit this VAT information you are making a legal declaration that the information is true and complete. A false declaration can result in prosecution.";
const date = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function MtdVatPanel({ connected, sandbox, canSubmit, isOwner, status }: { connected: boolean; sandbox: boolean; canSubmit: boolean; isOwner: boolean; status: string | null }) {
  const router = useRouter();
  const [obligations, setObligations] = useState<VatObligation[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<VatObligation | null>(null);
  const [boxes, setBoxes] = useState<VatBoxes | null>(null);
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{ receipt: VatReceipt; boxes: VatBoxes; period: VatObligation } | null>(null);
  const [headerCheck, setHeaderCheck] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    const result = await loadVatObligationsAction(collectClientInfo());
    if (result.ok) setObligations(result.data); else setError(result.message);
  }, []);

  useEffect(() => { if (connected && canSubmit) void load(); }, [connected, canSubmit, load]);

  async function prepare(obligation: VatObligation) {
    setSelected(obligation); setBoxes(null); setDeclared(false); setError("");
    const result = await previewVatReturnAction(obligation.start, obligation.end);
    if (result.ok) setBoxes(result.data); else setError(result.message);
  }

  async function submit() {
    if (!selected) return;
    setBusy(true); setError("");
    const result = await submitVatReturnAction({ clientInfo: collectClientInfo(), periodKey: selected.periodKey, declared });
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setReceipt({ ...result.data, period: selected });
    setSelected(null); setBoxes(null);
    await load();
    router.refresh();
  }

  async function checkHeaders() {
    setHeaderCheck("Checking…");
    const result = await checkFraudHeadersAction(collectClientInfo());
    setHeaderCheck(JSON.stringify(result.ok ? result.data : result.message, null, 2));
  }

  async function disconnect() {
    if (!window.confirm("Disconnect from HMRC? You'll need to sign in to HMRC again to send returns.")) return;
    const result = await disconnectHmrcAction();
    if (result.ok) router.refresh(); else setError(result.message);
  }

  return <section className="card space-y-4 p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">Send to HMRC {sandbox && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">HMRC sandbox (test)</span>}</h2>
        <p className="mt-1 text-sm text-slate-500">ScorpBook gets your VAT periods from HMRC and submits returns directly (Making Tax Digital).</p>
      </div>
      {connected && isOwner && <button type="button" className="text-xs font-medium text-slate-500 hover:text-red-700" onClick={() => void disconnect()}>Disconnect HMRC</button>}
    </div>

    {status === "connected" && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">✓ Connected to HMRC.</p>}
    {status === "declined" && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">You didn&apos;t give ScorpBook permission at HMRC, so nothing was connected.</p>}
    {status === "error" && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Connecting to HMRC didn&apos;t work. Please try again.</p>}

    {!canSubmit ? <p className="text-sm text-slate-500">Only an Owner or Accountant can send VAT returns.</p>
      : !connected ? <div className="space-y-2">
        <p className="text-sm">You&apos;ll sign in at HMRC with the Government Gateway user ID for this VAT number, then give ScorpBook permission. Connections last 18 months.</p>
        <a href="/integrations/hmrc/connect" className="button">Connect to HMRC</a>
      </div>
      : <>
        {obligations === null && !error && <p className="text-sm text-slate-500">Getting your VAT periods from HMRC…</p>}
        {obligations && !obligations.length && <p className="text-sm text-slate-500">HMRC has no VAT periods for this business yet.</p>}
        {obligations && obligations.length > 0 && <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">{obligations.map((item) =>
          <li key={item.periodKey} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span>{date(item.start)} – {date(item.end)} <span className="ml-1 text-xs text-slate-500">due {date(item.due)}</span></span>
            {item.status === "F" ? <span className="text-xs font-medium text-emerald-700">✓ Submitted{item.received ? ` ${date(item.received)}` : ""}</span>
              : <button type="button" className="button-secondary px-3 py-1.5 text-xs" onClick={() => void prepare(item)}>Prepare return</button>}
          </li>)}</ul>}

        {selected && <div className="space-y-4 rounded-lg bg-slate-50 p-4">
          <p className="font-semibold">VAT return for {date(selected.start)} – {date(selected.end)}</p>
          {!boxes ? <p className="text-sm text-slate-500">Working out your figures…</p> : <>
            <ul className="divide-y divide-slate-200 text-sm">{BOX_LABELS.map(([key, label, whole]) =>
              <li key={key} className={`flex justify-between gap-3 py-1.5 ${key === "box5" ? "font-semibold" : ""}`}><span><span className="mr-2 text-xs font-bold text-slate-500">Box {key.slice(3)}</span>{label}</span><span className="tabular-nums">{whole ? `£${Number(boxes[key]).toLocaleString("en-GB")}` : formatMoney(boxes[key])}</span></li>)}</ul>
            <p className="text-xs text-slate-500">Check these against your records. <Link href={`/reports/vat-return?start=${selected.start}&end=${selected.end}`} className="text-accent">See how they&apos;re worked out</Link></p>
            <label className="flex items-start gap-3 rounded-lg border border-slate-300 bg-white p-3 text-sm">
              <input type="checkbox" className="mt-1" checked={declared} onChange={(event) => setDeclared(event.target.checked)} />
              <span>{DECLARATION}</span>
            </label>
            <div className="flex gap-2">
              <button type="button" className="button" disabled={!declared || busy} onClick={() => void submit()}>{busy ? "Sending to HMRC…" : "Submit VAT return"}</button>
              <button type="button" className="button-secondary" disabled={busy} onClick={() => setSelected(null)}>Cancel</button>
            </div>
          </>}
        </div>}

        {receipt && <div className="space-y-1 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">✓ HMRC received your VAT return for {date(receipt.period.start)} – {date(receipt.period.end)}</p>
          <p>Form bundle number: <strong>{receipt.receipt.formBundleNumber}</strong> · Processed {new Date(receipt.receipt.processingDate).toLocaleString("en-GB", { timeZone: "Europe/London" })}</p>
          {receipt.receipt.chargeRefNumber && <p>Payment reference: <strong>{receipt.receipt.chargeRefNumber}</strong></p>}
          <p className="text-xs">ScorpBook has saved this receipt with the return.</p>
        </div>}
      </>}

    {error && <div role="alert" className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"><p>{error}</p>
      {connected && /connect to HMRC again/i.test(error) && <a href="/integrations/hmrc/connect" className="button">Connect to HMRC again</a>}</div>}

    {sandbox && connected && canSubmit && <details className="text-xs text-slate-500">
      <summary className="cursor-pointer">Developer: check fraud prevention headers</summary>
      <button type="button" className="button-secondary mt-2 px-3 py-1.5 text-xs" onClick={() => void checkHeaders()}>Run HMRC header check</button>
      {headerCheck && <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900 p-3 text-[11px] text-slate-100">{headerCheck}</pre>}
    </details>}
  </section>;
}
