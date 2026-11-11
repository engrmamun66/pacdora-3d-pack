import { PageHeader } from "@/components/admin/page-header";
import { TemplateWizard } from "@/components/templates-admin/template-wizard";
import { db } from "@/server/db";
import { requireSuperAdmin } from "@/server/admin";
import { readSvgColors } from "@/server/site-settings";

export const metadata = { title: "Add template" };

export default async function NewTemplatePage() {
  await requireSuperAdmin();
  const categories = await db.templateCategory.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }], select: { id: true, kind: true, name: true } });
  const { settings: svgColors } = await readSvgColors();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Add template" description="Upload an SVG dieline, choose what each line means, and set how it folds in 3D." />
      <TemplateWizard
        svgColors={svgColors}
        mode="create"
        categories={categories.map((c) => ({ id: c.id, kind: c.kind as "use" | "model", name: c.name }))}
        initial={{ slug: "", name: "", description: "", published: true, sortOrder: 0, backgroundUrl: null, categoryIds: [], source: null, dieline: null, roles: {}, options: { unit: "px", scale: 1, pxPerInch: 96 }, fold: null, referenceStyles: [], material: null }}
      />
    </div>
  );
}
