"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { toCleanSvg, toDxf, type ImportedDieline, type Role } from "@packaging/svg-import";
import { svgDataUrl } from "@/lib/dieline-preview";
import { notify } from "@/lib/notify";
import { ROLE_COLOR } from "@/lib/template-import";
import { SheetCanvas, type ToggleDef } from "./sheet-canvas";

const MARGIN = 8;
type Toggles = { bleed: boolean; guides: boolean };
const DEFS: ToggleDef<keyof Toggles>[] = [
  { key: "bleed", label: "Bleed" },
  { key: "guides", label: "Guides" },
];

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Public page for a template imported from SVG: pan/zoom sheet, size, and SVG / DXF downloads built in the browser. */
export function SvgTemplateViewer({
  slug,
  title,
  description,
  dieline,
  roles,
  categories,
}: {
  slug: string;
  title: string;
  description: string;
  dieline: ImportedDieline;
  roles: Record<string, Role>;
  categories: string[];
}) {
  const [toggles, setToggles] = useState<Toggles>({ bleed: true, guides: false });
  const has = (r: Role) => Object.values(roles).includes(r);
  const src = useMemo(
    () => svgDataUrl(toCleanSvg(dieline, roles, { margin: MARGIN, showBleed: toggles.bleed, showGuides: toggles.guides })),
    [dieline, roles, toggles],
  );
  const defs = DEFS.filter((d) => (d.key === "bleed" ? has("bleed") : has("guide")));
  const legend = [
    { label: "Cut", color: ROLE_COLOR.cut },
    ...(has("crease") ? [{ label: "Crease", color: ROLE_COLOR.crease, dashed: true }] : []),
    ...(has("bleed") && toggles.bleed ? [{ label: "Bleed", color: ROLE_COLOR.bleed, dashed: true }] : []),
    ...(has("guide") && toggles.guides ? [{ label: "Guide", color: ROLE_COLOR.guide, dashed: true }] : []),
  ];

  const download = (kind: "svg" | "dxf") => {
    try {
      if (kind === "svg") saveBlob(new Blob([toCleanSvg(dieline, roles, { margin: 0, showBleed: toggles.bleed, showGuides: toggles.guides })], { type: "image/svg+xml" }), `${slug}.svg`);
      else saveBlob(new Blob([toDxf(dieline, roles)], { type: "application/dxf" }), `${slug}.dxf`);
      notify.success(`Downloaded ${slug}.${kind}`);
    } catch {
      notify.error("Download failed", { description: "Please try again." });
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:h-dvh">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2">
        <Link href="/templates" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" aria-label="Back to Templates">
          <ArrowLeft className="size-4" /> Templates
        </Link>
        <span className="h-5 w-px bg-border" aria-hidden />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          {description ? <p className="hidden truncate text-xs text-muted-foreground sm:block">{description}</p> : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex min-h-[60vh] min-w-0 flex-col lg:min-h-0">
          <SheetCanvas
            bounds={{ width: dieline.widthMm + 2 * MARGIN, height: dieline.heightMm + 2 * MARGIN }}
            src={src}
            toggles={toggles}
            toggleDefs={defs}
            onToggles={setToggles}
            legend={legend}
          />
        </main>
        <aside className="flex flex-col gap-4 overflow-y-auto border-t p-4 lg:border-t-0 lg:border-l">
          <section className="rounded-2xl border p-4 text-sm">
            <h2 className="mb-2 font-semibold">Sheet size</h2>
            <p className="tabular-nums">{dieline.widthMm.toFixed(1)} × {dieline.heightMm.toFixed(1)} mm</p>
            <p className="tabular-nums text-muted-foreground">{(dieline.widthMm / 25.4).toFixed(2)} × {(dieline.heightMm / 25.4).toFixed(2)} in</p>
            {categories.length ? (
              <div className="mt-3 flex flex-wrap gap-1">
                {categories.map((c) => <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-xs">{c}</span>)}
              </div>
            ) : null}
          </section>
          <section className="flex flex-col gap-3 rounded-2xl border p-4">
            <h2 className="font-semibold">Download the dieline</h2>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => download("svg")} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/80">
                <Download className="size-4" aria-hidden /> SVG
              </button>
              <button type="button" onClick={() => download("dxf")} className="flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-medium hover:bg-muted">
                <Download className="size-4" aria-hidden /> DXF
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Millimetre units, true size. DXF has CUT and CREASE layers (and BLEED when present).</p>
            <p className="text-xs text-muted-foreground">This is a fixed dieline: sizes cannot be changed. The 3D preview and artwork editor are not available for it yet.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
