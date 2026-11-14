"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Switching between two views (Dieline | 3D) where one of them is slow to build.
 * - `tab` is the choice: it changes at once, so the tab lights up on the click.
 * - `mounted` is the view that is really on screen. It follows `tab` two frames later, so the loading
 *   placeholder is painted before the slow build blocks the page.
 * - `switching` is true from the click until the new view says it is drawn (`markReady`). The tabs stay disabled meanwhile.
 * A safety timer ends `switching` even if a view never reports.
 * `extraDelay(from, to)` (ms) holds the mount back a little longer, e.g. while a sidebar animation plays on a free main thread.
 * `instant(from, to)` marks a switch that builds nothing slow (the views are only moved): no waiting for `markReady`, no placeholder.
 */
export function useViewSwitch<T extends string>(initial: T, extraDelay?: (from: T, to: T) => number, instant?: (from: T, to: T) => boolean) {
  const [tab, setTab] = useState<T>(initial);
  const [mounted, setMounted] = useState<T>(initial);
  const [ready, setReady] = useState(true);
  const switching = tab !== mounted || !ready;
  const latest = useRef({ tab, mounted });
  useEffect(() => {
    latest.current = { tab, mounted };
  });

  const instantRef = useRef(instant);
  useEffect(() => {
    instantRef.current = instant;
  });
  const select = (next: T) => {
    if (switching || next === tab) return;
    setTab(next);
    if (!instantRef.current?.(tab, next)) setReady(false);
  };

  const delayRef = useRef(extraDelay);
  useEffect(() => {
    delayRef.current = extraDelay;
  });
  useEffect(() => {
    if (tab === mounted) return;
    let second = 0;
    let wait = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const ms = delayRef.current?.(mounted, tab) ?? 0;
        if (ms > 0) wait = window.setTimeout(() => setMounted(tab), ms);
        else setMounted(tab);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      window.clearTimeout(wait);
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

/** How long the Dieline <-> 3D exchange takes (ms), and its easing. */
export const SWAP_MS = 520;
export const SWAP_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Wraps a view that has just taken a new place: it starts where `getFrom()` says the other view was (moved and scaled
 * there) and glides to its own place. Read once, when it mounts; no rectangle = no motion (first load, other switches).
 */
export function SwapIn({ getFrom, className, children }: { getFrom: () => DOMRect | null | undefined; className?: string; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  const from = useRef(getFrom);
  useLayoutEffect(() => {
    const node = el.current;
    const start = from.current();
    if (!node || !start || typeof node.animate !== "function") return;
    const end = node.getBoundingClientRect();
    if (end.width < 1 || end.height < 1 || start.width < 1 || start.height < 1) return;
    const dx = start.left - end.left;
    const dy = start.top - end.top;
    const sx = start.width / end.width;
    const sy = start.height / end.height;
    const run = node.animate(
      [
        { transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.4 },
        { transformOrigin: "0 0", transform: "none", opacity: 1 },
      ],
      { duration: SWAP_MS, easing: SWAP_EASE },
    );
    return () => run.cancel();
  }, []);
  return (
    <div ref={el} className={className}>
      {children}
    </div>
  );
}

/** A grid of soft cells that pulse in a diagonal wave (the Split placeholder's look). */
function GridWave({ label }: { label: string }) {
  const cols = 6;
  const rows = 7;
  return (
    <div role="status" aria-live="polite" className="absolute inset-0 z-10 overflow-hidden bg-background p-5">
      <span className="sr-only">{label}</span>
      <div aria-hidden className="grid size-full gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols * rows }, (_, i) => (
          <div key={i} className="animate-pulse rounded-lg bg-muted-foreground/15" style={{ animationDelay: `${((i % cols) + Math.floor(i / cols)) * 110}ms`, animationDuration: "1.6s" }} />
        ))}
      </div>
    </div>
  );
}

/** Placeholder for the Split view: two grids of pulsing cells side by side (sheet on the left, 3D box on the right), at the width the split will have. */
export function SplitSkeleton({ pct, label }: { pct: number; label: string }) {
  return (
    <div role="status" aria-live="polite" style={{ "--split": `${pct}%` } as React.CSSProperties} className="absolute inset-0 z-10 flex flex-col bg-background lg:flex-row">
      <span className="sr-only">{label}</span>
      <div className="relative min-h-0 flex-1 lg:flex-none lg:basis-(--split) lg:border-r">
        <GridWave label="Loading the dieline" />
      </div>
      <div className="relative min-h-0 flex-1">
        <GridWave label="Loading the 3D view" />
      </div>
    </div>
  );
}
