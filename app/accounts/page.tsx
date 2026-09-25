import { requireAccountingUser } from "@/lib/accounting/auth";
import { listAccounts } from "@/lib/accounting/service";
import { ACCOUNT_TYPE_LABELS } from "@/lib/accounting/constants";
import { AccountForm } from "@/components/accounts/account-form";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  await requireAccountingUser();
  const accounts = await listAccounts();
  return <main className="mx-auto w-full max-w-7xl px-5 py-8"><div className="space-y-6">
    <div><p className="text-sm font-semibold text-accent">GENERAL LEDGER</p><h1 className="mt-1 text-3xl font-bold">Chart of Accounts</h1>
      <p className="mt-2 text-sm text-slate-500">Manage your company accounts. Inactive accounts remain on historical entries but cannot be used on new drafts.</p></div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">Accounts <span className="ml-1 text-sm font-normal text-slate-400">{accounts.length}</span></h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Code</th><th className="px-5 py-3">Account name</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Manage</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {accounts.map((account) => <tr key={account.id} className="hover:bg-slate-50/70">
                <td className="px-5 py-3 font-mono font-semibold">{account.code}</td><td className="px-5 py-3">{account.name}</td>
                <td className="px-5 py-3">{ACCOUNT_TYPE_LABELS[account.type as keyof typeof ACCOUNT_TYPE_LABELS] ?? account.type}</td>
                <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${account.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{account.is_active ? "Active" : "Inactive"}</span></td>
                <td className="px-5 py-3"><details className="group"><summary className="cursor-pointer list-none text-xs font-semibold text-accent">Edit</summary><div className="absolute z-10 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"><AccountForm account={account} /></div></details></td>
              </tr>)}
              {!accounts.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">No accounts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card h-fit p-5"><h2 className="font-semibold">Add account</h2><p className="mt-1 text-sm text-slate-500">Accounts cannot be deleted or have their code or type changed after creation.</p><div className="mt-4"><AccountForm /></div></section>
    </div>
  </div></main>;
}
