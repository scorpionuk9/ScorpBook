"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { retryScorpInvoiceEventAction } from "@/app/actions/integrations";

export function RetryEventButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function retry(formData: FormData) {
    setBusy(true);
    const result = await retryScorpInvoiceEventAction(formData);
    setMessage({ ok: result.ok, text: result.message });
    setBusy(false);
    if (result.ok) router.refresh();
  }
  return <form action={retry} className="flex flex-wrap items-center gap-2">
    <input type="hidden" name="id" value={id} />
    <button className="button-secondary px-3 py-1.5 text-xs" disabled={busy} type="submit">{busy ? "Retrying…" : "Try again"}</button>
    {message && <span role="status" className={`text-xs ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</span>}
  </form>;
}
