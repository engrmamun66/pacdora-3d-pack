import { Suspense } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { LayoutManager } from "@/components/admin/layout-manager";
import { getIconSettings, listDesigns, listLayouts } from "@/server/layouts";
import { requireSuperAdmin } from "@/server/admin";

export const metadata = { title: "Template Layouts" };

/** The data is read inside a Suspense boundary of this page (the page itself shows its header at once), like the other pages that read the database. */
async function Layouts() {
  await requireSuperAdmin();
  const [layouts, icon, designs] = await Promise.all([listLayouts(false), getIconSettings(), listDesigns()]);
  return <LayoutManager key={layouts.map((l) => l.id).sort().join(",")} layouts={layouts} designs={designs} iconBox={icon.box} iconStyle={icon.style} />;
}

export default function TemplateLayoutsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Template Layouts"
        description="How the box is shown to customers on a shared template page: one box, a row, a stack, a grid... Each layout becomes a Sample tab beside the 3D view, for every template."
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Layouts />
      </Suspense>
    </div>
  );
}
