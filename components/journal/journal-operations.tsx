"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { postJournalAction, reverseJournalAction, suggestEntryNumberAction } from "@/app/actions/accounting";

export function PostButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function post(formData: FormData) {
    setBusy(true);
    const result = await postJournalAction(formData);
    setMessage(result.message);
    setBusy(false);
    if (result.ok) router.refresh();
  }
  return <form action={post} className="flex items-center gap-2">
    <input type="hidden" name="entry_id" value={entryId} />
    <button className="button px-3 py-1.5 text-xs" disabled={busy} type="submit">{busy ? "Processing…" : "Post"}</button>
    {message && <span role="status" className="text-xs text-red-700">{message}</span>}
  </form>;
}

export function ReverseForm({ entryId, suggestedNumber, initialDate }: { entryId: string; suggestedNumber: string; initialDate: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reversalDate, setReversalDate] = useState(initialDate);
  const [entryNumber, setEntryNumber] = useState(suggestedNumber);
  const [currentSuggestion, setCurrentSuggestion] = useState(suggestedNumber);
  const [useAutomaticNumber, setUseAutomaticNumber] = useState(true);
  const suggestionRequest = useRef(0);

  async function changeReversalDate(value: string) {
    setReversalDate(value);
    if (!useAutomaticNumber || !value) return;
    const requestId = ++suggestionRequest.current;
    const result = await suggestEntryNumberAction(value);
    if (requestId !== suggestionRequest.current) return;
    if (result.ok && result.entry_number) {
      setCurrentSuggestion(result.entry_number);
      setEntryNumber(result.entry_number);
    } else {
      setMessage(result.message);
    }
  }

  async function reverse(formData: FormData) {
    setBusy(true);
    formData.set("reversal_entry_number", useAutomaticNumber ? "" : entryNumber);
    formData.set("reversal_date", reversalDate);
    const result = await reverseJournalAction(formData);
    setMessage(result.message);
    setBusy(false);
    if (result.ok) router.refresh();
  }
  return <details className="relative">
    <summary className="button-secondary cursor-pointer px-3 py-1.5 text-xs">Reverse</summary>
    <form action={reverse} className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xl">
      <input type="hidden" name="entry_id" value={entryId} />
      <p className="text-sm font-semibold">Create reversing entry</p>
      <label className="block text-xs font-medium text-slate-600">Reversal entry number<input className="field mt-1" name="reversal_entry_number" required value={entryNumber} onChange={(event) => { setEntryNumber(event.target.value); setUseAutomaticNumber(event.target.value === currentSuggestion); }} maxLength={50} /><span className="mt-1 block font-normal text-slate-400">{useAutomaticNumber ? "Suggested; finalized when saved. You can edit it." : "Custom entry number."}</span></label>
      <label className="block text-xs font-medium text-slate-600">Reversal date<input className="field mt-1" name="reversal_date" type="date" required value={reversalDate} onChange={(event) => void changeReversalDate(event.target.value)} /></label>
      <label className="block text-xs font-medium text-slate-600">Description<input className="field mt-1" name="description" maxLength={2000} placeholder="Defaults to the original entry reference" /></label>
      {message && <p role="status" className={`text-xs ${message.toLowerCase().includes("failed") ? "text-red-700" : "text-emerald-700"}`}>{message}</p>}
      <button className="button w-full" disabled={busy} type="submit">{busy ? "Creating…" : "Confirm reversal and post"}</button>
    </form>
  </details>;
}
