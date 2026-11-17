import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { PagesTabs } from "@/components/admin/pages/pages-tabs";

/** Pages shell: the list of pages on the left, the chosen page's form on the right. Every page checks the super-admin role itself. */
export default function PagesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pages" description="The words and sections of the public site. Changes show on the site as soon as you save." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[208px_minmax(0,1fr)] md:items-start">
        <aside className="md:sticky md:top-24">
          <Suspense fallback={<div className="h-28 animate-pulse rounded-lg bg-muted" />}>
            <PagesTabs />
          </Suspense>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
