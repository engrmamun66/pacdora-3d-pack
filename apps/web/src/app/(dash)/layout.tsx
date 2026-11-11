import type { ReactNode } from "react";
import { SiteHeader } from "@/components/marketing/site-header";

/**
 * Shell of the customer dashboard: the same header as the home page (logo and menu), with the
 * account menu in place of the sign-in buttons. No sidebar. The session is read inside Suspense
 * and every action re-checks it.
 */
export default function DashLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader solid inApp />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
