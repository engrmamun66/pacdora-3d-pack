"use client";

import { useState } from "react";
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter, AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter, Group, RotateCcw, RotateCw, Ungroup } from "lucide-react";
import { ARTWORK_FONTS, type ArtworkObject, type BoxBackground } from "@packaging/schema";
import { BackgroundPanel } from "./background-panel";
import type { AlignMode } from "./editor-controller";
import { ColorField, NumberField, SelectField, TextField, ToggleField } from "./fields";

type Patch = Partial<ArtworkObject>;

const ALIGN: { mode: AlignMode; label: string; Icon: typeof AlignStartVertical }[] = [
  { mode: "left", label: "Align left", Icon: AlignStartVertical },
  { mode: "hcenter", label: "Align centre (horizontal)", Icon: AlignCenterVertical },
  { mode: "right", label: "Align right", Icon: AlignEndVertical },
  { mode: "top", label: "Align top", Icon: AlignStartHorizontal },
  { mode: "vcenter", label: "Align middle (vertical)", Icon: AlignCenterHorizontal },
  { mode: "bottom", label: "Align bottom", Icon: AlignEndHorizontal },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b px-3 py-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function AlignBar({ onAlign, disabled, target = "its panel" }: { onAlign: (m: AlignMode) => void; disabled: boolean; /** Words for the tooltip: what it aligns to. */ target?: string }) {
  return (
    <div className="flex gap-1">
      {ALIGN.map(({ mode, label, Icon }) => (
        <button key={mode} type="button" title={`${label} (to ${target})`} aria-label={label} disabled={disabled} onClick={() => onAlign(mode)} className="flex size-7 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40">
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

/** What the multi-selection panel can do (all act on the whole selection). */
export interface MultiActions {
  /** Count of objects in the selection. */
  count: number;
  canGroup: boolean;
  canUngroup: boolean;
  onGroup: () => void;
  onUngroup: () => void;
  onAlign: (m: AlignMode, to: "panel" | "selection") => void;
  onDistribute: (axis: "h" | "v") => void;
  /** Factor, 1 = unchanged. */
  onScale: (factor: number) => void;
  /** Degrees, clockwise. */
  onRotate: (deg: number) => void;
}

const iconBtn = "flex h-7 items-center justify-center gap-1 rounded-md border px-2 text-xs hover:bg-muted disabled:opacity-40";

/** Several objects chosen: align them, group them, make them bigger or smaller, turn them. */
function MultiPanel({ m }: { m: MultiActions }) {
  const [to, setTo] = useState<"selection" | "panel">("selection");
  const [percent, setPercent] = useState("110");
  const [degrees, setDegrees] = useState("15");
  const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
  return (
    <>
      <Section title={`${m.count} objects`}>
        <div role="radiogroup" aria-label="Align to" className="grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5 text-xs">
          {(["selection", "panel"] as const).map((v) => (
            <label key={v} className={`cursor-pointer rounded px-2 py-1 text-center ${to === v ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}>
              <input type="radio" name="align-to" className="sr-only" checked={to === v} onChange={() => setTo(v)} />
              {v === "selection" ? "To selection" : "To panel"}
            </label>
          ))}
        </div>
        <AlignBar onAlign={(mode) => m.onAlign(mode, to)} disabled={false} target={to === "selection" ? "the selection" : "its panel"} />
        <div className="flex gap-1">
          <button type="button" className={iconBtn} disabled={m.count < 3} title="Space out evenly, left to right (3 or more objects)" aria-label="Distribute horizontally" onClick={() => m.onDistribute("h")}><AlignHorizontalDistributeCenter className="size-3.5" /> Spread across</button>
          <button type="button" className={iconBtn} disabled={m.count < 3} title="Space out evenly, top to bottom (3 or more objects)" aria-label="Distribute vertically" onClick={() => m.onDistribute("v")}><AlignVerticalDistributeCenter className="size-3.5" /> Spread down</button>
        </div>
      </Section>
      <Section title="Group">
        <div className="flex gap-1">
          <button type="button" className={iconBtn} disabled={!m.canGroup} title="Group (Ctrl/Cmd+G): they move, resize and turn together" onClick={m.onGroup}><Group className="size-3.5" /> Group</button>
          <button type="button" className={iconBtn} disabled={!m.canUngroup} title="Ungroup (Shift+Ctrl/Cmd+G)" onClick={m.onUngroup}><Ungroup className="size-3.5" /> Ungroup</button>
        </div>
      </Section>
      <Section title="Size and rotation">
        <div className="flex items-center gap-1">
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Scale
            <input aria-label="Scale by percent" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") m.onScale(num(percent) / 100); }} className="h-7 w-14 rounded-md border bg-background px-1.5 text-right text-xs text-foreground" />
            %
          </label>
          <button type="button" className={iconBtn} disabled={!(num(percent) > 0)} onClick={() => m.onScale(num(percent) / 100)}>Apply</button>
        </div>
        <p className="text-[11px] text-muted-foreground">100 keeps the size; 50 halves it, 200 doubles it. You can also drag the corner handles on the canvas.</p>
        <div className="flex items-center gap-1">
          <button type="button" className={iconBtn} title="Turn 90° anticlockwise" aria-label="Turn 90 degrees anticlockwise" onClick={() => m.onRotate(-90)}><RotateCcw className="size-3.5" /> 90°</button>
          <button type="button" className={iconBtn} title="Turn 90° clockwise" aria-label="Turn 90 degrees clockwise" onClick={() => m.onRotate(90)}><RotateCw className="size-3.5" /> 90°</button>
          <input aria-label="Turn by degrees" inputMode="decimal" value={degrees} onChange={(e) => setDegrees(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") m.onRotate(num(degrees)); }} className="ml-1 h-7 w-12 rounded-md border bg-background px-1.5 text-right text-xs" />
          <span className="text-xs text-muted-foreground">°</span>
          <button type="button" className={iconBtn} disabled={!Number.isFinite(num(degrees))} onClick={() => m.onRotate(num(degrees))}>Turn</button>
        </div>
        <p className="text-[11px] text-muted-foreground">Or drag the round handle above the selection.</p>
      </Section>
    </>
  );
}

export function PropertiesPanel({
  object,
  selectionCount,
  onPatch,
  onAlign,
  onLock,
  multi,
  background,
}: {
  multi: MultiActions;
  background: {
    /** The background pictures, bottom to top, and the chosen one (-1 = none). */
    layers: BoxBackground[];
    selected: number;
    max: number;
    onSelect: (i: number) => void;
    onRemove: (i: number) => void;
    onMove: (i: number, delta: -1 | 1) => void;
    assets: { id: string; fileName: string }[];
    /** File name by image id, for the layer list. */
    names: Record<string, string>;
    library: { id: string; name: string }[];
    uploading: boolean;
    /** The picture is being moved and resized on the dieline. */
    editing: boolean;
    onToggleEdit: () => void;
    onPatch: (i: number, p: Partial<BoxBackground>) => void;
    onPick: (assetId: string) => void;
    onPickLibrary: (pictureId: string, name: string) => void;
    onUpload: () => void;
  };
  object: ArtworkObject | null;
  selectionCount: number;
  onPatch: (p: Patch) => void;
  onAlign: (m: AlignMode) => void;
  onLock: (locked: boolean) => void;
}) {
  if (selectionCount === 0) {
    return (
      <>
        <BackgroundPanel layers={background.layers} selected={background.selected} max={background.max} onSelect={background.onSelect} onRemove={background.onRemove} onMove={background.onMove} assets={background.assets} names={background.names} library={background.library} uploading={background.uploading} editing={background.editing} onToggleEdit={background.onToggleEdit} onPatch={background.onPatch} onPick={background.onPick} onPickLibrary={background.onPickLibrary} onUpload={background.onUpload} />
        <p className="px-3 py-4 text-xs text-muted-foreground">Select an object to edit it, or add text, shapes and images from the toolbar.</p>
      </>
    );
  }
  if (selectionCount > 1 || !object) {
    return <MultiPanel m={multi} />;
  }
  const o = object;
  const disabled = o.locked;
  return (
    <div className={disabled ? "[&_input:not([data-keep])]:pointer-events-none [&_input:not([data-keep])]:opacity-60" : undefined}>
      <Section title={o.type === "text" ? "Text" : o.type === "image" ? "Image" : o.type[0]!.toUpperCase() + o.type.slice(1)}>
        <TextField label="Name" value={o.name} maxLength={80} onCommit={(name) => onPatch({ name })} />
        <div className="grid grid-cols-[88px_1fr] items-center gap-2">
          <span className="text-xs text-muted-foreground">Locked</span>
          <input data-keep type="checkbox" className="size-4" checked={o.locked} onChange={(e) => onLock(e.target.checked)} aria-label="Locked" />
        </div>
        <ToggleField label="Visible" checked={o.visible} onCommit={(visible) => onPatch({ visible })} />
      </Section>
      <Section title="Position">
        <p className="text-[11px] text-muted-foreground">On panel: <span className="font-medium text-foreground">{o.panelId ?? "sheet"}</span> (offset from its centre)</p>
        <NumberField label="X offset" value={o.dx} suffix="mm" onCommit={(dx) => onPatch({ dx })} />
        <NumberField label="Y offset" value={o.dy} suffix="mm" onCommit={(dy) => onPatch({ dy })} />
        <NumberField label="Rotation" value={o.angle} step={1} min={-360} max={360} suffix="°" decimals={1} onCommit={(angle) => onPatch({ angle })} />
        <NumberField label="Opacity" value={Math.round(o.opacity * 100)} step={5} min={0} max={100} suffix="%" decimals={0} onCommit={(v) => onPatch({ opacity: v / 100 })} />
        <AlignBar onAlign={onAlign} disabled={disabled} />
      </Section>
      {o.type === "text" ? (
        <Section title="Typography">
          <TextField label="Text" multiline maxLength={5000} value={o.text} onCommit={(text) => onPatch({ text })} />
          <SelectField label="Font" value={o.fontFamily} options={ARTWORK_FONTS.map((f) => ({ value: f, label: f }))} onCommit={(fontFamily) => onPatch({ fontFamily })} />
          <NumberField label="Size" value={o.fontSizePt} step={1} min={1} max={1000} suffix="pt" decimals={1} onCommit={(fontSizePt) => onPatch({ fontSizePt })} />
          <SelectField label="Weight" value={o.fontWeight} options={[{ value: "normal", label: "Regular" }, { value: "bold", label: "Bold" }]} onCommit={(fontWeight) => onPatch({ fontWeight })} />
          <SelectField label="Style" value={o.fontStyle} options={[{ value: "normal", label: "Normal" }, { value: "italic", label: "Italic" }]} onCommit={(fontStyle) => onPatch({ fontStyle })} />
          <SelectField label="Align" value={o.textAlign} options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }]} onCommit={(textAlign) => onPatch({ textAlign })} />
          <NumberField label="Line height" value={o.lineHeight} step={0.05} min={0.5} max={4} onCommit={(lineHeight) => onPatch({ lineHeight })} />
          <NumberField label="Box width" value={o.width} min={0.1} max={5000} suffix="mm" onCommit={(width) => onPatch({ width })} />
          <ColorField label="Colour" value={o.fill} onCommit={(fill) => fill && onPatch({ fill })} />
        </Section>
      ) : null}
      {o.type === "image" ? (
        <Section title="Size">
          <NumberField label="Width" value={o.width} min={0.1} max={5000} suffix="mm" onCommit={(width) => onPatch({ width, height: (o.height * width) / o.width })} />
          <NumberField label="Height" value={o.height} min={0.1} max={5000} suffix="mm" onCommit={(height) => onPatch({ height, width: (o.width * height) / o.height })} />
          <ToggleField label="Flip horiz." checked={o.flipX} onCommit={(flipX) => onPatch({ flipX })} />
          <ToggleField label="Flip vert." checked={o.flipY} onCommit={(flipY) => onPatch({ flipY })} />
        </Section>
      ) : null}
      {o.type === "rect" || o.type === "ellipse" ? (
        <Section title="Shape">
          <NumberField label="Width" value={o.width} min={0.1} max={5000} suffix="mm" onCommit={(width) => onPatch({ width })} />
          <NumberField label="Height" value={o.height} min={0.1} max={5000} suffix="mm" onCommit={(height) => onPatch({ height })} />
          {o.type === "rect" ? <NumberField label="Corner radius" value={o.cornerRadius} min={0} max={2500} suffix="mm" onCommit={(cornerRadius) => onPatch({ cornerRadius })} /> : null}
          <ColorField label="Fill" value={o.fill} allowNone onCommit={(fill) => onPatch({ fill })} />
          <ColorField label="Stroke" value={o.stroke} allowNone onCommit={(stroke) => onPatch(stroke ? { stroke, strokeWidth: o.strokeWidth || 0.5 } : { stroke: null, strokeWidth: 0 })} />
          {o.stroke ? <NumberField label="Stroke width" value={o.strokeWidth} step={0.1} min={0} max={100} suffix="mm" onCommit={(strokeWidth) => onPatch({ strokeWidth })} /> : null}
        </Section>
      ) : null}
      {o.type === "line" ? (
        <Section title="Line">
          <NumberField label="Length" value={o.length} min={0.1} max={5000} suffix="mm" onCommit={(length) => onPatch({ length })} />
          <ColorField label="Colour" value={o.stroke} onCommit={(stroke) => stroke && onPatch({ stroke })} />
          <NumberField label="Width" value={o.strokeWidth} step={0.1} min={0.05} max={100} suffix="mm" onCommit={(strokeWidth) => onPatch({ strokeWidth })} />
        </Section>
      ) : null}
    </div>
  );
}
