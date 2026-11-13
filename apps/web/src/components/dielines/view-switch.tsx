"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Switching between two views (Dieline | 3D) where one of them is slow to build.
 * - `tab` is the choice: it changes at once, so the tab lights up on the click.
 * - `mounted` is the view that is really on screen. It follows `tab` two frames later, so the loading
 *   placeholder is painted before the slow build blocks the page.
 * - `switching` is true from the click until the new view says it is drawn (`markReady`). The tabs stay disabled meanwhile.
 * A safety timer ends `switching` even if a view never reports.
 */
export function useViewSwitch<T extends string>(initial: T) {
  const [tab, setTab] = useState<T>(initial);
  const [mounted, setMounted] = useState<T>(initial);
  const [ready, setReady] = useState(true);
  const switching = tab !== mounted || !ready;
  const latest = useRef({ tab, mounted });
  useEffect(() => {
    latest.current = { tab, mounted };
  });

  const select = (next: T) => {
    if (switching || next === tab) return;
    setTab(next);
    setReady(false);
  };

  useEffect(() => {
    if (tab === mounted) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setMounted(tab));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [tab, mounted]);

  useEffect(() => {
    if (ready) return;
    const t = window.setTimeout(() => setReady(true), 10000);
    return () => window.clearTimeout(t);
  }, [ready]);

  /** The view on screen is drawn. Ignored until the chosen view is the mounted one. */
  const markReady = useCallback(() => {
    if (latest.current.tab === latest.current.mounted) setReady(true);
  }, []);

  return { tab, mounted, switching, select, markReady };
}

/** Pulsing placeholder that covers a view while it loads (put it in a `relative` container). */
export function ViewSkeleton({ kind, label }: { kind: "sheet" | "box"; label: string }) {
  const block = "rounded-lg bg-muted-foreground/15";
  return (
    <div role="status" aria-live="polite" className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden rounded-[inherit] bg-background">
      <span className="sr-only">{label}</span>
      {kind === "sheet" ? (
        <div aria-hidden className="grid aspect-[4/3] w-[min(70%,420px)] animate-pulse grid-cols-4 grid-rows-3 gap-2">
          {[0, 1, 0, 0, 1, 1, 1, 1, 0, 1, 0, 0].map((on, i) => (on ? <div key={i} className={block} /> : <div key={i} />))}
        </div>
      ) : (
        <div aria-hidden className="flex w-[min(60%,320px)] animate-pulse flex-col items-center gap-4">
          <div className={`aspect-[4/3] w-full rounded-2xl ${block.replace("rounded-lg ", "")}`} />
          <div className={`h-3 w-2/3 ${block}`} />
        </div>
      )}
    </div>
  );
}
