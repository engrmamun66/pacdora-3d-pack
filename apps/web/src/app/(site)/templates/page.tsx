import { Suspense } from "react";
import { connection } from "next/server";
import { TemplateLibrary } from "@/components/templates/template-library";
import { AiDescribe } from "@/components/templates/ai-describe";
import { aiEnabled } from "@/server/env";
import { getPublicCatalogue } from "@/server/templates-public";
import { getSiteContent } from "@/server/site-content";
import { StudioBand } from "@/components/studio/studio-band";

export const metadata = { title: "Templates" };

export default function TemplatesPage() {
  return (
    <Suspense fallback={<div className="flex flex-col gap-8"><div className="paper-grid sheet h-40 animate-pulse" /><div className="sheet h-96 animate-pulse" /></div>}>
      <Library />
    </Suspense>
  );
}

async function Library() {
  const [{ templates, categories }, content] = await Promise.all([getPublicCatalogue(), getSiteContent()]);
  const page = content.templatesPage;
  return (
    <div className="flex flex-col gap-8">
      {/* The heading and the line under it are set under Admin > Pages > Templates page. */}
      <StudioBand chip={`${templates.length} template${templates.length === 1 ? "" : "s"}`} title={page.title} description={page.subtitle || undefined} />
      <TemplateLibrary items={templates} categories={categories}>
        <Suspense fallback={null}>
          <AiPanel />
        </Suspense>
      </TemplateLibrary>
    </div>
  );
}

/** Read at request time: the page itself is prerendered, the AI switch is a runtime setting. */
async function AiPanel() {
  await connection();
  return aiEnabled ? <AiDescribe /> : null;
}
