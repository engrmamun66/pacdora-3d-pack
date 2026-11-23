"use client";

import { useMemo, useRef, useState } from "react";
import { Scissors, X } from "lucide-react";
import type { FoldRing } from "@packaging/dieline-engine";
import { Button } from "@/components/ui/button";

type Line = readonly number[];

export interface SeamPanel {
  id: string;
  label: string;
  /** Flat x, y, ... in mm. */
  polygon: readonly number[];
}

const same = (a: Line, b: Line) => a.every((v, k) => Math.abs(v - b[k]!) < 0.2) || a.every((v, k) => Math.abs(v - [b[2]!, b[3]!, b[0]!, b[1]!][k]!) < 0.2);
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Where the slits go. Some panels are joined in a circle by fold lines (the petals around a corner), and one fold line of
 * each circle has to stay open: a seam, a slit that is not folded. Pick a circle on the left; its fold lines show on the
 * sheet on the right, big, and a click on one of them makes it the slit. The picture changes at once. Nothing is applied
 * until "Apply", which finds the panels again with these seams.
 */
export function FoldSeamsDialog({
  rings,
  panels,
  cut,
  label,
  onApply,
  onClose,
}: {
  rings: readonly FoldRing[];
  panels: readonly SeamPanel[];
  /** The cut lines of the drawing, for the outline. */
  cut: readonly { pts: number[]; closed: boolean }[];
  label: (panelId: string) => string;
  onApply: (seams: number[][]) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [pins, setPins] = useState<Line[]>(() => rings.map((r) => [...r.open.line]));
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [whole, setWhole] = useState(false);

  const ring = rings[active]!;
  const chosen = (i: number) => rings[i]!.lines.findIndex((l) => same(l.line, pins[i]!));
  const changed = rings.some((r, i) => !same(r.open.line, pins[i]!));
  const pick = (i: number, line: Line) => setPins((cur) => cur.map((p, k) => (k === i ? [...line] : p)));

  const ringPanels = useMemo(() => new Set(ring.lines.flatMap((l) => [l.a, l.b])), [ring]);

  // What the picture shows: this circle close up (or the whole sheet).
  const view = useMemo(() => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const grow = (x: number, y: number) => {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    };
    if (whole) {
      for (const p of panels) for (let i = 0; i < p.polygon.length; i += 2) grow(p.polygon[i]!, p.polygon[i + 1]!);
    } else {
      for (const p of panels) if (ringPanels.has(p.id)) for (let i = 0; i < p.polygon.length; i += 2) grow(p.polygon[i]!, p.polygon[i + 1]!);
      for (const l of ring.lines) {
        grow(l.line[0], l.line[1]);
        grow(l.line[2], l.line[3]);
      }
    }
    if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 100, h: 100 };
    const m = Math.max(x1 - x0, y1 - y0) * 0.08;
    return { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m };
  }, [whole, panels, ring, ringPanels]);
  const font = Math.max(view.w, view.h) * 0.03;
  const centre = (p: SeamPanel) => {
    let x = 0;
    let y = 0;
    const n = p.polygon.length / 2;
    for (let i = 0; i < p.polygon.length; i += 2) {
      x += p.polygon[i]!;
      y += p.polygon[i + 1]!;
    }
    return { x: x / n, y: y / n };
  };

  return (
    <dialog
      ref={(el) => {
        ref.current = el;
        if (el && !el.open) el.showModal();
      }}
      aria-labelledby="seams-title"
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto flex h-[min(46rem,96dvh)] w-[min(76rem,calc(100vw-1rem))] flex-col rounded-xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <div className="min-w-0">
          <h2 id="seams-title" className="font-semibold">Set the slits</h2>
          <p className="text-xs text-muted-foreground">In each circle of panels, one fold line stays open (a slit). Click a line on the sheet to make it the slit.</p>
        </div>
        <button type="button" aria-label="Close" className="rounded p-1 hover:bg-muted" onClick={() => ref.current?.close()}><X className="size-4" /></button>
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[19rem_minmax(0,1fr)]">
        {/* The circles and their lines */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-b p-4 text-sm md:border-r md:border-b-0">
          <div className="flex flex-col gap-1" role="tablist" aria-label="Circles of panels">
            {rings.map((r, i) => {
              const at = chosen(i);
              const l = at >= 0 ? r.lines[at]! : r.open;
              return (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  onClick={() => {
                    setActive(i);
                    setHover(null);
                  }}
                  className={`flex flex-col rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted ${i === active ? "border-primary bg-primary/5" : ""}`}
                >
                  <span className="font-medium">Circle {i + 1} <span className="font-normal text-muted-foreground">· {r.lines.length} lines</span></span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground"><Scissors className="size-3" aria-hidden /> {label(l.a)} | {label(l.b)}</span>
                </button>
              );
            })}
          </div>

          <fieldset className="flex flex-col gap-0.5 border-t pt-3">
            <legend className="mb-1 text-xs font-semibold">Circle {active + 1}: the slit is the line between</legend>
            {ring.lines.map((l, k) => (
              <label key={k} className={`flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-muted ${chosen(active) === k ? "bg-red-50 dark:bg-red-500/10" : ""}`} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)}>
                <input type="radio" name="seam" className="size-4" checked={chosen(active) === k} onChange={() => pick(active, l.line)} />
                <span>{label(l.a)} and {label(l.b)}</span>
              </label>
            ))}
          </fieldset>
        </div>

        {/* The sheet, live */}
        <div className="relative flex min-h-0 flex-col">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-1.5 text-xs">
            <span className="flex items-center gap-1"><i className="inline-block h-0 w-5 border-t-[3px] border-dashed border-red-600" /> slit (open, not folded)</span>
            <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-5 bg-teal-700" /> folds</span>
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 select-none">
              <input type="checkbox" className="size-3.5 accent-primary" checked={whole} onChange={(e) => setWhole(e.target.checked)} />
              Show the whole sheet
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden bg-muted/30 p-2">
            <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className="h-full w-full rounded bg-white" role="img" aria-label={`Circle ${active + 1} on the sheet`}>
              {panels.map((p) => (
                <polygon key={p.id} points={Array.from({ length: p.polygon.length / 2 }, (_, i) => `${round(p.polygon[2 * i]!)},${round(p.polygon[2 * i + 1]!)}`).join(" ")} fill={ringPanels.has(p.id) ? "#fef3c7" : "#f4f4f5"} stroke="#d4d4d8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
              {cut.map((c, i) =>
                c.closed ? (
                  <polygon key={`c${i}`} points={c.pts.map(round).join(" ")} fill="none" stroke="#1e40af" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                ) : (
                  <polyline key={`c${i}`} points={c.pts.map(round).join(" ")} fill="none" stroke="#1e40af" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                ),
              )}
              {/* The slits of the other circles, small */}
              {pins.map((p, i) => (i === active ? null : (
                <g key={`o${i}`}>
                  <line x1={p[0]} y1={p[1]} x2={p[2]} y2={p[3]} stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
                  <line x1={p[0]} y1={p[1]} x2={p[2]} y2={p[3]} stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke" pointerEvents="stroke" className="cursor-pointer" onClick={() => setActive(i)}><title>{`Circle ${i + 1}: open the circle`}</title></line>
                </g>
              )))}
              {ring.lines.map((l, k) => {
                const isSlit = chosen(active) === k;
                const on = hover === k;
                const [x1, y1, x2, y2] = l.line;
                return (
                  <g key={k}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={isSlit ? "#dc2626" : "#0f766e"} strokeWidth={on ? 6 : 4} strokeDasharray={isSlit ? "7 5" : undefined} strokeLinecap="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="transparent"
                      strokeWidth={18}
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="stroke"
                      className="cursor-pointer"
                      onPointerEnter={() => setHover(k)}
                      onPointerLeave={() => setHover(null)}
                      onClick={() => pick(active, l.line)}
                    >
                      <title>{isSlit ? `The slit: ${label(l.a)} and ${label(l.b)}` : `Make this the slit: ${label(l.a)} and ${label(l.b)}`}</title>
                    </line>
                  </g>
                );
              })}
              {panels.filter((p) => whole || ringPanels.has(p.id)).map((p) => {
                const c = centre(p);
                return <text key={`t${p.id}`} x={c.x} y={c.y} textAnchor="middle" dominantBaseline="middle" fontSize={font} fill="#18181b" pointerEvents="none" stroke="#ffffff" strokeWidth={font * 0.25} paintOrder="stroke">{p.label}</text>;
              })}
            </svg>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3">
        <p className="max-w-xl text-xs text-muted-foreground">Apply finds the panels again with these slits. Panel names and kinds, fold steps, directions and angles you changed go back to what is detected. Window holes are kept.</p>
        <div className="flex gap-2">
          <Button type="button" variant="destructive" onClick={() => ref.current?.close()}>Cancel</Button>
          <Button type="button" variant="dark" disabled={!changed} onClick={() => {
            onApply(pins.map((p) => [...p]));
            ref.current?.close();
          }}>Apply</Button>
        </div>
      </div>
    </dialog>
  );
}
