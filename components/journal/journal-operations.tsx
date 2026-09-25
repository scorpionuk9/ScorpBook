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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);
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
      setHasError(true);
      setMessage(result.message);
    }
  }

  async function reverse(formData: FormData) {
    setBusy(true);
    setMessage("");
    setHasError(false);
    formData.set("reversal_entry_number", useAutomaticNumber ? "" : entryNumber);
    formData.set("reversal_date", reversalDate);
    try {
      const result = await reverseJournalAction(formData);
      setMessage(result.message);
      setHasError(!result.ok);
      if (result.ok) {
        dialogRef.current?.close();
        router.refresh();
      }
    } catch {
      setHasError(true);
      setMessage("The reversal could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return <>
    <button type="button" className="button-secondary px-3 py-1.5 text-xs" onClick={() => { setMessage(""); setHasError(false); dialogRef.current?.showModal(); }}>Reverse</button>
    <dialog ref={dialogRef} aria-labelledby={`reverse-title-${entryId}`} className="fixed inset-0 m-auto w-[min(28rem,calc(100%-2rem))] max-w-none rounded-xl border border-slate-200 bg-white p-0 text-left shadow-2xl backdrop:bg-slate-900/40">
    <form action={reverse} className="space-y-4 p-5">
      <input type="hidden" name="entry_id" value={entryId} />
      <h2 id={`reverse-title-${entryId}`} className="text-base font-semibold">Create reversing entry</h2>
      <label className="block text-xs font-medium text-slate-600">Reversal entry number<input className="field mt-1" name="reversal_entry_number" required value={entryNumber} onChange={(event) => { setEntryNumber(event.target.value); setUseAutomaticNumber(event.target.value === currentSuggestion); }} maxLength={50} /><span className="mt-1 block font-normal text-slate-400">{useAutomaticNumber ? "Suggested; finalized when saved. You can edit it." : "Custom entry number."}</span></label>
      <label className="block text-xs font-medium text-slate-600">Reversal date<input className="field mt-1" name="reversal_date" type="date" required value={reversalDate} onChange={(event) => void changeReversalDate(event.target.value)} /></label>
      <label className="block text-xs font-medium text-slate-600">Description<input className="field mt-1" name="description" maxLength={2000} placeholder="Defaults to the original entry reference" /></label>
      {message && <p role="status" className={`text-xs ${hasError ? "text-red-700" : "text-emerald-700"}`}>{message}</p>}
      <div className="flex justify-end gap-2"><button type="button" className="button-secondary" disabled={busy} onClick={() => dialogRef.current?.close()}>Cancel</button><button className="button" disabled={busy} type="submit">{busy ? "Creating…" : "Confirm reversal and post"}</button></div>
    </form>
    </dialog>
  </>;
}
