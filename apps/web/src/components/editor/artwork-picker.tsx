"use client";

import { useMemo, useState } from "react";
import { ImagePlus, Search } from "lucide-react";
import { assetUrl } from "./fabric-map";

export type PickerAsset = { id: string; fileName: string };
export type PickerLibraryItem = { id: string; name: string; tags: string[]; category: string };

/** What a dragged thumbnail carries. The canvas reads it on drop (see `readDragged`). */
export type Dragged = { kind: "asset"; id: string; name: string } | { kind: "library"; id: string; name: string };
const DRAG_TYPE = "application/x-dieline-artwork";

export const startDrag = (e: React.DragEvent, d: Dragged) => {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(d));
  e.dataTransfer.effectAllowed = "copy";
};

export function readDragged(dt: DataTransfer): Dragged | null {
  try {
    const raw = dt.getData(DRAG_TYPE);
    const d = raw ? (JSON.parse(raw) as Dragged) : null;
    return d && (d.kind === "asset" || d.kind === "library") && typeof d.id === "string" ? d : null;
  } catch {
    return null;
  }
}

/** True while something the canvas can take is dragged over it: a picture from this panel, or files. */
export const canDrop = (dt: DataTransfer) => Array.from(dt.types).includes(DRAG_TYPE) || Array.from(dt.types).includes("Files");

/**
 * The "Artwork" panel: the customer's own uploads (private, only they see them) and the shared
 * library the admin keeps. Pictures are placed by a click or by dragging them onto the dieline;
 * files can be dropped on the panel to upload them (several at once).
 */
export function ArtworkPicker({
  assets,
  library,
  uploading,
  onUploadFiles,
  onPlace,
}: {
  assets: PickerAsset[];
  library: PickerLibraryItem[];
  uploading: boolean;
  onUploadFiles: (files: File[]) => void;
  onPlace: (d: Dragged) => void;
}) {
  const [tab, setTab] = useState<"mine" | "library">("mine");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [over, setOver] = useState(false);

  const categories = useMemo(() => [...new Set(library.map((l) => l.category).filter(Boolean))], [library]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return library.filter((l) => (!category || l.category === category) && (!needle || l.name.toLowerCase().includes(needle) || l.tags.some((t) => t.includes(needle)) || l.category.toLowerCase().includes(needle)));
  }, [library, q, category]);

  const tabClass = (on: boolean) => `flex-1 border-b-2 px-2 py-1.5 text-xs ${on ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`;

  return (
    <section aria-label="Artwork" className="flex min-h-0 flex-1 flex-col border-t">
      <div role="tablist" aria-label="Artwork source" className="flex border-b">
        <button type="button" role="tab" aria-selected={tab === "mine"} className={tabClass(tab === "mine")} onClick={() => setTab("mine")}>My uploads</button>
        <button type="button" role="tab" aria-selected={tab === "library"} className={tabClass(tab === "library")} onClick={() => setTab("library")}>Library</button>
      </div>

      {tab === "mine" ? (
        <div
          className={`flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2 ${over ? "bg-primary/5" : ""}`}
          onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
          onDrop={(e) => {
            setOver(false);
            const files = Array.from(e.dataTransfer.files);
            if (files.length) { e.preventDefault(); onUploadFiles(files); }
          }}
        >
          <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-2 py-2 text-center text-xs text-muted-foreground hover:bg-muted focus-within:ring-2 focus-within:ring-ring ${over ? "border-primary text-foreground" : ""}`}>
            <input type="file" multiple accept="image/png,image/jpeg" className="sr-only" aria-label="Upload pictures" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) onUploadFiles(f); }} />
            <ImagePlus className="size-4 shrink-0" aria-hidden />
            {uploading ? "Uploading…" : over ? "Drop to upload" : "Drop or choose pictures (PNG, JPEG)"}
          </label>
          {assets.length === 0 ? <p className="px-1 text-xs text-muted-foreground">Your uploads appear here. Only you can see them.</p> : null}
          <ul className="grid grid-cols-3 gap-1.5">
            {assets.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => startDrag(e, { kind: "asset", id: a.id, name: a.fileName })}
                  title={`${a.fileName}: click to place, or drag onto the dieline`}
                  className="aspect-square w-full cursor-grab overflow-hidden rounded border bg-muted hover:ring-2 hover:ring-ring active:cursor-grabbing"
                  onClick={() => onPlace({ kind: "asset", id: a.id, name: a.fileName })}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- private route, cached by URL */}
                  <img src={assetUrl(a.id)} alt={a.fileName} draggable={false} className="h-full w-full object-contain" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or tag" aria-label="Search the library" maxLength={80} className="h-8 w-full rounded-md border bg-background pr-2 pl-7 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          {categories.length > 0 ? (
            <select aria-label="Library category" value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
              <option value="">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : null}
          {library.length === 0 ? <p className="px-1 text-xs text-muted-foreground">The library is empty.</p> : shown.length === 0 ? <p className="px-1 text-xs text-muted-foreground">Nothing matches.</p> : null}
          <ul className="grid grid-cols-3 gap-1.5">
            {shown.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => startDrag(e, { kind: "library", id: l.id, name: l.name })}
                  title={`${l.name}${l.tags.length ? ` (${l.tags.join(", ")})` : ""}: click to place, or drag onto the dieline`}
                  className="aspect-square w-full cursor-grab overflow-hidden rounded border bg-muted hover:ring-2 hover:ring-ring active:cursor-grabbing"
                  onClick={() => onPlace({ kind: "library", id: l.id, name: l.name })}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- private route, cached by URL */}
                  <img src={`/api/artworks/${l.id}/image`} alt={l.name} draggable={false} className="h-full w-full object-contain" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
