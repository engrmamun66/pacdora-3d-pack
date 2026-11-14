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

/**
 * Placeholder that covers a view while it loads (put it in a `relative` container). One look everywhere: the sheet is a
 * dieline sketch with pulsing panels and marching creases, the 3D box is a floor grid in perspective drifting toward the viewer.
 */
export function ViewSkeleton({ kind, label }: { kind: "sheet" | "box"; label: string }) {
  return kind === "sheet" ? <DielineSketch label={label} /> : <FloorGridSketch label={label} />;
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

/** Sheet placeholder for Split: a box dieline (cross of panels, flaps, a glue tab) whose panels pulse in turn while its crease lines march. */
function DielineSketch({ label }: { label: string }) {
  const panels: { x: number; y: number; w: number; h: number }[] = [
    { x: 150, y: 40, w: 120, h: 60 },
    { x: 90, y: 100, w: 60, h: 100 },
    { x: 150, y: 100, w: 120, h: 100 },
    { x: 270, y: 100, w: 60, h: 100 },
    { x: 330, y: 100, w: 60, h: 100 },
    { x: 150, y: 200, w: 120, h: 60 },
  ];
  return (
    <div role="status" aria-live="polite" className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden rounded-[inherit] bg-background">
      <span className="sr-only">{label}</span>
      <svg aria-hidden viewBox="60 20 360 260" className="w-[min(78%,520px)] text-muted-foreground" fill="none">
        {panels.map((p, i) => (
          <rect key={i} {...p} rx={4} className="animate-pulse fill-current" fillOpacity={0.06} style={{ animationDelay: `${i * 160}ms`, animationDuration: "1.5s" }} />
        ))}
        <g stroke="currentColor" strokeOpacity={0.28} strokeWidth={1.4} strokeDasharray="6 4" className="dl-march">
          <path d="M150 100V200M270 100V200M330 100V200M150 100H270M150 200H270" />
        </g>
        <path d="M150 40H270V100H330V200H270V260H150V200H90V100H150ZM330 100H390V200H330" stroke="currentColor" strokeOpacity={0.2} strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** 3D placeholder for Split: a floor grid in perspective (like the one under the box) drifting toward the viewer. */
function FloorGridSketch({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="absolute inset-0 z-10 overflow-hidden rounded-[inherit] bg-muted/40">
      <span className="sr-only">{label}</span>
      <div aria-hidden className="absolute inset-x-0 top-0 h-full" style={{ perspective: "650px", perspectiveOrigin: "50% 8%" }}>
        <div className="floor-grid absolute left-[-60%] top-[6%] h-[170%] w-[220%] origin-top" style={{ transform: "rotateX(64deg)" }} />
      </div>
    </div>
  );
}

/** Placeholder for the Split view: the same two looks side by side (dieline left, 3D right), at the width the split will have. */
export function SplitSkeleton({ pct, label }: { pct: number; label: string }) {
  return (
    <div role="status" aria-live="polite" style={{ "--split": `${pct}%` } as React.CSSProperties} className="absolute inset-0 z-10 flex flex-col bg-background lg:flex-row">
      <span className="sr-only">{label}</span>
      <div className="relative min-h-0 flex-1 lg:flex-none lg:basis-(--split) lg:border-r">
        <ViewSkeleton kind="sheet" label="Loading the dieline" />
      </div>
      <div className="relative min-h-0 flex-1">
        <ViewSkeleton kind="box" label="Loading the 3D view" />
      </div>
    </div>
  );
}

/** How long the placeholder takes to fade away once the views are drawn (ms). */
const FADE_MS = 280;

/**
 * The placeholder over a view that is loading: Dieline and 3D show their own look, Split shows both side by side.
 * It stays until `show` ends and then fades away as one piece, so both halves of Split go together.
 */
export function SkeletonOverlay({ show, tab, pct }: { show: boolean; tab: "dieline" | "3d" | "split"; pct: number }) {
  const [last, setLast] = useState(tab);
  if (show && last !== tab) setLast(tab);
  const [wasShown, setWasShown] = useState(show);
  const [linger, setLinger] = useState(false);
  if (show !== wasShown) {
    setWasShown(show);
    if (!show) setLinger(true);
  }
  if (show && linger) setLinger(false);
  useEffect(() => {
    if (!linger) return;
    const t = window.setTimeout(() => setLinger(false), FADE_MS + 40);
    return () => window.clearTimeout(t);
  }, [linger]);
  if (!show && !linger) return null;
  return (
    <div className={`absolute inset-0 z-10 transition-opacity ease-out ${show ? "opacity-100" : "pointer-events-none opacity-0"}`} style={{ transitionDuration: `${FADE_MS}ms` }}>
      {last === "split" ? <SplitSkeleton pct={pct} label="Loading the split view" /> : <ViewSkeleton kind={last === "dieline" ? "sheet" : "box"} label={last === "3d" ? "Loading the 3D view" : "Loading the dieline"} />}
    </div>
  );
}
