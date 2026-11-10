import { Suspense } from "react";
import { connection } from "next/server";
import { TemplateLibrary } from "@/components/templates/template-library";
import { AiDescribe } from "@/components/templates/ai-describe";
import { aiEnabled } from "@/server/env";
import { getPublicCatalogue } from "@/server/templates-public";

export const metadata = { title: "Templates" };

export default function TemplatesPage() {
  return (
    <>
      <h1 className="sr-only">Templates</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}>
        <Library />
      </Suspense>
    </>
  );
}

async function Library() {
  const { templates, categories } = await getPublicCatalogue();
  return (
    <TemplateLibrary items={templates} categories={categories}>
      <Suspense fallback={null}>
        <AiPanel />
      </Suspense>
    </TemplateLibrary>
  );
}

/** Read at request time: the page itself is prerendered, the AI switch is a runtime setting. */
async function AiPanel() {
  await connection();
  return aiEnabled ? <AiDescribe /> : null;
}
