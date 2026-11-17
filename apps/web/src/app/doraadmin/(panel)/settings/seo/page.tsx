import { SeoForm } from "@/components/admin/seo-form";
import { SettingsHeading } from "@/components/admin/settings-ui";
import { requireSuperAdmin } from "@/server/admin";
import { readSeoSettings } from "@/server/seo-settings";
import { getSiteIdentity } from "@/server/site-identity";

export const metadata = { title: "Settings: SEO" };

/** /doraadmin/settings/seo: search-engine and link-preview data of the public site. */
export default async function SeoSettingsPage() {
  await requireSuperAdmin();
  const [{ settings, updatedAt }, identity] = await Promise.all([readSeoSettings(), getSiteIdentity()]);
  return (
    <section aria-labelledby="h-seo">
      <SettingsHeading
        title="SEO"
        description={`Titles, descriptions, link previews and structured data for the public pages${updatedAt ? `. Last saved ${updatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : ". Showing the built-in starting data"}.`}
      />
      <SeoForm initial={settings} siteTitle={identity.title} />
    </section>
  );
}
