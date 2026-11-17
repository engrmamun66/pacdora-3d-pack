import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOwner } from "@/server/portal";
import { getSiteIdentity } from "@/server/site-identity";
import { getCustomer } from "@/server/customer-auth";
import { PortalHeader } from "@/components/portal/portal-header";

/**
 * Shell of a Client's public portal (shared template pages, cart, customer orders). It has nothing of the Client's own
 * dashboard: customers sign in with their mobile number and cannot reach Client pages from here.
 */
async function Shell({ params, children }: { params: Promise<{ userHash: string }>; children: ReactNode }) {
  const { userHash } = await params;
  const owner = await getOwner(userHash);
  if (!owner) notFound();
  const customer = await getCustomer();
  return (
    <>
      <PortalHeader userHash={userHash} title={owner.title} logoUrl={owner.logoUrl} phone={customer?.phone ?? null} homeScope={null} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="border-t border-dashed border-[color-mix(in_oklab,var(--crease)_45%,transparent)] py-5 text-center text-xs text-muted-foreground">
        <span className="font-display text-sm font-semibold text-foreground">{owner.title}</span>
        <span className="mx-2 font-mono">·</span>
        <span className="font-mono">packaging templates</span>
      </footer>
    </>
  );
}

/** The tab shows the Client's business name alone (no site name). Falls back to the site's own title when the address is wrong. */
export async function generateMetadata({ params }: { params: Promise<{ userHash: string }> }): Promise<Metadata> {
  const { userHash } = await params;
  const owner = await getOwner(userHash);
  if (!owner) return { title: (await getSiteIdentity()).title, robots: { index: false, follow: false } };
  return { title: { absolute: owner.title }, robots: { index: false, follow: false } };
}

export default function PortalLayout({ children, params }: { children: ReactNode; params: Promise<{ userHash: string }> }) {
  return (
    <div className="studio flex min-h-screen flex-col bg-background">
      <Suspense fallback={<div className="h-14 border-b" />}>
        <Shell params={params}>{children}</Shell>
      </Suspense>
    </div>
  );
}
