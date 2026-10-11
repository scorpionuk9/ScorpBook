import { requireAccountingUser } from "@/lib/accounting/auth";
import { getViewMode } from "@/lib/ui/view-mode-server";
import { LABELS } from "@/lib/ui/view-mode";
import { listAccountingPeriods } from "@/lib/accounting/service";
import { accountingToday } from "@/lib/accounting/dates";
import { AccountingPeriodManager } from "@/components/periods/accounting-period-manager";

export const dynamic = "force-dynamic";

export default async function AccountingPeriodsPage() {
  await requireAccountingUser();
  const t = LABELS[await getViewMode()];
  const periods = await listAccountingPeriods();
  return <main className="mx-auto w-full max-w-7xl px-5 py-8"><div className="space-y-6">
    <div><p className="text-sm font-semibold text-accent">PERIOD END</p><h1 className="mt-1 text-3xl font-bold">{t.periods}</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">{t.periodsIntro}</p></div>
    <AccountingPeriodManager periods={periods} currentDate={accountingToday()} />
  </div></main>;
}
