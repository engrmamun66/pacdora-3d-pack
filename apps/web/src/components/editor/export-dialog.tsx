"use client";

import { useRef, useState } from "react";
import { Download, X } from "lucide-react";
import type { DielineGeometry } from "@packaging/dieline-engine";
import { ILLUSTRATOR_PROFILES } from "@packaging/render-print/profiles";
import type { Artwork } from "@packaging/schema";
import { setPngDpi } from "@/lib/png-dpi";
import { notify } from "@/lib/notify";
import { renderPng } from "./artwork-raster";

type Format = "pdf" | "ai" | "eps" | "svg" | "dxf" | "png" | "png-hires" | "glb" | "json";

const FORMATS: { value: Format; label: string; hint: string }[] = [
  { value: "pdf", label: "PDF (print)", hint: "Vector. Die lines as spot colours on their own layers, trim and bleed boxes set." },
  { value: "ai", label: "Adobe Illustrator (.ai)", hint: "PDF-compatible .ai for the chosen Illustrator version." },
  { value: "eps", label: "EPS", hint: "Encapsulated PostScript for the chosen Illustrator version. No layers, no transparency." },
  { value: "svg", label: "SVG", hint: "Vector, millimetre units, named layers." },
  { value: "dxf", label: "DXF (cutting table / CAD)", hint: "Die lines only: CUT and CREASE layers, millimetres." },
  { value: "png", label: "PNG, 150 dpi", hint: "Flat artwork image for screens and previews." },
  { value: "png-hires", label: "PNG, 300 dpi (high resolution)", hint: "Flat artwork image for print proofs." },
  { value: "glb", label: "3D model (GLB)", hint: "The 3D carton as shown in the preview, in metres." },
  { value: "json", label: "Project file (JSON)", hint: "Everything needed to rebuild this project." },
];

const SERVER: readonly Format[] = ["pdf", "ai", "eps", "svg", "dxf", "json"];

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const fileBase = (name: string) => name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "dieline";

export function ExportDialog({
  projectId,
  name,
  geo,
  getArtwork,
  boardColor,
  flushSave,
  getGlb,
  onClose,
}: {
  projectId: string;
  name: string;
  geo: DielineGeometry;
  getArtwork: () => Artwork;
  boardColor: string;
  flushSave: () => Promise<void>;
  getGlb: () => Promise<Blob>;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<Format>("pdf");
  const [profile, setProfile] = useState("cc");
  const [opts, setOpts] = useState({ artwork: true, dieline: true, bleed: false, safe: false, dimensions: false });
  const [cutSpot, setCutSpot] = useState("CutContour");
  const [creaseSpot, setCreaseSpot] = useState("Crease");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; title: string; notes: string[] } | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  const meta = FORMATS.find((f) => f.value === format)!;
  const needsProfile = format === "ai" || format === "eps";
  const profiles = ILLUSTRATOR_PROFILES.filter((p) => format !== "ai" || p.ai);
  const effectiveProfile = profiles.some((p) => p.id === profile) ? profile : profiles[0]!.id;
  const vector = ["pdf", "ai", "eps", "svg"].includes(format);
  const spotNameOk = (s: string) => /^[\w .-]{1,40}$/.test(s);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      if (SERVER.includes(format)) {
        await flushSave(); // the server exports the saved project
        const q = new URLSearchParams({
          format,
          profile: effectiveProfile,
          artwork: opts.artwork ? "1" : "0",
          dieline: opts.dieline ? "1" : "0",
          bleed: opts.bleed ? "1" : "0",
          safe: opts.safe ? "1" : "0",
          dimensions: opts.dimensions ? "1" : "0",
          cutSpot,
          creaseSpot,
        });
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/export?${q}`);
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `Export failed (${res.status}).`);
        }
        const report = JSON.parse(decodeURIComponent(res.headers.get("x-export-report") ?? "%7B%7D")) as { losses?: string[] };
        const ext = format === "json" ? "json" : format;
        download(await res.blob(), `${fileBase(name)}.${ext}`);
        setResult({ ok: true, title: `Downloaded ${ext.toUpperCase()}`, notes: report.losses ?? [] });
        if (report.losses?.length) notify.warning(`Downloaded ${ext.toUpperCase()} with ${report.losses.length} limitation${report.losses.length === 1 ? "" : "s"}`, { description: "See the notes in the export dialog." });
        else notify.success(`Downloaded ${ext.toUpperCase()}`);
      } else if (format === "glb") {
        download(await getGlb(), `${fileBase(name)}.glb`);
        setResult({ ok: true, title: "Downloaded GLB", notes: ["The model shows the carton at the current fold amount. Panels have zero thickness."] });
        notify.info("Downloaded GLB", { description: "Panels have zero thickness." });
      } else {
        const want = format === "png-hires" ? 300 : 150;
        const r = await renderPng(geo, getArtwork(), { dpi: want, background: boardColor, dieline: opts.dieline });
        const bytes = setPngDpi(new Uint8Array(await r.blob.arrayBuffer()), r.dpi);
        download(new Blob([bytes], { type: "image/png" }), `${fileBase(name)}-${r.dpi}dpi.png`);
        if (r.dpi < want) notify.warning(`PNG saved at ${r.dpi} dpi, not ${want}`, { description: "The browser's canvas size limit was reached." });
        else notify.success(`Downloaded PNG (${r.width} x ${r.height} px)`);
        setResult({
          ok: true,
          title: `Downloaded PNG (${r.width} x ${r.height} px)`,
          notes: [
            ...(r.dpi < want ? [`Resolution reduced to ${r.dpi} dpi: the image would exceed the browser's canvas size limit.`] : []),
            "PNG is a flat image: use PDF, AI or EPS for printing plates.",
          ],
        });
      }
    } catch (e) {
      setResult({ ok: false, title: "Export failed", notes: [(e as Error).message] });
      notify.error("Export failed", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const check = (key: keyof typeof opts, label: string, disabled = false) => (
    <label className={`flex items-center gap-2 text-sm ${disabled ? "opacity-50" : ""}`}>
      <input type="checkbox" disabled={disabled} checked={opts[key]} onChange={(e) => setOpts((o) => ({ ...o, [key]: e.target.checked }))} />
      {label}
    </label>
  );

  return (
    <dialog
      ref={(el) => {
        ref.current = el;
        if (el && !el.open) el.showModal();
      }}
      onClose={onClose}
      aria-labelledby="export-title"
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 id="export-title" className="font-semibold">Export</h2>
        <button type="button" aria-label="Close" className="rounded p-1 hover:bg-muted" onClick={() => ref.current?.close()}>
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor="export-format">Format</label>
          <select id="export-format" aria-describedby="export-format-hint" className="h-9 rounded-md border bg-background px-2" value={format} onChange={(e) => setFormat(e.target.value as Format)}>
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <span id="export-format-hint" className="text-xs text-muted-foreground">{meta.hint}</span>
        </div>

        {needsProfile ? (
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="export-profile">Illustrator version</label>
            <select id="export-profile" aria-describedby="export-profile-hint" className="h-9 rounded-md border bg-background px-2" value={effectiveProfile} onChange={(e) => setProfile(e.target.value)}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} {p.tested ? "" : "(untested)"}
                </option>
              ))}
            </select>
            <span id="export-profile-hint" className="text-xs text-amber-700 dark:text-amber-400">
              Untested means this file has not yet been opened in that real Illustrator version. Check it before sending to print.
            </span>
          </div>
        ) : null}

        {format !== "json" && format !== "glb" ? (
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="mb-1 text-sm">Include</legend>
            {check("artwork", "Artwork", format === "dxf")}
            {check("dieline", "Die lines (cut, crease)", format === "dxf")}
            {check("bleed", "Bleed guide", !vector)}
            {check("safe", "Safe-area guide", !vector)}
            {check("dimensions", "Dimensions", !vector)}
          </fieldset>
        ) : null}

        {vector && opts.dieline && (format === "pdf" || format === "ai" || format === "eps") ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Cut spot colour name
              <input className="h-8 rounded-md border bg-background px-2" value={cutSpot} maxLength={40} onChange={(e) => setCutSpot(e.target.value)} aria-invalid={!spotNameOk(cutSpot)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Crease spot colour name
              <input className="h-8 rounded-md border bg-background px-2" value={creaseSpot} maxLength={40} onChange={(e) => setCreaseSpot(e.target.value)} aria-invalid={!spotNameOk(creaseSpot)} />
            </label>
            <p className="col-span-2 text-xs text-muted-foreground">Use the names your printer expects. Letters, digits, space, dot, dash and underscore only.</p>
          </div>
        ) : null}

        {result ? (
          <div role={result.ok ? "status" : "alert"} className={`rounded-md border px-3 py-2 text-sm ${result.ok ? "" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
            <p className="font-medium">{result.title}</p>
            {result.notes.length ? (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : result.ok ? (
              <p className="text-xs text-muted-foreground">Nothing was lost in this format.</p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 border-t px-5 py-3">
        <button type="button" className="h-9 rounded-md border px-3 text-sm hover:bg-muted" onClick={() => ref.current?.close()}>
          Close
        </button>
        <button
          type="button"
          disabled={busy || !spotNameOk(cutSpot) || !spotNameOk(creaseSpot)}
          onClick={() => void run()}
          className="flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
        >
          <Download className="size-4" />
          {busy ? "Exporting…" : "Export"}
        </button>
      </div>
    </dialog>
  );
}
