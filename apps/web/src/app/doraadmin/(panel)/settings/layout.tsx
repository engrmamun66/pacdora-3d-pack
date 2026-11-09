import { Suspense, type ReactNode } from "react";
import { SettingsTabs } from "@/components/admin/settings-tabs";

/** Settings shell: tabs on the left, the chosen section on the right. Every section page checks the super-admin role itself. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Site options and the state of this installation. Your own account is under Profile (top right).</p>
      </div>
      <div className="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)] md:gap-10">
        <aside className="md:sticky md:top-6 md:self-start">
          <Suspense fallback={<div className="h-28 animate-pulse rounded-md bg-muted" />}>
            <SettingsTabs />
          </Suspense>
        </aside>
        <div className="min-w-0 border-t pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-10">{children}</div>
      </div>
    </div>
  );
}
