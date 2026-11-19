import { isBackgroundCategory } from "@/lib/artwork-meta";
import { readLayoutSpec, type LayoutItem } from "@/lib/scene-layout";
import { SAMPLE_BOXES, SAMPLE_STYLES } from "@/lib/sample-boxes";
import { db } from "@/server/db";

/** Where a layout's icon is served (public: it is on the shared pages). The short version changes when the icon does, so it is fetched again. */
export const layoutIconUrl = (id: string, key: string) => `/api/portal/layout-icons/${id}?v=${key.replace(/^layouts\//, "").slice(0, 8)}`;

/** The template layouts in the order the admin set. Damaged rows are left out. `activeOnly` = what customers see. */
export async function listLayouts(activeOnly: boolean): Promise<LayoutItem[]> {
  const rows = await db.templateLayout.findMany({
    where: activeOnly ? { active: true } : {},
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, active: true, spec: true, iconKey: true },
  });
  return rows.flatMap((r) => {
    const spec = readLayoutSpec(r.spec);
    return spec ? [{ id: r.id, name: r.name, active: r.active, spec, iconUrl: r.iconKey ? layoutIconUrl(r.id, r.iconKey) : null }] : [];
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

const ICON_BOX_KEY = "layout-icon-box";

/** The sample box and the colour style all layout icons (and the admin preview) are drawn with. Each falls back to the first one. */
export async function getIconSettings(): Promise<{ box: string; style: string }> {
  const row = await db.siteSetting.findUnique({ where: { key: ICON_BOX_KEY }, select: { value: true } });
  const v = (row?.value ?? {}) as { id?: unknown; style?: unknown };
  return {
    box: typeof v.id === "string" && SAMPLE_BOXES.some((b) => b.id === v.id) ? v.id : SAMPLE_BOXES[0]!.id,
    style: typeof v.style === "string" && SAMPLE_STYLES.some((x) => x.id === v.style) ? v.style : SAMPLE_STYLES[0]!.id,
  };
}

/** Save the box and/or the style (the one not given is kept). */
export async function saveIconSettings(patch: { box?: string; style?: string }, adminId: string): Promise<void> {
  const now = await getIconSettings();
  const value = { id: patch.box ?? now.box, style: patch.style ?? now.style };
  await db.siteSetting.upsert({ where: { key: ICON_BOX_KEY }, create: { key: ICON_BOX_KEY, value, updatedById: adminId }, update: { value, updatedById: adminId } });
}
