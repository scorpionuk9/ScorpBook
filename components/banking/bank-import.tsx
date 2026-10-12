"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { importBankFeedAction } from "@/app/actions/banking";
import { detectColumns, mappingProblem, parseCsv, statementRows, type ColumnMapping, type StatementRow } from "@/lib/banking/csv";
import { formatMoney } from "@/lib/ui/format";

type MoneyAccount = { id: string; name: string };

const FIELDS: Array<{ key: keyof ColumnMapping; label: string; optional?: boolean }> = [
  { key: "date", label: "Date" },
  { key: "description", label: "Description" },
  { key: "amount", label: "Amount (+ in / − out)", optional: true },
  { key: "paidIn", label: "…or Money in", optional: true },
  { key: "paidOut", label: "…and Money out", optional: true },
  { key: "reference", label: "Reference", optional: true },
];

export function BankImport({ accounts, defaultAccountId }: { accounts: MoneyAccount[]; defaultAccountId: string }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  let preview: StatementRow[] = [];
  let previewError = "";
  if (mapping) {
    try { preview = statementRows(dataRows, mapping); } catch (error) { previewError = error instanceof Error ? error.message : "The file could not be read."; }
  }

  async function chooseFile(file: File | undefined) {
    setMessage(null);
    setMapping(null);
    if (!file) return;
    if (file.size > 2_000_000) { setMessage({ ok: false, text: "The file must be smaller than 2 MB." }); return; }
    try {
      const [headerRow, ...rows] = parseCsv((await file.text()).replace(/^﻿/, ""));
      if (!headerRow || !rows.length) throw new Error("The file has no transactions.");
      setFileName(file.name);
      setHeaders(headerRow);
      setDataRows(rows);
      setMapping(detectColumns(headerRow));
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "The file could not be read." });
    }
  }

  async function importRows() {
    if (!preview.length) return;
    setBusy(true);
    const result = await importBankFeedAction({ bank_account_id: accountId, rows: preview });
    setBusy(false);
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) { setMapping(null); setFileName(""); router.refresh(); }
  }

  return <section className="card space-y-4 p-5">
    <div><h2 className="font-semibold">Upload a bank statement</h2>
      <p className="mt-1 text-sm text-slate-500">Download a CSV from your online banking (most UK banks call it &quot;Export&quot; or &quot;Download transactions&quot;) and upload it here. Transactions you&apos;ve already uploaded are skipped automatically.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold text-slate-700">Which account is this statement for?
        <select className="field mt-1.5" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select></label>
      <label className="text-sm font-semibold text-slate-700">CSV file
        <input type="file" accept=".csv,text/csv" className="field mt-1.5" onChange={(event) => void chooseFile(event.target.files?.[0])} /></label>
    </div>

    {mapping && <div className="space-y-3 rounded-lg bg-slate-50 p-4">
      <p className="text-sm font-semibold">Check the columns in {fileName}</p>
      <div className="grid gap-2 sm:grid-cols-3">{FIELDS.map((field) =>
        <label key={field.key} className="text-xs font-medium text-slate-600">{field.label}
          <select className="field mt-1" value={mapping[field.key]} onChange={(event) => setMapping({ ...mapping, [field.key]: Number(event.target.value) })}>
            <option value={-1}>{field.optional ? "— not used —" : "Choose…"}</option>
            {headers.map((header, index) => <option key={index} value={index}>{header || `Column ${index + 1}`}</option>)}
          </select></label>)}
      </div>
      {mappingProblem(mapping) || previewError
        ? <p className="text-sm text-red-700">{mappingProblem(mapping) ?? previewError}</p>
        : <>
          <table className="w-full text-left text-xs"><tbody className="divide-y divide-slate-200">{preview.slice(0, 5).map((row) =>
            <tr key={row.fingerprint}><td className="py-1.5 pr-3 whitespace-nowrap">{row.transaction_date}</td><td className="py-1.5 pr-3">{row.description}</td><td className={`py-1.5 text-right tabular-nums ${row.amount.startsWith("-") ? "text-slate-700" : "text-emerald-700"}`}>{formatMoney(row.amount)}</td></tr>)}
          </tbody></table>
          <p className="text-xs text-slate-500">{preview.length} transaction{preview.length === 1 ? "" : "s"} found{preview.length > 5 ? " (first 5 shown)" : ""}. Money coming in should be positive.</p>
          <button type="button" className="button" disabled={busy} onClick={() => void importRows()}>{busy ? "Importing…" : `Import ${preview.length} transaction${preview.length === 1 ? "" : "s"}`}</button>
        </>}
    </div>}
    {message && <p role="status" className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p>}
  </section>;
}
