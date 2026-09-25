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
      setMessage("確認連結無效或已過期，請重新建立帳戶或聯絡管理員。");
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
      setMessage(error instanceof Error ? error.message : "登入失敗，請檢查資料後再試。");
    } finally { setBusy(false); }
  }

  return <AuthShell>
    <div className="mb-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0e9f91]">Welcome back</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#0a1a38]">登入 ScorpBook</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">登入你的帳戶，繼續管理公司帳務。</p>
    </div>
    <form action={submit} className="space-y-5">
      <label className="block text-sm font-semibold text-slate-700">電子郵件
        <input required type="email" name="email" autoComplete="username" placeholder="name@company.com" className="field mt-2 h-12 rounded-xl border-slate-200 px-4" />
      </label>
      <label className="block text-sm font-semibold text-slate-700">密碼
        <span className="relative mt-2 block"><input required type={showPassword ? "text" : "password"} name="password" autoComplete="current-password" placeholder="輸入密碼" className="field h-12 rounded-xl border-slate-200 px-4 pr-20" />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-3 text-xs font-semibold text-[#128c83] hover:text-[#0b625e]" aria-pressed={showPassword}>{showPassword ? "隱藏" : "顯示"}</button>
        </span>
      </label>
      {message && <p role="status" aria-live="polite" className={`rounded-xl px-4 py-3 text-sm ${message.startsWith("Email confirmed") ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{message}</p>}
      <button className="w-full rounded-xl bg-[#087f78] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#066a65] focus:outline-none focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60" disabled={busy} type="submit">{busy ? "登入中…" : "登入"}</button>
    </form>
    <p className="mt-7 text-center text-sm text-slate-500">還沒有帳戶？ <Link href="/signup" className="font-semibold text-[#087f78] hover:underline">建立帳戶</Link></p>
  </AuthShell>;
}
