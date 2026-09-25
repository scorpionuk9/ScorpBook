import type { Metadata } from "next";
import { Navigation } from "@/app/navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScorpBook | 會計總帳",
  description: "Scorpia Tech Ltd 會計總帳與日記帳管理",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>
    <Navigation />
    <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
    <footer className="mx-auto max-w-7xl px-5 pb-8 text-xs text-slate-400">Scorpia Tech Ltd · 固定租戶總帳</footer>
  </body></html>;
}
