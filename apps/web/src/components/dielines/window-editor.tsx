"use client";

import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Copy, Lock, LockOpen, Maximize, Minus, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import {
  MAX_WINDOWS,
  WINDOW_MIN_SIZE,
  WINDOW_SHAPES,
  WINDOW_SHAPE_GROUPS,
  WINDOW_SHAPE_LABELS,
  applyWindows,
  area,
  flattenOutline,
  shapeKeepsRatio,
  shapeRatio,
  shapeStartSize,
  windowPolygon,
  type DielineGeometry,
  type WatermarkSpec,
  type WindowShape,
  type WindowSpec,
} from "@packaging/dieline-engine";
import { dielineViewBox, renderDielineSvg } from "@packaging/render-svg";
import type { CartonViewHandle } from "@/components/viewer3d/carton-view";
import { svgDataUrl } from "@/lib/dieline-preview";
import { FoldPreview } from "./side-cards";
import { fromDisplay, toDisplay, type Unit } from "./units";
import { boxOf, pointIn, snapMove, windowGaps, type Guide } from "@/lib/window-guides";

/** Pixels per millimetre on screen, and the centre of what is shown (mm). */
interface View {
  s: number;
  cx: number;
  cy: number;
}

type Handle = { kind: "move" } | { kind: "rotate" } | { kind: "size"; sx: -1 | 0 | 1; sy: -1 | 0 | 1 };

interface Drag {
  handle: Handle;
  id: string;
  /** The window when the drag started, and the pointer's place then (mm). */
  start: WindowSpec;
  px: number;
  py: number;
}

const polyD = (pts: readonly { x: number; y: number }[]) => `M${pts.map((p) => `${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join("L")}Z`;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** A fresh id that no window in the list uses. */
const freshId = (list: readonly WindowSpec[]) => {
  for (let i = 1; ; i++) if (!list.some((w) => w.id === `w${i}`)) return `w${i}`;
};

/** Starting box of a shape, as a share of the panel it goes on (width, height). */
const SHAPE_MIME = "application/x-dieline-window-shape";

/** Small picture of a shape for the palette. */
function ShapeIcon({ shape }: { shape: WindowShape }) {
  // The shape at its natural proportions, as big as the picture allows.
  const r = shapeRatio(shape);
  const w = r >= 1.27 ? 38 : Math.round(30 * r);
  const h = r >= 1.27 ? Math.round(38 / r) : 30;
  const pts = windowPolygon({ shape, cx: 0, cy: 0, width: w, height: h, rotation: 0 });
  return (
    <svg viewBox="-24 -20 48 40" className="h-10 w-12" aria-hidden>
      <path d={polyD(pts)} fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The window editor: replaces the dieline workspace (same page) while the customer places windows on the box.
 * Windows are plain numbers in the sheet's frame; the engine decides what fits (`applyWindows`) and the editor shows its
 * verdict live. Nothing is kept until "Done".
 */
export function WindowEditor({
  geo,
  value,
  unit,
  onUnit,
  onDone,
  onCancel,
  materialId,
  boardColor,
  thickness,
  watermark,
}: {
  /** The dieline without windows. */
  geo: DielineGeometry;
  value: readonly WindowSpec[];
  unit: Unit;
  onUnit: (u: Unit) => void;
  onDone: (windows: WindowSpec[]) => void;
  onCancel: () => void;
  materialId: string | undefined;
  boardColor: string;
  thickness: number;
  watermark: WatermarkSpec | null;
}) {
  const [draft, setDraft] = useState<WindowSpec[]>(() => [...value]);
  const [past, setPast] = useState<WindowSpec[][]>([]);
  const [future, setFuture] = useState<WindowSpec[][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [lockRatio, setLockRatio] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [guides, setGuides] = useState<Guide[]>([]);
  /** Right-click menu: where it opens (px inside the sheet area) and for which window. */
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(1);
  const previewRef = useRef<CartonViewHandle>(null);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // The check is cheap and always live (red windows). Building the 3D box is the heavy part: it waits until the pointer is released.
  const result = useMemo(() => applyWindows(geo, draft), [geo, draft]);
  const [dragging, setDragging] = useState(false);
  const [boxDraft, setBoxDraft] = useState(draft);
  if (!dragging && boxDraft !== draft) setBoxDraft(draft); // follows the drawing again as soon as the pointer is released
  const slowBoxDraft = useDeferredValue(boxDraft);
  const boxGeo = useMemo(() => applyWindows(geo, slowBoxDraft).geo, [geo, slowBoxDraft]);
  const problemOf = useMemo(() => new Map(result.problems.filter((p) => p.id).map((p) => [p.id, p.message])), [result.problems]);
  const sel = draft.find((w) => w.id === selected) ?? null;
  const panelPolys = useMemo(() => geo.foldTree.panels.map((p) => flattenOutline({ points: p.polygon, ...(p.bulges ? { bulges: p.bulges } : {}) })), [geo]);
  /** The smallest panel the point lies in (the top one where flaps are stacked). */
  const panelAt = (at: { x: number; y: number }) => panelPolys.filter((q) => pointIn(at, q)).sort((a, b) => area(a) - area(b))[0] ?? null;
  // How far the chosen window is from the left and top edge (or fold) of its panel.
  const gaps = useMemo(() => {
    if (!sel) return null;
    const poly = windowPolygon(sel);
    const b = boxOf(poly);
    const host = panelAt({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
    return host ? windowGaps(host, poly) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- panelAt only reads panelPolys
  }, [sel, panelPolys]);

  // ---- history ----
  const commit = useCallback((next: WindowSpec[]) => {
    setPast((p) => [...p.slice(-60), draftRef.current]);
    setFuture([]);
    setDraft(next);
  }, []);
  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast(past.slice(0, -1));
    setFuture([draft, ...future]);
    setDraft(prev);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture(future.slice(1));
    setPast([...past, draft]);
    setDraft(next);
  };

  // ---- the sheet picture ----
  const box = useMemo(() => dielineViewBox(geo, 22), [geo]);
  const src = useMemo(
    () => svgDataUrl(renderDielineSvg(geo, { showBleed: false, showSafe: false, showGlue: false, showAnnotations: false, showPanelLabels: true })),
    [geo],
  );

  // ---- pan and zoom ----
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View | null>(null);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => setSize({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Until the person pans or zooms the whole sheet is shown (computed, so it follows the size of the window).
  const fitted: View = useMemo(() => ({ s: Math.min(size.w / box.width, size.h / box.height) * 0.94, cx: box.minX + box.width / 2, cy: box.minY + box.height / 2 }), [size.w, size.h, box]);
  const v = view ?? fitted;
  const fit = () => setView(null);
  const vbX = v.cx - size.w / (2 * v.s);
  const vbY = v.cy - size.h / (2 * v.s);
  const toMm = (e: { clientX: number; clientY: number }) => {
    const r = host.current!.getBoundingClientRect();
    return { x: v.cx + (e.clientX - r.left - size.w / 2) / v.s, y: v.cy + (e.clientY - r.top - size.h / 2) / v.s };
  };
  const zoom = (factor: number, at?: { x: number; y: number }) =>
    setView((cur0) => {
      const cur = cur0 ?? fitted;
      const s = Math.min(60, Math.max(0.3, cur.s * factor));
      const f = cur.s / s;
      const p = at ?? { x: cur.cx, y: cur.cy };
      return { s, cx: p.x + (cur.cx - p.x) * f, cy: p.y + (cur.cy - p.y) * f };
    });
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView((cur0) => {
        const cur = cur0 ?? fitted;
        const s = Math.min(60, Math.max(0.3, cur.s * Math.exp(-e.deltaY * 0.0015)));
        const px = cur.cx + (e.clientX - r.left - size.w / 2) / cur.s;
        const py = cur.cy + (e.clientY - r.top - size.h / 2) / cur.s;
        const f = cur.s / s;
        return { s, cx: px + (cur.cx - px) * f, cy: py + (cur.cy - py) * f };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [size.w, size.h, fitted]);

  // ---- adding ----
  /** Size of a new window of this shape on a panel of this size (`k` shrinks it). Round shapes stay round. */
  const sizeFor = (shape: WindowShape, pw: number, ph: number, k: number): [number, number] => {
    let [width, height] = shapeStartSize(shape, pw, ph, k);
    if (shapeKeepsRatio(shape)) width = height = Math.min(width, height);
    return [Math.max(WINDOW_MIN_SIZE, round3(width)), Math.max(WINDOW_MIN_SIZE, round3(height))];
  };
  const isEven = shapeKeepsRatio;

  /** A shape dropped from the palette: centred on the drop point, as big as fits the panel under it. */
  const addAt = (shape: WindowShape, at: { x: number; y: number }) => {
    if (draft.length >= MAX_WINDOWS) {
      setNotice(`At most ${MAX_WINDOWS} windows.`);
      return;
    }
    const host = geo.foldTree.panels
      .map((p) => ({ pts: flattenOutline({ points: p.polygon, ...(p.bulges ? { bulges: p.bulges } : {}) }) }))
      .filter((p) => pointIn(at, p.pts))
      .sort((a, b) => area(a.pts) - area(b.pts))[0]; // the smallest one when pieces overlap (a stacked flap)
    if (!host) {
      setNotice("Drop the shape on a panel of the dieline.");
      return;
    }
    const xs = host.pts.map((q) => q.x);
    const ys = host.pts.map((q) => q.y);
    const pw = Math.max(...xs) - Math.min(...xs);
    const ph = Math.max(...ys) - Math.min(...ys);
    const id = freshId(draft);
    for (const k of [0.6, 0.45, 0.33, 0.24, 0.17, 0.12, 0.08, 0.05]) {
      const [width, height] = sizeFor(shape, pw, ph, k);
      const w: WindowSpec = { id, shape, cx: round3(at.x), cy: round3(at.y), width, height, rotation: 0 };
      if (applyWindows(geo, [...draft, w]).problems.every((q) => q.id !== id)) {
        commit([...draft, w]);
        setSelected(id);
        setNotice(null);
        if (isEven(shape)) setLockRatio((l) => ({ ...l, [id]: true }));
        return;
      }
    }
    setNotice("It does not fit there: keep it away from folds, edges and other windows.");
  };

  const add = (shape: WindowShape) => {
    if (draft.length >= MAX_WINDOWS) {
      setNotice(`At most ${MAX_WINDOWS} windows.`);
      return;
    }
    // The first place where the engine accepts it: the middle of each panel (biggest first), then a ring around it, smaller each try.
    const panels = geo.foldTree.panels
      .map((p) => {
        const pts = flattenOutline({ points: p.polygon, ...(p.bulges ? { bulges: p.bulges } : {}) });
        const xs = pts.map((q) => q.x);
        const ys = pts.map((q) => q.y);
        return { id: p.id, a: area(pts), x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), printable: p.printable };
      })
      .sort((a, b) => Number(b.printable) - Number(a.printable) || b.a - a.a);
    const id = freshId(draft);
    const even = isEven(shape);
    // Biggest panel first; on each, the biggest size that the engine accepts, in the middle first, then around it.
    for (const p of panels) {
      const pw = p.x1 - p.x0;
      const ph = p.y1 - p.y0;
      for (const k of [1, 0.75, 0.55, 0.4, 0.28]) {
        const [width, height] = sizeFor(shape, pw, ph, k);
        if (Math.min(width, height) < 8) continue; // too small to be useful: try a bigger panel
        const mx = (p.x0 + p.x1) / 2;
        const my = (p.y0 + p.y1) / 2;
        const tries: [number, number][] = [[0, 0]];
        for (const f of [0.25, 0.4]) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) tries.push([dx * f * pw, dy * f * ph]);
        for (const [dx, dy] of tries) {
          const w: WindowSpec = { id, shape, cx: round3(mx + dx), cy: round3(my + dy), width, height, rotation: 0 };
          if (applyWindows(geo, [...draft, w]).problems.every((q) => q.id !== id)) {
            commit([...draft, w]);
            setSelected(id);
            setNotice(null);
            if (even) setLockRatio((l) => ({ ...l, [id]: true }));
            return;
          }
        }
      }
    }
    setNotice("There is no free room for another window. Make one smaller or remove one.");
  };

  const patch = (id: string, change: Partial<WindowSpec>, push = true) => {
    const next = draftRef.current.map((w) => (w.id === id ? { ...w, ...change } : w));
    if (push) commit(next);
    else setDraft(next);
  };
  const remove = (id: string) => {
    commit(draft.filter((w) => w.id !== id));
    setSelected(null);
  };
  const duplicate = (id: string) => {
    const w = draft.find((x) => x.id === id);
    if (!w || draft.length >= MAX_WINDOWS) return;
    const nid = freshId(draft);
    const off = Math.max(4, Math.min(w.width, w.height) * 0.25);
    commit([...draft, { ...w, id: nid, cx: round3(w.cx + off), cy: round3(w.cy + off) }]);
    setSelected(nid);
  };

  // ---- dragging ----
  const drag = useRef<Drag | null>(null);
  const panning = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const begin = (e: React.PointerEvent, handle: Handle, w: WindowSpec) => {
    if (e.button !== 0) return; // a right click only opens the menu
    setMenu(null);
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toMm(e);
    drag.current = { handle, id: w.id, start: w, px: p.x, py: p.y };
    setSelected(w.id);
    setDragging(true);
    setPast((h) => [...h.slice(-60), draftRef.current]);
    setFuture([]);
  };
  type Pointer = { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean };
  // Pointer events can come faster than the screen draws: keep the latest one and handle it once per frame.
  const latest = useRef<Pointer | null>(null);
  const frame = useRef(0);
  const handler = useRef<(e: Pointer) => void>(() => undefined);
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current && !panning.current) return;
    latest.current = { clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey, altKey: e.altKey };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const ev = latest.current;
      latest.current = null;
      if (ev) handler.current(ev);
    });
  };
  const moveNow = (e: Pointer) => {
    if (panning.current) {
      const pn = panning.current;
      setView((cur) => {
        const c = cur ?? fitted;
        return { ...c, cx: pn.cx - (e.clientX - pn.x) / c.s, cy: pn.cy - (e.clientY - pn.y) / c.s };
      });
      return;
    }
    const d = drag.current;
    if (!d) return;
    const p = toMm(e);
    const w = d.start;
    if (d.handle.kind === "move") {
      let nx = w.cx + p.x - d.px;
      let ny = w.cy + p.y - d.py;
      if (e.altKey) setGuides([]);
      else {
        // Line up with the other windows and the middle of the panel (hold Alt to move freely).
        const own = boxOf(windowPolygon({ ...w, cx: nx, cy: ny }));
        const others = draftRef.current.filter((o) => o.id !== d.id).map((o) => boxOf(windowPolygon(o)));
        const host = panelAt({ x: nx, y: ny });
        const s = snapMove(own, others, host ? boxOf(host) : null, 6 / v.s);
        nx += s.dx;
        ny += s.dy;
        setGuides(s.guides);
      }
      patch(d.id, { cx: round3(nx), cy: round3(ny) }, false);
    } else if (d.handle.kind === "rotate") {
      let deg = (Math.atan2(p.y - w.cy, p.x - w.cx) * 180) / Math.PI + 90;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      deg = ((deg + 540) % 360) - 180;
      patch(d.id, { rotation: round3(deg) }, false);
    } else {
      const { sx, sy } = d.handle;
      const a = (w.rotation * Math.PI) / 180;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      // The pointer in the window's own frame (its centre is the origin, its sides are the axes).
      const lx = (p.x - w.cx) * cos + (p.y - w.cy) * sin;
      const ly = -(p.x - w.cx) * sin + (p.y - w.cy) * cos;
      let width = w.width;
      let height = w.height;
      let ncx = 0;
      let ncy = 0;
      if (sx !== 0) {
        const fixed = (-sx * w.width) / 2;
        width = Math.max(WINDOW_MIN_SIZE, sx * (lx - fixed));
        ncx = fixed + (sx * width) / 2;
      }
      if (sy !== 0) {
        const fixed = (-sy * w.height) / 2;
        height = Math.max(WINDOW_MIN_SIZE, sy * (ly - fixed));
        ncy = fixed + (sy * height) / 2;
      }
      if (sx !== 0 && sy !== 0 && lockRatio[w.id]) {
        // A corner with the ratio locked: the bigger pull wins.
        const r = w.width / w.height;
        const byW = width;
        const byH = height * r;
        width = Math.max(byW, byH);
        height = width / r;
        ncx = (-sx * w.width) / 2 + (sx * width) / 2;
        ncy = (-sy * w.height) / 2 + (sy * height) / 2;
      }
      patch(
        d.id,
        { width: round3(width), height: round3(height), cx: round3(w.cx + ncx * cos - ncy * sin), cy: round3(w.cy + ncx * sin + ncy * cos) },
        false,
      );
    }
  };
  useEffect(() => {
    handler.current = moveNow;
  });
  // The right-click menu closes on a click elsewhere, Escape, scrolling or zooming.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const away = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("wheel", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("wheel", close);
      window.removeEventListener("resize", close);
    };
  }, [menu]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const onUp = () => {
    // The last position counts even if its frame has not been drawn yet.
    if (frame.current) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    }
    if (latest.current) {
      moveNow(latest.current);
      latest.current = null;
    }
    setGuides([]);
    setDragging(false);
    drag.current = null;
    panning.current = null;
  };

  // ---- keys ----
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
    } else if (mod && e.key.toLowerCase() === "d" && sel) {
      e.preventDefault();
      duplicate(sel.id);
    } else if ((e.key === "Delete" || e.key === "Backspace") && sel) {
      e.preventDefault();
      remove(sel.id);
    } else if (e.key === "Escape") {
      if (selected) {
        e.stopPropagation();
        setSelected(null);
      }
    } else if (sel && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      patch(sel.id, { cx: round3(sel.cx + (e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0)), cy: round3(sel.cy + (e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0)) });
    }
  };

  const bad = result.problems.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col" role="region" aria-label="Window editor" onKeyDown={onKey}>
      <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <h2 className="text-sm font-semibold">Window holes</h2>
        <p className="hidden text-xs text-muted-foreground md:block">Click a shape to add it, or drag it onto a panel. Each window must stay inside one panel, away from folds and edges.</p>
        <div className="ml-auto flex items-center gap-2">
          {bad ? <span role="status" className="hidden text-xs text-destructive sm:block">{result.problems.length} {result.problems.length === 1 ? "window does" : "windows do"} not fit</span> : null}
          <button type="button" onClick={onCancel} className="inline-flex h-8 items-center rounded-lg border bg-background px-3 text-[13px] font-medium hover:bg-muted">Cancel</button>
          <button
            type="button"
            disabled={bad}
            title={bad ? "Fix the windows marked in red first" : "Keep these windows"}
            onClick={() => onDone(draft)}
            className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Done
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)_19rem]">
        {/* Shapes */}
        <aside className="flex flex-col gap-3 overflow-y-auto border-b p-3 lg:border-r lg:border-b-0" aria-label="Window shapes">
          {notice ? <p role="status" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{notice}</p> : null}
          {WINDOW_SHAPE_GROUPS.map((group) => (
            <section key={group.id} aria-label={group.title} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-foreground/80">{group.title}</h3>
              <div className="grid grid-cols-3 gap-2 lg:grid-cols-2">
                {group.shapes.map((shape) => (
                  <button
                    key={shape}
                    type="button"
                    onClick={() => add(shape)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(SHAPE_MIME, shape);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    title={`Click to add: ${WINDOW_SHAPE_LABELS[shape].toLowerCase()}. Or drag it onto a panel`}
                    className="flex flex-col items-center gap-1 rounded-xl border bg-background p-2 text-center text-xs text-foreground/80 transition-colors hover:border-primary hover:bg-muted"
                  >
                    <ShapeIcon shape={shape} />
                    {WINDOW_SHAPE_LABELS[shape]}
                  </button>
                ))}
              </div>
            </section>
          ))}
          <p className="text-xs text-muted-foreground">{draft.length} of {MAX_WINDOWS} windows. Drag a shape onto a panel to place it where you drop it. Delete removes the chosen one; the arrow keys nudge it (Shift = 5 mm). Moving snaps to other windows and the panel middle; hold Alt to move freely.</p>
        </aside>

        {/* The sheet */}
        <div className="relative min-h-[50vh] min-w-0 bg-muted/30 lg:min-h-0">
          <div
            ref={host}
            className={`absolute inset-0 touch-none overflow-hidden ${dropping ? "ring-2 ring-inset ring-primary/60" : ""}`}
            tabIndex={0}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(SHAPE_MIME)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              if (!dropping) setDropping(true);
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => {
              setDropping(false);
              const shape = e.dataTransfer.getData(SHAPE_MIME);
              if (!(WINDOW_SHAPES as readonly string[]).includes(shape)) return;
              e.preventDefault();
              addAt(shape as WindowShape, toMm(e));
            }}
            onPointerDown={(e) => {
              if (e.target !== e.currentTarget && (e.target as Element).tagName !== "svg" && (e.target as Element).tagName !== "image") return;
              setSelected(null);
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
              panning.current = { x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy };
            }}
          >
            <svg viewBox={`${vbX} ${vbY} ${size.w / v.s} ${size.h / v.s}`} className="size-full select-none" role="img" aria-label="The dieline with its windows">
              <rect x={box.minX} y={box.minY} width={box.width} height={box.height} fill="#ffffff" />
              <image href={src} x={box.minX} y={box.minY} width={box.width} height={box.height} preserveAspectRatio="none" />
              {draft.map((w) => {
                const on = w.id === selected;
                const problem = problemOf.get(w.id);
                const local = windowPolygon({ ...w, cx: 0, cy: 0, rotation: 0 });
                return (
                  <g
                    key={w.id}
                    transform={`translate(${w.cx} ${w.cy}) rotate(${w.rotation})`}
                    onContextMenu={(e) => {
                      // Right click anywhere on the window or its grips.
                      e.preventDefault();
                      const r = host.current!.getBoundingClientRect();
                      setSelected(w.id);
                      setMenu({ x: e.clientX - r.left, y: e.clientY - r.top, id: w.id });
                    }}
                  >
                    <path
                      d={polyD(local)}
                      fill={problem ? "#dc2626" : "#2563eb"}
                      fillOpacity={problem ? 0.22 : 0.16}
                      stroke={problem ? "#dc2626" : "#2563eb"}
                      strokeWidth={(on ? 2 : 1.4) / v.s}
                      strokeLinejoin="round"
                      className="cursor-move"
                      onPointerDown={(e) => begin(e, { kind: "move" }, w)}
                    />
                    {on ? (
                      <g pointerEvents="all">
                        {/* The frame of the window, then the grips: round on the corners, a pill on each side. */}
                        <rect x={-w.width / 2} y={-w.height / 2} width={w.width} height={w.height} fill="none" stroke="#3b82f6" strokeWidth={2.2 / v.s} pointerEvents="none" />
                        <line x1={0} y1={-w.height / 2} x2={0} y2={-w.height / 2 - 20 / v.s} stroke="#3b82f6" strokeWidth={1.2 / v.s} pointerEvents="none" />
                        <circle cx={0} cy={-w.height / 2 - 20 / v.s} r={8 / v.s} fill="rgba(99,102,241,0.18)" pointerEvents="none" />
                        <circle cx={0} cy={-w.height / 2 - 20 / v.s} r={6.5 / v.s} fill="#fff" stroke="#e4e1ff" strokeWidth={1 / v.s} className="cursor-grab" onPointerDown={(e) => begin(e, { kind: "rotate" }, w)} />
                        {([[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]] as const).map(([sx, sy]) => {
                          const corner = sx !== 0 && sy !== 0;
                          const cx = (sx * w.width) / 2;
                          const cy = (sy * w.height) / 2;
                          // Pill: long along the side it moves (top and bottom grips are wide, left and right ones tall).
                          const pw = (sy !== 0 ? 22 : 9) / v.s;
                          const ph = (sx !== 0 ? 22 : 9) / v.s;
                          const cursor = corner ? (sx === sy ? "cursor-nwse-resize" : "cursor-nesw-resize") : sx !== 0 ? "cursor-ew-resize" : "cursor-ns-resize";
                          return (
                            <g key={`${sx}${sy}`} className={cursor} onPointerDown={(e) => begin(e, { kind: "size", sx, sy }, w)}>
                              {corner ? (
                                <>
                                  <circle cx={cx} cy={cy} r={11 / v.s} fill="rgba(99,102,241,0.18)" />
                                  <circle cx={cx} cy={cy} r={8.5 / v.s} fill="#fff" stroke="#e4e1ff" strokeWidth={1 / v.s} />
                                </>
                              ) : (
                                <>
                                  <rect x={cx - pw / 2 - 1.5 / v.s} y={cy - ph / 2 - 1.5 / v.s} width={pw + 3 / v.s} height={ph + 3 / v.s} rx={(Math.min(pw, ph) + 3 / v.s) / 2} fill="rgba(99,102,241,0.18)" />
                                  <rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph} rx={Math.min(pw, ph) / 2} fill="#fff" stroke="#e4e1ff" strokeWidth={1 / v.s} />
                                </>
                              )}
                            </g>
                          );
                        })}
                      </g>
                    ) : null}
                  </g>
                );
              })}
              {/* Distances of the chosen window to the left and top edge of its panel */}
              {gaps ? (
                <g pointerEvents="none" fill="#2563eb" stroke="#2563eb" strokeWidth={1.2 / v.s} fontSize={11 / v.s} textAnchor="middle" aria-label="Distances to the panel edges">
                  {gaps.left && gaps.left.to - gaps.left.from > 0.05 ? (
                    <g>
                      <line x1={gaps.left.from} y1={gaps.left.y} x2={gaps.left.to} y2={gaps.left.y} />
                      <line x1={gaps.left.from} y1={gaps.left.y - 4 / v.s} x2={gaps.left.from} y2={gaps.left.y + 4 / v.s} />
                      <line x1={gaps.left.to} y1={gaps.left.y - 4 / v.s} x2={gaps.left.to} y2={gaps.left.y + 4 / v.s} />
                      <text x={(gaps.left.from + gaps.left.to) / 2} y={gaps.left.y - 5 / v.s} stroke="#fff" strokeWidth={3.5 / v.s} paintOrder="stroke" strokeLinejoin="round">{toDisplay(String(gaps.left.to - gaps.left.from), unit)}</text>
                    </g>
                  ) : null}
                  {gaps.top && gaps.top.to - gaps.top.from > 0.05 ? (
                    <g>
                      <line x1={gaps.top.x} y1={gaps.top.from} x2={gaps.top.x} y2={gaps.top.to} />
                      <line x1={gaps.top.x - 4 / v.s} y1={gaps.top.from} x2={gaps.top.x + 4 / v.s} y2={gaps.top.from} />
                      <line x1={gaps.top.x - 4 / v.s} y1={gaps.top.to} x2={gaps.top.x + 4 / v.s} y2={gaps.top.to} />
                      <text x={gaps.top.x + 5 / v.s} y={(gaps.top.from + gaps.top.to) / 2 + 4 / v.s} textAnchor="start" stroke="#fff" strokeWidth={3.5 / v.s} paintOrder="stroke" strokeLinejoin="round">{toDisplay(String(gaps.top.to - gaps.top.from), unit)}</text>
                    </g>
                  ) : null}
                </g>
              ) : null}
              {/* Alignment guides while a window is moved */}
              {guides.length > 0 ? (
                <g pointerEvents="none" stroke="#f97316" strokeWidth={1.2 / v.s} strokeDasharray={`${5 / v.s} ${3 / v.s}`}>
                  {guides.map((g, i) => <line key={i} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} />)}
                </g>
              ) : null}
            </svg>
          </div>
          {menu ? (
            <div
              ref={menuRef}
              role="menu"
              aria-label="Window actions"
              className="absolute z-30 w-44 rounded-xl border bg-background p-1 text-sm shadow-lg"
              style={{ left: Math.min(menu.x, Math.max(0, size.w - 184)), top: Math.min(menu.y, Math.max(0, size.h - 92)) }}
            >
              <button
                type="button"
                role="menuitem"
                autoFocus
                disabled={draft.length >= MAX_WINDOWS}
                onClick={() => {
                  duplicate(menu.id);
                  setMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-40"
              >
                <Copy className="size-4" aria-hidden /> Duplicate
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  remove(menu.id);
                  setMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none"
              >
                <Trash2 className="size-4" aria-hidden /> Delete
              </button>
            </div>
          ) : null}
          <div role="toolbar" aria-label="Window tools" className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border bg-background p-1 shadow-md">
            <button type="button" aria-label="Undo" title="Undo" disabled={past.length === 0} onClick={undo} className="flex size-8 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40"><Undo2 className="size-4" /></button>
            <button type="button" aria-label="Redo" title="Redo" disabled={future.length === 0} onClick={redo} className="flex size-8 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40"><Redo2 className="size-4" /></button>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <button type="button" aria-label="Zoom out" onClick={() => zoom(0.8)} className="flex size-8 items-center justify-center rounded-md hover:bg-muted"><Minus className="size-4" /></button>
            <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round((v.s / Math.max(1e-6, Math.min(size.w / box.width, size.h / box.height))) * 100)}%</span>
            <button type="button" aria-label="Zoom in" onClick={() => zoom(1.25)} className="flex size-8 items-center justify-center rounded-md hover:bg-muted"><Plus className="size-4" /></button>
            <button type="button" aria-label="Fit sheet to screen" onClick={fit} className="flex size-8 items-center justify-center rounded-md hover:bg-muted"><Maximize className="size-4" /></button>
          </div>
        </div>

        {/* Numbers, problems and the box */}
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-t p-3 lg:border-t-0 lg:border-l" aria-label="Window details">
          <FoldPreview
            geo={boxGeo}
            progress={progress}
            onProgress={setProgress}
            color={boardColor}
            thickness={thickness}
            watermark={watermark}
            viewRef={previewRef}
            {...(materialId ? { materialId } : {})}
          />
          <section aria-label="Size and place" className="rounded-xl border p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Size and place</h3>
              <div role="radiogroup" aria-label="Unit" className="flex rounded-lg border p-0.5 text-xs">
                {(["mm", "in"] as const).map((u) => (
                  <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => onUnit(u)} className={`rounded-md px-2 py-0.5 ${unit === u ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{u}</button>
                ))}
              </div>
            </div>
            {sel ? (
              <Fields
                key={sel.id}
                win={sel}
                unit={unit}
                origin={geo.cutBounds.min}
                locked={Boolean(lockRatio[sel.id])}
                onLock={() => setLockRatio((l) => ({ ...l, [sel.id]: !l[sel.id] }))}
                onChange={(c) => patch(sel.id, c)}
                onDuplicate={() => duplicate(sel.id)}
                onRemove={() => remove(sel.id)}
              />
            ) : (
              <p className="text-xs text-muted-foreground">Choose a window on the sheet to change its numbers.</p>
            )}
            {sel && problemOf.get(sel.id) ? <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{problemOf.get(sel.id)}</p> : null}
          </section>
          {result.problems.some((p) => !p.id) ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{result.problems.find((p) => !p.id)!.message}</p> : null}
        </aside>
      </div>
    </div>
  );
}

/** The numbers of one window: size, centre measured from the corner of the cut outline, turn. */
function Fields({
  win,
  unit,
  origin,
  locked,
  onLock,
  onChange,
  onDuplicate,
  onRemove,
}: {
  win: WindowSpec;
  unit: Unit;
  origin: { x: number; y: number };
  locked: boolean;
  onLock: () => void;
  onChange: (c: Partial<WindowSpec>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const num = (label: string, mm: number, set: (mm: number) => void, opts?: { angle?: boolean; min?: number }) => (
    <NumberBox
      key={label}
      label={label}
      value={opts?.angle ? String(Math.round(win.rotation * 100) / 100) : toDisplay(String(mm), unit)}
      onCommit={(text) => {
        const n = Number(opts?.angle ? text : fromDisplay(text, unit));
        if (Number.isFinite(n) && (opts?.min === undefined || n >= opts.min)) set(n);
      }}
    />
  );
  const ratio = win.width / win.height;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        {num("Width", win.width, (n) => onChange(locked ? { width: n, height: round3(n / ratio) } : { width: n }), { min: WINDOW_MIN_SIZE })}
        {num("Height", win.height, (n) => onChange(locked ? { height: n, width: round3(n * ratio) } : { height: n }), { min: WINDOW_MIN_SIZE })}
        <button type="button" aria-pressed={locked} aria-label={locked ? "Unlock the ratio" : "Lock the ratio"} title={locked ? "Ratio locked" : "Lock the ratio"} onClick={onLock} className="grid size-9 place-items-center rounded-lg border hover:bg-muted">
          {locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {num("X", win.cx - origin.x, (n) => onChange({ cx: round3(n + origin.x) }))}
        {num("Y", win.cy - origin.y, (n) => onChange({ cy: round3(n + origin.y) }))}
        {num("Turn (°)", win.rotation, (n) => onChange({ rotation: Math.max(-360, Math.min(360, n)) }), { angle: true })}
      </div>
      <p className="text-[11px] text-muted-foreground">X and Y are the middle of the window, from the top left corner of the sheet.</p>
      <div className="flex items-center gap-2 border-t pt-3">
        <button type="button" onClick={onDuplicate} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] hover:bg-muted"><Copy className="size-3.5" aria-hidden /> Duplicate</button>
        <button type="button" onClick={onRemove} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] text-destructive hover:bg-destructive/10"><Trash2 className="size-3.5" aria-hidden /> Delete</button>
      </div>
    </div>
  );
}

/** A number the person types: applied on Enter or when the box loses focus. */
function NumberBox({ label, value, onCommit }: { label: string; value: string; onCommit: (text: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? value;
  const finish = () => {
    if (text !== null) onCommit(text);
    setText(null);
  };
  return (
    <label className="flex flex-col gap-1 text-xs font-medium">
      {label}
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={shown}
        onChange={(e) => setText(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish();
          if (e.key === "Escape") {
            e.stopPropagation();
            setText(null);
          }
        }}
        className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </label>
  );
}
