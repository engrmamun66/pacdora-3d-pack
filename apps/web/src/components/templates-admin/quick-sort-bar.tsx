"use client";

import { InfoTip } from "./help-tip";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const MIN_H = 150;
/** Height the bar opens with (and returns to on a double-click on the grip). */
const START_H = 200;
/** How long a chip takes to slide in or out (ms); a little more than the CSS animation. */
const CHIP_MS = 240;
/** How long the bar takes to slide up or down (ms); the editor waits this long before it lets go of the sort. */
export const QUICK_SLIDE_MS = 260;

export interface QuickItem {
  id: string;
  label: string;
  /** The step the line was given; lines with the same step fold together. */
  step: number;
}

/**
 * Quick sort bar, fixed to the bottom of the window while it is open (it does not move when the page scrolls).
 * An empty placeholder of the same height sits in the page, so nothing hides behind the bar and the bar keeps the editor's left edge and width.
 * The fold lines the admin clicked are shown in groups, one group per step. Step 1 is open at first, and "Add step" opens
 * the next one: the lines clicked from then on join it. Lines of one step fold together. Drag a chip into another step
 * (or focus it and press Alt + left or right arrow), press x to drop it, Apply to use it.
 */
export function QuickSortBar({
  items,
  step,
  preview,
  onPreviewChange,
  total,
  onAddStep,
  onSelectStep,
  onEdit,
  onHover,
  partNames,
  activeId = null,
  lightId = null,
  count,
  onSetStep,
  onMove,
  onRemoveStep,
  onRemove,
  onClear,
  onApply,
  onCancel,
  bottom,
  closing = false,
}: {
  items: QuickItem[];
  /** The step the next clicked line joins. */
  step: number;
  /** How many panels fold in all (every fold line swings one panel): the number to pick from. */
  total: number;
  /** Whether the 3D box folds in the order being sorted. */
  preview: boolean;
  onPreviewChange: (on: boolean) => void;
  onAddStep: () => void;
  /** Make this step the open one: the lines clicked next join it. */
  onSelectStep: (step: number) => void;
  /** A chip's name was clicked: edit that line's step, angle, kind and direction. */
  onEdit: (id: string) => void;
  /** Names of the part(s) being sorted now (the box, a lid...). Absent when the sheet is a single piece. */
  partNames?: readonly string[];
  /** The pointer (or keyboard focus) is on this line's chip, or left it (null): the editor lights the panel it swings on the sheet and in 3D. */
  onHover?: (id: string | null) => void;
  /** The line being edited in the side panel: its chip stays highlighted. */
  activeId?: string | null;
  /** The panel under the pointer on the sheet or in the 3D view has this line: its chip blinks and its step is scrolled into view. */
  lightId?: string | null;
  /** How many steps to show (empty ones too), at least. */
  count: number;
  /** Give a line this step. */
  onSetStep: (id: string, step: number) => void;
  /** Put a line in a step just before another line of it (`beforeId`), or at the end of the step when `beforeId` is null. */
  onMove: (id: string, step: number, beforeId: string | null) => void;
  /** Drop a whole step with its lines; the steps after it move up one. */
  onRemoveStep: (step: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onApply: () => void;
  onCancel: () => void;
  /** Distance from the window bottom (CSS length), so the bar clears a sticky save bar. */
  bottom: string;
  /** The bar is leaving: it slides down instead of sitting there. */
  closing?: boolean;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStep, setOverStep] = useState<number | null>(null);
  // Where a dragged chip would land: before or after this chip.
  const [landing, setLanding] = useState<{ id: string; after: boolean } | null>(null);
  // Height of the bar. The grip at the top centre makes it taller (as tall as the window allows) so more steps show at once.
  const [height, setHeight] = useState(START_H);
  // The placeholder in the page tells where the bar goes sideways (the editor's column); the bar itself is fixed to the window.
  const slot = useRef<HTMLDivElement>(null);
  const [column, setColumn] = useState<{ left: number; width: number } | null>(null);
  useEffect(() => {
    const el = slot.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setColumn((c) => (c && c.left === r.left && c.width === r.width ? c : { left: r.left, width: r.width }));
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      watch.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const grip = useRef<{ y: number; h: number } | null>(null);
  const maxH = () => Math.max(MIN_H, window.innerHeight - 80);
  const resize = (h: number) => setHeight(Math.min(maxH(), Math.max(MIN_H, Math.round(h))));

  // Chips slide in from the right when a line joins, and slide back out when it leaves. A removed chip stays on screen
  // (in `leaving`) until its exit animation is done; `fresh` holds the chips that have just joined.
  const [seen, setSeen] = useState(items);
  const [fresh, setFresh] = useState<string[]>([]);
  const [leaving, setLeaving] = useState<QuickItem[]>([]);
  if (seen !== items) {
    setSeen(items);
    const gone = seen.filter((p) => !items.some((i) => i.id === p.id));
    const added = items.filter((i) => !seen.some((p) => p.id === i.id)).map((i) => i.id);
    if (gone.length) setLeaving((l) => [...l.filter((x) => !gone.some((g) => g.id === x.id) && !items.some((i) => i.id === x.id)), ...gone]);
    else if (leaving.some((x) => items.some((i) => i.id === x.id))) setLeaving((l) => l.filter((x) => !items.some((i) => i.id === x.id)));
    if (added.length) setFresh((f) => [...f, ...added]);
  }
  useEffect(() => {
    if (!leaving.length && !fresh.length) return;
    const timer = window.setTimeout(() => {
      setLeaving([]);
      setFresh([]);
    }, CHIP_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, fresh]);

  // "Add step" opens the next group at the bottom of the list: when the list scrolls, glide down so the new step is in view.
  const list = useRef<HTMLOListElement>(null);
  const scrollToNew = useRef(false);
  useEffect(() => {
    if (!scrollToNew.current) return;
    scrollToNew.current = false;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const box = list.current;
    const group = box?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    // Scroll only this list (not the page): down to where the new step's bottom edge meets the list's bottom edge.
    if (box && group) box.scrollTo({ top: group.offsetTop + group.offsetHeight - box.clientHeight, behavior: reduce ? "auto" : "smooth" });
  }, [step]);

  // A panel under the pointer elsewhere: bring its step into view in the list (only the list scrolls, not the page).
  useEffect(() => {
    if (!lightId) return;
    const box = list.current;
    const chip = box?.querySelector<HTMLElement>(`[data-chip="${CSS.escape(lightId)}"]`);
    const group = chip?.closest<HTMLElement>("[data-step]");
    if (!box || !group) return;
    const top = group.offsetTop;
    const bottom = top + group.offsetHeight;
    if (top >= box.scrollTop && bottom <= box.scrollTop + box.clientHeight) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({ top: Math.max(0, top - 4), behavior: reduce ? "auto" : "smooth" });
  }, [lightId]);

  // One group per step in use, in order; the open step is always shown, even while it is still empty.
  const last = Math.max(count, step, ...items.map((i) => i.step), ...leaving.map((i) => i.step));
  const stepNumbers = Array.from({ length: last }, (_, i) => i + 1);
  const groups = stepNumbers.map((n) => ({ step: n, items: items.filter((i) => i.step === n), out: leaving.filter((i) => i.step === n) }));
  const usedSteps = groups.filter((g) => g.items.length).length;
  const idle = items.length === 0 && step === 1;
  // At the very bottom of the window the bar sits flush with it (square bottom); above a save bar it floats as a card.
  const flush = parseFloat(bottom) === 0;

  return (
    <>
    <div ref={slot} aria-hidden style={{ height }} />
    {/* In <body>, not here: a parent with a transform or filter would make "fixed" relative to itself and push the bar sideways. */}
    {typeof document === "undefined" ? null : createPortal(<section
      aria-label="Quick sort"
      style={{ bottom, height, left: column?.left ?? 0, width: column?.width ?? "100%", visibility: column ? "visible" : "hidden" }}
      className={`${closing ? "quick-down" : "quick-up"} fixed z-20 flex flex-col gap-2 border-t border-t-[#444444] ${flush ? "rounded-t-xl" : "rounded-xl"} bg-card px-4 py-2.5 shadow-[0_-6px_20px_-4px_rgba(0,0,0,0.28)]`}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the quick sort bar"
        aria-valuemin={MIN_H}
        aria-valuenow={height}
        tabIndex={0}
        title="Drag up or down to resize. Double-click to reset."
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          grip.current = { y: e.clientY, h: height };
        }}
        onPointerMove={(e) => grip.current && resize(grip.current.h + (grip.current.y - e.clientY))}
        onPointerUp={() => (grip.current = null)}
        onPointerCancel={() => (grip.current = null)}
        onDoubleClick={() => setHeight(START_H)}
        onKeyDown={(e) => {
          const next = e.key === "ArrowUp" ? height + 24 : e.key === "ArrowDown" ? height - 24 : e.key === "Home" ? START_H : null;
          if (next === null) return;
          e.preventDefault();
          resize(next);
        }}
        className="group absolute -top-3 left-1/2 flex h-6 w-20 -translate-x-1/2 cursor-ns-resize touch-none items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span aria-hidden className="h-1.5 w-12 rounded-full bg-neutral-400 shadow-xs transition-colors group-hover:bg-neutral-600 group-focus-visible:bg-neutral-600 dark:bg-neutral-500" />
      </div>

      {/* Top row: what this is, what the next click does, and the buttons. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-semibold">Quick sort</h3>
          {partNames && partNames.length ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary" title="The part being sorted now. Every part has its own steps." aria-label={`${partNames.length === 1 ? "Part" : "Parts"} being sorted: ${partNames.join(", ")}`}>
              {partNames.length === 1 ? "Part" : "Parts"}: {partNames.join(", ")}
            </span>
          ) : null}
          <InfoTip label="Quick sort">Click a step to open it, then click fold lines on the picture: they join the open step (now step {step}). A line already in another step moves to it; click a line in its own step to take it out. Add step makes a new empty step at the end. Lines with the same step fold together. Drag a chip into another step to move it, or onto another chip to put it before or after that chip.</InfoTip>
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {`${items.length} ${items.length === 1 ? "panel" : "panels"} selected / ${total} ${total === 1 ? "panel" : "panels"}${items.length ? ` - in ${usedSteps} ${usedSteps === 1 ? "step" : "steps"}` : ""}`}
        </p>
        <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 text-sm">
          <input type="checkbox" checked={preview} onChange={(e) => onPreviewChange(e.target.checked)} className="size-4 accent-foreground" />
          Preview 3D folding
        </label>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="dark" size="sm" onClick={() => {
            scrollToNew.current = true;
            onAddStep();
          }} title={`Make a new empty step ${last + 1}: the lines you click next join it`}>
            <Plus className="size-4" aria-hidden /> Add step
          </Button>
          <Button type="button" variant="dark" size="sm" disabled={idle} onClick={onClear} title="Remove every line and step"><Trash2 className="size-4" aria-hidden /> Clear</Button>
          <Button type="button" variant="destructive" size="sm" onClick={onCancel}>Cancel</Button>
          <Button type="button" variant="dark" size="sm" disabled={!items.length} onClick={onApply}>Apply</Button>
        </div>
      </div>

      {/* The steps, one group each. */}
      <ol ref={list} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-0.5" aria-label="Fold steps, in order. Lines of one step fold together.">
        {groups.map((g) => {
          const open = g.step === step;
          const target = dragId !== null && overStep === g.step;
          return (
            <li
              key={g.step}
              data-step={g.step}
              data-lit={lightId !== null && g.items.some((x) => x.id === lightId) ? "" : undefined}
              onDragOver={(e) => {
                if (dragId) {
                  e.preventDefault();
                  setOverStep(g.step);
                }
              }}
              onClick={() => onSelectStep(g.step)}
              onDragLeave={() => setOverStep((s) => (s === g.step ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) onSetStep(dragId, g.step);
                setDragId(null);
                setOverStep(null);
              }}
              className={`flex shrink-0 flex-wrap items-center gap-1.5 rounded-xl border py-1.5 pr-2 pl-1.5 cursor-pointer transition-colors ${open ? "border-primary/50 bg-primary/5" : "bg-muted/30 hover:bg-muted/50"} ${lightId !== null && g.items.some((x) => x.id === lightId) ? "border-amber-400 ring-2 ring-amber-300/60" : ""} ${target ? "border-primary bg-primary/10 ring-2 ring-primary/30" : ""}`}
            >
              <button type="button" aria-pressed={open} aria-label={`Open step ${g.step}: the lines you click next join it`} className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${open ? "bg-primary text-primary-foreground" : "bg-foreground/10 text-foreground"}`}>Step {g.step}</button>
              {g.items.length === 0 ? <span className="px-1 text-xs text-muted-foreground">Click fold lines to add them here</span> : null}
              {g.items.map((it, at) => (
                <div
                  key={it.id}
                  data-chip={it.id}
                  draggable
                  onDragOver={(e) => {
                    if (!dragId || dragId === it.id) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    setOverStep(g.step);
                    setLanding({ id: it.id, after: e.clientX > r.left + r.width / 2 });
                  }}
                  onDragLeave={() => setLanding((c) => (c?.id === it.id ? null : c))}
                  onDrop={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const after = landing?.id === it.id && landing.after;
                    onMove(dragId, g.step, after ? (g.items[at + 1]?.id ?? null) : it.id);
                    setDragId(null);
                    setOverStep(null);
                    setLanding(null);
                  }}
                  onDragStart={(e) => {
                    setDragId(it.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", it.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverStep(null);
                    setLanding(null);
                  }}
                  onPointerEnter={() => onHover?.(it.id)}
                  onPointerLeave={() => onHover?.(null)}
                  onFocus={() => onHover?.(it.id)}
                  onBlur={() => onHover?.(null)}
                  className={`flex shrink-0 cursor-grab items-center gap-1 rounded-lg border border-b-2 py-0.5 pr-0.5 pl-0.5 text-xs shadow-xs transition-opacity active:cursor-grabbing ${lightId === it.id ? "animate-pulse border-amber-500 border-b-amber-500 bg-amber-100 ring-2 ring-amber-400 dark:bg-amber-500/20" : activeId === it.id ? "border-primary border-b-primary bg-primary/10 ring-2 ring-primary/40" : "border-b-[#444444] bg-background dark:border-b-white/70"} ${dragId === it.id ? "opacity-40" : ""} ${landing?.id === it.id && dragId ? (landing.after ? "shadow-[3px_0_0_0_var(--color-primary)]" : "shadow-[-3px_0_0_0_var(--color-primary)]") : ""} ${fresh.includes(it.id) ? "chip-in" : ""}`}
                >
                  <GripVertical className="size-3 text-muted-foreground" aria-hidden />
                  <button
                    type="button"
                    className="max-w-44 truncate rounded px-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    title={`Edit ${it.label}`}
                    aria-label={`Step ${it.step}: ${it.label}. Click to edit it. Alt plus left or right arrow moves it to another step.`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(it.id);
                    }}
                    onKeyDown={(e) => {
                      if (!e.altKey) return;
                      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                        e.preventDefault();
                        if (it.step > 1) onSetStep(it.id, it.step - 1);
                      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                        e.preventDefault();
                        onSetStep(it.id, it.step + 1);
                      }
                    }}
                  >
                    {it.label}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${it.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(it.id);
                    }}
                    className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </div>
              ))}
              {g.out.map((it) => (
                <div key={`out-${it.id}`} aria-hidden className="chip-out flex shrink-0 items-center gap-1 rounded-lg border border-b-2 border-b-[#444444] bg-background dark:border-b-white/70 py-0.5 pr-0.5 pl-0.5 text-xs shadow-xs">
                  <GripVertical className="size-3 text-muted-foreground" aria-hidden />
                  <span className="max-w-44 truncate px-1">{it.label}</span>
                  <span className="grid size-5 place-items-center"><X className="size-3" aria-hidden /></span>
                </div>
              ))}
              {groups.length > 1 || g.items.length > 0 ? (
                <button
                  type="button"
                  aria-label={`Remove step ${g.step}${g.items.length ? " and its lines" : ""}`}
                  title={g.items.length ? `Remove step ${g.step} and its lines` : `Remove step ${g.step}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveStep(g.step);
                  }}
                  className="ml-auto grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>, document.body)}
    </>
  );
}
