"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, ImageIcon, Plus, Sparkles, Trash2, X } from "lucide-react";
import { generateDieline } from "@packaging/dieline-engine";
import { Button } from "@/components/ui/button";
import { RangeSlider } from "@/components/ui/range-slider";
import { CartonView, type CartonViewHandle } from "@/components/viewer3d/carton-view";
import { addStarterLayouts, clearLayoutIcon, createLayout, deleteLayout, moveLayout, setIconBox, setIconStyle, setLayoutIcon, updateLayout } from "@/app/doraadmin/template-layout-actions";
import { MAX_BOXES, MAX_ITEMS, MAX_REPEAT, PRESETS, layoutInstances, newBoxItem, presetSpec, type BoxItem, type LayoutItem, type LayoutSpec, type Repeat } from "@/lib/scene-layout";
import { notify } from "@/lib/notify";
import { SAMPLE_BOXES, SAMPLE_STYLES, styleCss } from "@/lib/sample-boxes";
import { gradientTexture } from "./sample-look";
import { confirmAction } from "@/lib/confirm";

/** Icons are square pictures of this many pixels. */
const ICON_PX = 300;

const input = "h-9 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** What is being edited: a saved layout (id) or a new one (null). */
interface Draft {
  id: string | null;
  name: string;
  active: boolean;
  spec: LayoutSpec;
}

const newDraft = (n: number): Draft => ({ id: null, name: `Sample ${n}`, active: true, spec: defaultLayoutSpec("row") });

/** A number with a slider: the value is shown next to it and can be typed. */
function Setting({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="grid grid-cols-[7.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <RangeSlider min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="flex items-center gap-1">
        <input
          type="number"
          aria-label={`${label}, value`}
          className={`${input} h-8 w-full px-1.5 text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
        />
        {unit ? <span className="text-xs text-muted-foreground">{unit}</span> : null}
      </span>
    </label>
  );
}

/**
 * Admin: the layouts customers can pick on a shared template page ("Sample 1", "Sample 2" ...). Pick or add one on the left;
 * set the arrangement and the camera on the right and watch the result on a sample box. The same list serves every template.
 */
export function LayoutManager({ layouts, iconBox, iconStyle }: { layouts: LayoutItem[]; /** The sample box and colour style all icons (and the preview) use. */ iconBox: string; iconStyle: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft>(() => {
    const first = layouts[0];
    return first ? { id: first.id, name: first.name, active: first.active, spec: first.spec } : newDraft(1);
  });
  const view = useRef<CartonViewHandle>(null);
  /** The box being edited (an index into the layout's boxes). */
  const [sel, setSel] = useState(0);

  // The box the preview shows (the layouts work on any box, so the admin can try them on different shapes).
  const [styleId, setStyleId] = useState(SAMPLE_STYLES.some((x) => x.id === iconStyle) ? iconStyle : SAMPLE_STYLES[0]!.id);
  const style = SAMPLE_STYLES.find((x) => x.id === styleId) ?? SAMPLE_STYLES[0]!;
  const [boxId, setBoxId] = useState(SAMPLE_BOXES.some((b) => b.id === iconBox) ? iconBox : SAMPLE_BOXES[0]!.id);
  const sample = useMemo(() => {
    const b = SAMPLE_BOXES.find((x) => x.id === boxId) ?? SAMPLE_BOXES[0]!;
    try {
      return generateDieline(b.generatorId, b.params);
    } catch {
      return null;
    }
  }, [boxId]);

  // The gradient of the chosen style, painted on the flat sheet of the sample box (null for the plain board and solid colours).
  const look = useMemo(() => (sample ? gradientTexture(sample, style) : null), [sample, style]);

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          notify.success(r.message);
          after?.();
          router.refresh();
        } else notify.error(r.message);
      } catch {
        notify.error("Could not complete the action. Please try again.");
      }
    });

  const set = (patch: Partial<LayoutSpec>) => setDraft((d) => ({ ...d, spec: { ...d.spec, ...patch } }));
  const pick = (l: LayoutItem) => {
    setDraft({ id: l.id, name: l.name, active: l.active, spec: l.spec });
    setSel(0);
  };
  const spec = draft.spec;
  const total = layoutInstances(spec).length;
  const at = Math.min(sel, spec.items.length - 1);
  const item = spec.items[at]!;
  const setItems = (items: BoxItem[]) => set({ items });
  const setItem = (patch: Partial<Omit<BoxItem, "repeat">>) => setItems(spec.items.map((it, i) => (i === at ? { ...it, ...patch } : it)));
  const setRepeat = (patch: Partial<Repeat>) => setItems(spec.items.map((it, i) => (i === at ? { ...it, repeat: { ...it.repeat, ...patch } } : it)));
  // The most boxes one item may repeat to, so the whole layout stays within the limit.
  const perLine = item.repeat.rows;
  const room = Math.floor((MAX_BOXES - (total - item.repeat.count * item.repeat.rows)) / perLine);
  const roomRows = Math.floor((MAX_BOXES - (total - item.repeat.count * item.repeat.rows)) / item.repeat.count);
  const addBox = () => {
    if (spec.items.length >= MAX_ITEMS || total >= MAX_BOXES) return notify.error(`At most ${MAX_ITEMS} boxes to set up and ${MAX_BOXES} on screen.`);
    setItems([...spec.items, newBoxItem({ x: item.x + 1.2 })]);
    setSel(spec.items.length);
  };
  const dupBox = () => {
    if (spec.items.length >= MAX_ITEMS || total + item.repeat.count * item.repeat.rows > MAX_BOXES) return notify.error(`At most ${MAX_ITEMS} boxes to set up and ${MAX_BOXES} on screen.`);
    setItems([...spec.items.slice(0, at + 1), { ...item, x: item.x + 1.2, repeat: { ...item.repeat } }, ...spec.items.slice(at + 1)]);
    setSel(at + 1);
  };
  const removeBox = () => {
    if (spec.items.length < 2) return;
    setItems(spec.items.filter((_, i) => i !== at));
    setSel(Math.max(0, at - 1));
  };
  const loadPreset = (id: string) => {
    const p = presetSpec(id);
    if (!p) return;
    setDraft((d) => ({ ...d, spec: { ...p, mirror: p.mirror.on ? p.mirror : d.spec.mirror } }));
    setSel(0);
  };

  const save = () => {
    const body = { name: draft.name, active: draft.active, spec };
    if (draft.id) run(() => updateLayout({ id: draft.id, ...body }));
    else run(() => createLayout(body), () => { setDraft(newDraft(layouts.length + 2)); setSel(0); });
  };

  // Changing the box redraws every saved icon with it: one hidden 3D view is shown for each layout in turn, and its picture is saved.
  const [redraw, setRedraw] = useState<{ queue: LayoutItem[]; at: number } | null>(null);
  const redrawView = useRef<CartonViewHandle>(null);

  /** Save the box or the style, then redraw every saved icon with it. */
  const changeLook = (what: "box" | "style", id: string) => {
    if (what === "box") setBoxId(id);
    else setStyleId(id);
    start(async () => {
      const r = await (what === "box" ? setIconBox(id) : setIconStyle(id)).catch(() => ({ ok: false, message: "Could not save." }));
      if (!r.ok) return void notify.error(r.message);
      const queue = layouts.filter((l) => l.iconUrl);
      if (queue.length > 0) setRedraw({ queue, at: 0 });
    });
  };

  /** The hidden view of the current layout is ready: keep its picture as the icon, then go to the next layout. */
  const iconReady = async () => {
    if (!redraw) return;
    const cur = redraw.queue[redraw.at]!;
    const png = redrawView.current?.snapshot({ width: ICON_PX, height: ICON_PX });
    if (png) await setLayoutIcon(cur.id, png).catch(() => undefined);
    if (redraw.at + 1 < redraw.queue.length) setRedraw({ queue: redraw.queue, at: redraw.at + 1 });
    else {
      setRedraw(null);
      notify.success(`Redrew ${redraw.queue.length} ${redraw.queue.length === 1 ? "icon" : "icons"}.`);
      router.refresh();
    }
  };

  /** The person moved the camera in the preview: Turn around, Look from and Zoom follow it. */
  const takeView = (v: { azimuthDeg: number; elevationDeg: number; zoom: number }) => {
    const turn = ((((Math.round(v.azimuthDeg) + 180) % 360) + 360) % 360) - 180;
    set({ azimuthDeg: turn, elevationDeg: Math.max(-89, Math.min(89, Math.round(v.elevationDeg))), zoom: Math.max(0.2, Math.min(10, Math.round(v.zoom * 100) / 100)) });
  };

  /** Keep a small picture of the preview, as it is now, as the icon of this layout (shown where the layout is listed). */
  const setIcon = () => {
    if (!draft.id) return notify.error("Save the layout first, then set its icon.");
    const png = view.current?.snapshot({ width: ICON_PX, height: ICON_PX });
    if (!png) return notify.error("The 3D view is not ready yet.");
    run(() => setLayoutIcon(draft.id, png));
  };
  const iconUrl = layouts.find((l) => l.id === draft.id)?.iconUrl ?? null;


  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3 shadow-xs">
        <label className="flex items-center gap-2 text-sm font-medium">
          Box
          <select value={boxId} disabled={pending || redraw !== null} onChange={(e) => changeLook("box", e.target.value)} aria-label="Box shape for the preview and the icons" className={`${input} font-normal`}>
            {SAMPLE_BOXES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          Style
          <span aria-hidden className="size-5 shrink-0 rounded-full border" style={{ background: styleCss(style) }} />
          <select value={styleId} disabled={pending || redraw !== null} onChange={(e) => changeLook("style", e.target.value)} aria-label="Colour style of the box in the preview and the icons" className={`${input} font-normal`}>
            {SAMPLE_STYLES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">{redraw ? `Redrawing icons ${redraw.at + 1} of ${redraw.queue.length}…` : "The preview and the icons of all samples are drawn with this box and style. Changing either redraws the saved icons."}</p>
      </div>
      {redraw ? (
        <div aria-hidden className="pointer-events-none fixed top-0 -left-[2000px] size-[300px]">
          {sample ? <CartonView key={`${redraw.queue[redraw.at]!.id}-${boxId}`} ref={redrawView} className="size-full" geo={sample} texture={look?.canvas ?? null} textureRect={look?.rect ?? null} progress={1} outsideColor={style.outside} insideColor={style.inside} layout={redraw.queue[redraw.at]!.spec} boardGrain={1} onReady={() => void iconReady()} /> : null}
        </div>
      ) : null}
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
      <aside className="flex flex-col gap-3">
        <ol aria-label="Layouts" className="flex flex-col gap-1 rounded-xl border bg-card p-1.5 shadow-xs">
          {layouts.map((l, i) => {
            const active = draft.id === l.id;
            return (
              <li key={l.id} className={`flex items-center gap-1 rounded-lg ${active ? "bg-accent" : "hover:bg-muted/60"}`}>
                <button type="button" onClick={() => pick(l)} aria-current={active ? "true" : undefined} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-left">
                  {l.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- the layout's own small PNG
                    <img src={l.iconUrl} alt="" className="size-10 shrink-0 rounded border bg-muted object-cover" />
                  ) : (
                    <span className="grid size-10 shrink-0 place-items-center rounded border border-dashed text-muted-foreground"><ImageIcon className="size-4" aria-hidden /></span>
                  )}
                  <span className="min-w-0">
                  <span className={`block truncate text-sm ${active ? "font-medium" : ""}`}>{l.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{(() => {
                      const n = layoutInstances(l.spec).length;
                      return `${n} ${n === 1 ? "box" : "boxes"}${l.spec.mirror.on ? ", mirror" : ""}`;
                    })()}</span>
                  </span>
                </button>
                <button type="button" aria-label={`Move ${l.name} up`} disabled={pending || i === 0} className="grid size-7 place-items-center rounded-md hover:bg-background disabled:opacity-30" onClick={() => run(() => moveLayout(l.id, "up"))}><ArrowUp className="size-3.5" /></button>
                <button type="button" aria-label={`Move ${l.name} down`} disabled={pending || i === layouts.length - 1} className="mr-1 grid size-7 place-items-center rounded-md hover:bg-background disabled:opacity-30" onClick={() => run(() => moveLayout(l.id, "down"))}><ArrowDown className="size-3.5" /></button>
              </li>
            );
          })}
          {layouts.length === 0 ? <li className="px-3 py-4 text-center text-sm text-muted-foreground">No layouts yet.</li> : null}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-9" onClick={() => { setDraft(newDraft(layouts.length + 1)); setSel(0); }}><Plus className="size-4" /> New layout</Button>
          {layouts.length === 0 ? (
            <Button type="button" variant="outline" className="h-9" disabled={pending} onClick={() => run(() => addStarterLayouts(), () => undefined)}><Sparkles className="size-4" /> Add starter layouts</Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">Customers see the layouts that are switched on, in this order, as Sample 1, Sample 2 and so on.</p>
      </aside>

      <section aria-label="Layout settings" className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:items-start">
        <div className="overflow-hidden rounded-xl border bg-muted/40 xl:order-2 xl:sticky xl:top-24">
          {sample ? <CartonView ref={view} className="h-[22rem] w-full" geo={sample} texture={look?.canvas ?? null} textureRect={look?.rect ?? null} progress={1} outsideColor={style.outside} insideColor={style.inside} layout={spec} boardGrain={1} onUserView={takeView} /> : null}
          <div className="flex items-center justify-between gap-2 border-t bg-background px-3 py-2">
            {iconUrl ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {/* eslint-disable-next-line @next/next/no-img-element -- the layout's own small PNG */}
                <img src={iconUrl} alt="" className="size-10 rounded border object-cover" />
                Icon
                <button type="button" aria-label="Remove the icon" title="Remove the icon" disabled={pending} onClick={() => draft.id && run(() => clearLayoutIcon(draft.id))} className="grid size-6 place-items-center rounded-md hover:bg-muted"><X className="size-3.5" aria-hidden /></button>
              </span>
            ) : <span />}
            <div className="flex flex-wrap justify-end gap-1.5">
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={setIcon} title={draft.id ? "Use the 3D view as it is now as the icon of this layout" : "Save the layout first"}><ImageIcon className="size-3.5" /> Set this view as icon</Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs xl:order-1">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
            <label className="flex flex-col gap-1 text-xs font-medium">
              Name
              <input className={input} value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Start from a preset
              <select
                className={input}
                value=""
                onChange={(e) => {
                  if (e.target.value) loadPreset(e.target.value);
                }}
              >
                <option value="">Choose…</option>
                {PRESETS.map((a) => <option key={a.id} value={a.id} title={a.hint}>{a.label}</option>)}
              </select>
            </label>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">A preset only fills in the boxes below. Change anything after it.</p>

          <div className="flex flex-col gap-3 border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Boxes <span className="font-normal text-muted-foreground">({total} on screen)</span></p>
              <div className="flex gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={addBox}><Plus className="size-3.5" /> Add box</Button>
                <Button type="button" variant="outline" size="sm" onClick={dupBox}><Copy className="size-3.5" /> Duplicate</Button>
                <Button type="button" variant="destructive" size="sm" className="border-destructive/30" disabled={spec.items.length < 2} onClick={removeBox}><Trash2 className="size-3.5" /> Remove</Button>
              </div>
            </div>
            <div role="tablist" aria-label="Boxes" className="flex flex-wrap gap-1">
              {spec.items.map((it, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === at}
                  onClick={() => setSel(i)}
                  className={`h-8 rounded-lg border px-3 text-sm ${i === at ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted"}`}
                >
                  Box {i + 1}{it.repeat.count * it.repeat.rows > 1 ? ` ×${it.repeat.count * it.repeat.rows}` : ""}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">Place (1 = one box size)</p>
              <Setting label="Left / right" value={item.x} min={-12} max={12} step={0.05} onChange={(v) => setItem({ x: v })} />
              <Setting label="Up (on the floor = 0)" value={item.y} min={-5} max={12} step={0.05} onChange={(v) => setItem({ y: v })} />
              <Setting label="Front / back" value={item.z} min={-12} max={12} step={0.05} onChange={(v) => setItem({ z: v })} />
              <p className="pt-1 text-xs font-medium text-muted-foreground">Turn</p>
              <Setting label="Spin" value={item.yawDeg} min={-180} max={180} step={1} unit="°" onChange={(v) => setItem({ yawDeg: Math.round(v) })} />
              <Setting label="Lean forward" value={item.pitchDeg} min={-180} max={180} step={1} unit="°" onChange={(v) => setItem({ pitchDeg: Math.round(v) })} />
              <Setting label="Lean sideways" value={item.rollDeg} min={-180} max={180} step={1} unit="°" onChange={(v) => setItem({ rollDeg: Math.round(v) })} />
              <p className="pt-1 text-xs font-medium text-muted-foreground">Size</p>
              <Setting label="Size" value={item.scale} min={0.2} max={3} step={0.05} unit="×" onChange={(v) => setItem({ scale: Math.round(v * 100) / 100 })} />
              <Setting label="Wider" value={item.stretchX} min={0.2} max={3} step={0.05} unit="×" onChange={(v) => setItem({ stretchX: Math.round(v * 100) / 100 })} />
              <Setting label="Taller" value={item.stretchY} min={0.2} max={3} step={0.05} unit="×" onChange={(v) => setItem({ stretchY: Math.round(v * 100) / 100 })} />
              <Setting label="Deeper" value={item.stretchZ} min={0.2} max={3} step={0.05} unit="×" onChange={(v) => setItem({ stretchZ: Math.round(v * 100) / 100 })} />
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setItem({ pitchDeg: 90, rollDeg: 0 })}>Lay flat</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setItem({ pitchDeg: 0, rollDeg: 0, yawDeg: 0 })}>Stand up</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setItem({ stretchX: 1, stretchY: 1, stretchZ: 1, scale: 1 })}>Reset size</Button>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">Repeat this box: a line of copies, then rows of lines (for grids)</p>
              <Setting label="Copies in a line" value={item.repeat.count} min={1} max={Math.min(MAX_REPEAT, Math.max(1, room))} step={1} onChange={(v) => setRepeat({ count: Math.round(v) })} />
              {item.repeat.count > 1 ? (
                <>
                  <Setting label="Step right" value={item.repeat.dx} min={-4} max={4} step={0.05} onChange={(v) => setRepeat({ dx: v })} />
                  <Setting label="Step up" value={item.repeat.dy} min={-4} max={4} step={0.05} onChange={(v) => setRepeat({ dy: v })} />
                  <Setting label="Step forward" value={item.repeat.dz} min={-4} max={4} step={0.05} onChange={(v) => setRepeat({ dz: v })} />
                  <Setting label="Spin each by" value={item.repeat.dYawDeg} min={-90} max={90} step={1} unit="°" onChange={(v) => setRepeat({ dYawDeg: Math.round(v) })} />
                  <Setting label="Lean forward each by" value={item.repeat.dPitchDeg} min={-90} max={90} step={1} unit="°" onChange={(v) => setRepeat({ dPitchDeg: Math.round(v) })} />
                  <Setting label="Lean sideways each by" value={item.repeat.dRollDeg} min={-90} max={90} step={1} unit="°" onChange={(v) => setRepeat({ dRollDeg: Math.round(v) })} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={item.repeat.alternateLean} onChange={(e) => setRepeat({ alternateLean: e.target.checked })} />
                    Zig-zag: neighbours lean opposite ways
                  </label>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Add copies to repeat the box to the right, up, forward, or any mix.</p>
              )}
              <Setting label="Rows" value={item.repeat.rows} min={1} max={Math.min(MAX_REPEAT, Math.max(1, roomRows))} step={1} onChange={(v) => setRepeat({ rows: Math.round(v) })} />
              {item.repeat.rows > 1 ? (
                <>
                  <Setting label="Row step right" value={item.repeat.rowDx} min={-4} max={4} step={0.05} onChange={(v) => setRepeat({ rowDx: v })} />
                  <Setting label="Row step up" value={item.repeat.rowDy} min={-4} max={4} step={0.05} onChange={(v) => setRepeat({ rowDy: v })} />
                  <Setting label="Row step forward" value={item.repeat.rowDz} min={-4} max={4} step={0.05} onChange={(v) => setRepeat({ rowDz: v })} />
                </>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t pt-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={spec.mirror.on} onChange={(e) => set({ mirror: { ...spec.mirror, on: e.target.checked } })} />
              Glossy floor (reflection)
            </label>
            {spec.mirror.on ? (
              <>
                <Setting label="Reflection strength" value={spec.mirror.opacity} min={0.05} max={0.8} step={0.01} onChange={(v) => set({ mirror: { ...spec.mirror, opacity: Math.round(v * 100) / 100 } })} />
                <Setting label="Reflection length" value={spec.mirror.fade} min={0.1} max={3} step={0.05} unit="×" onChange={(v) => set({ mirror: { ...spec.mirror, fade: Math.round(v * 100) / 100 } })} />
              </>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 border-t pt-4">
            <p className="text-sm font-medium">Camera</p>
            <Setting label="Turn around" value={spec.azimuthDeg} min={-180} max={180} step={1} unit="°" onChange={(v) => set({ azimuthDeg: Math.round(v) })} />
            <Setting label="Look from" value={spec.elevationDeg} min={-89} max={89} step={1} unit="°" onChange={(v) => set({ elevationDeg: Math.round(v) })} />
            <Setting label="Zoom" value={spec.zoom} min={0.2} max={4} step={0.05} unit="×" onChange={(v) => set({ zoom: Math.round(v * 100) / 100 })} />
          </div>

          <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t bg-card px-4 py-3 shadow-[0_-8px_12px_-10px_rgba(0,0,0,0.18)]">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Show to customers
            </label>
            <div className="flex gap-2">
              {draft.id ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="h-9 border-destructive/30"
                  disabled={pending}
                  onClick={async () => {
                    if (await confirmAction({ title: `Delete "${draft.name}"?`, description: "Customers will no longer see this layout." })) run(() => deleteLayout(draft.id), () => { setDraft(newDraft(layouts.length)); setSel(0); });
                  }}
                >
                  <Trash2 className="size-4" /> Delete
                </Button>
              ) : null}
              <Button type="button" className="h-9" disabled={pending} onClick={save}>{draft.id ? "Save layout" : "Add layout"}</Button>
            </div>
          </div>
        </div>
      </section>
    </div>
    </div>
  );
}
