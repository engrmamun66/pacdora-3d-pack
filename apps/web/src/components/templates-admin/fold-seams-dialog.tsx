"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus, Scissors, X } from "lucide-react";
import type { FoldRing } from "@packaging/dieline-engine";
import { Button } from "@/components/ui/button";

type Line = readonly number[];

export interface SeamPanel {
  id: string;
  label: string;
  /** Flat x, y, ... in mm. */
  polygon: readonly number[];
}

/** A fold line of the sheet that can be made a slit: its two end points (mm) and the two panels it joins. */
export interface SeamLine {
  line: Line;
  a: string;
  b: string;
}

const same = (a: Line, b: Line) => a.every((v, k) => Math.abs(v - b[k]!) < 0.2) || a.every((v, k) => Math.abs(v - [b[2]!, b[3]!, b[0]!, b[1]!][k]!) < 0.2);
const round = (n: number) => Math.round(n * 100) / 100;
const dedupe = (lines: readonly Line[]): Line[] => lines.reduce<Line[]>((out, l) => (out.some((o) => same(o, l)) ? out : [...out, l]), []);

/**
 * Where the slits go, in the admin's hands. Every fold line of the sheet is shown. Click a line to make it a slit (red
 * dashed: open, not folded); click it again to make it a fold again. Panels joined in a circle (the petals around a corner)
 * need one slit in the circle; where the admin leaves none, one is picked automatically. Zoom with the wheel, drag to move.
 * Nothing is applied until "Apply", which finds the panels again with these slits.
 */
export function FoldSeamsDialog({
  lines,
  rings,
  slits,
  panels,
  cut,
  label,
  onApply,
  onClose,
}: {
  /** The fold lines in use now, and the lines left open now (a slit can be taken back). */
  lines: readonly SeamLine[];
  rings: readonly FoldRing[];
  /** Slits chosen before (by Apply). Together with the lines the detection left open, they are the slits at the start. */
  slits: readonly Line[];
  panels: readonly SeamPanel[];
  /** The cut lines of the drawing, for the outline. */
  cut: readonly { pts: number[]; closed: boolean }[];
  label: (panelId: string) => string;
  onApply: (slits: number[][]) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragged = useRef(false);

  // Every line that can be clicked: the fold lines in use, and the lines left open that a circle offers.
  const all = useMemo<SeamLine[]>(() => {
    const out = [...lines];
    for (const r of rings) for (const l of r.lines) if (!out.some((o) => same(o.line, l.line))) out.push({ line: l.line, a: l.a, b: l.b });
    return out;
  }, [lines, rings]);
  const initial = useMemo(() => dedupe([...slits, ...rings.map((r) => r.open.line)]), [slits, rings]);
  const [selected, setSelected] = useState<Line[]>(initial);
  const [hover, setHover] = useState<Line | null>(null);
  const isSlit = (l: Line) => selected.some((s) => same(s, l));
  const toggle = (l: Line) => setSelected((cur) => (cur.some((s) => same(s, l)) ? cur.filter((s) => !same(s, l)) : [...cur, l]));
  const changed = selected.length !== initial.length || selected.some((s) => !initial.some((i) => same(i, s)));

  // What each circle has now: how many of its lines are slits.
  const ringState = rings.map((r) => ({ ring: r, count: r.lines.filter((l) => selected.some((s) => same(s, l.line))).length }));
  const inRing = (l: Line) => rings.some((r) => r.lines.some((x) => same(x.line, l)));
  const undecided = (l: Line) => ringState.some((s) => s.count === 0 && s.ring.lines.some((x) => same(x.line, l)));
  const labelOf = (l: Line) => {
    const f = all.find((x) => same(x.line, l));
    return f ? `${label(f.a)} | ${label(f.b)}` : "a fold line";
  };

  // Zoom and pan: the box of the sheet the picture shows.
  const [moved, setMoved] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const view = useMemo(() => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of panels) {
      for (let i = 0; i < p.polygon.length; i += 2) {
        x0 = Math.min(x0, p.polygon[i]!);
        y0 = Math.min(y0, p.polygon[i + 1]!);
        x1 = Math.max(x1, p.polygon[i]!);
        y1 = Math.max(y1, p.polygon[i + 1]!);
      }
    }
    if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 100, h: 100 };
    const m = Math.max(x1 - x0, y1 - y0) * 0.04;
    return { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m };
  }, [panels]);
  const box = moved ?? view;
  const unit = 1 / Math.min(size.w / box.w, size.h / box.h); // sheet mm per screen pixel
  // Names stay a small, readable size on screen, a little larger as the sheet is zoomed in.
  const zoomed = Math.max(1, view.w / box.w);
  const font = Math.min(13, 7 * Math.sqrt(zoomed)) * unit;
  const zoomAt = (f: number, at: { x: number; y: number } | null) => {
    const w = Math.min(view.w * 1.5, Math.max(view.w / 40, box.w / f));
    const k = w / box.w;
    const c = at ?? { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    setMoved({ x: c.x - (c.x - box.x) * k, y: c.y - (c.y - box.y) * k, w, h: box.h * k });
  };
  /** Bring a circle into view. */
  const showRing = (r: FoldRing) => {
    const ids = new Set(r.lines.flatMap((l) => [l.a, l.b]));
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of panels) {
      if (!ids.has(p.id)) continue;
      for (let i = 0; i < p.polygon.length; i += 2) {
        x0 = Math.min(x0, p.polygon[i]!);
        y0 = Math.min(y0, p.polygon[i + 1]!);
        x1 = Math.max(x1, p.polygon[i]!);
        y1 = Math.max(y1, p.polygon[i + 1]!);
      }
    }
    if (!Number.isFinite(x0)) return;
    const m = Math.max(x1 - x0, y1 - y0) * 0.1;
    const w = x1 - x0 + 2 * m;
    const h = y1 - y0 + 2 * m;
    // Keep the shape of the picture: widen the box that is too narrow.
    const aspect = size.w / size.h;
    const bw = Math.max(w, h * aspect);
    const bh = bw / aspect;
    setMoved({ x: (x0 + x1) / 2 - bw / 2, y: (y0 + y1) / 2 - bh / 2, w: bw, h: bh });
  };

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const watch = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const onWheel = useEffectEvent((e: WheelEvent) => {
    e.preventDefault();
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const at = pt.matrixTransform(m.inverse());
    zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), { x: at.x, y: at.y });
  });
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const startPan = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button > 2) return;
    const svg = e.currentTarget;
    const m = svg.getScreenCTM();
    if (!m) return;
    dragged.current = false;
    const from = { x: e.clientX, y: e.clientY };
    const origin = box;
    const u = 1 / m.a;
    const id = e.pointerId;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - from.x;
      const dy = ev.clientY - from.y;
      if (!dragged.current && Math.hypot(dx, dy) < 5) return;
      // Capture only once it is a drag: capturing at pointer down sends the click to the sheet, so no line gets it.
      if (!dragged.current) svg.setPointerCapture(id);
      dragged.current = true;
      setMoved({ ...origin, x: origin.x - dx * u, y: origin.y - dy * u });
    };
    const up = () => {
      svg.removeEventListener("pointermove", move);
      svg.removeEventListener("pointerup", up);
      svg.removeEventListener("pointercancel", up);
      // A click that ends a drag must not pick a line: let it pass first.
      window.setTimeout(() => (dragged.current = false), 0);
    };
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);
  };

  const ringPanels = useMemo(() => new Set(rings.flatMap((r) => r.lines.flatMap((l) => [l.a, l.b]))), [rings]);
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
  const bridges = selected.filter((s) => !inRing(s)).length;
  const cutOff = ringState.filter((s) => s.count >= 2).length;

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
          <p className="text-xs text-muted-foreground">Click a fold line to make it a slit (open, not folded). Click it again to make it a fold again.</p>
        </div>
        <button type="button" aria-label="Close" className="rounded p-1 hover:bg-muted" onClick={() => ref.current?.close()}><X className="size-4" /></button>
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto border-b p-4 text-sm md:border-r md:border-b-0">
          <section aria-label="Slits">
            <h3 className="mb-1 flex items-center gap-1.5 font-semibold"><Scissors className="size-3.5" aria-hidden /> Slits <span className="rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums">{selected.length}</span></h3>
            {selected.length === 0 ? <p className="text-xs text-muted-foreground">No slit. Click a fold line on the sheet.</p> : (
              <ul className="flex flex-col gap-0.5">
                {selected.map((s) => (
                  <li key={s.join(",")} className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-muted" onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(null)}>
                    <span className="min-w-0 flex-1 truncate">{labelOf(s)}</span>
                    {!inRing(s) ? <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[10px] font-medium text-amber-900" title="This line is not part of a circle: it is the only connection of a panel, so that panel would be cut off">only link</span> : null}
                    <button type="button" aria-label={`Make ${labelOf(s)} a fold again`} title="Make it a fold again" className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground" onClick={() => toggle(s)}><X className="size-3" /></button>
                  </li>
                ))}
              </ul>
            )}
            {bridges > 0 ? <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">{bridges === 1 ? "One slit is" : `${bridges} slits are`} the only link of a panel to the box: that panel will be left out.</p> : null}
          </section>

          {rings.length > 0 ? (
            <section aria-label="Circles of panels">
              <h3 className="mb-1 font-semibold">Circles of panels <span className="rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums">{rings.length}</span></h3>
              <p className="mb-2 text-xs text-muted-foreground">Panels joined in a circle (the petals around a corner) need one slit in the circle. If you leave none, one is picked for you.</p>
              <ul className="flex flex-col gap-1">
                {ringState.map(({ ring, count }, i) => (
                  <li key={i}>
                    <button type="button" className="flex w-full flex-col rounded-lg border px-3 py-1.5 text-left hover:bg-muted" onClick={() => showRing(ring)}>
                      <span className="font-medium">Circle {i + 1} <span className="font-normal text-muted-foreground">· {ring.lines.length} lines</span></span>
                      <span className={`text-xs ${count === 1 ? "text-muted-foreground" : "text-amber-800 dark:text-amber-300"}`}>
                        {count === 1 ? "1 slit" : count === 0 ? "no slit: one is picked for you" : `${count} slits: part of the circle is cut off`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {cutOff > 0 ? <p className="text-xs text-amber-800 dark:text-amber-300">A circle with two or more slits falls apart there. That is allowed, but check it.</p> : null}
        </div>

        <div className="relative flex min-h-0 flex-col">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-1.5 text-xs">
            <span className="flex items-center gap-1"><i className="inline-block h-0 w-5 border-t-[3px] border-dashed border-red-600" /> slit (open)</span>
            <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-5 bg-teal-700" /> fold</span>
            <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-5 bg-amber-500" /> circle without a slit</span>
            <span className="ml-auto flex items-center gap-1">
              <button type="button" aria-label="Zoom out" className="grid size-7 place-items-center rounded border hover:bg-muted" onClick={() => zoomAt(1 / 1.5, null)}><Minus className="size-3.5" /></button>
              <button type="button" aria-label="Zoom in" className="grid size-7 place-items-center rounded border hover:bg-muted" onClick={() => zoomAt(1.5, null)}><Plus className="size-3.5" /></button>
              <button type="button" aria-label="Fit to the window" title="Fit to the window" className="grid size-7 place-items-center rounded border hover:bg-muted" onClick={() => setMoved(null)}><Maximize2 className="size-3.5" /></button>
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden bg-muted/30 p-2">
            <svg ref={svgRef} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="h-full w-full cursor-grab touch-none rounded bg-white active:cursor-grabbing" role="img" aria-label="The sheet with its fold lines" onPointerDown={startPan}>
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
              {all.map((l) => {
                const slit = isSlit(l.line);
                const on = hover !== null && same(hover, l.line);
                const [x1, y1, x2, y2] = l.line;
                const stroke = slit ? "#dc2626" : undecided(l.line) ? "#f59e0b" : "#0f766e";
                return (
                  <g key={l.line.join(",")}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={on ? 6 : slit ? 4 : 3} strokeDasharray={slit ? "7 5" : undefined} strokeLinecap="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="transparent"
                      strokeWidth={16}
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="stroke"
                      className="cursor-pointer"
                      onPointerEnter={() => setHover(l.line)}
                      onPointerLeave={() => setHover(null)}
                      onClick={() => !dragged.current && toggle(l.line)}
                    >
                      <title>{slit ? `Slit: ${label(l.a)} | ${label(l.b)}. Click to make it a fold again.` : `Fold: ${label(l.a)} | ${label(l.b)}. Click to make it a slit.`}</title>
                    </line>
                  </g>
                );
              })}
              {panels.map((p) => {
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
            onApply(selected.map((s) => [...s]));
            ref.current?.close();
          }}>Apply</Button>
        </div>
      </div>
    </dialog>
  );
}
