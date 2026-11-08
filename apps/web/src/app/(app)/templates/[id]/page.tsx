import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getPreset, templateCatalog } from "@packaging/dieline-engine";
import { TemplateDesigner } from "@/components/templates/template-designer";

export function generateStaticParams() {
  return templateCatalog.map((t) => ({ id: t.id }));
}

async function Designer({ params }: { params: PageProps<"/templates/[id]">["params"] }) {
  const { id } = await params;
  const preset = getPreset(id);
  if (!preset) notFound();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/templates" className="text-sm text-muted-foreground hover:underline">← Templates</Link>
        <h1 className="text-2xl font-semibold">{preset.name}</h1>
        <p className="text-muted-foreground">{preset.description}</p>
      </div>
      <TemplateDesigner
        mode={{ kind: "create", presetId: preset.id }}
        generatorId={preset.generatorId}
        initialName={preset.name}
        initialParams={{ ...preset.defaults }}
      />
    </div>
  );
}

export default function TemplatePage({ params }: PageProps<"/templates/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-muted" />}>
      <Designer params={params} />
    </Suspense>
  );
}
