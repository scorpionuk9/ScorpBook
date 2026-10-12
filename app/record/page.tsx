import Link from "next/link";
import { getAccountingContext } from "@/lib/accounting/auth";
import { listAccounts } from "@/lib/accounting/service";
import { accountingToday } from "@/lib/accounting/dates";
import { GUIDED_SCENARIOS, type GuidedScenario } from "@/lib/accounting/guided";
import { getViewMode } from "@/lib/ui/view-mode-server";
import { GuidedEntry } from "@/components/guided/guided-entry";

export const dynamic = "force-dynamic";

type RecordPageProps = { searchParams: Promise<{ type?: string | string[] }> };

export default async function RecordPage({ searchParams }: RecordPageProps) {
  const { company } = await getAccountingContext();
  const [accounts, mode, params] = await Promise.all([listAccounts(), getViewMode(), searchParams]);
  const requested = Array.isArray(params.type) ? params.type[0] : params.type;
  const initialScenario = GUIDED_SCENARIOS.find((scenario) => scenario === requested) as GuidedScenario | undefined;
  return <main className="mx-auto w-full max-w-6xl px-5 py-8"><div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><Link href="/dashboard" className="text-sm font-medium text-accent">← Home</Link><p className="mt-5 text-sm font-semibold text-accent">RECORD SOMETHING</p><h1 className="mt-1 text-3xl font-bold">What happened?</h1>
        <p className="mt-2 text-sm text-slate-500">Pick what happened and answer a few questions. ScorpBook does the bookkeeping for you.</p></div>
      <Link href="/journal/new" className="text-sm font-medium text-slate-500 hover:text-accent">Something else? Enter it manually →</Link>
    </div>
    <GuidedEntry accounts={accounts} today={accountingToday()} initialScenario={initialScenario} showLines={mode === "accountant"} businessType={company.business_type} vatRegistered={company.vat_registered} />
  </div></main>;
}
