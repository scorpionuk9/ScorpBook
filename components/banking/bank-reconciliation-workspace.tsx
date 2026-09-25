"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import type { BankReconciliationDetail } from "@/lib/accounting/service";
import { completeBankReconciliationAction, importBankStatementAction, matchBankStatementLineAction, unmatchBankStatementLineAction } from "@/app/actions/accounting";

type ImportedRow = { transaction_date: string; description: string; reference?: string; amount: string };

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some((cell) => cell.trim()) || rows.length === 0) rows.push(row);
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

function parseDate(value: string): string {
  const input = value.trim();
  let year: string; let month: string; let day: string;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input);
  const uk = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(input);
  if (iso) [, year, month, day] = iso;
  else if (uk) [, day, month, year] = uk;
  else throw new Error(`Unsupported transaction date: ${input}`);
  const result = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const check = new Date(`${result}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== result) throw new Error(`Invalid transaction date: ${input}`);
  return result;
}

function parseAmount(value: string): string {
  let input = value.trim().replace(/^(GBP|USD|EUR|£|\$|€)\s*/i, "").replaceAll(",", "").replaceAll(" ", "");
  if (input.startsWith("(") && input.endsWith(")")) input = `-${input.slice(1, -1)}`;
  if (!/^-?\d{1,11}(?:\.\d{1,4})?$/.test(input)) throw new Error(`Unsupported signed amount: ${value}`);
  return input;
}

function csvRows(source: string): ImportedRow[] {
  const [headerRow, ...dataRows] = parseCsv(source.replace(/^\uFEFF/, ""));
  const headers = headerRow.map((value) => value.trim().toLowerCase().replaceAll("_", " "));
  const dateIndex = headers.findIndex((value) => ["date", "transaction date"].includes(value));
  const descriptionIndex = headers.findIndex((value) => ["description", "details", "narrative"].includes(value));
  const amountIndex = headers.findIndex((value) => ["amount", "signed amount"].includes(value));
  const referenceIndex = headers.findIndex((value) => ["reference", "transaction id", "transaction reference"].includes(value));
  if ([dateIndex, descriptionIndex, amountIndex].some((index) => index < 0)) {
    throw new Error("CSV headers must include Date, Description, and Amount. Reference is optional.");
  }
  return dataRows.map((cells, index) => {
    const description = cells[descriptionIndex]?.trim() ?? "";
    if (!description) throw new Error(`Row ${index + 2} is missing its description.`);
    return {
      transaction_date: parseDate(cells[dateIndex] ?? ""),
      description,
      reference: referenceIndex >= 0 ? cells[referenceIndex]?.trim() || undefined : undefined,
      amount: parseAmount(cells[amountIndex] ?? ""),
    };
  });
}

function signedAmount(debit: string, credit: string): string {
  return new Decimal(debit).minus(credit).toFixed(4);
}

export function BankReconciliationWorkspace({ detail }: { detail: BankReconciliationDetail }) {
  const router = useRouter();
  const { reconciliation, lines, candidates } = detail;
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const matchedCount = lines.filter((line) => line.matched_journal_line_id).length;
  const unmatchedCandidates = candidates.filter((candidate) => !candidate.matched_statement_line_id);
  const statementActivity = useMemo(() => lines.reduce((sum, line) => sum.plus(line.amount), new Decimal(0)), [lines]);
  const statementBalancesAgree = new Decimal(reconciliation.opening_balance).plus(statementActivity).eq(reconciliation.closing_balance);
  const allMatched = lines.length > 0 && matchedCount === lines.length;

  async function importFile(formData: FormData) {
    setBusy(true); setMessage(""); setError(false);
    try {
      const file = formData.get("statement_file");
      if (!(file instanceof File) || !file.size) throw new Error("Choose a CSV bank statement first.");
      if (file.size > 2_000_000) throw new Error("The CSV must be smaller than 2 MB.");
      const rows = csvRows(await file.text());
      const result = await importBankStatementAction(reconciliation.id, rows);
      setMessage(result.message); setError(!result.ok);
      if (result.ok) router.refresh();
    } catch (reason) {
      setError(true); setMessage(reason instanceof Error ? reason.message : "The bank statement could not be imported.");
    } finally { setBusy(false); }
  }

  async function matchLine(statementLineId: string, journalLineId: string) {
    setBusy(true); setMessage(""); setError(false);
    const result = journalLineId
      ? await matchBankStatementLineAction(reconciliation.id, { statement_line_id: statementLineId, journal_line_id: journalLineId })
      : await unmatchBankStatementLineAction(reconciliation.id, { statement_line_id: statementLineId });
    setBusy(false); setMessage(result.message); setError(!result.ok);
    if (result.ok) router.refresh();
  }

  async function complete() {
    setBusy(true); setMessage(""); setError(false);
    const result = await completeBankReconciliationAction(reconciliation.id);
    setBusy(false); setMessage(result.message); setError(!result.ok);
    if (result.ok) router.refresh();
  }

  return <div className="space-y-6">
    <section className="card grid gap-4 p-5 sm:grid-cols-4">
      <div><p className="text-xs text-slate-500">Statement opening</p><p className="mt-1 font-mono text-lg tabular-nums">{reconciliation.opening_balance}</p></div>
      <div><p className="text-xs text-slate-500">Statement activity</p><p className="mt-1 font-mono text-lg tabular-nums">{statementActivity.toFixed(4)}</p></div>
      <div><p className="text-xs text-slate-500">Statement closing</p><p className="mt-1 font-mono text-lg tabular-nums">{reconciliation.closing_balance}</p></div>
      <div><p className="text-xs text-slate-500">Statement lines matched</p><p className="mt-1 font-mono text-lg tabular-nums">{matchedCount} / {lines.length}</p></div>
    </section>

    {!lines.length && reconciliation.status === "IN_PROGRESS" && <section className="card p-5 sm:p-7">
      <h2 className="font-semibold">Import bank statement CSV</h2>
      <p className="mt-1 text-sm text-slate-500">Required headers: <code>Date,Description,Amount</code>. Optional: <code>Reference</code>. Dates may use YYYY-MM-DD or DD/MM/YYYY. Deposits are positive; withdrawals are negative.</p>
      <p className="mt-2 text-xs text-slate-400">Example: <code>2026-09-03,Client payment,125.00,TX-001</code></p>
      <form action={importFile} className="mt-4 flex flex-wrap items-end gap-3"><label className="min-w-64 flex-1 text-xs font-medium text-slate-600">CSV statement<input required name="statement_file" type="file" accept=".csv,text/csv" className="field mt-1.5" /></label><button type="submit" className="button" disabled={busy}>{busy ? "Importing…" : "Import statement"}</button></form>
    </section>}

    {lines.length > 0 && <section className="card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold">Statement matching</h2><p className="mt-1 text-xs text-slate-500">Match each bank transaction to one posted journal line with the same signed amount.</p></div><Link href="/journal/new" className="text-xs font-semibold text-accent">＋ Record missing transaction</Link></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Date / Reference</th><th className="px-4 py-3">Statement transaction</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Matched journal entry</th><th className="px-4 py-3">Match</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{lines.map((line) => {
          const amount = new Decimal(line.amount).toFixed(4);
          const options = candidates.filter((candidate) => signedAmount(candidate.debit, candidate.credit) === amount);
          const matchedCandidate = line.matched_journal_line_id ? candidates.find((candidate) => candidate.id === line.matched_journal_line_id) : undefined;
          return <tr key={line.id} className={line.matched_journal_line_id ? "bg-emerald-50/40" : ""}>
            <td className="whitespace-nowrap px-4 py-3 text-xs">{line.transaction_date}{line.bank_reference && <div className="mt-1 font-mono text-slate-400">{line.bank_reference}</div>}</td>
            <td className="max-w-72 px-4 py-3">{line.description}</td><td className="px-4 py-3 text-right font-mono tabular-nums">{amount}</td>
            <td className="px-4 py-3 text-xs">{matchedCandidate ? <><span className="font-mono font-semibold">{matchedCandidate.entry_number}</span><span className="ml-2 text-slate-500">{matchedCandidate.entry_date} · {matchedCandidate.entry_description || matchedCandidate.description}</span></> : <span className="text-amber-700">Unmatched</span>}</td>
            <td className="px-4 py-3">{reconciliation.status === "IN_PROGRESS" ? <select className="field min-w-64 text-xs" value={line.matched_journal_line_id ?? ""} disabled={busy} onChange={(event) => void matchLine(line.id, event.target.value)}><option value="">Unmatched</option>{options.map((candidate) => <option key={candidate.id} value={candidate.id} disabled={Boolean(candidate.matched_statement_line_id && candidate.matched_statement_line_id !== line.id)}>{candidate.entry_number} · {candidate.entry_date} · {candidate.entry_description || candidate.description || "Journal line"}{candidate.matched_statement_line_id && candidate.matched_statement_line_id !== line.id ? " (already matched)" : ""}</option>)}</select> : <span className="text-xs text-slate-500">{line.matched_journal_line_id ? "Matched" : "Unmatched"}</span>}</td>
          </tr>;
        })}</tbody></table></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4"><div className="space-y-1 text-xs"><p className={statementBalancesAgree ? "text-emerald-700" : "text-amber-800"}>{statementBalancesAgree ? "Statement opening + activity equals closing." : "Statement opening + activity does not equal closing."}</p><p className={unmatchedCandidates.length ? "text-amber-800" : "text-emerald-700"}>{unmatchedCandidates.length ? `${unmatchedCandidates.length} posted bank journal line(s) still need a statement match.` : "All posted bank journal lines in this period are matched."}</p></div>
        {reconciliation.status === "IN_PROGRESS" && <button className="button" type="button" disabled={busy || !allMatched || !statementBalancesAgree || unmatchedCandidates.length > 0} onClick={() => void complete()}>{busy ? "Completing…" : "Complete reconciliation"}</button>}
      </div>
    </section>}
    {message && <p role="status" className={`text-sm ${error ? "text-red-700" : "text-emerald-700"}`}>{message}</p>}
  </div>;
}
