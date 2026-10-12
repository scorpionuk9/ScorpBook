import { getAccountingContext } from "@/lib/accounting/auth";
import { listMembers, listPendingInvitations } from "@/lib/accounting/company";
import { TeamManager } from "@/components/company/team-manager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const { user, company } = await getAccountingContext();
  const [members, invitations] = await Promise.all([listMembers(company.id), listPendingInvitations(company.id)]);
  return <main className="mx-auto w-full max-w-4xl px-5 py-8"><div className="space-y-6">
    <div><p className="text-sm font-semibold text-accent">SETUP</p><h1 className="mt-1 text-3xl font-bold">Team</h1>
      <p className="mt-2 text-sm text-slate-500">People who can see or work on the books for {company.name}.</p></div>
    <TeamManager members={members} invitations={invitations} currentUserId={user.id} canManage={company.role === "OWNER"} companyName={company.name} />
  </div></main>;
}
