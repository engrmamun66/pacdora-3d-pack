import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { SiteTitle } from "@/components/site-brand";
import { UserMenu } from "@/components/app/user-menu";

/**
 * Shell of the customer dashboard: a top bar only, no sidebar (the page needs the whole width for
 * its own category and tag panel). The session is read inside Suspense and every action re-checks it.
 */
export default function DashLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center gap-6 border-b px-6">
        <Link href="/my-dashboard" className="font-semibold">
          <Suspense fallback={null}>
            <SiteTitle />
          </Suspense>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/templates" className="hover:text-foreground">Templates</Link>
          <Link href="/projects" className="hover:text-foreground">Projects</Link>
        </nav>
        <div className="ml-auto">
          <Suspense fallback={<div className="size-8 rounded-full bg-muted" />}>
            <UserMenu />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 p-6">{children}</main>
    </div>
  );
}
