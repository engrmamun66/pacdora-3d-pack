import { WatermarkForm } from "@/components/admin/watermark-form";
import { SettingsHeading } from "@/components/admin/settings-ui";
import { requireSuperAdmin } from "@/server/admin";
import { readWatermark } from "@/server/site-settings";

export const metadata = { title: "Settings: Watermark" };

/** /doraadmin/settings/watermark: the faint text repeated inside the cut area of the dieline sheet. */
export default async function WatermarkSettings() {
  await requireSuperAdmin();
  const { settings, updatedAt } = await readWatermark();
  return (
    <section aria-labelledby="h-wm">
      <SettingsHeading
        title="Watermark"
        description={`A faint text repeated inside the cut area of the dieline sheet that customers see. It is not in downloaded files.${updatedAt ? ` Last saved ${updatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC.` : ""}`}
      />
      <WatermarkForm initial={settings} />
    </section>
  );
}
