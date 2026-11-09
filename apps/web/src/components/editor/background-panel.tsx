"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { BACKGROUND_FITS, type BackgroundFit, type BoxBackground } from "@packaging/schema";
import { assetUrl } from "./fabric-map";
import { NumberField, SelectField } from "./fields";

type Asset = { id: string; fileName: string };

const FIT_LABEL: Record<BackgroundFit, string> = { cover: "Fill (crop)", contain: "Fit inside", stretch: "Stretch" };

/**
 * Box background controls: one image under all artwork that fills the print
 * area (the dieline plus bleed). Shown in the Properties panel when nothing is selected.
 */
export function BackgroundPanel({
  background,
  assets,
  uploading,
  onPatch,
  onPick,
  onUpload,
}: {
  background: BoxBackground | null;
  assets: Asset[];
  uploading: boolean;
  onPatch: (p: Partial<BoxBackground> | null) => void;
  onPick: (assetId: string) => void;
  onUpload: () => void;
}) {
  const current = background ? assets.find((a) => a.id === background.assetId) : undefined;
  return (
    <section className="flex flex-col gap-2 border-b px-3 py-3" aria-label="Box background">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Box background</h3>
      <p className="text-[11px] text-muted-foreground">An image behind all artwork that covers the whole box, bleed included. It shows in 3D and in every export.</p>

      {background ? (
        <div className="flex items-center gap-2 rounded-md border p-1.5">
          <div className="size-10 shrink-0 overflow-hidden rounded bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assetUrl(background.assetId)} alt="" className="h-full w-full object-cover" />
          </div>
          <span className="min-w-0 flex-1 truncate text-xs">{current?.fileName ?? "Background image"}</span>
          <button type="button" onClick={() => onPatch(null)} className="flex size-7 items-center justify-center rounded-md hover:bg-muted" title="Remove the background" aria-label="Remove the background">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ) : null}

      <button type="button" onClick={onUpload} disabled={uploading} className="flex h-8 items-center justify-center gap-1.5 rounded-md border text-xs font-medium hover:bg-muted disabled:opacity-50">
        <ImagePlus className="size-3.5" aria-hidden /> {uploading ? "Uploading…" : background ? "Upload another image" : "Upload background image"}
      </button>

      {assets.length ? (
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">Or choose one of your images</p>
          <div className="grid max-h-40 grid-cols-4 gap-1 overflow-auto">
            {assets.map((a) => (
              <button
                key={a.id}
                type="button"
                title={`Use ${a.fileName} as the background`}
                aria-label={`Use ${a.fileName} as the background`}
                aria-pressed={background?.assetId === a.id}
                onClick={() => onPick(a.id)}
                className={`aspect-square overflow-hidden rounded border bg-muted hover:ring-2 hover:ring-ring ${background?.assetId === a.id ? "ring-2 ring-primary" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl(a.id)} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {background ? (
        <div className="flex flex-col gap-2 pt-1">
          <SelectField label="Fit" value={background.fit} options={BACKGROUND_FITS.map((f) => ({ value: f, label: FIT_LABEL[f] }))} onCommit={(fit) => onPatch({ fit })} />
          <NumberField label="Zoom" value={Math.round(background.scale * 100)} step={5} min={10} max={1000} suffix="%" decimals={0} onCommit={(v) => onPatch({ scale: v / 100 })} />
          <NumberField label="X offset" value={background.dx} suffix="mm" onCommit={(dx) => onPatch({ dx })} />
          <NumberField label="Y offset" value={background.dy} suffix="mm" onCommit={(dy) => onPatch({ dy })} />
          <NumberField label="Opacity" value={Math.round(background.opacity * 100)} step={5} min={0} max={100} suffix="%" decimals={0} onCommit={(v) => onPatch({ opacity: v / 100 })} />
          <button type="button" onClick={() => onPatch({ fit: "cover", scale: 1, dx: 0, dy: 0, opacity: 1 })} className="h-7 rounded-md border text-xs hover:bg-muted">
            Reset position and size
          </button>
        </div>
      ) : null}
    </section>
  );
}
