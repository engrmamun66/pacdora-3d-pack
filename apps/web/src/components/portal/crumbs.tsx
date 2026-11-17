"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { ChevronRight } from "lucide-react";
import { portalHome } from "@/lib/portal-paths";

export interface Crumb {
  label: string;
  /** Absent on the page you are on. */
  href?: string;
}

/** Where you are: links back up to the shared template list, and the current page last. */
export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((c, i) => (
          <li key={`${i}-${c.label}`} className="flex min-w-0 items-center gap-1.5">
            {i > 0 ? <ChevronRight className="size-3.5 shrink-0" aria-hidden /> : null}
            {c.href ? (
              <Link href={c.href} className="truncate hover:text-foreground hover:underline">{c.label}</Link>
            ) : (
              <span aria-current="page" className="truncate text-foreground">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

const key = (userHash: string) => `portal-list:${userHash}`;
const listeners = new Set<() => void>();

interface Remembered {
  path: string;
  label: string;
}

/** The shared list this browser looked at last (the cart page has no list in its address, so it asks here). */
function readRaw(userHash: string): string {
  try {
    return sessionStorage.getItem(key(userHash)) ?? "";
  } catch {
    return "";
  }
}

/** Put on a list or template page: the cart, checkout and orders pages then link back to this list. */
export function RememberList({ userHash, path, label }: { userHash: string; path: string; label: string }) {
  useEffect(() => {
    try {
      sessionStorage.setItem(key(userHash), JSON.stringify({ path, label } satisfies Remembered));
    } catch {
      // blocked storage: the pages link to all templates instead
    }
    listeners.forEach((l) => l());
  }, [userHash, path, label]);
  return null;
}

/** Crumbs of the cart, checkout, orders and sign-in pages: back to the list the customer came from, then this page. */
export function PortalCrumbs({ userHash, current, trail = [] }: { userHash: string; current: string; trail?: Crumb[] }) {
  const raw = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => readRaw(userHash),
    () => "",
  );
  let list: Remembered = { path: portalHome(userHash), label: "Templates" };
  try {
    const v = raw ? (JSON.parse(raw) as Partial<Remembered>) : null;
    // Only an address inside this portal is trusted.
    if (v && typeof v.path === "string" && typeof v.label === "string" && v.path.startsWith(`/${userHash}/`)) list = { path: v.path, label: v.label };
  } catch {
    // keep the default
  }
  return <Crumbs items={[{ label: list.label, href: list.path }, ...trail, { label: current }]} />;
}
