import Link from "next/link";
import { notFound } from "next/navigation";
import type { ImportedDieline, Role } from "@packaging/svg-import";
import { TemplateWizard } from "@/components/templates-admin/template-wizard";
import { db } from "@/server/db";
import { requireSuperAdmin } from "@/server/admin";

export const metadata = { title: "Edit template" };

export default async function EditTemplatePage({ params }: PageProps<"/doraadmin/templates/[slug]/edit">) {
  await requireSuperAdmin();
  const { slug } = await params;
  if (slug.length > 80) notFound();
  const [t, categories] = await Promise.all([
    db.template.findUnique({ where: { id: slug }, select: { id: true, name: true, description: true, published: true, sortOrder: true, backgroundKey: true, source: true, geometry: true, categories: { select: { id: true } } } }),
    db.templateCategory.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }], select: { id: true, kind: true, name: true } }),
  ]);
  if (!t) notFound();
  const g = t.source === "svg" ? (t.geometry as unknown as { dieline: ImportedDieline; roles: Record<string, Role>; options: { unit: "auto" | "mm" | "cm" | "in" | "pt" | "px"; scale: number; pxPerInch: number } } | null) : null;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/doraadmin/templates" className="text-sm text-muted-foreground hover:underline">← Templates</Link>
        <h1 className="text-2xl font-semibold">Edit {t.name}</h1>
        {t.source === "builtin" ? <p className="text-sm text-muted-foreground">Built-in parametric template: you can change its name, description, categories, order, background image and visibility. Its shape comes from the dieline generator in code.</p> : null}
      </div>
      <TemplateWizard
        mode="edit"
        categories={categories.map((c) => ({ id: c.id, kind: c.kind as "use" | "model", name: c.name }))}
        initial={{
          slug: t.id,
          name: t.name,
          description: t.description,
          published: t.published,
          sortOrder: t.sortOrder,
          backgroundUrl: t.backgroundKey ? `/api/templates/${encodeURIComponent(t.id)}/background?v=${encodeURIComponent(t.backgroundKey.slice("templates/".length, -4))}` : null,
          categoryIds: t.categories.map((c) => c.id),
          source: t.source === "svg" ? "svg" : "builtin",
          dieline: g?.dieline ?? null,
          roles: g?.roles ?? {},
          options: g?.options ?? { unit: "auto", scale: 1, pxPerInch: 96 },
        }}
      />
    </div>
  );
}
