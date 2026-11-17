"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";
import { ensureLinks } from "@/server/portal";
import { setOrderStatus } from "@/server/orders";
import { templateHash } from "@/server/share-hash";
import { isOrderStatus } from "@/lib/order-status";

export type ActionResult = { ok: true } | { ok: false; message: string };

/** Change the status of one of the signed-in Client's orders. */
export async function updateOrderStatus(orderId: string, status: string): Promise<ActionResult> {
  const user = await requireUser();
  if (typeof orderId !== "string" || orderId.length > 40 || !isOrderStatus(status)) return { ok: false, message: "That status is not valid." };
  if (!(await setOrderStatus(user.id, orderId, status))) return { ok: false, message: "Order not found." };
  revalidatePath("/my-dashboard", "layout");
  return { ok: true };
}

/** Switch a share link (all / category / tag) on or off. The address stays the same either way. */
export async function setLinkActive(linkId: string, active: boolean): Promise<ActionResult> {
  const user = await requireUser();
  if (typeof linkId !== "string" || linkId.length > 40 || typeof active !== "boolean") return { ok: false, message: "Invalid request." };
  const r = await db.shareLink.updateMany({ where: { id: linkId, userId: user.id }, data: { active } });
  if (r.count !== 1) return { ok: false, message: "Link not found." };
  revalidatePath("/my-dashboard", "layout");
  return { ok: true };
}

/** Switch one template on or off in every shared page (a template link row is kept only to remember "off" / "on"). */
export async function setTemplateShared(projectId: string, shared: boolean): Promise<ActionResult> {
  const user = await requireUser();
  if (typeof projectId !== "string" || projectId.length > 40 || typeof shared !== "boolean") return { ok: false, message: "Invalid request." };
  const project = await db.project.findFirst({ where: { id: projectId, userId: user.id }, select: { id: true } });
  if (!project) return { ok: false, message: "Template not found." };
  await db.shareLink.upsert({
    where: { userId_scope_targetId: { userId: user.id, scope: "template", targetId: project.id } },
    create: { userId: user.id, scope: "template", targetId: project.id, projectId: project.id, hash: templateHash(project.id), active: shared },
    update: { active: shared },
  });
  revalidatePath("/my-dashboard", "layout");
  return { ok: true };
}

/** Make sure every category and tag has its link (called when the Share tab opens). */
export async function ensureMyLinks(): Promise<void> {
  const user = await requireUser();
  await ensureLinks(user.id);
}
