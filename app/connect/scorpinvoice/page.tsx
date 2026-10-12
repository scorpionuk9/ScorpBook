import Link from "next/link";
import { getOptionalAccountingContext } from "@/lib/accounting/auth";
import { readConnectToken } from "@/lib/integrations/scorpinvoice";
import { linkScorpInvoiceAction } from "@/app/actions/integrations";
import { SubmitAndGo } from "@/components/company/accept-button";

export const dynamic = "force-dynamic";

export default async function ConnectScorpInvoicePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const [request, context] = await Promise.all([Promise.resolve(readConnectToken(token)), getOptionalAccountingContext()]);
  const here = `/connect/scorpinvoice?token=${encodeURIComponent(token)}`;
  const owned = context?.companies.filter((company) => company.role === "OWNER") ?? [];
  let body: React.ReactNode;
  if (!request) {
    body = <p className="text-sm text-slate-600">This link has expired or isn&apos;t valid. Go back to ScorpInvoice and choose <strong>Connect to ScorpBook</strong> again.</p>;
  } else if (!context) {
    body = <>
      <p className="text-sm text-slate-600">ScorpBook is free while in beta. Create an account (you can use the same email, <strong>{request.email}</strong>) or sign in.</p>
      <div className="flex gap-2"><Link className="button" href={`/signup?next=${encodeURIComponent(here)}`}>Create account</Link><Link className="button-secondary" href={`/login?next=${encodeURIComponent(here)}`}>Sign in</Link></div>
    </>;
  } else if (!owned.length) {
    body = <>
      <p className="text-sm text-slate-600">First, tell ScorpBook a little about your business.</p>
      <Link className="button" href={`/onboarding?name=${encodeURIComponent(request.business_name)}&next=${encodeURIComponent(here)}`}>Set up my books</Link>
    </>;
  } else {
    body = <SubmitAndGo action={linkScorpInvoiceAction} fields={{ token }} label="Connect" pendingLabel="Connecting…" to="/integrations/scorpinvoice">
      <label className="block text-sm font-semibold text-slate-700">Send ScorpInvoice records to
        <select name="company_id" className="field mt-1.5" defaultValue={context.company?.role === "OWNER" ? context.company.id : owned[0].id}>
          {owned.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select></label>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="backfill" defaultChecked className="mt-1" />
        <span><span className="font-semibold">Also bring in what&apos;s already in ScorpInvoice</span><span className="block text-xs text-slate-500">Sent invoices, payments and expenses you&apos;ve recorded so far. Leave this off if they&apos;re already in your books.</span></span></label>
    </SubmitAndGo>;
  }
  return <main className="mx-auto w-full max-w-xl px-5 py-12"><section className="card space-y-4 p-6 sm:p-8">
    <p className="text-sm font-semibold text-accent">CONNECT SCORPINVOICE</p>
    <h1 className="text-2xl font-bold">Keep your books up to date automatically</h1>
    {request && <p className="text-sm text-slate-500">Invoices you send, payments you receive and expenses you log in ScorpInvoice ({request.email}) will be recorded in ScorpBook within a few minutes.</p>}
    {body}
  </section></main>;
}
