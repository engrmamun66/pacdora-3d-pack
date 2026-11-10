import { SiteIdentityForm } from "@/components/admin/site-identity-form";
import { SettingsHeading } from "@/components/admin/settings-ui";
import { site } from "@/config/site";
import { resolveIdentity } from "@/lib/site-identity";
import { requireSuperAdmin } from "@/server/admin";
import { readSiteIdentity } from "@/server/site-identity";

export const metadata = { title: "Settings: Site Identity" };

/** /doraadmin/settings/identity: site title, logo and favicon. */
export default async function SiteIdentitySettings() {
  await requireSuperAdmin();
  const { identity, updatedAt } = await readSiteIdentity();
  const resolved = resolveIdentity(identity, site.name);
  return (
    <section aria-labelledby="h-identity">
      <SettingsHeading
        title="Site Identity"
        description={`Site title, logo and favicon${updatedAt ? `. Last saved ${updatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}.`}
      />
      <SiteIdentityForm initialTitle={identity.title ?? ""} defaultTitle={site.name} logoUrl={resolved.logoUrl} faviconUrl={resolved.faviconUrl} />
    </section>
  );
}
