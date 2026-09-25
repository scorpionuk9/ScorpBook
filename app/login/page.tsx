"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("confirmation") === "failed") {
      setMessage("This confirmation link is invalid or has expired. Please sign up again or contact an administrator.");
    }
  }, []);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || ""),
      });
      if (error) throw error;
      router.replace("/journal");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign in failed. Please check your details and try again.");
    } finally { setBusy(false); }
  }

  return <AuthShell>
    <div className="mb-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0e9f91]">Welcome back</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#0a1a38]">Sign in to ScorpBook</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">Sign in to continue managing your company books.</p>
    </div>
    <form action={submit} className="space-y-5">
      <label className="block text-sm font-semibold text-slate-700">Email address
        <input required type="email" name="email" autoComplete="username" placeholder="name@company.com" className="field mt-2 h-12 rounded-xl border-slate-200 px-4" />
      </label>
      <label className="block text-sm font-semibold text-slate-700">Password
        <span className="relative mt-2 block"><input required type={showPassword ? "text" : "password"} name="password" autoComplete="current-password" placeholder="Enter your password" className="field h-12 rounded-xl border-slate-200 px-4 pr-20" />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-3 text-xs font-semibold text-[#128c83] hover:text-[#0b625e]" aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button>
        </span>
      </label>
      {message && <p role="status" aria-live="polite" className={`rounded-xl px-4 py-3 text-sm ${message.startsWith("Email confirmed") ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{message}</p>}
      <button className="w-full rounded-xl bg-[#087f78] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#066a65] focus:outline-none focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60" disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button>
    </form>
    <p className="mt-7 text-center text-sm text-slate-500">New to ScorpBook? <Link href="/signup" className="font-semibold text-[#087f78] hover:underline">Create an account</Link></p>
  </AuthShell>;
}
