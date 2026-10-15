import Link from "next/link";

export const CONTACT_EMAIL = "scorpbook@scorpiatech.com";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-2xl px-5 py-10 text-slate-700">
    <Link href="/dashboard" className="text-sm font-medium text-accent">← Back to ScorpBook</Link>
    <h1 className="mt-4 text-3xl font-bold text-ink">{title}</h1>
    <p className="mt-2 text-sm text-slate-500">Last updated: {updated}</p>
    <div className="legal mt-8 space-y-8 text-sm leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:mt-1 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">{children}</div>
  </main>;
}

export function ContactLink() {
  return <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-accent">{CONTACT_EMAIL}</a>;
}
