import type { ReactNode } from "react";
import { SiteHeader } from "@/components/marketing/site-header";

/** Inner pages that keep the site header (no dashboard sidebar). */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader solid />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
