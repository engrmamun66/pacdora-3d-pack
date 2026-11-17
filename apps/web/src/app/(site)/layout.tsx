import { Suspense, type ReactNode } from "react";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

/** Inner pages that keep the site header and footer (no dashboard sidebar). */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="studio flex min-h-screen flex-col bg-background">
      <SiteHeader solid />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <Suspense fallback={null}>
        <SiteFooter />
      </Suspense>
    </div>
  );
}
