"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowRight, X } from "lucide-react";

const listeners = new Set<() => void>();
const key = (text: string) => `announcement-closed:${text}`;

/**
 * The thin line of text above the menu that an admin switches on under Pages > Header and footer. A visitor can
 * close it; it stays closed for that browser tab until the text changes.
 */
export function Announcement({ text, link }: { text: string; link: { label: string; href: string } | null }) {
  const closed = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => {
      try {
        return sessionStorage.getItem(key(text)) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  if (closed) return null;
  const close = () => {
    try {
      sessionStorage.setItem(key(text), "1");
    } catch {
      // blocked storage: it stays open
    }
    listeners.forEach((l) => l());
  };
  return (
    <div role="region" aria-label="Announcement" className="relative flex min-h-9 items-center justify-center gap-3 bg-[var(--ink,#16213a)] px-10 py-1.5 text-center text-xs text-white sm:text-sm">
      <span className="size-1.5 shrink-0 rounded-full bg-[var(--cut,#e0227a)]" aria-hidden />
      <span>
        {text}
        {link ? (
          <Link href={link.href} className="ml-2 inline-flex items-center gap-1 font-medium underline underline-offset-2">
            {link.label} <ArrowRight className="size-3" aria-hidden />
          </Link>
        ) : null}
      </span>
      <button type="button" onClick={close} aria-label="Close the announcement" className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md hover:bg-white/15"><X className="size-4" aria-hidden /></button>
    </div>
  );
}
