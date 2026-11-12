"use client";

import { useMemo, useRef, useState } from "react";
import { BoxSelect, Eraser, MousePointer2, RotateCcw, Sparkles } from "lucide-react";
import { groupPathIds, suggestExclusions, type ImportedDieline } from "@packaging/svg-import";
import { Button } from "@/components/ui/button";
import { pathData } from "@/lib/template-import";

type Tool = "click" | "box-out" | "box-in";
interface Box { x0: number; y0: number; x1: number; y1: number }

const MAX_HIT_PATHS = 4000;
const MAX_GROUPS_SHOWN = 200;

/**
 * Clean-up step: leave parts of the imported drawing out of the template (colour keys, dimension
 * notes, a second layout the admin does not want ...). Suggestions come from the importer and are
 * only applied when the admin approves them; anything else is excluded by hand: click a line, tick
 * a named group, or drag a box over an area. Excluded lines are removed completely: they no longer
 * count in the sheet size. (An "Ignore" line role instead keeps the lines as an optional reference.)
 */
export function CleanupEditor({
  full,
  excluded,
  onChange,
  error,
}: {
  full: ImportedDieline;
  excluded: readonly number[];
  onChange: (ids: number[]) => void;
  error: string | null;
}) {
  const out = useMemo(() => new Set(excluded), [excluded]);
  const [tool, setTool] = useState<Tool>("click");
  const [hover, setHover] = useState<ReadonlySet<number>>(new Set());
  const [box, setBox] = useState<Box | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const suggestions = useMemo(() => suggestExclusions(full), [full]);
  const groups = useMemo(
    () => (full.groups ?? []).slice(0, MAX_GROUPS_SHOWN).map((g) => ({ ...g, ids: groupPathIds(full, g) })).filter((g) => g.ids.length > 0),
    [full],
  );
  const pending = useMemo(() => new Set(suggestions.flatMap((s) => s.ids).filter((id) => !out.has(id))), [suggestions, out]);
  const styleOf = useMemo(() => new Map(full.styles.map((s) => [s.key, s])), [full]);
  const shapes = useMemo(
    () =>
      full.paths.map((p) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < p.pts.length; i += 2) {
          x0 = Math.min(x0, p.pts[i]!); x1 = Math.max(x1, p.pts[i]!);
          y0 = Math.min(y0, p.pts[i + 1]!); y1 = Math.max(y1, p.pts[i + 1]!);
        }
        return { id: p.id!, d: pathData(p.pts, p.closed), style: styleOf.get(p.style), x0, y0, x1, y1 };
      }),
    [full, styleOf],
  );

  const set = (ids: Iterable<number>, on: boolean) => {
    const next = new Set(out);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    onChange([...next].sort((a, b) => a - b));
  };
  const state = (ids: number[]): "all" | "some" | "none" => {
    const n = ids.filter((id) => out.has(id)).length;
    return n === 0 ? "none" : n === ids.length ? "all" : "some";
  };

  const pad = Math.max(full.widthMm, full.heightMm) * 0.03;
  const sw = Math.max(full.widthMm, full.heightMm) / 450;
  const total = full.paths.length;
  const interactive = tool === "click" && shapes.length <= MAX_HIT_PATHS;

  const toMm = (e: React.PointerEvent): { x: number; y: number } | null => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const q = pt.matrixTransform(m.inverse());
    return { x: q.x, y: q.y };
  };
  const onDown = (e: React.PointerEvent) => {
    if (tool === "click") return;
    const p = toMm(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!box) return;
    const p = toMm(e);
    if (p) setBox({ ...box, x1: p.x, y1: p.y });
  };
  const onUp = () => {
    if (!box) return;
    const xa = Math.min(box.x0, box.x1), xb = Math.max(box.x0, box.x1);
    const ya = Math.min(box.y0, box.y1), yb = Math.max(box.y0, box.y1);
    setBox(null);
    if (xb - xa < sw * 2 && yb - ya < sw * 2) return; // a click, not a drag
    const inside = shapes.filter((s) => s.x0 >= xa && s.x1 <= xb && s.y0 >= ya && s.y1 <= yb).map((s) => s.id);
    if (inside.length) set(inside, tool === "box-out");
  };

  const toolBtn = (t: Tool, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setTool(t)}
      aria-pressed={tool === t}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${tool === t ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        {suggestions.length > 0 ? (
          <div className="rounded-xl border border-amber-300/70 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-500/5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-medium"><Sparkles className="size-4 text-amber-600" aria-hidden /> Suggested to leave out</h3>
              {pending.size > 0 ? (
                <Button type="button" size="sm" onClick={() => set(pending, true)}>Approve all</Button>
              ) : (
                <span className="text-xs text-muted-foreground">All approved</span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Nothing is removed until you approve it. Hover a row to see it in the preview.</p>
            <ul className="mt-2 flex flex-col gap-2">
              {suggestions.map((s) => {
                const st = state(s.ids);
                return (
                  <li
                    key={s.key}
                    onMouseEnter={() => setHover(new Set(s.ids))}
                    onMouseLeave={() => setHover(new Set())}
                    className="rounded-lg border bg-background p-2.5 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{s.label}</p>
                        <p className="text-xs text-muted-foreground">{s.ids.length} {s.ids.length === 1 ? "line" : "lines"}</p>
                      </div>
                      <Button type="button" size="sm" variant={st === "all" ? "outline" : "default"} onClick={() => set(s.ids, st !== "all")}>
                        {st === "all" ? "Undo" : "Leave out"}
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{s.reason}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">Nothing looks out of place: no legend or dimension notes were found by name. You can still leave out anything by hand.</p>
        )}

        {groups.length > 0 ? (
          <div className="rounded-xl border p-3">
            <h3 className="text-sm font-medium">Named groups in the file</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Tick a group to leave all of it out.</p>
            <ul className="mt-2 flex max-h-64 flex-col gap-0.5 overflow-y-auto pr-1">
              {groups.map((g, i) => {
                const st = state(g.ids);
                return (
                  <li key={`${g.from}-${i}`} style={{ paddingLeft: Math.min(g.depth, 6) * 14 }} onMouseEnter={() => setHover(new Set(g.ids))} onMouseLeave={() => setHover(new Set())}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={st === "all"}
                        ref={(el) => { if (el) el.indeterminate = st === "some"; }}
                        onChange={() => set(g.ids, st !== "all")}
                      />
                      <span className="min-w-0 flex-1 truncate">{g.label}</span>
                      <span className="text-xs text-muted-foreground">{g.ids.length}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 rounded-xl border p-3 text-sm">
          <p><strong>{out.size}</strong> of {total} lines left out{out.size > 0 ? <>; the rest is {total - out.size}.</> : "."}</p>
          {out.size > 0 ? (
            <Button type="button" variant="outline" onClick={() => onChange([])}><RotateCcw className="size-4" aria-hidden /> Bring everything back</Button>
          ) : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tool">
          {toolBtn("click", "Click lines", <MousePointer2 className="size-4" aria-hidden />)}
          {toolBtn("box-out", "Box: leave out", <BoxSelect className="size-4" aria-hidden />)}
          {toolBtn("box-in", "Box: bring back", <Eraser className="size-4" aria-hidden />)}
        </div>
        <p className="text-xs text-muted-foreground">
          {tool === "click" ? "Click a line to leave it out, or click a faded one to bring it back." : "Drag a box. Lines that fit completely inside it are " + (tool === "box-out" ? "left out." : "brought back.")}
          {shapes.length > MAX_HIT_PATHS ? " This drawing has too many lines to click one by one; use boxes or groups." : ""}
        </p>
        <div className="rounded-xl border bg-white p-3">
          <svg
            ref={svgRef}
            viewBox={`${-pad} ${-pad} ${full.widthMm + 2 * pad} ${full.heightMm + 2 * pad}`}
            className={`mx-auto max-h-[62vh] w-full touch-none select-none ${tool === "click" ? "" : "cursor-crosshair"}`}
            role="img"
            aria-label="The imported drawing. Faded lines are left out."
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => setBox(null)}
          >
            {/* a halo under lines that are suggested but not approved yet, and under the hovered rows */}
            {shapes.map((s) =>
              pending.has(s.id) || hover.has(s.id) ? (
                <path key={`h${s.id}`} d={s.d} stroke={hover.has(s.id) ? "#f59e0b" : "#fde68a"} strokeWidth={sw * (hover.has(s.id) ? 6 : 4)} opacity={0.8} />
              ) : null,
            )}
            {shapes.map((s) => {
              const gone = out.has(s.id);
              return (
                <path
                  key={s.id}
                  d={s.d}
                  stroke={gone ? "#9ca3af" : (s.style?.stroke ?? "#000")}
                  strokeWidth={gone ? sw * 0.8 : sw * 1.3}
                  strokeDasharray={gone ? `${sw * 1.5} ${sw * 2}` : s.style?.dashed ? `${sw * 4} ${sw * 2}` : undefined}
                  opacity={gone ? 0.45 : 1}
                />
              );
            })}
            {interactive
              ? shapes.map((s) => (
                  <path
                    key={`t${s.id}`}
                    d={s.d}
                    stroke="transparent"
                    strokeWidth={sw * 7}
                    pointerEvents="stroke"
                    className="cursor-pointer"
                    onClick={() => set([s.id], !out.has(s.id))}
                    onMouseEnter={() => setHover(new Set([s.id]))}
                    onMouseLeave={() => setHover(new Set())}
                  />
                ))
              : null}
            {box ? (
              <rect
                x={Math.min(box.x0, box.x1)}
                y={Math.min(box.y0, box.y1)}
                width={Math.abs(box.x1 - box.x0)}
                height={Math.abs(box.y1 - box.y0)}
                fill={tool === "box-out" ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)"}
                stroke={tool === "box-out" ? "#ef4444" : "#22c55e"}
                strokeWidth={sw}
                strokeDasharray={`${sw * 3} ${sw * 2}`}
              />
            ) : null}
          </svg>
        </div>
        <p className="text-xs text-muted-foreground">
          Left out lines are removed for good: they are not drawn, not in the 3D box, and not counted in the sheet size. To keep lines only as a faint picture for customers, set them to <em>Ignore</em> in the next step instead.
        </p>
      </div>
    </div>
  );
}
