"use client";

import { InfoTip } from "./help-tip";
import { RotateCcw } from "lucide-react";
import type { FoldSetup, PartFit, PartPlacement, PartPlacementMode, PartSide } from "@packaging/dieline-engine";
import { Button } from "@/components/ui/button";
import { makeMain, pieceNameOf, rootsOf, setMainName, updatePart, updatePartMeta } from "@/lib/fold-edit";

const field = "h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const MAX_SHIFT = 5000;

const MODES: { value: PartPlacementMode; label: string }[] = [
  { value: "closed", label: "On top, closed" },
  { value: "open", label: "On top, open (tilted)" },
  { value: "inside", label: "Inside" },
  { value: "auto", label: "Automatic (inside if fits)" },
  { value: "beside", label: "Beside" },
];
const SIDES: { value: PartSide; label: string }[] = [
  { value: "right", label: "Right" },
  { value: "left", label: "Left" },
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
];

const mm = (n: number) => `${Math.round(n * 10) / 10} mm`;
const size3 = (v: { x: number; y: number; z: number }) => `${Math.round(v.x)} × ${Math.round(v.y)} × ${Math.round(v.z)} mm`;

/** Placement with one field changed; an empty value removes it. */
function patchPlacement(pl: PartPlacement, patch: Partial<Record<"openDeg" | "side" | "gap" | "relativeTo" | "mode" | "hop", unknown>> & { offset?: { x?: number; y?: number; z?: number } | null; start?: { from?: PartSide | ""; x?: number; y?: number; z?: number } | null }): PartPlacement {
  const next: Record<string, unknown> = { ...pl, ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === "") delete next[k];
  for (const key of ["offset", "start"] as const) {
    const v = patch[key] === undefined ? pl[key] : patch[key];
    const kept = v ? Object.entries(v as Record<string, unknown>).filter(([, n]) => n !== undefined && n !== 0 && n !== "") : [];
    if (kept.length === 0) delete next[key];
    else next[key] = Object.fromEntries(kept);
  }
  return next as unknown as PartPlacement;
}

const num = (raw: string): number | undefined => {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, n)) : undefined;
};

/** What "does it fit" says, in plain words. */
function fitText(fit: PartFit, against: string): { ok: boolean; text: string } {
  const { slack } = fit;
  if (fit.fits) {
    return { ok: true, text: `Fits inside ${against} with ${mm(slack.x)} to spare across, ${mm(slack.y)} deep, ${mm(slack.z)} high.` };
  }
  const over: string[] = [];
  if (slack.x < -0.01) over.push(`${mm(-slack.x)} too wide`);
  if (slack.y < -0.01) over.push(`${mm(-slack.y)} too deep`);
  if (slack.z < -0.01) over.push(`${mm(-slack.z)} too high`);
  return { ok: false, text: `Does not fit inside ${against}: ${over.join(", ")}. It can sit on top like a lid instead.` };
}

/**
 * The pieces of a sheet with more than one: name each, say which one is the main body, and where
 * every other piece (a lid, an insert) goes in 3D: against which piece, how it is set (on top, inside,
 * beside, open), the distance, a position shift, and whether it folds with the main body or after it.
 */
export function PiecesEditor({ fold, fits, label, onChange }: { fold: FoldSetup; fits: readonly PartFit[]; label: (panelId: string) => string; onChange: (f: FoldSetup) => void }) {
  const parts = fold.parts ?? [];
  const roots = rootsOf(fold);
  if (!parts.length) return null;
  const name = (rootId: string) => pieceNameOf(fold, rootId);

  return (
    <section id="pieces-section" aria-label="Pieces" className="flex flex-col gap-2 rounded-xl border p-3">
      <p className="text-sm">
        <strong>{parts.length + 1} pieces.</strong>{" "}
        <InfoTip label="Pieces">Each folds on its own, with its own steps (see its tab). Set where every piece except the main body goes in 3D.</InfoTip>
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-2.5 py-1.5 text-sm">
        <input aria-label="Name of the main body" className={`${field} w-32 font-medium`} maxLength={40} placeholder="Main body" value={fold.mainName ?? ""} onChange={(e) => onChange(setMainName(fold, e.target.value))} />
        <span className="text-xs text-muted-foreground">Main body · base {label(fold.rootId)} · stays in place</span>
      </div>

      <ul className="flex flex-col gap-2">
        {parts.map((part) => {
          const pl = part.placement;
          const mode = pl.mode;
          const who = name(part.rootId);
          const againstId = pl.relativeTo && roots.includes(pl.relativeTo) && pl.relativeTo !== part.rootId ? pl.relativeTo : fold.rootId;
          const against = name(againstId);
          const fit = fits.find((f) => f.rootId === part.rootId);
          const verdict = fit ? fitText(fit, against) : null;
          const set = (patch: Parameters<typeof patchPlacement>[1]) => onChange(updatePart(fold, part.rootId, patchPlacement(pl, patch)));
          const off = pl.offset ?? {};
          const start = pl.start ?? {};
          const setStart = (axis: "x" | "y" | "z", raw: string) => set({ start: { ...start, [axis]: num(raw) } });
          const setOff = (axis: "x" | "y" | "z", raw: string) => set({ offset: { ...off, [axis]: num(raw) } });
          const distanceLabel = mode === "beside" ? "Gap" : mode === "inside" ? "Above floor" : mode === "auto" ? "Distance" : "Above rim";
          const resolved = mode === "auto" && fit ? fit.auto : mode;
          const changed = !!pl.offset || !!pl.start || pl.gap !== undefined || pl.hop !== undefined;
          return (
            <li key={part.rootId} className="flex flex-col gap-2 rounded-lg border px-2.5 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <input aria-label={`Name of ${who}`} className={`${field} w-32 font-medium`} maxLength={40} placeholder={`Part ${roots.indexOf(part.rootId) + 1}`} value={part.name ?? ""} onChange={(e) => onChange(updatePartMeta(fold, part.rootId, { name: e.target.value }))} />
                <span className="text-xs text-muted-foreground">base {label(part.rootId)}</span>
                {verdict ? (
                  <span className={`rounded-full px-2 py-0.5 text-xs ${verdict.ok ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200" : "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"}`}>
                    {verdict.ok ? "Fits inside" : "Too big to fit inside"}
                  </span>
                ) : null}
                <Button type="button" variant="outline" size="xs" className="ml-auto" onClick={() => onChange(makeMain(fold, part.rootId))}>Make main body</Button>
              </div>

              <div className="flex flex-wrap items-end gap-x-2 gap-y-2">
                <Field label="Placed against">
                  <select aria-label={`Which piece ${who} is placed against`} className={`${field} w-32`} value={againstId} onChange={(e) => set({ relativeTo: e.target.value === fold.rootId ? undefined : e.target.value })}>
                    {roots.filter((r) => r !== part.rootId).map((r) => <option key={r} value={r}>{name(r)}</option>)}
                  </select>
                </Field>
                <Field label="Where it goes">
                  <select aria-label={`Where ${who} goes in 3D`} className={`${field} w-44`} value={mode} onChange={(e) => set({ mode: e.target.value })}>
                    {MODES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                {mode === "open" ? (
                  <Field label="Tilt °">
                    <input aria-label={`How far ${who} is tilted open, in degrees`} className={`${field} w-16`} type="number" min={0} max={120} step={1} value={pl.openDeg ?? 30} onChange={(e) => set({ openDeg: Math.min(120, Math.max(0, Math.round(Number(e.target.value) || 0))) })} />
                  </Field>
                ) : null}
                {mode === "beside" ? (
                  <Field label="Side">
                    <select aria-label={`Which side ${who} stands on`} className={`${field} w-24`} value={pl.side ?? "right"} onChange={(e) => set({ side: e.target.value })}>
                      {SIDES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                ) : null}
                <Field label={`${distanceLabel} mm`}>
                  <input aria-label={`${distanceLabel} of ${who}, in millimetres`} className={`${field} w-20`} type="number" min={-MAX_SHIFT} max={MAX_SHIFT} step={1} placeholder={mode === "beside" ? "auto" : "0"} value={pl.gap ?? ""} onChange={(e) => set({ gap: num(e.target.value) })} />
                </Field>
                {([["x", "Shift side"], ["y", "Shift back"], ["z", "Shift up"]] as const).map(([axis, text]) => (
                  <Field key={axis} label={`${text} mm`}>
                    <input aria-label={`${text} of ${who}, in millimetres`} className={`${field} w-20`} type="number" min={-MAX_SHIFT} max={MAX_SHIFT} step={1} placeholder="0" value={off[axis] ?? ""} onChange={(e) => setOff(axis, e.target.value)} />
                  </Field>
                ))}
                <Field label="Start up in">
                  <select aria-label={`Which side ${who} starts from`} title="Where the part starts: clear of the piece it goes against, on this side. Default: where it lies on the sheet." className={`${field} w-32`} value={start.from ?? ""} onChange={(e) => set({ start: { ...start, from: e.target.value as PartSide | "" } })}>
                    <option value="">Where it lies</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                    <option value="back">Back</option>
                    <option value="front">Front</option>
                  </select>
                </Field>
                {([["x", "Start side"], ["y", "Start back"], ["z", "Start up"]] as const).map(([axis, text]) => (
                  <Field key={`s${axis}`} label={`${text} mm`}>
                    <input aria-label={`${text} of ${who}, in millimetres`} title="Where the part starts, as a shift from its flat place, before it folds and travels into position." className={`${field} w-20`} type="number" min={-MAX_SHIFT} max={MAX_SHIFT} step={1} placeholder="0" value={start[axis] ?? ""} onChange={(e) => setStart(axis, e.target.value)} />
                  </Field>
                ))}
                <Field label="Lift while moving mm">
                  <input aria-label={`How high ${who} is lifted while it moves into place, in millimetres`} title="How high the part rises on its way, so it passes over the other piece instead of through it. Empty = automatic, 0 = straight line." className={`${field} w-24`} type="number" min={0} max={MAX_SHIFT} step={1} placeholder="auto" value={pl.hop ?? ""} onChange={(e) => { const n = num(e.target.value); set({ hop: n === undefined ? undefined : Math.max(0, n) }); }} />
                </Field>
                <Field label="Folds">
                  <select aria-label={`When ${who} folds`} className={`${field} w-40`} value={part.timing ?? "together"} onChange={(e) => onChange(updatePartMeta(fold, part.rootId, { timing: e.target.value as "together" | "after" }))}>
                    <option value="together">With main body</option>
                    <option value="after">After previous</option>
                  </select>
                </Field>
                <button type="button" aria-label={`Reset distance and shift of ${who}`} title="Reset distance, shift, start and lift" disabled={!changed} onClick={() => set({ offset: null, start: null, gap: undefined, hop: undefined })} className="grid size-8 place-items-center rounded-lg border text-muted-foreground hover:bg-muted disabled:opacity-40">
                  <RotateCcw className="size-3.5" aria-hidden />
                </button>
              </div>

              {fit && verdict ? (
                <p className="text-xs text-muted-foreground" role="status">
                  {who} {size3(fit.size)} · {against} {size3(fit.space)}. {verdict.text}
                  {mode === "auto" ? ` Automatic: ${resolved === "inside" ? "inside" : "on top, closed"}.` : ""}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 text-[11px] font-medium leading-none text-muted-foreground">
      {label}
      {children}
    </label>
  );
}
