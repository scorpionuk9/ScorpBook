"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCompanyAction, updateCompanyAction } from "@/app/actions/company";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type CompanyFormValues = { name: string; business_type: "LIMITED_COMPANY" | "SOLE_TRADER"; vat_registered: boolean; vat_number: string; year_end_month: number; year_end_day: number };

export function CompanyForm({ initial, mode, next = "/dashboard", readOnly = false }: { initial: CompanyFormValues; mode: "create" | "edit"; next?: string; readOnly?: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<CompanyFormValues>) => setValues({ ...values, ...patch });
  const soleTrader = values.business_type === "SOLE_TRADER";

  async function submit(formData: FormData) {
    setBusy(true); setMessage(null);
    const result = mode === "create" ? await createCompanyAction(formData) : await updateCompanyAction(formData);
    setBusy(false);
    if (!result.ok) { setMessage({ ok: false, text: result.message }); return; }
    if (mode === "create") { router.push(next); router.refresh(); } else { setMessage({ ok: true, text: "Saved." }); router.refresh(); }
  }

  return <form action={submit} className="space-y-5">
    <fieldset disabled={readOnly || mode === "edit"} className="space-y-2">
      <legend className="text-sm font-semibold text-slate-700">What kind of business is it?</legend>
      <div className="grid gap-2 sm:grid-cols-2">{([
        ["SOLE_TRADER", "Sole trader", "You work for yourself and file a Self Assessment tax return."],
        ["LIMITED_COMPANY", "Limited company", "Registered at Companies House, with its own Corporation Tax."],
      ] as const).map(([value, label, hint]) => <label key={value} className={`cursor-pointer rounded-lg border p-3 text-sm ${values.business_type === value ? "border-accent bg-emerald-50" : "border-slate-200 hover:bg-slate-50"} ${mode === "edit" ? "cursor-default opacity-80" : ""}`}>
        <input type="radio" name="business_type" value={value} className="sr-only" checked={values.business_type === value} onChange={() => set({ business_type: value })} />
        <span className="block font-semibold">{label}</span><span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
      </label>)}</div>
      {mode === "edit" && <p className="text-xs text-slate-500">The business type sets up your categories, so it can&apos;t be changed later. If you&apos;ve incorporated, add the company as a new business.</p>}
    </fieldset>

    <label className="block text-sm font-semibold text-slate-700">{soleTrader ? "Trading name (or your name)" : "Company name"}
      <input name="name" required maxLength={150} disabled={readOnly} className="field mt-1.5" value={values.name} onChange={(event) => set({ name: event.target.value })} placeholder={soleTrader ? "e.g. Jo Smith Plumbing" : "e.g. Acme Services Ltd"} /></label>

    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-slate-700">When does your financial year end?</p>
      <div className="flex gap-2">
        <select name="year_end_day" disabled={readOnly} className="field w-24" value={values.year_end_day} onChange={(event) => set({ year_end_day: Number(event.target.value) })}>
          {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}
        </select>
        <select name="year_end_month" disabled={readOnly} className="field" value={values.year_end_month} onChange={(event) => set({ year_end_month: Number(event.target.value) })}>
          {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
        </select>
      </div>
      <p className="text-xs text-slate-500">{soleTrader ? "Most sole traders use 5 April (the tax year end)." : "Your accounting reference date, shown on Companies House."}</p>
    </div>

    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" name="vat_registered" disabled={readOnly} className="mt-1" checked={values.vat_registered} onChange={(event) => set({ vat_registered: event.target.checked })} />
      <span><span className="font-semibold">Registered for VAT</span><span className="block text-xs text-slate-500">Turns on VAT fields and the VAT return. You can change this later.</span></span>
    </label>

    {values.vat_registered && <label className="block text-sm font-semibold text-slate-700">VAT registration number
      <input name="vat_number" disabled={readOnly} inputMode="text" autoComplete="off" maxLength={20} className="field mt-1.5 max-w-xs" placeholder="GB 123 4567 89" value={values.vat_number} onChange={(event) => set({ vat_number: event.target.value })} />
      <span className="mt-1 block text-xs font-normal text-slate-500">On your VAT registration certificate. Needed to send VAT returns to HMRC; you can add it later.</span>
    </label>}

    {message && <p role="status" className={`rounded-lg p-3 text-sm ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>}
    {!readOnly && <button type="submit" className="button" disabled={busy}>{busy ? "Saving…" : mode === "create" ? "Set up my books" : "Save changes"}</button>}
  </form>;
}
