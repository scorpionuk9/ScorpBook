import { getAccountingContext } from "@/lib/accounting/auth";
import { TwoStepManager } from "@/components/security/two-step-manager";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const { user } = await getAccountingContext();
  return <main className="mx-auto w-full max-w-2xl px-5 py-8"><div className="space-y-6">
    <div><p className="text-sm font-semibold text-accent">YOUR ACCOUNT</p><h1 className="mt-1 text-3xl font-bold">Sign-in security</h1>
      <p className="mt-2 text-sm text-slate-500">Signed in as {user.email}. These settings apply to your login for every business you have access to.</p></div>
    <TwoStepManager />
  </div></main>;
}
