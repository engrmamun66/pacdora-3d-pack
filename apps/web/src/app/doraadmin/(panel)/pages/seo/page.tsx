import { SeoEditor } from "@/components/admin/pages/other-editors";
import { site } from "@/config/site";
import { requireSuperAdmin } from "@/server/admin";
import { readSiteContent } from "@/server/site-content";
import { getSiteIdentity } from "@/server/site-identity";

export const metadata = { title: "Pages: Search engines" };

export default async function SeoAdmin() {
  await requireSuperAdmin();
  const [{ content }, identity] = await Promise.all([readSiteContent(), getSiteIdentity()]);
  return <SeoEditor initial={content.seo} siteTitle={identity.title} defaultDescription={site.tagline} />;
}
