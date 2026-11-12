import { PageHeader } from "@/components/admin/page-header";
import { notFound } from "next/navigation";
import { getGenerator, type FoldSetup } from "@packaging/dieline-engine";
import type { ImportedDieline, Role } from "@packaging/svg-import";
import { TemplateWizard } from "@/components/templates-admin/template-wizard";
import { db } from "@/server/db";
import { requireSuperAdmin } from "@/server/admin";
import { readViewSettings } from "@/lib/view-settings";
import { readTemplateWindows } from "@/lib/template-windows";
import { templateStatus } from "@/lib/template-status";
import { readSvgColors } from "@/server/site-settings";

export const metadata = { title: "Edit template" };

export default async function EditTemplatePage({ params }: PageProps<"/doraadmin/templates/[slug]/edit">) {
  await requireSuperAdmin();
  const { slug } = await params;
  if (slug.length > 80) notFound();
  const [t, categories] = await Promise.all([
    db.template.findUnique({ where: { id: slug }, select: { id: true, name: true, description: true, status: true, published: true, sortOrder: true, defaultThickness: true, generatorId: true, backgroundKey: true, viewSettings: true, windows: true, updatedAt: true, source: true, geometry: true, categories: { select: { id: true } } } }),
    db.templateCategory.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }], select: { id: true, kind: true, name: true } }),
  ]);
  if (!t) notFound();
  const g = t.source === "svg" ? (t.geometry as unknown as { dieline: ImportedDieline; full?: ImportedDieline; excluded?: number[]; roles: Record<string, Role>; options: { unit: "auto" | "mm" | "cm" | "in" | "pt" | "px"; scale: number; pxPerInch: number }; fold?: FoldSetup | null; referenceStyles?: string[] } | null) : null;
  // Built-in templates whose generator has a board thickness get a "Default material" field.
  const thicknessParam = t.source === "builtin" ? getGenerator(t.generatorId).params.find((q) => q.key === "thickness") : undefined;
  const material = thicknessParam && thicknessParam.kind === "number" ? { min: thicknessParam.min, max: thicknessParam.max, value: t.defaultThickness } : null;
  const { settings: svgColors } = await readSvgColors();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Edit ${t.name}`}
        description={t.source === "builtin" ? "Built-in parametric template: you can change its name, description, categories, order, default material, background image and visibility. Its shape comes from the dieline generator in code." : undefined}
      />
      <TemplateWizard
        svgColors={svgColors}
        key={t.updatedAt.getTime()}
        mode="edit"
        categories={categories.map((c) => ({ id: c.id, kind: c.kind as "use" | "model", name: c.name }))}
        initial={{
          slug: t.id,
          name: t.name,
          description: t.description,
          status: templateStatus(t.status),
          sortOrder: t.sortOrder,
          backgroundUrl: t.backgroundKey ? `/api/templates/${encodeURIComponent(t.id)}/background?v=${encodeURIComponent(t.backgroundKey.slice("templates/".length, -4))}` : null,
          categoryIds: t.categories.map((c) => c.id),
          source: t.source === "svg" ? "svg" : "builtin",
          dieline: g?.full ?? g?.dieline ?? null,
          excluded: g?.excluded ?? [],
          roles: g?.roles ?? {},
          options: g?.options ?? { unit: "px", scale: 1, pxPerInch: 96 },
          fold: g?.fold ?? null,
          referenceStyles: g?.referenceStyles ?? [],
          material,
          view: readViewSettings(t.viewSettings),
          windows: readTemplateWindows(t.windows),
        }}
      />
    </div>
  );
}
