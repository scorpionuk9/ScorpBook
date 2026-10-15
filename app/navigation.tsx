"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { setViewModeAction } from "@/app/actions/preferences";
import { switchCompanyAction } from "@/app/actions/company";
import { LABELS, type ViewMode } from "@/lib/ui/view-mode";

function hiddenOn(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/") || pathname === "/signup" || pathname.startsWith("/auth/");
}

// "/banking" (reconciliation) and "/banking/inbox" are separate menu items.
function isActive(href: string, pathname: string): boolean {
  if (href === "/banking" && pathname.startsWith("/banking/inbox")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const active = isActive(href, pathname);
  return <Link className={`block whitespace-nowrap rounded-md px-3 py-2 ${active ? "bg-emerald-50 font-semibold text-accent" : "text-slate-700 hover:bg-slate-100"}`} href={href}>{label}</Link>;
}

function NavMenu({ label, items, pathname }: { label: string; items: Array<{ href: string; label: string }>; pathname: string }) {
  const active = items.some((item) => isActive(item.href, pathname));
  // Keyed by pathname so the menu closes after navigating.
  return <details key={pathname} className="relative">
    <summary className={`cursor-pointer list-none whitespace-nowrap rounded-md px-3 py-2 ${active ? "bg-emerald-50 font-semibold text-accent" : "text-slate-700 hover:bg-slate-100"}`}>{label} ▾</summary>
    <div className="absolute left-0 z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
      {items.map((item) => <NavLink key={item.href} {...item} pathname={pathname} />)}
    </div>
  </details>;
}

type NavCompany = { name: string; role: string; vatRegistered: boolean };

function CompanySwitcher({ company, companies, pathname }: { company: NavCompany; companies: Array<{ id: string; name: string; current: boolean }>; pathname: string }) {
  return <details key={pathname} className="relative">
    <summary className="cursor-pointer list-none truncate rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100" title="Switch company">{company.name} ▾</summary>
    <div className="absolute left-0 z-20 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
      {companies.map((item) => <form key={item.id} action={switchCompanyAction}><input type="hidden" name="company_id" value={item.id} />
        <button type="submit" className={`block w-full truncate rounded-md px-3 py-2 text-left text-sm ${item.current ? "bg-emerald-50 font-semibold text-accent" : "text-slate-700 hover:bg-slate-100"}`}>{item.name}</button></form>)}
      <Link href="/onboarding" className="mt-1 block rounded-md border-t border-slate-100 px-3 py-2 text-sm text-accent hover:bg-slate-100">＋ Add another business</Link>
    </div>
  </details>;
}

export function Navigation({ mode, company, companies, signedIn }: { mode: ViewMode; company: NavCompany | null; companies: Array<{ id: string; name: string; current: boolean }>; signedIn: boolean }) {
  const pathname = usePathname();
  if (hiddenOn(pathname)) return null;
  const t = LABELS[mode];
  const signOut = <form action={logoutAction}><button className="rounded-md px-3 py-2 text-slate-500 hover:bg-slate-100" type="submit">Sign out</button></form>;
  if (!company) {
    return <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4">
      <span className="text-lg font-bold tracking-tight text-ink">ScorpBook</span>{signedIn && <nav className="text-sm">{signOut}</nav>}
    </div></header>;
  }
  const reports = [
    { href: "/reports/income-statement", label: t.incomeStatement },
    { href: "/reports/balance-sheet", label: t.balanceSheet },
    ...(company.vatRegistered ? [{ href: "/reports/vat-return", label: t.vatReturn }] : []),
    ...(mode === "accountant" ? [{ href: "/reports/trial-balance", label: t.trialBalance }] : []),
  ];
  const setup = [
    { href: "/accounts", label: t.accounts },
    { href: "/suppliers", label: t.suppliers },
    { href: "/banking", label: t.banking },
    { href: "/periods", label: t.periods },
    { href: "/integrations/scorpinvoice", label: "ScorpInvoice sync" },
    { href: "/settings/company", label: "Business details" },
    { href: "/settings/team", label: "Team" },
    { href: "/settings/security", label: "Sign-in security" },
  ];
  return <header className="border-b border-slate-200 bg-white">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="flex min-w-0 items-center gap-2"><Link href="/dashboard" className="text-lg font-bold tracking-tight text-ink">ScorpBook</Link><CompanySwitcher company={company} companies={companies} pathname={pathname} /></div>
      <nav className="flex flex-wrap items-center gap-1 text-sm">
        <NavLink href="/dashboard" label={t.home} pathname={pathname} />
        <NavLink href="/journal" label={t.journal} pathname={pathname} />
        <NavLink href="/bills" label={t.bills} pathname={pathname} />
        <NavLink href="/banking/inbox" label={t.bankInbox} pathname={pathname} />
        <NavMenu label={t.reports} items={reports} pathname={pathname} />
        <NavMenu label={t.setup} items={setup} pathname={pathname} />
        <form action={setViewModeAction} className="ml-2">
          <input type="hidden" name="mode" value={mode === "simple" ? "accountant" : "simple"} />
          <button className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50" type="submit" aria-label={mode === "simple" ? "Accountant view" : "Simple view"} title={mode === "simple" ? "Show standard accounting terms such as debits, credits and the trial balance" : "Switch back to plain-language labels"}>
            {mode === "simple" ? "Accountant view" : "Simple view"}
          </button>
        </form>
        {signOut}
      </nav>
    </div>
  </header>;
}

export function SiteFooter() {
  const pathname = usePathname();
  if (hiddenOn(pathname)) return null;
  return <footer className="mx-auto flex w-full max-w-7xl flex-wrap gap-x-3 px-5 pb-8 text-xs text-slate-400"><span>ScorpBook by Scorpia Tech Ltd · Beta</span><Link href="/privacy" className="hover:text-slate-600">Privacy</Link><Link href="/terms" className="hover:text-slate-600">Terms</Link></footer>;
}
