import Link from "next/link";
import { z } from "zod";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { getVatReturn, listFiledVatReturns } from "@/lib/accounting/service";
import { accountingToday } from "@/lib/accounting/dates";
import { fileVatReturnAction } from "@/app/actions/banking";
import { getViewMode } from "@/lib/ui/view-mode-server";
import { formatMoney } from "@/lib/ui/format";
import { FormActionButton } from "@/components/banking/form-action-button";
import { VatExportButton } from "@/components/reports/vat-export-button";

export const dynamic = "force-dynamic";

const BOXES: Array<{ key: "box1" | "box2" | "box3" | "box4" | "box5" | "box6" | "box7" | "box8" | "box9"; title: string; plain: string; whole?: boolean }> = [
  { key: "box1", title: "VAT due on sales", plain: "VAT you charged customers." },
  { key: "box2", title: "VAT due on EU acquisitions", plain: "Only for goods brought into Northern Ireland from the EU." },
  { key: "box3", title: "Total VAT due", plain: "Box 1 + Box 2." },
  { key: "box4", title: "VAT reclaimed on purchases", plain: "VAT you paid on business costs and equipment." },
  { key: "box5", title: "Net VAT to pay or reclaim", plain: "Box 3 − Box 4. Positive means you pay HMRC; negative means HMRC pays you." },
  { key: "box6", title: "Total sales excluding VAT", plain: "All your sales before VAT, in whole pounds.", whole: true },
  { key: "box7", title: "Total purchases excluding VAT", plain: "Costs and equipment before VAT, in whole pounds. Wages, depreciation and Corporation Tax are left out.", whole: true },
  { key: "box8", title: "Goods supplied to the EU", plain: "Northern Ireland businesses only.", whole: true },
  { key: "box9", title: "Goods acquired from the EU", plain: "Northern Ireland businesses only.", whole: true },
];

function lastCompleteQuarter(today: string): { start: string; end: string } {
  const year = Number(today.slice(0, 4));
  const quarter = Math.floor((Number(today.slice(5, 7)) - 1) / 3); // current quarter index 0-3
  const startMonth = quarter === 0 ? 9 : (quarter - 1) * 3;
  const startYear = quarter === 0 ? year - 1 : year;
  const start = new Date(Date.UTC(startYear, startMonth, 1));
  const end = new Date(Date.UTC(startYear, startMonth + 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

type VatPageProps = { searchParams: Promise<{ start?: string | string[]; end?: string | string[] }> };

export default async function VatReturnPage({ searchParams }: VatPageProps) {
  await requireAccountingUser();
  const params = await searchParams;
  const today = accountingToday();
  const fallback = lastCompleteQuarter(today);
  const pick = (value: string | string[] | undefined, other: string) => { const first = Array.isArray(value) ? value[0] : value; return first && z.iso.date().safeParse(first).success ? first : other; };
  const start = pick(params.start, fallback.start);
  const end = pick(params.end, fallback.end);
  const valid = start <= end;
  const [boxes, filed, simple] = await Promise.all([valid ? getVatReturn(start, end) : null, listFiledVatReturns(), getViewMode().then((mode) => mode === "simple")]);
  const alreadyFiled = filed.find((item) => item.period_start === start && item.period_end === end);
  const shown = alreadyFiled?.boxes ?? boxes;
  const ended = end < today;

  return <main className="mx-auto w-full max-w-5xl px-5 py-8"><div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><Link href="/dashboard" className="text-sm font-medium text-accent">← Home</Link><p className="mt-5 text-sm font-semibold text-accent">REPORTS</p><h1 className="mt-1 text-3xl font-bold">VAT return</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">The nine figures HMRC asks for, worked out from your records using the standard (invoice date) VAT scheme.</p></div>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-slate-600">From<input type="date" name="start" defaultValue={start} className="field mt-1.5" /></label>
        <label className="text-xs font-semibold text-slate-600">To<input type="date" name="end" defaultValue={end} className="field mt-1.5" /></label>
        <button className="button" type="submit">Calculate</button>
      </form>
    </div>

    {!valid || !shown ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">The period must end after it starts.</p> : <>
      {alreadyFiled && <p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">✓ Marked as filed on {new Date(alreadyFiled.filed_at).toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "Europe/London" })}. These are the figures saved at the time.</p>}
      <section className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4 text-sm font-medium text-slate-500">{start} to {end}</div>
        <ul className="divide-y divide-slate-100">{BOXES.map((box) => <li key={box.key} className={`grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 ${box.key === "box5" ? "bg-slate-50 font-semibold" : ""}`}>
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Box {box.key.slice(3)}</span>
          <span><span className="block text-sm">{box.title}</span>{simple && <span className="block text-xs font-normal text-slate-500">{box.plain}</span>}</span>
          <span className="text-right tabular-nums">{box.whole ? `£${Number(shown[box.key]).toLocaleString("en-GB")}` : formatMoney(shown[box.key])}</span>
        </li>)}</ul>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <VatExportButton boxes={shown} start={start} end={end} />
        {!alreadyFiled && ended && <FormActionButton action={fileVatReturnAction} fields={{ start, end }} label="Mark as filed" pendingLabel="Saving…" className="button" />}
        {!ended && <span className="text-sm text-slate-500">This period hasn&apos;t ended yet, so the figures can still change.</span>}
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">How to submit</p>
        <p className="mt-1">HMRC only accepts VAT returns sent from Making Tax Digital software. ScorpBook can&apos;t send them to HMRC yet. For now, give these figures to your accountant, or enter them in HMRC-recognised bridging software, then click &quot;Mark as filed&quot; to keep a record. Check them first, especially if you use the Flat Rate or Cash Accounting scheme, which this calculation doesn&apos;t cover.</p>
      </div>
    </>}

    {filed.length > 0 && <section className="card p-5"><h2 className="font-semibold">Filed returns</h2>
      <ul className="mt-3 divide-y divide-slate-100 text-sm">{filed.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <Link className="text-accent" href={`/reports/vat-return?start=${item.period_start}&end=${item.period_end}`}>{item.period_start} to {item.period_end}</Link>
        <span className="tabular-nums">{Number(item.boxes.box5) < 0 ? "Reclaim " : "Paid "}{formatMoney(Math.abs(Number(item.boxes.box5)))}</span>
      </li>)}</ul></section>}
  </div></main>;
}
