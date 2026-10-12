import type { Metadata } from "next";
import { Navigation, SiteFooter } from "@/app/navigation";
import { getViewMode } from "@/lib/ui/view-mode-server";
import { getOptionalAccountingContext } from "@/lib/accounting/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScorpBook",
  description: "Plain-English bookkeeping for UK small businesses.",
  icons: { icon: "/scorpbook-icon.jpeg", apple: "/scorpbook-icon.jpeg" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [mode, context] = await Promise.all([getViewMode(), getOptionalAccountingContext()]);
  const company = context?.company ? { name: context.company.name, role: context.company.role, vatRegistered: context.company.vat_registered } : null;
  const companies = context?.companies.map(({ id, name }) => ({ id, name, current: id === context.company?.id })) ?? [];
  return <html lang="en"><body>
    <div className="flex min-h-screen flex-col">
      <Navigation mode={mode} company={company} companies={companies} signedIn={Boolean(context)} />
      {company?.role === "VIEWER" && <p className="bg-amber-50 px-5 py-2 text-center text-xs font-medium text-amber-900">You have view-only access to {company.name}. You can look around, but changes are saved by its Owner or Accountant.</p>}
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  </body></html>;
}
