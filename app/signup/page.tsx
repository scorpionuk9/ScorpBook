"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/ui/next-path";

export default function SignupPage() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [created, setCreated] = useState(false);
  const [next, setNext] = useState("/dashboard");
  useEffect(() => { setNext(safeNextPath(new URLSearchParams(window.location.search).get("next"))); }, []);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    setError("");
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirm_password") || "");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setBusy(false);
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      setBusy(false);
      return;
    }
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (signupError) throw signupError;
      setCreated(true);
      setMessage("Check your inbox and click the link to confirm your email. You'll then set up your business in a couple of minutes.");
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : "Sign up failed. Please try again later.");
    } finally { setBusy(false); }
  }

  return <AuthShell>
    <div className="mb-7">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0e9f91]">Get started</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#0a1a38]">Create your account</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">Free while ScorpBook is in beta. No card needed.</p>
    </div>
    {created ? <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg text-[#087f78]">✓</div>
      <h2 className="mt-4 font-semibold text-emerald-950">Almost there</h2>
      <p role="status" aria-live="polite" className="mt-2 text-sm leading-6 text-emerald-900">{message}</p>
      <Link href={next === "/dashboard" ? "/login" : `/login?next=${encodeURIComponent(next)}`} className="mt-5 inline-flex font-semibold text-[#087f78] hover:underline">Go to sign in →</Link>
    </div> : <form action={submit} className="space-y-4">
      <label className="block text-sm font-semibold text-slate-700">Email address
        <input required type="email" name="email" autoComplete="email" placeholder="name@company.com" className="field mt-2 h-12 rounded-xl border-slate-200 px-4" />
      </label>
      <label className="block text-sm font-semibold text-slate-700">Password
        <span className="relative mt-2 block"><input required minLength={8} type={showPassword ? "text" : "password"} name="password" autoComplete="new-password" placeholder="At least 8 characters" className="field h-12 rounded-xl border-slate-200 px-4 pr-20" />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-3 text-xs font-semibold text-[#128c83] hover:text-[#0b625e]" aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button>
        </span>
      </label>
      <label className="block text-sm font-semibold text-slate-700">Confirm password
        <input required minLength={8} type={showPassword ? "text" : "password"} name="confirm_password" autoComplete="new-password" placeholder="Enter your password again" className="field mt-2 h-12 rounded-xl border-slate-200 px-4" />
      </label>
      {error && <p role="alert" aria-live="polite" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <button className="w-full rounded-xl bg-[#087f78] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#066a65] focus:outline-none focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60" disabled={busy} type="submit">{busy ? "Creating account…" : "Create account"}</button>
    </form>}
    {!created && <p className="mt-5 text-center text-xs leading-5 text-slate-500">By creating an account you agree to our <Link href="/terms" className="font-semibold text-[#087f78] hover:underline">Terms of Service</Link> and <Link href="/privacy" className="font-semibold text-[#087f78] hover:underline">Privacy Policy</Link>.</p>}
    <p className="mt-7 text-center text-sm text-slate-500">Already have an account? <Link href={next === "/dashboard" ? "/login" : `/login?next=${encodeURIComponent(next)}`} className="font-semibold text-[#087f78] hover:underline">Sign in</Link></p>
  </AuthShell>;
}
