import { HeroSettingsForm } from "@/components/admin/hero-settings-form";
import { SettingsHeading } from "@/components/admin/settings-ui";
import { requireSuperAdmin } from "@/server/admin";
import { readHeroSettings } from "@/server/site-settings";

export const metadata = { title: "Settings: Home page" };

/** /doraadmin/settings: the first tab, home page hero options. */
export default async function HomePageSettings() {
  await requireSuperAdmin();
  const hero = await readHeroSettings();
  return (
    <section aria-labelledby="h-home">
      <SettingsHeading
        title="Home page"
        description={`Hero section${hero.updatedAt ? `. Last saved ${hero.updatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}.`}
      />
      <HeroSettingsForm initial={hero.settings} />
    </section>
  );
}
