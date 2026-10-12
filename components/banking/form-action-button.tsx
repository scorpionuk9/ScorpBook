"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/app/actions/accounting";

// A small button that submits hidden fields to a server action and refreshes on success.
export function FormActionButton({ action, fields, label, pendingLabel, className = "button-secondary px-3 py-1.5 text-xs" }: {
  action: (formData: FormData) => Promise<ActionResult>; fields: Record<string, string>; label: string; pendingLabel?: string; className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(formData: FormData) {
    setBusy(true); setError("");
    const result = await action(formData);
    setBusy(false);
    if (result.ok) router.refresh(); else setError(result.message);
  }
  return <form action={submit} className="inline-flex items-center gap-2">
    {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <button type="submit" className={className} disabled={busy}>{busy ? pendingLabel ?? "Working…" : label}</button>
    {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
  </form>;
}
