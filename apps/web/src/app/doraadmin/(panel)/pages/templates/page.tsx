import { TemplatesPageEditor } from "@/components/admin/pages/other-editors";
import { requireSuperAdmin } from "@/server/admin";
import { readSiteContent } from "@/server/site-content";

export const metadata = { title: "Pages: Templates page" };

export default async function TemplatesPageContentAdmin() {
  await requireSuperAdmin();
  const { content } = await readSiteContent();
  return <TemplatesPageEditor initial={content.templatesPage} />;
}

/** Reads the signed-in session, so it cannot be part of a static shell. */
export const instant = false;
