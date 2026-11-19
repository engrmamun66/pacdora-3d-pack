import { isBackgroundCategory } from "@/lib/artwork-meta";
import { readLayoutSpec, type LayoutItem } from "@/lib/scene-layout";
import { db } from "@/server/db";

/** The template layouts in the order the admin set. Damaged rows are left out. `activeOnly` = what customers see. */
export async function listLayouts(activeOnly: boolean): Promise<LayoutItem[]> {
  const rows = await db.templateLayout.findMany({
    where: activeOnly ? { active: true } : {},
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, active: true, spec: true },
  });
  return rows.flatMap((r) => {
    const spec = readLayoutSpec(r.spec);
    return spec ? [{ id: r.id, name: r.name, active: r.active, spec }] : [];
  });
}

/** A background picture the admin chose to feature on the shared template pages. */
export interface FeaturedBackground {
  id: string;
  name: string;
}

/** The featured background pictures (newest first). */
export async function listFeaturedBackgrounds(): Promise<FeaturedBackground[]> {
  const rows = await db.artworkItem.findMany({ where: { featured: true }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, name: true, category: true } });
  return rows.filter((r) => isBackgroundCategory(r.category)).map((r) => ({ id: r.id, name: r.name }));
}
