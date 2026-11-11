import "server-only";
import { db } from "./db";
import { projectThumbnail } from "@/lib/dieline-preview";
import { parseProjectDoc } from "@packaging/schema";

/** Most categories and tags one customer may keep (the lists stay usable, and storage stays bounded). */
export const MAX_CATEGORIES = 50;
export const MAX_TAGS = 100;

export interface MyTemplateRow {
  id: string;
  name: string;
  templateName: string;
  updatedAt: string;
  thumbnail: string | null;
  categoryId: string | null;
  tagIds: string[];
}
export interface MyLabel {
  id: string;
  name: string;
  count: number;
}
export interface MyDashboard {
  templates: MyTemplateRow[];
  /** Every template of the customer, before filtering. */
  total: number;
  uncategorised: number;
  categories: MyLabel[];
  tags: MyLabel[];
}

export interface DashboardFilter {
  q: string;
  /** A category id, "none" for templates without one, or "" for all. */
  cat: string;
  tag: string;
}

/** The customer's own templates (projects) with their categories and tags. Always scoped to `userId`. */
export async function loadMyDashboard(userId: string, f: DashboardFilter): Promise<MyDashboard> {
  const where = {
    userId,
    ...(f.cat === "none" ? { categoryId: null } : f.cat ? { categoryId: f.cat } : {}),
    ...(f.tag ? { tags: { some: { tagId: f.tag } } } : {}),
    ...(f.q ? { name: { contains: f.q, mode: "insensitive" as const } } : {}),
  };
  const [rows, total, uncategorised, categories, tags] = await Promise.all([
    db.project.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        projectData: true,
        updatedAt: true,
        categoryId: true,
        template: { select: { name: true, source: true, thumbnail: true } },
        tags: { select: { tagId: true } },
      },
    }),
    db.project.count({ where: { userId } }),
    db.project.count({ where: { userId, categoryId: null } }),
    db.userCategory.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { projects: true } } } }),
    db.userTag.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { projects: true } } } }),
  ]);
  return {
    templates: rows.map((r) => {
      let thumbnail: string | null = null;
      try {
        const doc = parseProjectDoc(r.projectData);
        thumbnail = projectThumbnail(r.template, doc.template.generatorId, doc.template.params);
      } catch {
        // a project file from a newer version: no preview
      }
      return { id: r.id, name: r.name, templateName: r.template.name, updatedAt: r.updatedAt.toISOString().slice(0, 10), thumbnail, categoryId: r.categoryId, tagIds: r.tags.map((t) => t.tagId) };
    }),
    total,
    uncategorised,
    categories: categories.map((c) => ({ id: c.id, name: c.name, count: c._count.projects })),
    tags: tags.map((t) => ({ id: t.id, name: t.name, count: t._count.projects })),
  };
}
