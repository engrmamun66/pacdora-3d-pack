import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { IMPORTED_GENERATOR_ID, getGenerator, getPreset } from "@packaging/dieline-engine";
import { DielineWorkspace } from "@/components/dielines/workspace";
import { getWatermark } from "@/server/site-settings";
import { getSession } from "@/server/session";
import { db } from "@/server/db";
import { importedStartParams, loadImportedSource } from "@/server/imported-templates";
import { getSaveAsOptions } from "@/server/projects";
import { readViewSettings } from "@/lib/view-settings";
import { readTemplateWindows } from "@/lib/template-windows";

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
    select: { id: true, name: true, description: true, source: true, published: true, viewSettings: true, defaultThickness: true, windows: true, categories: { where: { active: true }, select: { name: true } } },
  });
  if (!row || !row.published) notFound();
  // Signed in or not: the page is open to everyone. A signed-in visitor gets their profile icon in the header.
  const session = await getSession();
  const user = session?.user ?? null;
  const viewer = user ? { name: user.name, email: user.email, image: user.image ?? null } : null;
  const watermark = await getWatermark(user);
  const saveOptions = user ? await getSaveAsOptions(user.id) : null;

  // Imported SVG template: a fixed shape you can resize, add artwork to and export (no 3D fold).
  if (row.source === "svg") {
    const imported = await loadImportedSource(row.id);
    if (!imported) notFound();
    return (
      <DielineWorkspace
        mode={{ kind: "create", presetId: row.id }}
        generatorId={IMPORTED_GENERATOR_ID}
        imported={{ templateId: imported.templateId, flat: imported.flat, fold: imported.fold }}
        initialView={readViewSettings(row.viewSettings)}
        initialWindows={readTemplateWindows(row.windows)}
        modelId={row.id}
        title={row.name}
        description={row.description}
        initialName={row.name}
        initialParams={importedStartParams(imported.flat, imported.fold)}
        watermark={watermark}
        viewer={viewer}
        saveOptions={saveOptions}
      />
    );
  }

  // Built-in (parametric) template: the generator lives in code, name and description come from the database.
  const preset = getPreset(row.id);
  if (row.source !== "builtin" || !preset) notFound();
  const prefill = readPrefill((await searchParams).p, getGenerator(preset.generatorId).schemaKeys);
  return (
    <DielineWorkspace
      mode={{ kind: "create", presetId: preset.id }}
      generatorId={preset.generatorId}
      initialView={readViewSettings(row.viewSettings)}
      initialWindows={readTemplateWindows(row.windows)}
      modelId={row.id}
      title={row.name}
      description={row.description}
      initialName={row.name}
      initialParams={{ ...preset.defaults, ...(row.defaultThickness ? { thickness: row.defaultThickness } : {}), ...prefill }}
      watermark={watermark}
      viewer={viewer}
      saveOptions={saveOptions}
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
