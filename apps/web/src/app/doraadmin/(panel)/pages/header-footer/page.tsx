import { ChromeEditor } from "@/components/admin/pages/other-editors";
import { requireSuperAdmin } from "@/server/admin";
import { readSiteContent } from "@/server/site-content";

export const metadata = { title: "Pages: Header and footer" };

export default async function HeaderFooterAdmin() {
  await requireSuperAdmin();
  const { content } = await readSiteContent();
  return <ChromeEditor initial={content.chrome} />;
}
