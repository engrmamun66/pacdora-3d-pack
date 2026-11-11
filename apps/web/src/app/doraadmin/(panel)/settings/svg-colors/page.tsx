import { SvgColorsForm } from "@/components/admin/svg-colors-form";
import { SettingsHeading } from "@/components/admin/settings-ui";
import { requireSuperAdmin } from "@/server/admin";
import { readSvgColors } from "@/server/site-settings";

export const metadata = { title: "Settings: SVG Dieline Color" };

/** /doraadmin/settings/svg-colors: which stroke colours mean Cut, Fold, Bleed, Guide and Ignore. */
export default async function SvgColorSettings() {
  await requireSuperAdmin();
  const { settings, updatedAt } = await readSvgColors();
  return (
    <section aria-labelledby="h-svgc">
      <SettingsHeading
        title="SVG Dieline Color"
        description={`When an SVG is imported, a line with one of these colours gets that meaning automatically on the new template. Other colours keep the importer's own guess, and you can still change any line in the template form.${updatedAt ? ` Last saved ${updatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC.` : ""}`}
      />
      <SvgColorsForm initial={settings} />
    </section>
  );
}
