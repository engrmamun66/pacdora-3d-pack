"use client";

import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical } from "lucide-react";
import { ARTWORK_FONTS, type ArtworkObject } from "@packaging/schema";
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

export function AlignBar({ onAlign, disabled }: { onAlign: (m: AlignMode) => void; disabled: boolean }) {
  return (
    <div className="flex gap-1">
      {ALIGN.map(({ mode, label, Icon }) => (
        <button key={mode} type="button" title={`${label} (to its panel)`} aria-label={label} disabled={disabled} onClick={() => onAlign(mode)} className="flex size-7 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40">
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

export function PropertiesPanel({
  object,
  selectionCount,
  onPatch,
  onAlign,
  onLock,
}: {
  object: ArtworkObject | null;
  selectionCount: number;
  onPatch: (p: Patch) => void;
  onAlign: (m: AlignMode) => void;
  onLock: (locked: boolean) => void;
}) {
  if (selectionCount === 0) {
    return <p className="px-3 py-4 text-xs text-muted-foreground">Select an object to edit it, or add text, shapes and images from the toolbar.</p>;
  }
  if (selectionCount > 1 || !object) {
    return (
      <Section title={`${selectionCount} objects`}>
        <AlignBar onAlign={onAlign} disabled={false} />
        <p className="text-[11px] text-muted-foreground">Each object aligns to the panel it sits on.</p>
      </Section>
    );
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
