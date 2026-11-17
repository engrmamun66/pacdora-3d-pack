import "server-only";
import { db } from "./db";
import { projectThumbnail } from "@/lib/dieline-preview";
import { parseProjectDoc } from "@packaging/schema";
import { ensureLinks } from "./portal";
import { templateHash } from "./share-hash";
import { portalHome, portalTemplate } from "@/lib/portal-paths";

/** Most categories and tags one customer may keep (the lists stay usable, and storage stays bounded). */
export const MAX_CATEGORIES = 50;
export const MAX_TAGS = 100;

export interface MyTemplateRow {
  id: string;
  name: string;
  templateName: string;
  updatedAt: string;
  /** For sorting. */
  updatedMs: number;
  thumbnail: string | null;
  categoryId: string | null;
  tagIds: string[];
  /** The public address of this template (a path) and whether it is switched on. */
  share: ShareInfo;
}
/** A public link: its path (add the site address in front) and whether the Client has it switched on. */
export interface ShareInfo {
  path: string;
  active: boolean;
}
export interface MyLabel {
  id: string;
  name: string;
}
export interface MyDashboard {
  templates: MyTemplateRow[];
  /** How many templates the customer has in all (may be more than are listed). */
  total: number;
  categories: MyLabel[];
  tags: MyLabel[];
  /** Share links of everything: all templates, each category, each tag. */
  share: { all: ShareInfo; categories: Record<string, ShareInfo>; tags: Record<string, ShareInfo> };
}

/** The customer's own templates (projects) with their categories and tags. Always scoped to `userId`. The page filters and sorts them in the browser, so this loads the latest MAX_LISTED. */
export const MAX_LISTED = 300;

export async function loadMyDashboard(userId: string): Promise<MyDashboard> {
  await ensureLinks(userId);
  const [rows, total, categories, tags, links, hidden] = await Promise.all([
    db.project.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: MAX_LISTED,
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
    db.userCategory.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.userTag.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.shareLink.findMany({ where: { userId, scope: { in: ["all", "category", "tag"] } }, select: { scope: true, targetId: true, hash: true, active: true } }),
    db.shareLink.findMany({ where: { userId, scope: "template", active: false }, select: { projectId: true } }),
  ]);
  const all = links.find((l) => l.scope === "all");
  const userHash = all?.hash ?? "";
  const off = new Set(hidden.flatMap((h) => (h.projectId ? [h.projectId] : [])));
  const info = (scope: string) => Object.fromEntries(links.filter((l) => l.scope === scope && l.targetId).map((l) => [l.targetId!, { path: portalHome(userHash, l.hash), active: l.active }]));
  return {
    templates: rows.map((r) => {
      let thumbnail: string | null = null;
      try {
        const doc = parseProjectDoc(r.projectData);
        thumbnail = projectThumbnail(r.template, doc.template.generatorId, doc.template.params);
      } catch {
        // a project file from a newer version: no preview
      }
      return { id: r.id, name: r.name, templateName: r.template.name, updatedAt: r.updatedAt.toISOString().slice(0, 10), updatedMs: r.updatedAt.getTime(), thumbnail, categoryId: r.categoryId, tagIds: r.tags.map((t) => t.tagId), share: { path: portalTemplate(userHash, null, templateHash(r.id)), active: !off.has(r.id) } };
    }),
    total,
    categories,
    tags,
    share: { all: { path: portalHome(userHash), active: all?.active ?? true }, categories: info("category"), tags: info("tag") },
  };
}
