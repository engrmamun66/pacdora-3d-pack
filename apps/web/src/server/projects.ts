import "server-only";
import { db } from "./db";
import { parseProjectDoc, type ProjectDoc } from "@packaging/schema";

/** Projects of one user, newest first. Always scoped by userId. */
export async function listProjects(userId: string) {
  const rows = await db.project.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, templateId: true, projectData: true, updatedAt: true, template: { select: { name: true, source: true, thumbnail: true } } },
    take: 200,
  });
  return rows.map((r) => ({ ...r, doc: safeDoc(r.projectData) }));
}

/** One project if it belongs to the user, otherwise null (never leaks other users' data). */
export async function getProject(userId: string, id: string) {
  const row = await db.project.findFirst({ where: { id, userId }, include: { template: { select: { viewSettings: true } } } });
  if (!row) return null;
  return { ...row, doc: safeDoc(row.projectData) };
}

/** What "Save as" offers: the customer's own categories and tags, and (for a saved project) the ones it has now. */
export interface SaveAsOptions {
  categories: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  /** Preselected: the open project's category / tags (empty for a template page). */
  categoryId: string | null;
  tagIds: string[];
}

export async function getSaveAsOptions(userId: string, projectId?: string): Promise<SaveAsOptions> {
  const [categories, tags, project] = await Promise.all([
    db.userCategory.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.userTag.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    projectId ? db.project.findFirst({ where: { id: projectId, userId }, select: { categoryId: true, tags: { select: { tagId: true } } } }) : null,
  ]);
  return { categories, tags, categoryId: project?.categoryId ?? null, tagIds: project?.tags.map((t) => t.tagId) ?? [] };
}

function safeDoc(data: unknown): ProjectDoc | null {
  try {
    return parseProjectDoc(data);
  } catch {
    return null;
  }
}
