import Link from "next/link";
import { getOptionalAccountingContext } from "@/lib/accounting/auth";
import { previewInvitation } from "@/lib/accounting/company";
import { acceptInvitationAction } from "@/app/actions/company";
import { SubmitAndGo } from "@/components/company/accept-button";

export const dynamic = "force-dynamic";

const ROLE_LABELS = { OWNER: "an Owner", ACCOUNTANT: "an Accountant", VIEWER: "a viewer (view only)" } as const;

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, context] = await Promise.all([previewInvitation(token), getOptionalAccountingContext()]);
  const here = `/invite/${encodeURIComponent(token)}`;
  let body: React.ReactNode;
  if (!invite || !invite.valid) {
    body = <p className="text-sm text-slate-600">This invitation link has expired, been cancelled or already been used. Ask the person who invited you for a new one.</p>;
  } else if (!context) {
    body = <>
      <p className="text-sm text-slate-600">To accept, sign in or create a free account using <strong>{invite.email}</strong>.</p>
      <div className="flex gap-2"><Link className="button" href={`/signup?next=${encodeURIComponent(here)}`}>Create account</Link><Link className="button-secondary" href={`/login?next=${encodeURIComponent(here)}`}>Sign in</Link></div>
    </>;
  } else if ((context.user.email ?? "").toLowerCase() !== invite.email.toLowerCase()) {
    body = <p className="text-sm text-slate-600">You&apos;re signed in as <strong>{context.user.email}</strong>, but this invitation is for <strong>{invite.email}</strong>. Sign out, then open this link again and sign in with that address.</p>;
  } else {
    body = <SubmitAndGo action={acceptInvitationAction} fields={{ token }} label={`Join ${invite.company}`} pendingLabel="Joining…" to="/dashboard" />;
  }
  return <main className="mx-auto w-full max-w-xl px-5 py-12"><section className="card space-y-4 p-6 sm:p-8">
    <p className="text-sm font-semibold text-accent">INVITATION</p>
    <h1 className="text-2xl font-bold">{invite?.valid ? `Join ${invite.company} on ScorpBook` : "Invitation not available"}</h1>
    {invite?.valid && <p className="text-sm text-slate-500">You&apos;ve been invited as {ROLE_LABELS[invite.role]}.</p>}
    {body}
  </section></main>;
}
