"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Star } from "lucide-react";
import { notify } from "@/lib/notify";
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
  favoriteIds,
  uploading,
  onUploadFiles,
  onPlace,
}: {
  assets: PickerAsset[];
  library: PickerLibraryItem[];
  /** Library pictures this customer starred, newest first. */
  favoriteIds: string[];
  uploading: boolean;
  onUploadFiles: (files: File[]) => void;
  onPlace: (d: Dragged) => void;
}) {
  const [tab, setTab] = useState<"mine" | "library" | "favorites">("mine");
  const [category, setCategory] = useState("");
  const [over, setOver] = useState(false);
  const [favs, setFavs] = useState<string[]>(favoriteIds);

  const categories = useMemo(() => [...new Set(library.map((l) => l.category).filter(Boolean))], [library]);
  /** "All" first, then each category: what the previous / next buttons step through. */
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of library) m.set(l.category, (m.get(l.category) ?? 0) + 1);
    return m;
  }, [library]);
  const steps = useMemo(() => ["", ...categories], [categories]);
  const at = Math.max(0, steps.indexOf(category));
  const step = (d: number) => setCategory(steps[Math.min(steps.length - 1, Math.max(0, at + d))]!);
  const shown = useMemo(() => library.filter((l) => !category || l.category === category), [library, category]);

  const favSet = useMemo(() => new Set(favs), [favs]);
  const favorites = useMemo(() => {
    const byId = new Map(library.map((l) => [l.id, l]));
    return favs.flatMap((id) => byId.get(id) ?? []);
  }, [library, favs]);

  /** Star or un-star at once, then tell the server; put it back if that fails. */
  const toggleFavorite = async (id: string) => {
    const on = !favSet.has(id);
    setFavs((cur) => (on ? [id, ...cur] : cur.filter((f) => f !== id)));
    try {
      const res = await fetch("/api/artworks/favorites", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artworkId: id, favorite: on }) });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setFavs((cur) => (on ? cur.filter((f) => f !== id) : [id, ...cur.filter((f) => f !== id)]));
      notify.error("Could not change the favorite. Please try again.");
    }
  };

  /** Count on the top right corner of a tab, as a small round badge (hidden at zero). */
  const badge = (n: number) =>
    n > 0 ? <span aria-label={`${n} pictures`} className="pointer-events-none absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-medium text-primary-foreground tabular-nums">{n > 999 ? "999+" : n}</span> : null;

  const tabClass = (on: boolean) => `relative flex-1 border-b-2 px-2 py-1.5 text-xs ${on ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`;

  const libraryGrid = (items: PickerLibraryItem[]) => (
    <ul className="grid grid-cols-3 gap-1.5">
      {items.map((l) => {
        const fav = favSet.has(l.id);
        return (
          <li key={l.id} className="group relative">
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
            <button
              type="button"
              aria-label={fav ? `Remove ${l.name} from favorites` : `Add ${l.name} to favorites`}
              aria-pressed={fav}
              title={fav ? "Remove from favorites" : "Add to favorites"}
              onClick={() => void toggleFavorite(l.id)}
              className={`absolute top-px right-px grid size-5 place-items-center rounded-full bg-background/90 shadow-sm transition-opacity hover:bg-background focus-visible:opacity-100 ${fav ? "text-amber-500" : "text-muted-foreground opacity-70 group-hover:opacity-100"}`}
            >
              <Star className={`size-3 ${fav ? "fill-current" : ""}`} aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section aria-label="Artwork" style={{ height: "var(--artwork-h, 70%)" }} className="flex min-h-0 shrink-0 flex-col border-t">
      <div role="tablist" aria-label="Artwork source" className="flex border-b pt-2.5">
        <button type="button" role="tab" aria-selected={tab === "mine"} className={tabClass(tab === "mine")} onClick={() => setTab("mine")}>Uploads{badge(assets.length)}</button>
        <button type="button" role="tab" aria-selected={tab === "library"} className={tabClass(tab === "library")} onClick={() => setTab("library")}>Library{badge(shown.length)}</button>
        <button type="button" role="tab" aria-selected={tab === "favorites"} className={tabClass(tab === "favorites")} onClick={() => setTab("favorites")}>Favorites{badge(favs.length)}</button>
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
          <label className={`group flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 py-4 text-center transition-colors focus-within:ring-2 focus-within:ring-ring ${over ? "border-primary bg-primary/10" : "border-primary/50 bg-primary/5 hover:border-primary hover:bg-primary/10"}`}>
            <input type="file" multiple accept="image/png,image/jpeg" className="sr-only" aria-label="Upload pictures" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) onUploadFiles(f); }} />
            <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
              <ImagePlus className="size-3.5" aria-hidden />
            </span>
            <span className="text-sm font-semibold text-foreground">{uploading ? "Uploading…" : over ? "Drop to upload" : "Upload pictures"}</span>
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
      ) : tab === "favorites" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2">
          {favorites.length === 0 ? <p className="px-1 text-xs text-muted-foreground">No favorites yet. Click the star on a Library picture to keep it here.</p> : null}
          {libraryGrid(favorites)}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2">
          {categories.length > 0 ? (
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Previous category" title="Previous category" disabled={at === 0} onClick={() => step(-1)} className="grid size-8 shrink-0 place-items-center rounded-md border bg-background hover:bg-muted disabled:opacity-40 disabled:hover:bg-background"><ChevronLeft className="size-4" aria-hidden /></button>
              <select aria-label="Library category" value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs">
                <option value="">All categories ({library.length})</option>
                {categories.map((c) => <option key={c} value={c}>{c} ({counts.get(c) ?? 0})</option>)}
              </select>
              <button type="button" aria-label="Next category" title="Next category" disabled={at === steps.length - 1} onClick={() => step(1)} className="grid size-8 shrink-0 place-items-center rounded-md border bg-background hover:bg-muted disabled:opacity-40 disabled:hover:bg-background"><ChevronRight className="size-4" aria-hidden /></button>
            </div>
          ) : null}
          {library.length === 0 ? <p className="px-1 text-xs text-muted-foreground">The library is empty.</p> : shown.length === 0 ? <p className="px-1 text-xs text-muted-foreground">Nothing in this category.</p> : null}
          {libraryGrid(shown)}
        </div>
      )}
    </section>
  );
}
