"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { setViewModeAction } from "@/app/actions/preferences";
import { LABELS, type ViewMode } from "@/lib/ui/view-mode";

function hiddenOn(pathname: string): boolean {
  return pathname === "/login" || pathname === "/signup" || pathname === "/unauthorized" || pathname.startsWith("/auth/");
}

function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return <Link className={`block whitespace-nowrap rounded-md px-3 py-2 ${active ? "bg-emerald-50 font-semibold text-accent" : "text-slate-700 hover:bg-slate-100"}`} href={href}>{label}</Link>;
}

function NavMenu({ label, items, pathname }: { label: string; items: Array<{ href: string; label: string }>; pathname: string }) {
  const active = items.some((item) => pathname.startsWith(item.href));
  // Keyed by pathname so the menu closes after navigating.
  return <details key={pathname} className="relative">
    <summary className={`cursor-pointer list-none whitespace-nowrap rounded-md px-3 py-2 ${active ? "bg-emerald-50 font-semibold text-accent" : "text-slate-700 hover:bg-slate-100"}`}>{label} ▾</summary>
    <div className="absolute left-0 z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
      {items.map((item) => <NavLink key={item.href} {...item} pathname={pathname} />)}
    </div>
  </details>;
}

export function Navigation({ mode }: { mode: ViewMode }) {
  const pathname = usePathname();
  if (hiddenOn(pathname)) return null;
  const t = LABELS[mode];
  const reports = [
    { href: "/reports/income-statement", label: t.incomeStatement },
    { href: "/reports/balance-sheet", label: t.balanceSheet },
    ...(mode === "accountant" ? [{ href: "/reports/trial-balance", label: t.trialBalance }] : []),
  ];
  const setup = [
    { href: "/accounts", label: t.accounts },
    { href: "/suppliers", label: t.suppliers },
    { href: "/periods", label: t.periods },
    { href: "/integrations/scorpinvoice", label: "ScorpInvoice sync" },
  ];
  return <header className="border-b border-slate-200 bg-white">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
      <Link href="/dashboard" className="text-lg font-bold tracking-tight text-ink">ScorpBook {mode === "accountant" && <span className="ml-1 text-xs font-medium text-slate-500">ACCOUNTANT</span>}</Link>
      <nav className="flex flex-wrap items-center gap-1 text-sm">
        <NavLink href="/dashboard" label={t.home} pathname={pathname} />
        <NavLink href="/journal" label={t.journal} pathname={pathname} />
        <NavLink href="/bills" label={t.bills} pathname={pathname} />
        <NavLink href="/banking" label={t.banking} pathname={pathname} />
        <NavMenu label={t.reports} items={reports} pathname={pathname} />
        <NavMenu label={t.setup} items={setup} pathname={pathname} />
        <form action={setViewModeAction} className="ml-2">
          <input type="hidden" name="mode" value={mode === "simple" ? "accountant" : "simple"} />
          <button className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50" type="submit" aria-label={mode === "simple" ? "Accountant view" : "Simple view"} title={mode === "simple" ? "Show standard accounting terms such as debits, credits and the trial balance" : "Switch back to plain-language labels"}>
            {mode === "simple" ? "Accountant view" : "Simple view"}
          </button>
        </form>
        <form action={logoutAction}><button className="rounded-md px-3 py-2 text-slate-500 hover:bg-slate-100" type="submit">Sign out</button></form>
      </nav>
    </div>
  </header>;
}

export function SiteFooter() {
  const pathname = usePathname();
  if (hiddenOn(pathname)) return null;
  return <footer className="mx-auto w-full max-w-7xl px-5 pb-8 text-xs text-slate-400">Scorpia Tech Ltd · ScorpBook</footer>;
}
