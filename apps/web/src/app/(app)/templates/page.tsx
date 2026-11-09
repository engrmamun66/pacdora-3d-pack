import { CATEGORY_LABELS, getGenerator, templateCatalog, type TemplateCategory } from "@packaging/dieline-engine";
import { TemplateLibrary, type LibraryItem } from "@/components/templates/template-library";
import { tryThumbnail } from "@/lib/dieline-preview";
import { AiDescribe } from "@/components/templates/ai-describe";
import { aiEnabled } from "@/server/env";
import { connection } from "next/server";
import { Suspense } from "react";

export const metadata = { title: "Templates" };

export default function TemplatesPage() {
  // Catalogue lives in code, so this page is fully static.
  const items: LibraryItem[] = templateCatalog.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    categoryLabel: CATEGORY_LABELS[t.category],
    description: t.description,
    tags: [...t.tags],
    thumbnail: tryThumbnail(getGenerator(t.generatorId).id, t.defaults),
  }));
  const used = [...new Set(templateCatalog.map((t) => t.category))] as TemplateCategory[];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Templates</h1>
        <p className="text-muted-foreground">Pick a structure, then set your exact dimensions.</p>
      </div>
      <Suspense fallback={null}>
        <AiPanel />
      </Suspense>
      <TemplateLibrary items={items} categories={used.map((id) => ({ id, label: CATEGORY_LABELS[id] }))} />
    </div>
  );
}

/** Read at request time: the page itself is prerendered, the AI switch is a runtime setting. */
async function AiPanel() {
  await connection();
  return aiEnabled ? <AiDescribe /> : null;
}
