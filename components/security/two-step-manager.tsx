"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Enrolment = { factorId: string; qrCode: string; secret: string };

// Sets up or removes an authenticator-app (TOTP) second factor for the signed-in user.
export function TwoStepManager() {
  const [status, setStatus] = useState<"loading" | "off" | "on">("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await createBrowserSupabaseClient().auth.mfa.listFactors();
    if (error) { setMessage({ ok: false, text: error.message }); return; }
    const verified = data.totp.find((factor) => factor.status === "verified");
    setFactorId(verified?.id ?? null);
    setStatus(verified ? "on" : "off");
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function start() {
    setBusy(true); setMessage(null);
    try {
      const supabase = createBrowserSupabaseClient();
      // Clear any half-finished setup so enrolling again doesn't clash.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const factor of existing?.all ?? []) {
        if (factor.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `ScorpBook ${new Date().toISOString().slice(0, 10)}`, issuer: "ScorpBook" });
      if (error) throw error;
      setEnrolment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Could not start set-up." });
    } finally { setBusy(false); }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (!enrolment) return;
    setBusy(true); setMessage(null);
    const { error } = await createBrowserSupabaseClient().auth.mfa.challengeAndVerify({ factorId: enrolment.factorId, code: code.replace(/\s/g, "") });
    setBusy(false);
    if (error) { setMessage({ ok: false, text: "That code didn't work. Make sure your phone's clock is correct and try the latest code." }); return; }
    setEnrolment(null); setCode("");
    setMessage({ ok: true, text: "Two-step verification is on. You'll be asked for a code each time you sign in." });
    await load();
  }

  async function cancel() {
    if (enrolment) await createBrowserSupabaseClient().auth.mfa.unenroll({ factorId: enrolment.factorId });
    setEnrolment(null); setCode("");
  }

  async function remove() {
    if (!factorId || !window.confirm("Turn off two-step verification? Your account will only be protected by your password.")) return;
    setBusy(true); setMessage(null);
    const { error } = await createBrowserSupabaseClient().auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) { setMessage({ ok: false, text: error.message }); return; }
    setMessage({ ok: true, text: "Two-step verification is off." });
    await load();
  }

  return <section className="card space-y-4 p-5 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold">Two-step verification</h2>
        <p className="mt-1 text-sm text-slate-500">After your password, enter a code from an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password. This protects your books even if your password is leaked, and HMRC expects it for software that files tax returns.</p></div>
      {status !== "loading" && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status === "on" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{status === "on" ? "On" : "Off"}</span>}
    </div>

    {status === "off" && !enrolment && <button type="button" className="button" disabled={busy} onClick={() => void start()}>{busy ? "Starting…" : "Set up two-step verification"}</button>}

    {enrolment && <div className="grid gap-5 rounded-lg bg-slate-50 p-4 sm:grid-cols-[auto_minmax(0,1fr)]">
      {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns the QR code as an SVG data URL */}
      <img src={enrolment.qrCode} alt="QR code to scan with your authenticator app" className="h-44 w-44 rounded-lg bg-white p-2" />
      <form onSubmit={confirm} className="space-y-3 text-sm">
        <p><strong>1.</strong> Scan the QR code with your authenticator app.</p>
        <p className="text-xs text-slate-500">Can&apos;t scan it? Enter this key instead: <code className="break-all rounded bg-white px-1.5 py-0.5 font-mono">{enrolment.secret}</code></p>
        <label className="block"><strong>2.</strong> Enter the 6-digit code it shows
          <input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} value={code} onChange={(event) => setCode(event.target.value)} placeholder="123 456" className="field mt-1.5 max-w-40 tracking-widest" /></label>
        <div className="flex gap-2"><button type="submit" className="button" disabled={busy}>{busy ? "Checking…" : "Turn on"}</button>
          <button type="button" className="button-secondary" disabled={busy} onClick={() => void cancel()}>Cancel</button></div>
      </form>
    </div>}

    {status === "on" && <button type="button" className="button-secondary" disabled={busy} onClick={() => void remove()}>Turn off two-step verification</button>}
    {message && <p role="status" className={`rounded-lg p-3 text-sm ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>}
  </section>;
}
