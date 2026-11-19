"use client";

import { useEffect, useState } from "react";
import { Camera, RefreshCw, Star, Trash2 } from "lucide-react";
import { notify } from "@/lib/notify";
import { confirmAction } from "@/lib/confirm";
import type { LayoutItem } from "@/lib/scene-layout";
import type { CaptureInfo } from "@/server/captures";
import type { CartonViewHandle } from "./carton-view";

/** The size a 3D picture is taken at (the cards of the shared pages show it small). */
const SHOT = { width: 1200, height: 900 };

const fail = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Ask the server and read its error message when it says no. */
async function call(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(data?.error ?? "Something went wrong. Please try again.");
  return data;
}

/**
 * Under the 3D view of the online design page: pick a layout (Sample), set the fold above, and take a 3D picture.
 * The pictures are kept with the project; the cover one is shown on the cards of the Client's shared pages.
 */
export function CaptureBar({ projectId, viewRef, layouts, layoutId, onLayout, progress, onProgress }: { projectId: string; viewRef: React.RefObject<CartonViewHandle | null>; layouts: LayoutItem[]; layoutId: string | null; onLayout: (id: string | null) => void; progress: number; onProgress: (p: number) => void }) {
  const [shots, setShots] = useState<CaptureInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  /** The picture picked in the strip (its view is on screen): it can be updated with what the 3D view shows now. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = shots?.find((x) => x.id === selectedId) ?? null;

  useEffect(() => {
    let live = true;
    void call(`/api/projects/${projectId}/captures`)
      .then((d) => live && setShots((d as { captures: CaptureInfo[] }).captures))
      .catch(() => live && setShots([]));
    return () => {
      live = false;
    };
  }, [projectId]);

  /** A picture of the 3D view as it is now, with the layout, fold amount and camera (zoom included) it was taken with. */
  const shot = async (): Promise<FormData | null> => {
    const png = viewRef.current?.snapshot(SHOT);
    if (!png) {
      notify.error("The 3D view is not ready yet.");
      return null;
    }
    const body = new FormData();
    body.set("file", await (await fetch(png)).blob(), "capture.png");
    body.set("progress", String(progress));
    const view = viewRef.current?.getView();
    if (view) body.set("view", JSON.stringify(view));
    const name = layouts.find((l) => l.id === layoutId)?.name;
    if (name) body.set("layoutName", name);
    return body;
  };

  const take = async () => {
    setBusy(true);
    try {
      const body = await shot();
      if (!body) return;
      const d = (await call(`/api/projects/${projectId}/captures`, { method: "POST", body })) as { capture: CaptureInfo };
      setShots((s) => [d.capture, ...(s ?? [])]);
      notify.success(d.capture.cover ? "Picture saved, and set as the cover." : "Picture saved.");
    } catch (e) {
      notify.error(fail(e, "Could not save the picture."));
    } finally {
      setBusy(false);
    }
  };

  /** Replace the picked picture with the 3D view as it is now (same place in the strip, same cover mark). */
  const updateSelected = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const body = await shot();
      if (!body) return;
      const d = (await call(`/api/projects/${projectId}/captures/${selected.id}`, { method: "PUT", body })) as { capture: CaptureInfo };
      setShots((s) => (s ?? []).map((x) => (x.id === selected.id ? d.capture : x)));
      notify.success("View updated.");
    } catch (e) {
      notify.error(fail(e, "Could not update the view."));
    } finally {
      setBusy(false);
    }
  };

  /** Put back what the picture was taken with: its layout, fold amount and camera (zoom included). */
  const restore = (s: CaptureInfo) => {
    setSelectedId(s.id);
    onLayout(layouts.find((l) => l.name === s.layoutName)?.id ?? null);
    onProgress(s.progress);
    const view = s.view;
    // After the layout has moved the camera to its own view (if it did), go to the saved one.
    if (view) window.setTimeout(() => viewRef.current?.setViewSmooth(view, 500), 150);
  };

  const makeCover = async (id: string) => {
    try {
      await call(`/api/projects/${projectId}/captures/${id}`, { method: "PATCH" });
      setShots((s) => (s ?? []).map((x) => ({ ...x, cover: x.id === id })));
      notify.success("Cover picture changed.");
    } catch (e) {
      notify.error(fail(e, "Could not change the cover."));
    }
  };

  const remove = async (id: string) => {
    if (!(await confirmAction({ title: "Delete this picture?", description: "The 3D picture is removed from this project. This cannot be undone." }))) return;
    try {
      await call(`/api/projects/${projectId}/captures/${id}`, { method: "DELETE" });
      if (selectedId === id) setSelectedId(null);
      // The server hands the cover to the newest picture left when the cover is deleted.
      setShots((s) => {
        const left = (s ?? []).filter((x) => x.id !== id);
        const lost = (s ?? []).find((x) => x.id === id)?.cover;
        return lost && left[0] ? left.map((x, i) => ({ ...x, cover: i === 0 })) : left;
      });
    } catch (e) {
      notify.error(fail(e, "Could not delete the picture."));
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t bg-background px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {layouts.length > 0 ? (
          <label className="flex items-center gap-2 font-medium text-muted-foreground">
            Layout
            <select value={layoutId ?? ""} onChange={(e) => onLayout(e.target.value || null)} className="h-7 rounded-md border border-input bg-background px-1.5 text-xs font-normal text-foreground" aria-label="Layout of the boxes in the 3D view">
              <option value="">One box</option>
              {layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        ) : null}
        {selected ? (
          <button type="button" disabled={busy} onClick={() => void updateSelected()} className="ml-auto flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60" title="Replace the picked picture with the 3D view as it is now (fold amount, layout and camera)">
            <RefreshCw className="size-3.5" aria-hidden /> Update view
          </button>
        ) : null}
        <button type="button" disabled={busy} onClick={() => void take()} className={`${selected ? "" : "ml-auto "}flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60`} title="Save a picture of the 3D view as it is now (fold amount, layout and camera)">
          <Camera className="size-3.5" aria-hidden /> {busy ? "Saving…" : "Capture 3D picture"}
        </button>
      </div>
      {shots === null ? null : shots.length === 0 ? (
        <p className="text-muted-foreground">No pictures yet. Set the fold, layout and camera, then capture. The cover picture is shown on your shared pages.</p>
      ) : (
        <ul className="flex gap-2 overflow-x-auto px-1.5 pt-3 pb-1.5" aria-label="3D pictures of this project">
          {shots.map((s) => (
            <li key={s.id} className={`group relative h-16 w-20 shrink-0 rounded-md border bg-muted ${s.id === selectedId ? "ring-2 ring-foreground ring-offset-1 ring-offset-background" : ""}`}>
              <button type="button" onClick={() => restore(s)} title={`Use this view again${s.view ? ` (zoom ${Math.round(s.view.zoom * 100)}%)` : ""}`} aria-label={`Use this view again${s.layoutName ? `: ${s.layoutName}` : ""}, ${Math.round(s.progress * 100)}% folded`} className="block size-full overflow-hidden rounded-[5px]">
                {/* eslint-disable-next-line @next/next/no-img-element -- the project's own PNG */}
                <img src={s.url} alt="" className="size-full object-cover" />
              </button>
              {s.cover ? <span className="pointer-events-none absolute -top-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/65 py-0.5 pr-2 pl-1.5 text-[9px] font-medium text-white shadow-sm ring-1 ring-white/25 backdrop-blur-sm"><Star className="size-2.5 fill-amber-300 text-amber-300" aria-hidden /> Cover</span> : null}
              <span className="absolute inset-x-0 bottom-0 flex justify-end gap-0.5 rounded-b-[5px] bg-black/55 p-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                {s.cover ? null : <button type="button" aria-label="Use as cover picture" title="Use as cover picture" onClick={() => void makeCover(s.id)} className="grid size-5 place-items-center rounded text-white hover:bg-white/25"><Star className="size-3" aria-hidden /></button>}
                <button type="button" aria-label="Delete picture" title="Delete picture" onClick={() => void remove(s.id)} className="grid size-5 place-items-center rounded text-white hover:bg-white/25"><Trash2 className="size-3" aria-hidden /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
