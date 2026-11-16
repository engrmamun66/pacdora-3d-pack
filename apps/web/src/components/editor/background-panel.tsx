"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, Move, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { BACKGROUND_FITS, BACKGROUND_REPEATS, type BackgroundFit, type BackgroundRepeat, type BoxBackground, backgroundRepeat } from "@packaging/schema";
import { InfoTip } from "@/components/templates-admin/help-tip";
import { assetUrl } from "./fabric-map";
import { NumberField } from "./fields";

type Asset = { id: string; fileName: string };
type LibraryPicture = { id: string; name: string; category?: string };

const FIT_LABEL: Record<BackgroundFit, string> = { cover: "Fill", contain: "Fit", stretch: "Stretch" };
const REPEAT_LABEL: Record<BackgroundRepeat, string> = { none: "Once", both: "Tile", x: "Across", y: "Down" };
const REPEAT_HINT: Record<BackgroundRepeat, string> = { none: "The picture is shown once", both: "The picture repeats across and down, like tiles", x: "The picture repeats from left to right only", y: "The picture repeats from top to bottom only" };
const FIT_HINT: Record<BackgroundFit, string> = { cover: "Covers the whole box; the edges of the picture may be cut off", contain: "The whole picture is shown, with empty space around it if needed", stretch: "Stretched to the box, the picture may look squashed" };

/**
 * Box background controls, in the order a customer works with them: a folded "Add a picture" area on top (ready-made ones, their own images, or an upload),
 * then the pictures already on the box (top first), and the settings of the chosen picture. Pictures are stacked under all artwork; each is placed on the print area (the dieline plus bleed).
 */
/** A row of choices where exactly one is on: a label on the left, the choices on the right (like the number rows below it). */
function Choice<T extends string>({ label, value, options, labels, hints, onPick }: { label: string; value: T; options: readonly T[]; labels: Record<T, string>; hints: Record<T, string>; onPick: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-[3.75rem_1fr] items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-0.5 rounded-lg bg-muted p-0.5">
        {options.map((o) => (
          <button key={o} type="button" aria-pressed={value === o} onClick={() => onPick(o)} title={hints[o]} className={`min-w-0 flex-1 rounded-md px-0.5 py-1 text-xs ${value === o ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {labels[o]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BackgroundPanel({
  layers,
  selected,
  max,
  onSelect,
  onRemove,
  onMove,
  assets,
  names,
  library,
  uploading,
  editing,
  onToggleEdit,
  onPatch,
  onPick,
  onPickLibrary,
  onUpload,
  onDeleteAsset,
}: {
  layers: BoxBackground[];
  selected: number;
  max: number;
  onSelect: (i: number) => void;
  onRemove: (i: number) => void;
  onMove: (i: number, delta: -1 | 1) => void;
  assets: Asset[];
  names: Record<string, string>;
  /** Ready-made background pictures the admin keeps (category "Background Image"). */
  library: LibraryPicture[];
  uploading: boolean;
  editing: boolean;
  onToggleEdit: () => void;
  onPatch: (i: number, p: Partial<BoxBackground>) => void;
  onPick: (assetId: string) => void;
  onPickLibrary: (pictureId: string, name: string) => void;
  onUpload: () => void;
  /** Delete one of the user's own uploads. */
  onDeleteAsset?: (id: string, name: string) => void;
}) {
  const bg = layers[selected] ?? null;
  const full = layers.length >= max;
  const nameOf = (b: BoxBackground, i: number) => names[b.assetId] ?? `Background ${i + 1}`;
  const used = new Set(layers.map((l) => l.assetId));

  // The add area is open while the box has no picture, and folds away once one is added so the settings are in view.
  const [addOpen, setAddOpen] = useState(layers.length === 0);
  const [count, setCount] = useState(layers.length);
  // Choosing a picture blinks the "Move and resize" button twice, so the next step is easy to see (a new key restarts the animation).
  const [blink, setBlink] = useState(0);
  const [source, setSource] = useState<"ready" | "mine">("ready");
  const [category, setCategory] = useState("");
  const categories = useMemo(() => [...new Set(library.map((l) => l.category ?? "").filter(Boolean))].sort((a, b) => a.localeCompare(b)), [library]);
  /** Previous / next set, in the order of the list ("All sets" first); it goes round at the ends. */
  const stepSet = (delta: number) => {
    const all = ["", ...categories];
    setCategory(all[(all.indexOf(category) + delta + all.length) % all.length] ?? "");
  };
  const shownLibrary = category ? library.filter((l) => l.category === category) : library;
  if (count !== layers.length) {
    setCount(layers.length);
    setAddOpen(layers.length === 0);
  }
  const tab = source === "mine" && assets.length === 0 ? "ready" : library.length === 0 ? "mine" : source;

  const tabBtn = (on: boolean) => `flex-1 rounded-md px-2 py-1 text-xs ${on ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <section className="flex flex-col gap-3 border-b px-3 py-3" aria-label="Background">
      <h3 className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Background
        <InfoTip label="Background" className="normal-case">
          Pictures behind all artwork, stacked on the whole box (bleed included). Add several: each one has its own fit, size, place and opacity. They show in 3D and in every export.
        </InfoTip>
      </h3>

      {/* 1. Add a picture: on top, above the pictures already on the box */}
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAddOpen((o) => !o)}
            aria-expanded={addOpen}
            disabled={full}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border bg-background text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            <Plus className="size-3.5" aria-hidden /> Add a picture
            <ChevronDown className={`size-3.5 transition-transform ${addOpen ? "rotate-180" : ""}`} aria-hidden />
          </button>
          <button type="button" onClick={onUpload} disabled={uploading || full} className="flex h-8 items-center justify-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-50" title="Upload a picture from your computer">
            <Upload className="size-3.5" aria-hidden /> {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
        {full ? <p className="text-[11px] text-muted-foreground">A box can have {max} pictures at most. Remove one to add another.</p> : null}

        {addOpen && !full ? (
          <div className="flex flex-col gap-2">
            {library.length > 0 && assets.length > 0 ? (
              <div role="tablist" aria-label="Where the picture comes from" className="flex gap-1 rounded-lg bg-muted p-0.5">
                <button type="button" role="tab" aria-selected={tab === "ready"} className={tabBtn(tab === "ready")} onClick={() => setSource("ready")}>Ready-made</button>
                <button type="button" role="tab" aria-selected={tab === "mine"} className={tabBtn(tab === "mine")} onClick={() => setSource("mine")}>My images ({assets.length})</button>
              </div>
            ) : null}
            {tab === "ready" && categories.length > 1 ? (
              <div className="flex items-center gap-1">
                <button type="button" title="Previous set" aria-label="Previous set" onClick={() => stepSet(-1)} className="grid size-8 shrink-0 place-items-center rounded-md border bg-background hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <select aria-label="Background set" value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs">
                  <option value="">All sets ({library.length})</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="button" title="Next set" aria-label="Next set" onClick={() => stepSet(1)} className="grid size-8 shrink-0 place-items-center rounded-md border bg-background hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
            ) : null}
            {tab === "ready" && library.length > 0 ? (
              <div className="grid max-h-56 shrink-0 auto-rows-max grid-cols-4 gap-1 overflow-auto">
                {shownLibrary.map((l) => (
                  <button key={l.id} type="button" title={`Add ${l.name}`} aria-label={`Add ${l.name} as a background`} onClick={() => onPickLibrary(l.id, l.name)} className="relative block h-0 w-full overflow-hidden rounded border bg-muted pb-[calc(100%-2px)] hover:ring-2 hover:ring-ring">
                    {/* eslint-disable-next-line @next/next/no-img-element -- private route, cached by URL */}
                    <img src={`/api/artworks/${l.id}/image`} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            ) : null}
            {tab === "mine" && assets.length > 0 ? (
              <div className="grid max-h-56 shrink-0 auto-rows-max grid-cols-4 gap-1 overflow-auto">
                {assets.map((a) => (
                  <div key={a.id} className="group relative">
                    <button type="button" title={`Add ${a.fileName}`} aria-label={`Add ${a.fileName} as a background`} onClick={() => onPick(a.id)} className={`relative block h-0 w-full overflow-hidden rounded border bg-muted pb-[calc(100%-2px)] hover:ring-2 hover:ring-ring ${used.has(a.id) ? "ring-2 ring-primary/60" : ""}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={assetUrl(a.id)} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                    </button>
                    {onDeleteAsset ? (
                      <button
                        type="button"
                        title={`Delete ${a.fileName}`}
                        aria-label={`Delete ${a.fileName}`}
                        onClick={() => onDeleteAsset(a.id, a.fileName)}
                        className="absolute top-0.5 right-0.5 grid size-5 place-items-center rounded bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:opacity-100"
                      >
                        <Trash2 className="size-3" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            {library.length === 0 && assets.length === 0 ? <p className="text-xs text-muted-foreground">Use Upload to add your own picture.</p> : null}
          </div>
        ) : null}
      </div>

      {/* 2. Pictures on the box */}
      {layers.length ? (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium text-muted-foreground">On the box ({layers.length}), top first</p>
          <ul className="flex flex-col gap-1" aria-label="Background pictures (top first)">
            {layers.map((b, i) => ({ b, i })).reverse().map(({ b, i }) => (
              <li key={`${i}-${b.assetId}`} className={`flex items-center gap-1 rounded-lg border p-1 ${i === selected ? "border-primary bg-primary/5" : ""}`}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(i);
                    setBlink((n) => n + 1);
                  }}
                  onDoubleClick={() => {
                    // Double-click: choose it and start moving and resizing it on the dieline.
                    onSelect(i);
                    if (!editing) onToggleEdit();
                  }}
                  aria-pressed={i === selected}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  title="Click to choose, double-click to move and resize it on the dieline"
                >
                  <span className="size-9 shrink-0 overflow-hidden rounded bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={assetUrl(b.assetId)} alt="" className="h-full w-full object-cover" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs">{nameOf(b, i)}</span>
                </button>
                <button type="button" onClick={() => onMove(i, 1)} disabled={i === layers.length - 1} className="flex size-6 items-center justify-center rounded hover:bg-muted disabled:opacity-30" title="Bring forward" aria-label={`Move ${nameOf(b, i)} up`}>
                  <ArrowUp className="size-3.5" />
                </button>
                <button type="button" onClick={() => onMove(i, -1)} disabled={i === 0} className="flex size-6 items-center justify-center rounded hover:bg-muted disabled:opacity-30" title="Send backward" aria-label={`Move ${nameOf(b, i)} down`}>
                  <ArrowDown className="size-3.5" />
                </button>
                <button type="button" onClick={() => onRemove(i)} className="flex size-6 items-center justify-center rounded text-destructive hover:bg-destructive/10" title="Remove this picture" aria-label={`Remove ${nameOf(b, i)}`}>
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">No background yet. Pick a ready-made picture or upload your own.</p>
      )}

      {/* 3. Settings of the chosen picture */}
      {bg ? (
        <div className="flex flex-col gap-2 rounded-lg border p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-medium" title={nameOf(bg, selected)}>Adjust: {nameOf(bg, selected)}</p>
            <button type="button" title="Reset position, size, fit, repeat and opacity" aria-label="Reset position and size" onClick={() => onPatch(selected, { fit: "cover", repeat: "none", scale: 1, dx: 0, dy: 0, opacity: 1 })} className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <RotateCcw className="size-3.5" aria-hidden />
            </button>
          </div>
          <button
            key={blink}
            type="button"
            onClick={onToggleEdit}
            aria-pressed={editing}
            className={`flex h-8 items-center justify-center gap-1.5 rounded-md border text-xs font-medium ${blink > 0 && !editing ? "soft-blink" : ""} ${editing ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "hover:bg-muted"}`}
          >
            {editing ? <Check className="size-3.5" aria-hidden /> : <Move className="size-3.5" aria-hidden />}
            {editing ? "Done" : "Move and resize on the dieline"}
          </button>
          {editing ? <p className="text-[11px] text-muted-foreground">Drag the picture to move it, drag a round grip to resize it. Arrow keys nudge, Alt turns snapping off. Enter, Esc or a double-click on the picture finishes.</p> : null}

          <div className="flex flex-col gap-2 border-t pt-2">
            <Choice label="Sizing" value={bg.fit} options={BACKGROUND_FITS} labels={FIT_LABEL} hints={FIT_HINT} onPick={(fit) => onPatch(selected, { fit })} />
            <Choice label="Repeat" value={backgroundRepeat(bg)} options={BACKGROUND_REPEATS} labels={REPEAT_LABEL} hints={REPEAT_HINT} onPick={(repeat) => onPatch(selected, { repeat })} />
            <NumberField label="Opacity" value={Math.round(bg.opacity * 100)} step={5} min={0} max={100} suffix="%" decimals={0} onCommit={(v) => onPatch(selected, { opacity: v / 100 })} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
