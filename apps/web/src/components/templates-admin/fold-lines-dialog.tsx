"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Wand2, X } from "lucide-react";
import { extendFoldLines, type FlatDieline } from "@packaging/dieline-engine";
import { Button } from "@/components/ui/button";
import { dragEnd, extendEnd, lengthOf, segmentsOf, type End } from "@/lib/fold-line-edit";

export interface FoldLine {
  id: number;
  /** Flat x, y, ... in mm. */
  pts: number[];
}

export interface CutPath {
  pts: number[];
  closed: boolean;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const sameAs = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => round(v) === round(b[i]!));

/** One line of text per fold line, so a line is easy to find and to change. */
const toText = (lines: readonly FoldLine[]) => `[\n${lines.map((l) => `  {"id": ${l.id}, "pts": [${l.pts.map(round).join(", ")}]}`).join(",\n")}\n]`;

type Parsed = { ok: true; edits: Record<number, number[]> } | { ok: false; message: string };

/** The raw data back to lines. Only the points may change: not the list, not the ids. */
function parse(text: string, lines: readonly FoldLine[]): Parsed {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, message: `This is not valid JSON: ${e instanceof Error ? e.message : "check the commas and brackets"}.` };
  }
  if (!Array.isArray(data)) return { ok: false, message: "The data must be a list: [ {...}, {...} ]." };
  const known = new Map(lines.map((l) => [l.id, l]));
  const seen = new Set<number>();
  const edits: Record<number, number[]> = {};
  for (const item of data) {
    const row = item as { id?: unknown; pts?: unknown } | null;
    const id = row?.id;
    if (typeof id !== "number" || !known.has(id)) return { ok: false, message: `Line ${String(id)} is not one of this template's fold lines. Do not add or rename lines.` };
    if (seen.has(id)) return { ok: false, message: `Line ${id} is listed twice.` };
    seen.add(id);
    const pts = row?.pts;
    if (!Array.isArray(pts) || pts.length < 4 || pts.length % 2 !== 0 || pts.some((v) => typeof v !== "number" || !Number.isFinite(v))) {
      return { ok: false, message: `Line ${id} needs "pts" with at least two points as numbers: x, y, x, y.` };
    }
    if (!sameAs(pts as number[], known.get(id)!.pts)) edits[id] = pts as number[];
  }
  for (const l of lines) if (!seen.has(l.id)) return { ok: false, message: `Line ${l.id} is missing. Keep every fold line in the list.` };
  return { ok: true, edits };
}

const HANDLE_PX = 7;
const SNAP_PX = 10;

/**
 * Picture of the sheet with its fold lines. Click a fold line to select it, then drag one of its two end handles to make
 * it longer or shorter: an end slides along the line's own direction only (the line is never moved or turned), and it
 * snaps to the cut outline or another fold when it gets close. "To outline" buttons and "Extend all" do it in one click.
 * The raw data (JSON) is under "Raw data" for exact numbers. Nothing is applied until "Apply"; then the 3D fold has to be
 * detected again, and it works from the changed lines.
 */
export function FoldLinesDialog({
  lines,
  cut,
  widthMm,
  heightMm,
  onApply,
  onClose,
}: {
  lines: readonly FoldLine[];
  /** The cut lines of the drawing, drawn as the outline the fold lines should reach. */
  cut: readonly CutPath[];
  widthMm: number;
  heightMm: number;
  onApply: (changes: FoldLine[]) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Only the lines that were changed here: id -> new points.
  const [edits, setEdits] = useState<Record<number, number[]>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pxW, setPxW] = useState(800);
  const [drag, setDrag] = useState<{ id: number; end: End } | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [rawDraft, setRawDraft] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const current = useMemo(() => lines.map((l): FoldLine => ({ id: l.id, pts: edits[l.id] ?? l.pts })), [lines, edits]);
  const byId = useMemo(() => new Map(current.map((l) => [l.id, l])), [current]);
  const cutSegs = useMemo(() => segmentsOf(cut), [cut]);
  const changedIds = useMemo(() => lines.filter((l) => edits[l.id] && !sameAs(edits[l.id]!, l.pts)).map((l) => l.id), [lines, edits]);
  const raw = rawDraft ?? toText(current);
  const rawResult = useMemo(() => (rawDraft === null ? null : parse(rawDraft, lines)), [rawDraft, lines]);

  // The picture is drawn at its real size in pixels, so the handles keep one size however far the sheet is zoomed.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const watch = new ResizeObserver(() => setPxW(el.getBoundingClientRect().width || 800));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const margin = Math.max(widthMm, heightMm) * 0.04;
  const vbW = widthMm + 2 * margin;
  const vbH = heightMm + 2 * margin;
  const unit = vbW / pxW; // mm per screen pixel
  const targetsFor = (id: number) => [...cutSegs, ...segmentsOf(current.filter((l) => l.id !== id).map((l) => ({ pts: l.pts })))];

  const setLine = (id: number, pts: number[]) => setEdits((cur) => ({ ...cur, [id]: pts }));
  const resetLine = (id: number) => setEdits((cur) => Object.fromEntries(Object.entries(cur).filter(([key]) => Number(key) !== id)));

  const pointerMm = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const q = p.matrixTransform(m.inverse());
    return { x: q.x, y: q.y };
  };

  const sel = selected === null ? null : byId.get(selected) ?? null;
  const selOriginal = selected === null ? null : lines.find((l) => l.id === selected) ?? null;

  const extendAll = () => {
    const flat: FlatDieline = { cut: cut.map((c) => ({ pts: c.pts, closed: c.closed })), crease: current.map((l) => ({ pts: l.pts, closed: false })), bleed: [], guide: [] };
    // Same rule as the automatic fold detection (it may extend a free end up to a share of the sheet size, and cuts back what runs past the outline).
    const r = extendFoldLines(flat);
    if (r.extended + r.trimmed === 0) return setNote("No line needs it: every end already reaches a line, or is too far from one.");
    setEdits((cur) => {
      const next = { ...cur };
      r.flat.crease.forEach((p, i) => {
        const l = current[i]!;
        if (!sameAs(p.pts, l.pts)) next[l.id] = [...p.pts];
      });
      return next;
    });
    setNote(`${r.extended} ${r.extended === 1 ? "end" : "ends"} made longer${r.trimmed ? `, ${r.trimmed} cut back` : ""}.`);
  };

  const toOutline = (end: End) => {
    if (!sel) return;
    const out = extendEnd(sel.pts, end, targetsFor(sel.id));
    if (!out) return setNote("There is no line ahead of that end to reach.");
    setLine(sel.id, out);
    setNote(null);
  };

  return (
    <dialog
      ref={(el) => {
        ref.current = el;
        if (el && !el.open) el.showModal();
      }}
      aria-labelledby="fold-lines-title"
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto flex h-[min(46rem,96dvh)] w-[min(76rem,calc(100vw-1rem))] flex-col rounded-xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <div className="min-w-0">
          <h2 id="fold-lines-title" className="font-semibold">Edit fold lines</h2>
          <p className="text-xs text-muted-foreground">Click a fold line, then drag a dot at its end to make it longer or shorter. A line is never moved or turned.</p>
        </div>
        <button type="button" aria-label="Close" className="rounded p-1 hover:bg-muted" onClick={() => ref.current?.close()}><X className="size-4" /></button>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[minmax(0,1fr)_18rem]">
        {/* The sheet */}
        <div className="relative flex min-h-0 flex-col border-b md:border-r md:border-b-0">
          <div className="flex items-center gap-1 border-b px-3 py-1.5 text-xs">
            <button type="button" aria-label="Zoom out" className="grid size-7 place-items-center rounded border hover:bg-muted disabled:opacity-40" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z / 1.5))}><Minus className="size-3.5" /></button>
            <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button type="button" aria-label="Zoom in" className="grid size-7 place-items-center rounded border hover:bg-muted disabled:opacity-40" disabled={zoom >= 8} onClick={() => setZoom((z) => Math.min(8, z * 1.5))}><Plus className="size-3.5" /></button>
            <span className="ml-3 flex items-center gap-3 text-muted-foreground">
              <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-blue-800" /> cut</span>
              <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 border-t-2 border-dashed border-red-500" /> fold</span>
              <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-orange-500" /> changed</span>
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-2">
            <svg
              ref={svgRef}
              viewBox={`${-margin} ${-margin} ${vbW} ${vbH}`}
              style={{ width: `${zoom * 100}%` }}
              className="block h-auto touch-none rounded bg-white select-none"
              role="img"
              aria-label="The sheet with its fold lines"
              onPointerDown={() => setSelected(null)}
              onPointerMove={(e) => {
                if (!drag) return;
                const at = pointerMm(e);
                const line = byId.get(drag.id);
                if (!at || !line) return;
                setLine(drag.id, dragEnd(line.pts, drag.end, at, targetsFor(drag.id), SNAP_PX * unit));
              }}
              onPointerUp={() => setDrag(null)}
              onPointerCancel={() => setDrag(null)}
            >
              {cut.map((c, i) =>
                c.closed ? (
                  <polygon key={`c${i}`} points={c.pts.map(round).join(" ")} fill="none" stroke="#1e40af" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                ) : (
                  <polyline key={`c${i}`} points={c.pts.map(round).join(" ")} fill="none" stroke="#1e40af" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                ),
              )}
              {current.map((l) => {
                const on = l.id === selected;
                const changed = changedIds.includes(l.id);
                const d = l.pts.map(round).join(" ");
                return (
                  <g key={l.id}>
                    <polyline points={d} fill="none" stroke={on ? "#2563eb" : changed ? "#f97316" : "#ef4444"} strokeWidth={on ? 3 : changed ? 2 : 1.5} strokeDasharray={on ? undefined : "5 4"} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                    {/* A wide invisible line to click on */}
                    <polyline
                      points={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={16}
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="stroke"
                      className="cursor-pointer"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelected(l.id);
                        setNote(null);
                      }}
                    >
                      <title>{`Line ${l.id}, ${lengthOf(l.pts).toFixed(1)} mm`}</title>
                    </polyline>
                  </g>
                );
              })}
              {sel
                ? (["start", "end"] as const).map((end) => {
                    const i = end === "start" ? 0 : sel.pts.length - 2;
                    return (
                      <circle
                        key={end}
                        cx={sel.pts[i]}
                        cy={sel.pts[i + 1]}
                        r={HANDLE_PX * unit}
                        fill="#ffffff"
                        stroke="#2563eb"
                        strokeWidth={2.5}
                        vectorEffect="non-scaling-stroke"
                        className="cursor-grab active:cursor-grabbing"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          (e.currentTarget.ownerSVGElement as SVGSVGElement | null)?.setPointerCapture(e.pointerId);
                          setDrag({ id: sel.id, end });
                        }}
                      >
                        <title>{end === "start" ? "Start of the line: drag to make it longer or shorter" : "End of the line: drag to make it longer or shorter"}</title>
                      </circle>
                    );
                  })
                : null}
            </svg>
          </div>
        </div>

        {/* The selected line, and the tools */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4 text-sm">
          <label className="flex flex-col gap-1 font-medium">Fold line
            <select
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              value={selected ?? ""}
              onChange={(e) => {
                setSelected(e.target.value === "" ? null : Number(e.target.value));
                setNote(null);
              }}
            >
              <option value="">None selected</option>
              {current.map((l) => <option key={l.id} value={l.id}>Line {l.id} · {lengthOf(l.pts).toFixed(1)} mm{changedIds.includes(l.id) ? " · changed" : ""}</option>)}
            </select>
          </label>

          {sel && selOriginal ? (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
              <p className="font-medium">Line {sel.id}: <span className="tabular-nums">{lengthOf(sel.pts).toFixed(1)} mm</span>{changedIds.includes(sel.id) ? <span className="ml-1 text-xs font-normal text-muted-foreground">(was {lengthOf(selOriginal.pts).toFixed(1)} mm)</span> : null}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                from ({round(sel.pts[0]!)}, {round(sel.pts[1]!)}) to ({round(sel.pts[sel.pts.length - 2]!)}, {round(sel.pts[sel.pts.length - 1]!)})
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="dark" size="xs" onClick={() => toOutline("start")} title="Make the start of the line reach the first line ahead of it">Start to outline</Button>
                <Button type="button" variant="dark" size="xs" onClick={() => toOutline("end")} title="Make the end of the line reach the first line ahead of it">End to outline</Button>
                <Button type="button" variant="dark" size="xs" disabled={!changedIds.includes(sel.id)} onClick={() => resetLine(sel.id)}>Reset line</Button>
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-muted-foreground">Click a fold line on the sheet.</p>
          )}

          <div className="flex flex-col gap-2">
            <Button type="button" variant="dark" size="sm" onClick={extendAll} title="Make every free end reach the cut outline or another fold, the way Detect does it">
              <Wand2 className="size-4" aria-hidden /> Extend all to outline
            </Button>
            {note ? <p className="text-xs text-muted-foreground" aria-live="polite">{note}</p> : null}
          </div>

          <div className="mt-auto flex flex-col gap-2 border-t pt-3">
            <button type="button" aria-expanded={rawOpen} className="self-start text-xs font-medium underline underline-offset-4 hover:text-foreground" onClick={() => setRawOpen((o) => !o)}>{rawOpen ? "Hide raw data" : "Raw data (JSON)"}</button>
            {rawOpen ? (
              <>
                <textarea
                  aria-label="Fold lines as JSON"
                  spellCheck={false}
                  className="h-44 resize-y rounded-lg border border-input bg-background p-2 font-mono text-[11px] leading-4 whitespace-pre outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={raw}
                  onChange={(e) => {
                    setRawDraft(e.target.value);
                    const r = parse(e.target.value, lines);
                    if (r.ok) setEdits(r.edits);
                  }}
                  onBlur={() => rawResult?.ok && setRawDraft(null)}
                />
                {rawResult && !rawResult.ok ? <p role="alert" className="text-xs text-destructive">{rawResult.message}</p> : null}
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">{changedIds.length === 0 ? "No line is changed yet." : `${changedIds.length} ${changedIds.length === 1 ? "line" : "lines"} changed. After Apply, press Detect again.`}</p>
        <div className="flex gap-2">
          <Button type="button" variant="dark" disabled={changedIds.length === 0} onClick={() => setEdits({})}>Reset all</Button>
          <Button type="button" variant="destructive" onClick={() => ref.current?.close()}>Cancel</Button>
          <Button
            type="button"
            variant="dark"
            disabled={changedIds.length === 0 || (rawResult !== null && !rawResult.ok)}
            onClick={() => {
              onApply(changedIds.map((id) => ({ id, pts: edits[id]! })));
              ref.current?.close();
            }}
          >
            Apply
          </Button>
        </div>
      </div>
    </dialog>
  );
}
