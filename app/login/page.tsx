"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: String(formData.get("email") || ""),
        password: String(formData.get("password") || ""),
      });
      if (error) throw error;
      router.replace("/journal");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登入失敗。");
    } finally { setBusy(false); }
  }

  return <main className="mx-auto flex min-h-[75vh] max-w-md items-center px-5 py-12">
    <div className="card w-full p-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Scorpia Tech Ltd</p>
      <h1 className="mt-3 text-2xl font-bold">登入 ScorpBook</h1>
      <p className="mt-2 text-sm text-slate-500">請使用已加入 Supabase Auth 的帳號。</p>
      <form action={submit} className="mt-7 space-y-4">
        <label className="block text-sm font-medium">電郵<input required type="email" name="email" autoComplete="username" className="field mt-1.5" /></label>
        <label className="block text-sm font-medium">密碼<input required type="password" name="password" autoComplete="current-password" className="field mt-1.5" /></label>
        {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
        <button className="button w-full" disabled={busy} type="submit">{busy ? "登入中…" : "登入"}</button>
      </form>
    </div>
  </main>;
}
