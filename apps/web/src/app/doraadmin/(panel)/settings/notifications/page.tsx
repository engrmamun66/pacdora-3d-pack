import { SettingsHeading } from "@/components/admin/settings-ui";
import { ToastTester } from "@/components/admin/toast-tester";
import { requireSuperAdmin } from "@/server/admin";

export const metadata = { title: "Settings: Notifications" };

export default async function NotificationSettings() {
  await requireSuperAdmin();
  return (
    <section aria-labelledby="h-notify">
      <SettingsHeading title="Notifications" description="Messages appear at the bottom right: success, error, warning and info. Preview them here." />
      <ToastTester />
    </section>
  );
}

/** Reads the signed-in session, so it cannot be part of a static shell. */
export const instant = false;
