import { NewTemplate } from "@/components/templates-admin/new-template";
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
      <NewTemplate
        svgColors={svgColors}
        categories={categories.map((c) => ({ id: c.id, kind: c.kind as "use" | "model", name: c.name }))}
        initial={{ slug: "", name: "", description: "", status: "draft", sortOrder: 0, backgroundUrl: null, categoryIds: [], source: null, dieline: null, excluded: [], roles: {}, options: { unit: "px", scale: 1, pxPerInch: 96 }, fold: null, referenceStyles: [], material: null, view: null, windows: [] }}
      />
    </div>
  );
}

/** Reads the signed-in session, so it cannot be part of a static shell. */
export const instant = false;
