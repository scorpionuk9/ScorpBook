"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJournalAction, reverseJournalAction } from "@/app/actions/accounting";

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

export function ReverseForm({ entryId, suggestedNumber }: { entryId: string; suggestedNumber: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function reverse(formData: FormData) {
    setBusy(true);
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
      <label className="block text-xs font-medium text-slate-600">Reversal entry number<input className="field mt-1" name="reversal_entry_number" required defaultValue={suggestedNumber} maxLength={50} /></label>
      <label className="block text-xs font-medium text-slate-600">Reversal date<input className="field mt-1" name="reversal_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
      <label className="block text-xs font-medium text-slate-600">Description<input className="field mt-1" name="description" maxLength={2000} placeholder="Defaults to the original entry reference" /></label>
      {message && <p role="status" className={`text-xs ${message.toLowerCase().includes("failed") ? "text-red-700" : "text-emerald-700"}`}>{message}</p>}
      <button className="button w-full" disabled={busy} type="submit">{busy ? "Creating…" : "Confirm reversal and post"}</button>
    </form>
  </details>;
}
