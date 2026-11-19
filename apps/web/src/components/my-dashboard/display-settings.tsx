"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDisplaySettings } from "@/app/(dash)/my-dashboard/actions";
import { notify } from "@/lib/notify";

type Image = "dieline" | "3d";

const COLUMNS = [2, 3, 4, 5, 6];
const IMAGES: { id: Image | "product"; label: string; hint: string; soon?: boolean }[] = [
  { id: "3d", label: "3D Output", hint: "The cover 3D picture you took in Online design (3D view, Capture 3D picture). A template without one shows its dieline." },
  { id: "product", label: "Product Image", hint: "A photo of the finished product.", soon: true },
  { id: "dieline", label: "Dieline", hint: "The flat drawing of the box." },
];

/** Settings > Product Display Settings: how the templates look as cards on the Client's shared pages. */
export function DisplaySettings({ columns, image }: { columns: number; image: Image }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cols, setCols] = useState(columns);
  const [img, setImg] = useState<Image>(image);
  const changed = cols !== columns || img !== image;

  const save = () =>
    start(async () => {
      const r = await saveDisplaySettings({ columns: cols, image: img }).catch(() => ({ ok: false, message: "Could not save. Please try again." }));
      if (r.ok) {
        notify.success(r.message);
        router.refresh();
      } else notify.error(r.message);
    });

  return (
    <div className="flex flex-col gap-7">
      <fieldset className="flex flex-col gap-3">
        <legend className="font-display text-lg font-semibold">Cards per row</legend>
        <p className="text-sm text-muted-foreground">How many templates sit side by side on wide screens. Phones and tablets show fewer.</p>
        <div role="radiogroup" aria-label="Cards per row" className="flex flex-wrap gap-2">
          {COLUMNS.map((n) => (
            <label key={n} className={`grid size-11 cursor-pointer place-items-center rounded-lg border text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${cols === n ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "bg-background hover:bg-muted"}`}>
              <input type="radio" name="columns" value={n} checked={cols === n} onChange={() => setCols(n)} className="sr-only" />
              {n}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="font-display text-lg font-semibold">Show in card</legend>
        <p className="text-sm text-muted-foreground">The picture on each template card.</p>
        <div role="radiogroup" aria-label="Picture on a card" className="flex flex-col gap-2">
          {IMAGES.map((o) => (
            <label key={o.id} className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${o.soon ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/50"} ${img === o.id ? "border-[var(--ink)] bg-muted/40" : ""}`}>
              <input type="radio" name="image" value={o.id} disabled={o.soon} checked={img === o.id} onChange={() => o.id !== "product" && setImg(o.id)} className="mt-1" />
              <span>
                <span className="font-medium">{o.label}{o.soon ? " (coming soon)" : ""}</span>
                <span className="block text-muted-foreground">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <button type="button" disabled={pending || !changed} onClick={save} className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-60">{pending ? "Saving…" : "Save settings"}</button>
      </div>
    </div>
  );
}
