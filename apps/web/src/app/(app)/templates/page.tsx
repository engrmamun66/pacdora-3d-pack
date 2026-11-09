import { Suspense } from "react";
import { connection } from "next/server";
import { TemplateLibrary } from "@/components/templates/template-library";
import { AiDescribe } from "@/components/templates/ai-describe";
import { aiEnabled } from "@/server/env";
import { getPublicCatalogue } from "@/server/templates-public";

export const metadata = { title: "Templates" };

export default function TemplatesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Templates</h1>
        <p className="text-muted-foreground">Pick a structure, then set your exact dimensions or download the dieline.</p>
      </div>
      <Suspense fallback={null}>
        <AiPanel />
      </Suspense>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" />}>
        <Library />
      </Suspense>
    </div>
  );
}

async function Library() {
  const { templates, categories } = await getPublicCatalogue();
  return <TemplateLibrary items={templates} categories={categories} />;
}

/** Read at request time: the page itself is prerendered, the AI switch is a runtime setting. */
async function AiPanel() {
  await connection();
  return aiEnabled ? <AiDescribe /> : null;
}
