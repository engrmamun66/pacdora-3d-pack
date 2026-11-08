import "server-only";
import { db } from "./db";
import { parseProjectDoc, type ProjectDoc } from "@packaging/schema";

/** Projects of one user, newest first. Always scoped by userId. */
export async function listProjects(userId: string) {
  const rows = await db.project.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, templateId: true, projectData: true, updatedAt: true },
    take: 200,
  });
  return rows.map((r) => ({ ...r, doc: safeDoc(r.projectData) }));
}

/** One project if it belongs to the user, otherwise null (never leaks other users' data). */
export async function getProject(userId: string, id: string) {
  const row = await db.project.findFirst({ where: { id, userId } });
  if (!row) return null;
  return { ...row, doc: safeDoc(row.projectData) };
}

function safeDoc(data: unknown): ProjectDoc | null {
  try {
    return parseProjectDoc(data);
  } catch {
    return null;
  }
}
