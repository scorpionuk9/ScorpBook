import type { Metadata } from "next";
import { Navigation, SiteFooter } from "@/app/navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScorpBook | 會計總帳",
  description: "Scorpia Tech Ltd 會計總帳與日記帳管理",
  icons: { icon: "/scorpbook-icon.jpeg", apple: "/scorpbook-icon.jpeg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>
    <div className="flex min-h-screen flex-col">
      <Navigation />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  </body></html>;
}
