"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/app/actions/accounting";

// Submits a form to a server action, then navigates on success.
export function SubmitAndGo({ action, fields, label, pendingLabel, to, children }: {
  action: (formData: FormData) => Promise<ActionResult>; fields: Record<string, string>; label: string; pendingLabel: string; to: string; children?: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(formData: FormData) {
    setBusy(true); setMessage(null);
    const result = await action(formData);
    setBusy(false);
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) { router.push(to); router.refresh(); }
  }
  return <form action={submit} className="space-y-4">
    {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    {children}
    {message && <p role="status" className={`rounded-lg p-3 text-sm ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>}
    <button type="submit" className="button" disabled={busy}>{busy ? pendingLabel : label}</button>
  </form>;
}
