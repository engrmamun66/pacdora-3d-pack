import { HomeEditor } from "@/components/admin/pages/home-editor";
import { requireSuperAdmin } from "@/server/admin";
import { readSiteContent } from "@/server/site-content";

export const metadata = { title: "Pages: Home page" };

/** /doraadmin/pages: the home page's words, sections and their order. */
export default async function HomePageContent() {
  await requireSuperAdmin();
  const { content } = await readSiteContent();
  return <HomeEditor initial={content.home} />;
}
