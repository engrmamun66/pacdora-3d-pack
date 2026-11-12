"use client";

import { InfoTip } from "./help-tip";
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Maximize, Minus, Plus, X } from "lucide-react";
import type { ImportedDieline, Role } from "@packaging/svg-import";
import { Button } from "@/components/ui/button";
import { ROLE_COLOR, ROLE_LABELS, ROLE_ORDER, pathData } from "@/lib/template-import";

type View = "original" | "styles";
type Backdrop = "white" | "dark" | "checker";

const BACKDROP_CSS: Record<Backdrop, React.CSSProperties> = {
  white: { background: "#ffffff" },
  dark: { background: "#27272a" },
  checker: { backgroundColor: "#ffffff", backgroundImage: "linear-gradient(45deg,#e4e4e7 25%,transparent 25%,transparent 75%,#e4e4e7 75%),linear-gradient(45deg,#e4e4e7 25%,transparent 25%,transparent 75%,#e4e4e7 75%)", backgroundSize: "16px 16px", backgroundPosition: "0 0,8px 8px" },
};

interface Xf { k: number; x: number; y: number }
const MIN_K = 0.5;
const MAX_K = 30;

/** A box whose content can be zoomed (wheel, buttons, + / -), dragged, and reset (0). */
function ZoomPane({ children, backdrop }: { children: React.ReactNode; backdrop: Backdrop }) {
  const box = useRef<HTMLDivElement>(null);
  const [xf, setXf] = useState<Xf>({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ id: number; sx: number; sy: number; x: number; y: number } | null>(null);

  const zoomAt = (factor: number, cx: number, cy: number) =>
    setXf((v) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      const f = k / v.k;
      return k === 1 ? { k, x: 0, y: 0 } : { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
    });
  const zoomCentre = (factor: number) => {
    const el = box.current;
    if (el) zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2);
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.002), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const btn = "flex size-8 items-center justify-center rounded-md hover:bg-muted";
  return (
    <div className="relative h-full min-h-[320px] overflow-hidden rounded-lg border" style={BACKDROP_CSS[backdrop]}>
      <div
        ref={box}
        role="application"
        tabIndex={0}
        aria-label="SVG preview. Drag to move, scroll to zoom, plus and minus to zoom, 0 to reset."
        onKeyDown={(e) => {
          if (e.key === "+" || e.key === "=") zoomCentre(1.3);
          else if (e.key === "-") zoomCentre(1 / 1.3);
          else if (e.key === "0") setXf({ k: 1, x: 0, y: 0 });
          else return;
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: xf.x, y: xf.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d && d.id === e.pointerId) setXf((v) => ({ ...v, x: d.x + e.clientX - d.sx, y: d.y + e.clientY - d.sy }));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        className={`absolute inset-0 touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring ${xf.k > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
      >
        <div className="h-full w-full p-3" style={{ transform: `translate(${xf.x}px, ${xf.y}px) scale(${xf.k})`, transformOrigin: "0 0" }}>
          {children}
        </div>
      </div>
      <div role="toolbar" aria-label="Zoom" className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border bg-background p-1 shadow-md">
        <button type="button" aria-label="Zoom in" className={btn} onClick={() => zoomCentre(1.3)}><Plus className="size-4" /></button>
        <button type="button" aria-label="Zoom out" className={btn} onClick={() => zoomCentre(1 / 1.3)}><Minus className="size-4" /></button>
        <button type="button" aria-label="Reset zoom" className={btn} onClick={() => setXf({ k: 1, x: 0, y: 0 })}><Maximize className="size-4" /></button>
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(xf.k * 100)}%</span>
      </div>
    </div>
  );
}

/** Every parsed line in its own file colour, so the user can see which lines belong to which style. */
function StylesView({ dieline, active }: { dieline: ImportedDieline; active: string | null }) {
  const size = Math.max(dieline.widthMm, dieline.heightMm);
  const pad = size * 0.03;
  const sw = size / 500;
  const byStyle = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of dieline.paths) m.set(p.style, (m.get(p.style) ?? "") + pathData(p.pts, p.closed));
    return m;
  }, [dieline]);
  return (
    <svg viewBox={`${-pad} ${-pad} ${dieline.widthMm + 2 * pad} ${dieline.heightMm + 2 * pad}`} className="h-full w-full" role="img" aria-label="Lines grouped by style" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {dieline.styles.map((st) => {
        const on = active === st.key;
        const dim = active !== null && !on;
        return (
          <path
            key={st.key}
            d={byStyle.get(st.key) ?? ""}
            stroke={st.stroke ?? "#111111"}
            strokeWidth={on ? sw * 3 : sw * 1.2}
            strokeDasharray={st.dashed ? `${sw * 5} ${sw * 3}` : undefined}
            opacity={dim ? 0.12 : 1}
          />
        );
      })}
    </svg>
  );
}

/**
 * "Preview your SVG": the uploaded file as drawn (zoomable), a view that groups its
 * lines by style, and the role of every style, so the roles can be decided while looking.
 */
export function SvgPreviewButton({
  rawSvg,
  dieline,
  roles,
  onRole,
}: {
  /** The uploaded file's text; null when editing without a new upload. */
  rawSvg: string | null;
  dieline: ImportedDieline;
  roles: Record<string, Role>;
  onRole: (styleKey: string, role: Role) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("original");
  const [backdrop, setBackdrop] = useState<Backdrop>("white");
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement | null>(null);
  const active = hover ?? pinned;

  // An <img> never runs scripts or loads other files from an SVG, so showing the raw upload is safe.
  const url = useMemo(() => (open && rawSvg ? URL.createObjectURL(new Blob([rawSvg], { type: "image/svg+xml" })) : null), [open, rawSvg]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const tab = (v: View, label: string) => (
    <button type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`h-8 rounded-md px-3 text-sm font-medium ${view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{label}</button>
  );

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={!rawSvg} title={rawSvg ? undefined : "Upload the SVG file again to see the original"} onClick={() => setOpen(true)}>
        <Eye className="size-4" aria-hidden /> Preview your SVG
      </Button>
      {open ? (
        <dialog
          ref={(el) => {
            ref.current = el;
            if (el && !el.open) el.showModal();
          }}
          onClose={() => { setOpen(false); setHover(null); setPinned(null); }}
          onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
          aria-labelledby="svg-preview-title"
          className="m-auto h-[min(760px,94dvh)] w-[min(1120px,calc(100vw-24px))] overflow-hidden rounded-xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40"
        >
          <div className="grid h-full grid-rows-[auto_1fr_auto]">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <div>
                <h2 id="svg-preview-title" className="flex items-center gap-1 font-semibold">Your SVG <InfoTip label="Your SVG">Look at it, then set each style&apos;s role on the right.</InfoTip></h2>
                <p className="text-xs text-muted-foreground">{dieline.widthMm.toFixed(1)} × {dieline.heightMm.toFixed(1)} mm, {dieline.styles.length} line {dieline.styles.length === 1 ? "style" : "styles"}.</p>
              </div>
              <button type="button" aria-label="Close" className="rounded p-1 hover:bg-muted" onClick={() => ref.current?.close()}><X className="size-4" /></button>
            </div>

            <div className="grid min-h-0 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="flex min-h-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div role="tablist" aria-label="View" className="flex gap-1 rounded-lg bg-muted p-1">
                    {tab("original", "Original file")}
                    {tab("styles", "Lines by style")}
                  </div>
                  <div role="group" aria-label="Background" className="ml-auto flex items-center gap-1 text-xs">
                    <span className="text-muted-foreground">Background</span>
                    {(["white", "dark", "checker"] as const).map((b) => (
                      <button key={b} type="button" aria-pressed={backdrop === b} onClick={() => setBackdrop(b)} className={`h-7 rounded-md border px-2 capitalize ${backdrop === b ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted"}`}>{b}</button>
                    ))}
                  </div>
                </div>
                <div className="min-h-0 flex-1">
                  <ZoomPane key={view} backdrop={backdrop}>
                    {view === "original" ? (
                      url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- the admin's own upload, shown from a local blob URL
                        <img src={url} alt="The uploaded SVG file, as drawn" draggable={false} className="pointer-events-none h-full w-full select-none object-contain" />
                      ) : null
                    ) : (
                      <StylesView dieline={dieline} active={active} />
                    )}
                  </ZoomPane>
                </div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  {view === "original" ? "Original" : "By style"}
                  <InfoTip label="About this view">
                    {view === "original"
                      ? "This is your file exactly as it was drawn. Scroll to zoom, drag to move. White lines need the dark background."
                      : "Every line in the colour of its style. Hover or click a style on the right to see which lines it covers."}
                  </InfoTip>
                </p>
              </div>

              <div className="flex min-h-0 flex-col gap-2">
                <h3 className="text-sm font-medium">Line styles and their role</h3>
                <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                  {dieline.styles.map((st) => {
                    const on = active === st.key;
                    return (
                      <li
                        key={st.key}
                        onMouseEnter={() => setHover(st.key)}
                        onMouseLeave={() => setHover(null)}
                        className={`flex items-center gap-2 rounded-lg border p-2 ${on ? "border-primary bg-primary/5" : ""}`}
                      >
                        <button
                          type="button"
                          aria-pressed={pinned === st.key}
                          aria-label={`Highlight ${st.stroke ?? "no colour"}${st.dashed ? " dashed" : " solid"} lines`}
                          onFocus={() => setHover(st.key)}
                          onBlur={() => setHover(null)}
                          onClick={() => { setPinned(pinned === st.key ? null : st.key); setView("styles"); }}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <svg width="34" height="14" aria-hidden className="shrink-0 rounded bg-white ring-1 ring-border">
                            <line x1="2" y1="7" x2="32" y2="7" stroke={st.stroke ?? "#111"} strokeWidth="3" strokeDasharray={st.dashed ? "6 3" : undefined} />
                          </svg>
                          <span className="min-w-0 text-xs">
                            <span className="block truncate font-medium">{st.stroke ?? "no colour"}{st.dashed ? ", dashed" : ", solid"}</span>
                            <span className="text-muted-foreground">{st.count} {st.count === 1 ? "line" : "lines"}, {st.strokeWidthMm.toFixed(2)} mm</span>
                          </span>
                        </button>
                        <select
                          aria-label={`Role of ${st.stroke ?? "no colour"}${st.dashed ? " dashed" : " solid"} lines`}
                          className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                          value={roles[st.key]}
                          onChange={(e) => onRole(st.key, e.target.value as Role)}
                          style={{ borderLeft: `4px solid ${ROLE_COLOR[roles[st.key] ?? "ignore"]}` }}
                        >
                          {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                      </li>
                    );
                  })}
                </ul>
                {!Object.values(roles).includes("cut") ? <p role="alert" className="text-xs text-destructive">Mark at least one style as Cut.</p> : null}
              </div>
            </div>

            <div className="flex justify-end border-t px-5 py-3">
              <Button type="button" onClick={() => ref.current?.close()}>Done</Button>
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
