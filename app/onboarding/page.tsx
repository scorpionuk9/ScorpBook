import Link from "next/link";
import { getOptionalAccountingContext, requireSignedInUser } from "@/lib/accounting/auth";
import { CompanyForm } from "@/components/company/company-form";
import { safeNextPath } from "@/lib/ui/next-path";

export const dynamic = "force-dynamic";

type OnboardingProps = { searchParams: Promise<{ name?: string; next?: string }> };

export default async function OnboardingPage({ searchParams }: OnboardingProps) {
  await requireSignedInUser();
  const [context, params] = await Promise.all([getOptionalAccountingContext(), searchParams]);
  const hasCompany = Boolean(context?.companies.length);
  return <main className="mx-auto w-full max-w-2xl px-5 py-10"><div className="space-y-6">
    {hasCompany && <Link href="/dashboard" className="text-sm font-medium text-accent">← Back</Link>}
    <div><p className="text-sm font-semibold text-accent">{hasCompany ? "ADD A BUSINESS" : "WELCOME TO SCORPBOOK"}</p>
      <h1 className="mt-1 text-3xl font-bold">{hasCompany ? "Add another business" : "Let's set up your books"}</h1>
      <p className="mt-2 text-sm text-slate-500">Three quick questions. ScorpBook creates the right categories for you; there&apos;s nothing to configure.</p></div>
    <section className="card p-5 sm:p-7">
      <CompanyForm mode="create" next={safeNextPath(params.next)} initial={{ name: params.name?.slice(0, 150) ?? "", business_type: "SOLE_TRADER", vat_registered: false, year_end_month: 4, year_end_day: 5 }} />
    </section>
  </div></main>;
}
