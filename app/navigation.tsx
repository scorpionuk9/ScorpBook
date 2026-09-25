"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";

export function Navigation() {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/signup" || pathname === "/unauthorized" || pathname.startsWith("/auth/")) return null;
  return <header className="border-b border-slate-200 bg-white">
    <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
      <Link href="/journal" className="text-lg font-bold tracking-tight text-ink">ScorpBook <span className="ml-1 text-xs font-medium text-slate-500">ACCOUNTING</span></Link>
      <nav className="flex items-center gap-2 text-sm">
        <Link className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100" href="/journal">Journal</Link>
        <Link className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100" href="/accounts">Chart of Accounts</Link>
        <Link className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100" href="/reports/trial-balance">Trial Balance</Link>
        <form action={logoutAction}><button className="rounded-md px-3 py-2 text-slate-500 hover:bg-slate-100" type="submit">Sign out</button></form>
      </nav>
    </div>
  </header>;
}

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/signup" || pathname === "/unauthorized" || pathname.startsWith("/auth/")) return null;
  return <footer className="mx-auto w-full max-w-7xl px-5 pb-8 text-xs text-slate-400">Scorpia Tech Ltd · General Ledger</footer>;
}
