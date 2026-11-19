"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireSuperAdmin } from "@/server/admin";
import { storage } from "@/server/storage";
import type { ActionResult } from "./template-category-actions";

const idParam = z.string().min(1).max(60);
const nameParam = z.string().trim().min(1, "Name is required.").max(100, "Name is too long (100 characters max).");

function refresh() {
  revalidatePath("/doraadmin/users/templates");
}

/** Rename a client's project (super admin). */
export async function renameClientProject(id: unknown, name: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const i = idParam.safeParse(id);
  const n = nameParam.safeParse(name);
  if (!i.success) return { ok: false, message: "Invalid request." };
  if (!n.success) return { ok: false, message: n.error.issues[0]!.message };
  const r = await db.project.updateMany({ where: { id: i.data }, data: { name: n.data } });
  if (r.count === 0) return { ok: false, message: "Project not found." };
  refresh();
  return { ok: true, message: "Project renamed." };
}

/**
 * Delete a client's project (super admin): its 3D pictures, share links and tags go with it.
 * Order lines keep their text (the link to the project is cleared); the client's uploads stay in their library.
 */
export async function deleteClientProject(id: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const i = idParam.safeParse(id);
  if (!i.success) return { ok: false, message: "Invalid request." };
  const pictures = await db.projectCapture.findMany({ where: { projectId: i.data }, select: { storageKey: true } });
  const r = await db.project.deleteMany({ where: { id: i.data } });
  if (r.count === 0) return { ok: false, message: "Project not found." };
  for (const p of pictures) await storage.delete(p.storageKey).catch(() => undefined);
  refresh();
  return { ok: true, message: "Project deleted." };
}
