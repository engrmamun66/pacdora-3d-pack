"use client";

import { useEffect, useState } from "react";
import { Camera, Check, Star, Trash2 } from "lucide-react";
import { notify } from "@/lib/notify";
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
export function CaptureBar({ projectId, viewRef, layouts, layoutId, onLayout, progress }: { projectId: string; viewRef: React.RefObject<CartonViewHandle | null>; layouts: LayoutItem[]; layoutId: string | null; onLayout: (id: string | null) => void; progress: number }) {
  const [shots, setShots] = useState<CaptureInfo[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void call(`/api/projects/${projectId}/captures`)
      .then((d) => live && setShots((d as { captures: CaptureInfo[] }).captures))
      .catch(() => live && setShots([]));
    return () => {
      live = false;
    };
  }, [projectId]);

  const take = async () => {
    const png = viewRef.current?.snapshot(SHOT);
    if (!png) return notify.error("The 3D view is not ready yet.");
    setBusy(true);
    try {
      const blob = await (await fetch(png)).blob();
      const body = new FormData();
      body.set("file", blob, "capture.png");
      body.set("progress", String(progress));
      const name = layouts.find((l) => l.id === layoutId)?.name;
      if (name) body.set("layoutName", name);
      const d = (await call(`/api/projects/${projectId}/captures`, { method: "POST", body })) as { capture: CaptureInfo };
      setShots((s) => [d.capture, ...(s ?? [])]);
      notify.success(d.capture.cover ? "Picture saved, and set as the cover." : "Picture saved.");
    } catch (e) {
      notify.error(fail(e, "Could not save the picture."));
    } finally {
      setBusy(false);
    }
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
    if (!window.confirm("Delete this picture?")) return;
    try {
      await call(`/api/projects/${projectId}/captures/${id}`, { method: "DELETE" });
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
        <button type="button" disabled={busy} onClick={() => void take()} className="ml-auto flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60" title="Save a picture of the 3D view as it is now (fold amount, layout and camera)">
          <Camera className="size-3.5" aria-hidden /> {busy ? "Saving…" : "Capture 3D picture"}
        </button>
      </div>
      {shots === null ? null : shots.length === 0 ? (
        <p className="text-muted-foreground">No pictures yet. Set the fold, layout and camera, then capture. The cover picture is shown on your shared pages.</p>
      ) : (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="3D pictures of this project">
          {shots.map((s) => (
            <li key={s.id} className={`group relative h-16 w-20 shrink-0 overflow-hidden rounded-md border bg-muted ${s.cover ? "ring-2 ring-primary" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the project's own PNG */}
              <img src={s.url} alt={`3D picture${s.layoutName ? `, ${s.layoutName}` : ""}, ${Math.round(s.progress * 100)}% folded`} className="size-full object-cover" />
              {s.cover ? <span className="absolute left-0.5 top-0.5 flex items-center gap-0.5 rounded bg-primary px-1 text-[10px] font-medium text-primary-foreground"><Check className="size-2.5" aria-hidden /> Cover</span> : null}
              <span className="absolute inset-x-0 bottom-0 flex justify-end gap-0.5 bg-black/55 p-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
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
