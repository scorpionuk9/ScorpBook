"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [created, setCreated] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    setError("");
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirm_password") || "");
    if (password.length < 8) {
      setError("密碼至少需要 8 個字元。");
      setBusy(false);
      return;
    }
    if (password !== confirmPassword) {
      setError("兩次輸入的密碼不一致。");
      setBusy(false);
      return;
    }
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/journal` },
      });
      if (signupError) throw signupError;
      setCreated(true);
      setMessage("帳戶已建立。若系統要求電郵確認，請查看收件匣完成確認。帳務資料仍受管理員授權名單保護。");
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : "建立帳戶失敗，請稍後再試。");
    } finally { setBusy(false); }
  }

  return <AuthShell>
    <div className="mb-7">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0e9f91]">Get started</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#0a1a38]">建立你的帳戶</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">為 ScorpBook 建立安全登入資料。</p>
    </div>
    {created ? <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg text-[#087f78]">✓</div>
      <h2 className="mt-4 font-semibold text-emerald-950">帳戶申請已送出</h2>
      <p role="status" aria-live="polite" className="mt-2 text-sm leading-6 text-emerald-900">{message}</p>
      <Link href="/login" className="mt-5 inline-flex font-semibold text-[#087f78] hover:underline">前往登入 →</Link>
    </div> : <form action={submit} className="space-y-4">
      <label className="block text-sm font-semibold text-slate-700">電子郵件
        <input required type="email" name="email" autoComplete="email" placeholder="name@company.com" className="field mt-2 h-12 rounded-xl border-slate-200 px-4" />
      </label>
      <label className="block text-sm font-semibold text-slate-700">密碼
        <span className="relative mt-2 block"><input required minLength={8} type={showPassword ? "text" : "password"} name="password" autoComplete="new-password" placeholder="至少 8 個字元" className="field h-12 rounded-xl border-slate-200 px-4 pr-20" />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-3 text-xs font-semibold text-[#128c83] hover:text-[#0b625e]" aria-pressed={showPassword}>{showPassword ? "隱藏" : "顯示"}</button>
        </span>
      </label>
      <label className="block text-sm font-semibold text-slate-700">確認密碼
        <input required minLength={8} type={showPassword ? "text" : "password"} name="confirm_password" autoComplete="new-password" placeholder="再次輸入密碼" className="field mt-2 h-12 rounded-xl border-slate-200 px-4" />
      </label>
      {error && <p role="alert" aria-live="polite" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <button className="w-full rounded-xl bg-[#087f78] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#066a65] focus:outline-none focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60" disabled={busy} type="submit">{busy ? "建立中…" : "建立帳戶"}</button>
      <p className="pt-1 text-center text-xs leading-5 text-slate-500">建立帳戶後，管理員仍須核准帳務工作區存取權。</p>
    </form>}
    <p className="mt-7 text-center text-sm text-slate-500">已經有帳戶？ <Link href="/login" className="font-semibold text-[#087f78] hover:underline">返回登入</Link></p>
  </AuthShell>;
}
