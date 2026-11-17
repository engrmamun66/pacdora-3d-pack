"use client";

import { useEffect, useState } from "react";
import { ViewSkeleton } from "@/components/dielines/view-switch";

/** Column widths of the editor (px). Keep in step with LEFT_W and RIGHT_W in artwork-editor.tsx (not imported: that file pulls in the canvas library). */
const LEFT_W = 240;
const RIGHT_W = 288;

const Bar = ({ className = "", style }: { className?: string; style?: React.CSSProperties }) => <div aria-hidden style={style} className={`animate-pulse rounded-md bg-muted motion-reduce:animate-none ${className}`} />;

/**
 * What the Online design page looks like while it loads: the editor's own layout (top bar, layers and pictures on the left, the
 * dieline, the 3D view, the properties on the right) as pulsing blocks. The dieline and the 3D view use the same animated sketches
 * as the Split tab of the dieline page: the panels of a dieline pulse in turn, and a floor grid drifts toward the viewer.
 */
export function EditorSkeleton({ label = "Loading the editor" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid h-screen grid-rows-[48px_1fr] overflow-hidden bg-background">
      <span className="sr-only">{label}</span>
      <header className="flex items-center gap-2 border-b px-3">
        <Bar className="mr-2 h-6 w-40" />
        {Array.from({ length: 6 }, (_, i) => (
          <Bar key={i} className="size-8" />
        ))}
        <div className="flex-1" />
        <Bar className="h-8 w-24" />
        <Bar className="h-8 w-16" />
      </header>
      <div className="grid min-h-0" style={{ gridTemplateColumns: `${LEFT_W}px minmax(0,1fr) minmax(280px,38%) ${RIGHT_W}px` }}>
        <aside className="flex min-h-0 flex-col gap-2 overflow-hidden border-r p-3">
          <Bar className="h-3 w-16" />
          {[80, 64, 72].map((w, i) => (
            <Bar key={i} className="h-6" style={{ width: `${w}%` }} />
          ))}
          <div className="mt-3 flex gap-2">
            <Bar className="h-6 w-16" />
            <Bar className="h-6 w-16" />
            <Bar className="h-6 w-16" />
          </div>
          <Bar className="h-14 w-full" />
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 9 }, (_, i) => (
              <Bar key={i} className="aspect-square" />
            ))}
          </div>
        </aside>
        <main className="relative min-w-0">
          <ViewSkeleton kind="sheet" label="Loading the dieline" />
        </main>
        <section className="relative min-w-0 border-l">
          <ViewSkeleton kind="box" label="Loading the 3D view" />
        </section>
        <aside className="flex flex-col gap-3 overflow-hidden border-l p-3">
          <Bar className="h-3 w-24" />
          <Bar className="h-8 w-full" />
          <Bar className="h-8 w-full" />
          <Bar className="h-24 w-full" />
          <Bar className="h-8 w-full" />
          <Bar className="h-8 w-3/4" />
        </aside>
      </div>
    </div>
  );
}

/** How long the skeleton takes to fade away once the editor is drawn (ms). */
const FADE_MS = 320;

/** The skeleton over a page that is still starting up; it fades out as one piece when `show` ends, then leaves the page. */
export function EditorSkeletonOverlay({ show }: { show: boolean }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (show) return;
    const t = window.setTimeout(() => setGone(true), FADE_MS + 40);
    return () => window.clearTimeout(t);
  }, [show]);
  if (gone) return null;
  return (
    <div className={`fixed inset-0 z-50 transition-opacity ease-out ${show ? "opacity-100" : "pointer-events-none opacity-0"}`} style={{ transitionDuration: `${FADE_MS}ms` }}>
      <EditorSkeleton />
    </div>
  );
}
