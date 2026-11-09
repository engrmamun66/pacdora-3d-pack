import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "./db";
import { svgDataUrl, tryThumbnail } from "@/lib/dieline-preview";

export const TEMPLATES_TAG = "templates";

export interface PublicCategory {
  /** "use:gift-boxes" style key, unique across both groups. */
  key: string;
  kind: "use" | "model";
  slug: string;
  name: string;
  count: number;
}
export interface PublicTemplate {
  id: string;
  name: string;
  description: string;
  source: "builtin" | "svg";
  thumbnail: string | null;
  categoryKeys: string[];
}

/** Published templates and visible categories for the browse page. Cached; admin edits refresh it at once. */
export async function getPublicCatalogue(): Promise<{ templates: PublicTemplate[]; categories: PublicCategory[] }> {
  "use cache";
  cacheTag(TEMPLATES_TAG);
  cacheLife({ stale: 30, revalidate: 60, expire: 3600 });
  try {
    const [rows, cats] = await Promise.all([
      db.template.findMany({
        where: { published: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true, name: true, description: true, source: true, generatorId: true, defaultParameters: true, thumbnail: true,
          categories: { where: { active: true }, select: { kind: true, slug: true } },
        },
      }),
      db.templateCategory.findMany({ where: { active: true }, orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }], select: { kind: true, slug: true, name: true } }),
    ]);
    const templates: PublicTemplate[] = rows.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      source: t.source === "svg" ? "svg" : "builtin",
      thumbnail: t.source === "svg" ? (t.thumbnail ? svgDataUrl(t.thumbnail) : null) : tryThumbnail(t.generatorId, t.defaultParameters),
      categoryKeys: t.categories.map((c) => `${c.kind}:${c.slug}`),
    }));
    const categories: PublicCategory[] = cats
      .map((c) => {
        const key = `${c.kind}:${c.slug}`;
        return { key, kind: c.kind as "use" | "model", slug: c.slug, name: c.name, count: templates.filter((t) => t.categoryKeys.includes(key)).length };
      })
      .filter((c) => c.count > 0); // empty categories stay out of the public filter
    return { templates, categories };
  } catch {
    return { templates: [], categories: [] };
  }
}
