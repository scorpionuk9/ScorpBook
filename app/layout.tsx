import type { Metadata } from "next";
import { Navigation, SiteFooter } from "@/app/navigation";
import { getViewMode } from "@/lib/ui/view-mode-server";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScorpBook",
  description: "Bookkeeping for Scorpia Tech Ltd.",
  icons: { icon: "/scorpbook-icon.jpeg", apple: "/scorpbook-icon.jpeg" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const mode = await getViewMode();
  return <html lang="en"><body>
    <div className="flex min-h-screen flex-col">
      <Navigation mode={mode} />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  </body></html>;
}
