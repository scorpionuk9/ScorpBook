"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import type { Account, ExactJournalLine, JournalEntry } from "@/lib/accounting/service";
import { ENTRY_SOURCES } from "@/lib/accounting/constants";
import { saveDraftAction } from "@/app/actions/accounting";

type DraftEntry = JournalEntry & { lines: ExactJournalLine[] };
type DraftLine = { account_id: string; description: string; debit: string; credit: string };
const today = new Date().toISOString().slice(0, 10);

export function JournalComposer({ accounts, draft }: { accounts: Account[]; draft?: DraftEntry }) {
  const router = useRouter();
  const [lines, setLines] = useState<DraftLine[]>(draft?.lines.map((line) => ({
    account_id: line.account_id,
    description: line.description ?? "",
    debit: line.debit,
    credit: line.credit,
  })) ?? [emptyLine(), emptyLine()]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function emptyLine(): DraftLine { return { account_id: accounts[0]?.id ?? "", description: "", debit: "0", credit: "0" }; }
  const totals = useMemo(() => lines.reduce((acc, line) => ({
    debit: acc.debit.plus(line.debit || "0"),
    credit: acc.credit.plus(line.credit || "0"),
  }), { debit: new Decimal(0), credit: new Decimal(0) }), [lines]);
  const balanced = totals.debit.gt(0) && totals.debit.eq(totals.credit);

  function updateLine(index: number, key: keyof DraftLine, value: string) {
    setLines((current) => current.map((line, i) => i === index ? {
      ...line,
      [key]: value,
      ...(key === "debit" && new Decimal(value || "0").gt(0) ? { credit: "0" } : {}),
      ...(key === "credit" && new Decimal(value || "0").gt(0) ? { debit: "0" } : {}),
    } : line));
  }

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    const result = await saveDraftAction({
      entry_id: draft?.id,
      entry_number: String(formData.get("entry_number") || ""),
      entry_date: String(formData.get("entry_date") || ""),
      description: String(formData.get("description") || ""),
      source_type: String(formData.get("source_type") || "MANUAL"),
      lines: lines.map((line) => ({ ...line, description: line.description || undefined })),
    });
    setMessage(result.message);
    setBusy(false);
    if (result.ok) router.refresh();
  }

  return <form action={submit} className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-semibold text-slate-600">憑證編號<input required name="entry_number" maxLength={50} className="field mt-1.5" defaultValue={draft?.entry_number} placeholder="例如 JE-2026-001" /></label>
      <label className="text-xs font-semibold text-slate-600">日期<input required type="date" name="entry_date" className="field mt-1.5" defaultValue={draft?.entry_date ?? today} /></label>
      <label className="text-xs font-semibold text-slate-600">來源<select name="source_type" className="field mt-1.5" defaultValue={draft?.source_type ?? "MANUAL"}>{ENTRY_SOURCES.map((source) => <option key={source} value={source}>{source}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-600">摘要<input name="description" maxLength={2000} className="field mt-1.5" defaultValue={draft?.description ?? ""} placeholder="分錄說明" /></label>
    </div>
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-3">科目</th><th className="px-3 py-3">明細說明</th><th className="px-3 py-3 text-right">借方</th><th className="px-3 py-3 text-right">貸方</th><th className="w-12" /></tr></thead>
        <tbody className="divide-y divide-slate-100">{lines.map((line, index) => <tr key={index}>
          <td className="px-3 py-2"><select required className="field min-w-52" value={line.account_id} onChange={(e) => updateLine(index, "account_id", e.target.value)}><option value="">選擇科目</option>{accounts.filter((account) => account.is_active).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></td>
          <td className="px-3 py-2"><input className="field min-w-40" value={line.description} onChange={(e) => updateLine(index, "description", e.target.value)} placeholder="可留空" maxLength={500} /></td>
          <td className="px-3 py-2"><input className="field min-w-32 text-right tabular-nums" type="number" min="0" step="0.0001" value={line.debit} onChange={(e) => updateLine(index, "debit", e.target.value)} /></td>
          <td className="px-3 py-2"><input className="field min-w-32 text-right tabular-nums" type="number" min="0" step="0.0001" value={line.credit} onChange={(e) => updateLine(index, "credit", e.target.value)} /></td>
          <td className="px-2 py-2"><button type="button" className="text-slate-400 hover:text-red-600" aria-label="刪除分錄行" disabled={lines.length <= 2} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>×</button></td>
        </tr>)}</tbody>
        <tfoot className="bg-slate-50 font-semibold"><tr><td className="px-3 py-3" colSpan={2}>合計</td><td className="px-3 py-3 text-right tabular-nums">{totals.debit.toFixed(4)}</td><td className="px-3 py-3 text-right tabular-nums">{totals.credit.toFixed(4)}</td><td /></tr></tfoot>
      </table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><button type="button" className="button-secondary" onClick={() => setLines((current) => [...current, emptyLine()])}>＋ 新增分錄行</button><span className={`text-xs font-medium ${balanced ? "text-emerald-700" : "text-amber-700"}`}>{balanced ? "借貸平衡" : "草稿未平衡；過帳前必須平衡"}</span></div>
      <div className="flex items-center gap-3"><button type="button" className="button-secondary" onClick={() => router.push("/journal")}>取消</button><button disabled={busy || accounts.filter((a) => a.is_active).length === 0} className="button" type="submit">{busy ? "儲存中…" : draft ? "更新草稿" : "儲存草稿"}</button></div>
    </div>
    {message && <p role="status" className={`text-sm ${message.includes("失敗") || message.includes("錯誤") ? "text-red-700" : "text-emerald-700"}`}>{message}</p>}
  </form>;
}
