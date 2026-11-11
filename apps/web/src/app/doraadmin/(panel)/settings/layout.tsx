import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { SettingsTabs } from "@/components/admin/settings-tabs";

/** Settings shell: tabs on the left, the chosen section on the right. Every section page checks the super-admin role itself. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Site options and the state of this installation. Your own account is under Profile (top right)." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[208px_minmax(0,1fr)] md:items-start">
        <aside className="md:sticky md:top-24">
          <Suspense fallback={<div className="h-28 animate-pulse rounded-lg bg-muted" />}>
            <SettingsTabs />
          </Suspense>
        </aside>
        <div className="min-w-0 rounded-xl border bg-card p-5 shadow-xs sm:p-7">{children}</div>
      </div>
    </div>
  );
}
