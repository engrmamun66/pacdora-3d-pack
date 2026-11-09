import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { getGenerator, getPreset, templateCatalog } from "@packaging/dieline-engine";
import { DielineWorkspace } from "@/components/dielines/workspace";

export function generateStaticParams() {
  return templateCatalog.map((t) => ({ id: t.id }));
}

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

async function Designer({ params, searchParams }: { params: PageProps<"/templates/[id]">["params"]; searchParams: PageProps<"/templates/[id]">["searchParams"] }) {
  const { id } = await params;
  const preset = getPreset(id);
  if (!preset) notFound();
  const prefill = readPrefill((await searchParams).p, getGenerator(preset.generatorId).schemaKeys);
  return (
    <DielineWorkspace
      mode={{ kind: "create", presetId: preset.id }}
      generatorId={preset.generatorId}
      title={preset.name}
      description={preset.description}
      initialName={preset.name}
      initialParams={{ ...preset.defaults, ...prefill }}
      backHref="/templates"
      backLabel="Templates"
    />
  );
}

export default function TemplatePage({ params, searchParams }: PageProps<"/templates/[id]">) {
  return (
    <Suspense fallback={<div className="h-dvh animate-pulse bg-muted" />}>
      <Designer params={params} searchParams={searchParams} />
    </Suspense>
  );
}
