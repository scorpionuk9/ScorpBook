"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Account } from "@/lib/accounting/service";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from "@/lib/accounting/constants";
import { saveAccountAction } from "@/app/actions/accounting";

export function AccountForm({ account }: { account?: Account }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    const result = await saveAccountAction(formData);
    setMessage(result.message);
    setBusy(false);
    if (result.ok) router.refresh();
  }

  return <form action={submit} className="space-y-3">
    {account && <input type="hidden" name="id" value={account.id} />}
    <label className="block text-xs font-medium text-slate-600">Account code<input className="field mt-1" name="code" required maxLength={20} defaultValue={account?.code} readOnly={Boolean(account)} /></label>
    <label className="block text-xs font-medium text-slate-600">Account name<input className="field mt-1" name="name" required maxLength={100} defaultValue={account?.name} /></label>
    <label className="block text-xs font-medium text-slate-600">Type<select className="field mt-1" name="type" defaultValue={account?.type ?? "EXPENSE"} disabled={Boolean(account)}>{ACCOUNT_TYPES.map((type) => <option key={type} value={type}>{ACCOUNT_TYPE_LABELS[type]}</option>)}</select></label>
    {account && <input type="hidden" name="type" value={account.type} />}
    <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="is_active" defaultChecked={account?.is_active ?? true} />Active</label>
    {message && <p role="status" className={`text-xs ${message.toLowerCase().includes("failed") || message.includes("cannot") ? "text-red-700" : "text-emerald-700"}`}>{message}</p>}
    <button disabled={busy} className="button w-full" type="submit">{busy ? "Saving…" : account ? "Save changes" : "Add account"}</button>
  </form>;
}
