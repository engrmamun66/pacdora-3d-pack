import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { SiteTitle } from "@/components/site-brand";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminUserMenu } from "@/components/admin/admin-user-menu";
import { requireSuperAdmin } from "@/server/admin";
import { db } from "@/server/db";
import { env } from "@/server/env";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin" }, robots: { index: false, follow: false } };

async function HeaderUser() {
  const admin = await requireSuperAdmin();
  const row = await db.user.findUnique({ where: { id: admin.id }, select: { image: true } });
  return <AdminUserMenu name={admin.name} email={admin.email} image={row?.image ?? null} />;
}

/** Shell stays static; every page and action checks the super-admin role itself. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[220px_1fr]">
      <aside className="flex flex-col border-b bg-muted/30 py-4 md:border-r md:border-b-0">
        <p className="px-5 pt-1 font-semibold"><Suspense fallback={null}><SiteTitle /></Suspense></p>
        <p className="px-5 pb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Super admin</p>
        {/* usePathname() needs a Suspense boundary on routes with dynamic segments (e.g. templates/[slug]/edit). */}
        <Suspense fallback={<div className="mx-2 h-32 animate-pulse rounded-md bg-muted" />}>
          <AdminNav />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center justify-between gap-4 border-b px-6">
          <p className="text-sm text-muted-foreground">Administration</p>
          <div className="flex items-center gap-3">
            {/* Main site (the configured app URL), in a new tab. */}
            <a
              href={new URL("/", env.BETTER_AUTH_URL).href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"
            >
              Visit site
              <ExternalLink className="size-3.5" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <Suspense fallback={<div className="size-8 rounded-full bg-muted" />}>
              <HeaderUser />
            </Suspense>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-6">
          <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" />}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}
