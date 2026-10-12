"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteMemberAction, revokeInvitationAction, setMemberRoleAction } from "@/app/actions/company";
import type { Invitation, Member } from "@/lib/accounting/company";
import { FormActionButton } from "@/components/banking/form-action-button";

const ROLE_INFO = {
  OWNER: { label: "Owner", hint: "Everything, including business details and the team." },
  ACCOUNTANT: { label: "Accountant", hint: "Record, change and lock the books. Can't manage the team." },
  VIEWER: { label: "View only", hint: "See everything, change nothing." },
} as const;

export function TeamManager({ members, invitations, currentUserId, canManage, companyName }: { members: Member[]; invitations: Invitation[]; currentUserId: string; canManage: boolean; companyName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState<{ url: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function invite(formData: FormData) {
    setBusy(true); setError(""); setLink(null); setCopied(false);
    const result = await inviteMemberAction(formData);
    setBusy(false);
    if (!result.ok || !result.link) { setError(result.message); return; }
    setLink({ url: result.link, email: String(formData.get("email")) });
    router.refresh();
  }

  async function changeRole(userId: string, role: string) {
    if (role === "REMOVE" && !window.confirm("Remove this person from the business? They'll lose access straight away.")) return;
    const data = new FormData(); data.set("user_id", userId); data.set("role", role);
    const result = await setMemberRoleAction(data);
    if (!result.ok) setError(result.message); else { setError(""); router.refresh(); }
  }

  const mailto = link ? `mailto:${encodeURIComponent(link.email)}?subject=${encodeURIComponent(`Join ${companyName} on ScorpBook`)}&body=${encodeURIComponent(`I've invited you to the books for ${companyName} on ScorpBook. Open this link to accept (it works for 14 days):\n\n${link.url}`)}` : "";

  return <div className="space-y-6">
    <section className="card overflow-hidden">
      <ul className="divide-y divide-slate-100">{members.map((member) => <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
        <span>{member.email}{member.user_id === currentUserId && <span className="ml-2 text-xs text-slate-400">(you)</span>}</span>
        {canManage ? <select aria-label={`Role for ${member.email}`} className="field w-auto py-1.5 text-xs" value={member.role} onChange={(event) => void changeRole(member.user_id, event.target.value)}>
          {(Object.keys(ROLE_INFO) as Array<keyof typeof ROLE_INFO>).map((role) => <option key={role} value={role}>{ROLE_INFO[role].label}</option>)}
          <option value="REMOVE">Remove from business</option>
        </select> : <span className="text-xs font-medium text-slate-600">{ROLE_INFO[member.role].label}</span>}
      </li>)}</ul>
    </section>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

    {canManage && <section className="card space-y-4 p-5">
      <div><h2 className="font-semibold">Invite someone</h2><p className="mt-1 text-sm text-slate-500">For example your accountant or a business partner. They&apos;ll sign in (or create a free account) with this email address to accept.</p></div>
      <form action={invite} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
        <label className="text-sm font-semibold text-slate-700">Email<input name="email" type="email" required className="field mt-1.5" placeholder="accountant@firm.co.uk" /></label>
        <label className="text-sm font-semibold text-slate-700">Access<select name="role" defaultValue="ACCOUNTANT" className="field mt-1.5">
          {(Object.keys(ROLE_INFO) as Array<keyof typeof ROLE_INFO>).map((role) => <option key={role} value={role}>{ROLE_INFO[role].label}</option>)}</select></label>
        <button type="submit" className="button" disabled={busy}>{busy ? "Creating…" : "Create invitation"}</button>
      </form>
      <ul className="grid gap-1 text-xs text-slate-500 sm:grid-cols-3">{Object.values(ROLE_INFO).map((role) => <li key={role.label}><strong className="text-slate-700">{role.label}:</strong> {role.hint}</li>)}</ul>
      {link && <div className="space-y-2 rounded-lg bg-emerald-50 p-4 text-sm">
        <p className="font-medium text-emerald-900">Invitation ready. Send this link to {link.email}:</p>
        <input readOnly aria-label="Invitation link" className="field font-mono text-xs" value={link.url} onFocus={(event) => event.target.select()} />
        <div className="flex gap-2"><button type="button" className="button-secondary" onClick={() => { void navigator.clipboard.writeText(link.url); setCopied(true); }}>{copied ? "Copied ✓" : "Copy link"}</button>
          <a className="button-secondary" href={mailto}>Email it</a></div>
        <p className="text-xs text-emerald-800">This link is shown only once. Anyone with it can join if they sign in with {link.email}.</p>
      </div>}
    </section>}

    {invitations.length > 0 && <section className="card p-5"><h2 className="font-semibold">Waiting to accept</h2>
      <ul className="mt-3 divide-y divide-slate-100 text-sm">{invitations.map((invite) => <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span>{invite.email} · {ROLE_INFO[invite.role].label}<span className="ml-2 text-xs text-slate-400">expires {new Date(invite.expires_at).toLocaleDateString("en-GB", { dateStyle: "medium" })}</span></span>
        {canManage && <FormActionButton action={revokeInvitationAction} fields={{ invitation_id: invite.id }} label="Cancel" pendingLabel="Cancelling…" />}
      </li>)}</ul></section>}
  </div>;
}
