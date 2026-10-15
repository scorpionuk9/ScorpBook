"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/ui/next-path";

// Second step of sign-in for users with an authenticator app set up.
export default function VerifyPage() {
  const router = useRouter();
  const [next, setNext] = useState("/dashboard");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { setNext(safeNextPath(new URLSearchParams(window.location.search).get("next"))); }, []);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      const factor = factors.totp.find((item) => item.status === "verified");
      if (!factor) { router.replace(next); return; }
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.replace(/\s/g, "") });
      if (error) throw new Error("That code didn't work. Check your authenticator app and try the latest code.");
      router.replace(next);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verification failed. Please try again.");
    } finally { setBusy(false); }
  }

  async function signOut() {
    await createBrowserSupabaseClient().auth.signOut();
    router.replace("/login");
  }

  return <AuthShell>
    <div className="mb-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0e9f91]">Two-step verification</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#0a1a38]">Enter your code</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">Open your authenticator app and enter the 6-digit code for ScorpBook.</p>
    </div>
    <form onSubmit={verify} className="space-y-5">
      <label className="block text-sm font-semibold text-slate-700">Code
        <input required autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} value={code} onChange={(event) => setCode(event.target.value)} placeholder="123 456" className="field mt-2 h-12 rounded-xl border-slate-200 px-4 text-lg tracking-widest" />
      </label>
      {message && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p>}
      <button className="w-full rounded-xl bg-[#087f78] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#066a65] disabled:cursor-wait disabled:opacity-60" disabled={busy} type="submit">{busy ? "Checking…" : "Verify"}</button>
    </form>
    <p className="mt-7 text-center text-sm text-slate-500">Lost access to your authenticator app? Email <a href="mailto:scorpbook@scorpiatech.com" className="font-semibold text-[#087f78] hover:underline">scorpbook@scorpiatech.com</a> from your account email. <button type="button" onClick={() => void signOut()} className="font-semibold text-[#087f78] hover:underline">Sign out</button></p>
  </AuthShell>;
}
