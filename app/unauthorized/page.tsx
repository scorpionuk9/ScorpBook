import Link from "next/link";

export default function UnauthorizedPage() {
  return <main className="flex min-h-screen items-center justify-center bg-[#f5f8fb] px-5 py-12">
    <section className="card w-full max-w-lg p-8">
      <p className="text-sm font-semibold text-amber-700">需要授權</p>
      <h1 className="mt-2 text-2xl font-bold">此帳號尚未獲准使用</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">請管理員將 Supabase Auth 使用者 ID 加入伺服器環境變數 <code className="rounded bg-slate-100 px-1">SCORPBOOK_ALLOWED_USER_IDS</code>，再重新部署。</p>
      <Link className="button-secondary mt-6" href="/login">返回登入</Link>
    </section>
  </main>;
}
