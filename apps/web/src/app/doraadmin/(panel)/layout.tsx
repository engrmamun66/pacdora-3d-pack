import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { SiteBrand } from "@/components/site-brand";
import { AdminCrumbs } from "@/components/admin/admin-crumbs";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminShell } from "@/components/admin/admin-shell";
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
    <AdminShell
      siteUrl={new URL("/", env.BETTER_AUTH_URL).href}
      brand={
        <Suspense fallback={null}>
          <SiteBrand />
        </Suspense>
      }
      // usePathname() needs a Suspense boundary on routes with dynamic segments (e.g. templates/[slug]/edit).
      nav={
        <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-sidebar-accent" />}>
          <AdminNav />
        </Suspense>
      }
      crumbs={
        <Suspense fallback={null}>
          <AdminCrumbs />
        </Suspense>
      }
      user={
        <Suspense fallback={<div className="size-9 rounded-full bg-muted" />}>
          <HeaderUser />
        </Suspense>
      }
    >
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>{children}</Suspense>
    </AdminShell>
  );
}
