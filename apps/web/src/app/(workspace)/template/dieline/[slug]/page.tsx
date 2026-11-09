import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { getGenerator, getPreset } from "@packaging/dieline-engine";
import type { ImportedDieline, Role } from "@packaging/svg-import";
import { DielineWorkspace } from "@/components/dielines/workspace";
import { SvgTemplateViewer } from "@/components/dielines/svg-template-viewer";
import { db } from "@/server/db";

const prefillSchema = z.record(z.string().max(60), z.union([z.number().finite(), z.string().max(100), z.boolean()]));

/** Optional ?p= prefill (e.g. from an AI suggestion). Only known keys are kept; the engine validates values. */
function readPrefill(raw: string | string[] | undefined, allowed: readonly string[]) {
  if (typeof raw !== "string" || raw.length > 4000) return {};
  try {
    const parsed = prefillSchema.safeParse(JSON.parse(raw));
    return parsed.success ? Object.fromEntries(Object.entries(parsed.data).filter(([k]) => allowed.includes(k))) : {};
  } catch {
    return {};
  }
}

async function TemplateView({ params, searchParams }: { params: PageProps<"/template/dieline/[slug]">["params"]; searchParams: PageProps<"/template/dieline/[slug]">["searchParams"] }) {
  const { slug } = await params;
  if (slug.length > 80) notFound();
  const row = await db.template.findUnique({
    where: { id: slug },
    select: { id: true, name: true, description: true, source: true, published: true, geometry: true, categories: { where: { active: true }, select: { name: true } } },
  });
  if (!row || !row.published) notFound();

  // Imported SVG template: a fixed dieline (pan, zoom, download).
  if (row.source === "svg") {
    const g = row.geometry as unknown as { dieline?: ImportedDieline; roles?: Record<string, Role> } | null;
    if (!g?.dieline || !g.roles) notFound();
    return <SvgTemplateViewer slug={row.id} title={row.name} description={row.description} dieline={g.dieline} roles={g.roles} categories={row.categories.map((c) => c.name)} />;
  }

  // Built-in (parametric) template: the generator lives in code, name and description come from the database.
  const preset = getPreset(row.id);
  if (row.source !== "builtin" || !preset) notFound();
  const prefill = readPrefill((await searchParams).p, getGenerator(preset.generatorId).schemaKeys);
  return (
    <DielineWorkspace
      mode={{ kind: "create", presetId: preset.id }}
      generatorId={preset.generatorId}
      title={row.name}
      description={row.description}
      initialName={row.name}
      initialParams={{ ...preset.defaults, ...prefill }}
      backHref="/templates"
      backLabel="Templates"
    />
  );
}

export default function TemplateDielinePage({ params, searchParams }: PageProps<"/template/dieline/[slug]">) {
  return (
    <Suspense fallback={<div className="h-dvh animate-pulse bg-muted" />}>
      <TemplateView params={params} searchParams={searchParams} />
    </Suspense>
  );
}
