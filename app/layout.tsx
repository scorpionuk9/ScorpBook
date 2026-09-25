import type { Metadata } from "next";
import { Navigation, SiteFooter } from "@/app/navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScorpBook | General Ledger",
  description: "Accounting journal and chart of accounts for Scorpia Tech Ltd.",
  icons: { icon: "/scorpbook-icon.jpeg", apple: "/scorpbook-icon.jpeg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    <div className="flex min-h-screen flex-col">
      <Navigation />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  </body></html>;
}
