import Link from "next/link";

export default function UnauthorizedPage() {
  return <main className="flex min-h-screen items-center justify-center bg-[#f5f8fb] px-5 py-12">
    <section className="card w-full max-w-lg p-8">
      <p className="text-sm font-semibold text-amber-700">ACCESS REQUIRED</p>
      <h1 className="mt-2 text-2xl font-bold">This account is not authorized</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">Ask an administrator to add your Supabase Auth user ID to <code className="rounded bg-slate-100 px-1">SCORPBOOK_ALLOWED_USER_IDS</code>, then redeploy the app.</p>
      <Link className="button-secondary mt-6" href="/login">Back to sign in</Link>
    </section>
  </main>;
}
