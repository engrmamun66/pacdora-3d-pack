"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { STARTER_LAYOUTS, layoutSpecSchema } from "@/lib/scene-layout";
import { SAMPLE_BOXES, SAMPLE_STYLES, designIdOf, isDesignStyle } from "@/lib/sample-boxes";
import { saveIconSettings } from "@/server/layouts";
import { createDesignProject, loadDesignLook } from "@/server/layout-designs";
import { randomUUID } from "node:crypto";
import { sniffImage } from "@/lib/image-sniff";
import { storage } from "@/server/storage";
import { db } from "@/server/db";
import { requireSuperAdmin } from "@/server/admin";
import type { ActionResult } from "./template-category-actions";

const MAX_LAYOUTS = 40;
const idParam = z.string().min(1).max(60);
const nameSchema = z.string().trim().min(2, "Name must be at least 2 characters.").max(40, "Name is too long (40 characters max).");
const saveSchema = z.object({ name: nameSchema, active: z.boolean(), spec: layoutSpecSchema });

function refresh() {
  revalidatePath("/doraadmin/template-layouts");
}

/** Add a layout at the end of the list. */
export async function createLayout(input: unknown): Promise<ActionResult & { id?: string }> {
  await requireSuperAdmin();
  const p = saveSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]!.message };
  if ((await db.templateLayout.count()) >= MAX_LAYOUTS) return { ok: false, message: `At most ${MAX_LAYOUTS} layouts.` };
  const last = await db.templateLayout.aggregate({ _max: { sortOrder: true } });
  const row = await db.templateLayout.create({ data: { name: p.data.name, active: p.data.active, spec: p.data.spec, sortOrder: (last._max.sortOrder ?? 0) + 1 }, select: { id: true } });
  refresh();
  return { ok: true, message: "Layout added.", id: row.id };
}

/** Change the name, the settings or the on/off switch of a layout. */
export async function updateLayout(input: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const p = saveSchema.extend({ id: idParam }).safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]!.message };
  const r = await db.templateLayout.updateMany({ where: { id: p.data.id }, data: { name: p.data.name, active: p.data.active, spec: p.data.spec } });
  if (r.count === 0) return { ok: false, message: "Layout not found." };
  refresh();
  return { ok: true, message: "Layout saved." };
}

export async function deleteLayout(id: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const p = idParam.safeParse(id);
  if (!p.success) return { ok: false, message: "Invalid request." };
  const old = await db.templateLayout.findUnique({ where: { id: p.data }, select: { iconKey: true } });
  const r = await db.templateLayout.deleteMany({ where: { id: p.data } });
  if (r.count === 0) return { ok: false, message: "Layout not found." };
  if (old?.iconKey) await storage.delete(old.iconKey).catch(() => undefined);
  refresh();
  return { ok: true, message: "Layout deleted." };
}

/** Move a layout one place up or down (the order is the order of the Sample tabs). */
export async function moveLayout(id: unknown, direction: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const p = idParam.safeParse(id);
  const d = z.enum(["up", "down"]).safeParse(direction);
  if (!p.success || !d.success) return { ok: false, message: "Invalid request." };
  const rows = await db.templateLayout.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
  const at = rows.findIndex((r) => r.id === p.data);
  const to = d.data === "up" ? at - 1 : at + 1;
  if (at < 0 || to < 0 || to >= rows.length) return { ok: true, message: "Moved." };
  const order = rows.map((r) => r.id);
  [order[at], order[to]] = [order[to]!, order[at]!];
  // Renumber the whole list, so equal numbers never leave the order undecided.
  await db.$transaction(order.map((rowId, i) => db.templateLayout.update({ where: { id: rowId }, data: { sortOrder: i + 1 } })));
  refresh();
  return { ok: true, message: "Moved." };
}

/** Fill an empty list with a starting set of layouts. Does nothing when there are layouts already. */
export async function addStarterLayouts(): Promise<ActionResult> {
  await requireSuperAdmin();
  if ((await db.templateLayout.count()) > 0) return { ok: false, message: "There are layouts already." };
  await db.templateLayout.createMany({ data: STARTER_LAYOUTS.map((l, i) => ({ name: l.name, spec: l.spec, sortOrder: i + 1 })) });
  refresh();
  return { ok: true, message: "Starter layouts added." };
}

const MAX_ICON_BYTES = 300 * 1024;

/** Keep a small 3D picture (a PNG data URL taken from the preview) as the icon of a layout. */
export async function setLayoutIcon(id: unknown, dataUrl: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const p = idParam.safeParse(id);
  const m = typeof dataUrl === "string" && dataUrl.length < MAX_ICON_BYTES * 1.4 ? /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl) : null;
  if (!p.success || !m) return { ok: false, message: "Could not read the picture." };
  const bytes = new Uint8Array(Buffer.from(m[1]!, "base64"));
  if (bytes.length === 0 || bytes.length > MAX_ICON_BYTES || sniffImage(bytes)?.mime !== "image/png") return { ok: false, message: "The picture is not a small PNG." };
  const row = await db.templateLayout.findUnique({ where: { id: p.data }, select: { iconKey: true } });
  if (!row) return { ok: false, message: "Save the layout first, then set its icon." };
  const key = `layouts/${randomUUID()}.png`;
  await storage.put(key, bytes);
  await db.templateLayout.update({ where: { id: p.data }, data: { iconKey: key } });
  if (row.iconKey) await storage.delete(row.iconKey).catch(() => undefined);
  refresh();
  return { ok: true, message: "Icon saved." };
}

/** Remove the icon of a layout. */
export async function clearLayoutIcon(id: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const p = idParam.safeParse(id);
  if (!p.success) return { ok: false, message: "Invalid request." };
  const row = await db.templateLayout.findUnique({ where: { id: p.data }, select: { iconKey: true } });
  if (!row) return { ok: false, message: "Layout not found." };
  await db.templateLayout.update({ where: { id: p.data }, data: { iconKey: null } });
  if (row.iconKey) await storage.delete(row.iconKey).catch(() => undefined);
  refresh();
  return { ok: true, message: "Icon removed." };
}

/** Choose the sample box the layout icons are drawn with (the page then redraws the saved icons with it). */
export async function setIconBox(id: unknown): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  const p = z.string().refine((v) => SAMPLE_BOXES.some((b) => b.id === v)).safeParse(id);
  if (!p.success) return { ok: false, message: "Unknown box." };
  await saveIconSettings({ box: p.data }, admin.id);
  refresh();
  return { ok: true, message: "Icon box saved." };
}

/** Choose the colour style the sample box is dressed in (the page then redraws the saved icons with it). */
export async function setIconStyle(id: unknown): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  if (typeof id !== "string" || id.length > 80) return { ok: false, message: "Unknown style." };
  const known = SAMPLE_STYLES.some((x) => x.id === id) || (isDesignStyle(id) && (await db.layoutDesign.count({ where: { id: designIdOf(id) } })) > 0);
  if (!known) return { ok: false, message: "Unknown style." };
  await saveIconSettings({ style: id }, admin.id);
  refresh();
  return { ok: true, message: "Icon style saved." };
}

const MAX_DESIGNS = 30;
const designName = z.string().trim().min(1, "Give the design a name.").max(40, "The name is too long (40 characters max).");

/** Start a design on a sample box: its project is made, and the page opens the online design editor on it. */
export async function createLayoutDesign(input: unknown): Promise<ActionResult & { id?: string; projectId?: string }> {
  const admin = await requireSuperAdmin();
  const p = z.object({ name: designName, boxId: z.string().refine((v) => SAMPLE_BOXES.some((b) => b.id === v)) }).safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]!.message };
  if ((await db.layoutDesign.count()) >= MAX_DESIGNS) return { ok: false, message: `At most ${MAX_DESIGNS} designs.` };
  const made = await createDesignProject(admin.id, p.data.name, p.data.boxId);
  if ("error" in made) return { ok: false, message: made.error };
  const last = await db.layoutDesign.aggregate({ _max: { sortOrder: true } });
  const row = await db.layoutDesign.create({ data: { name: p.data.name, boxId: p.data.boxId, projectId: made.projectId, sortOrder: (last._max.sortOrder ?? 0) + 1 }, select: { id: true } });
  refresh();
  return { ok: true, message: "Design added.", id: row.id, projectId: made.projectId };
}

export async function renameLayoutDesign(input: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const p = z.object({ id: idParam, name: designName }).safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]!.message };
  const r = await db.layoutDesign.updateMany({ where: { id: p.data.id }, data: { name: p.data.name } });
  if (r.count === 0) return { ok: false, message: "Design not found." };
  refresh();
  return { ok: true, message: "Design saved." };
}

/** Delete a design and its project (not the one the icons are drawn with now: choose another style first). */
export async function deleteLayoutDesign(id: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const p = idParam.safeParse(id);
  if (!p.success) return { ok: false, message: "Invalid request." };
  const row = await db.layoutDesign.findUnique({ where: { id: p.data }, select: { projectId: true } });
  if (!row) return { ok: false, message: "Design not found." };
  const setting = await db.siteSetting.findUnique({ where: { key: "layout-icon-box" }, select: { value: true } });
  if ((setting?.value as { style?: unknown } | null)?.style === `design:${p.data}`) return { ok: false, message: "The icons are drawn with this design now. Choose another style first." };
  await db.project.delete({ where: { id: row.projectId } }); // the design goes with it
  refresh();
  return { ok: true, message: "Design deleted." };
}

/** What the sample box is dressed in for a design (its artwork and colours), for the browser to paint the box texture. */
export async function getLayoutDesignLook(id: unknown) {
  await requireSuperAdmin();
  const p = idParam.safeParse(id);
  return p.success ? loadDesignLook(p.data) : null;
}

/** Put the layouts in this order (the order of the Sample tabs). `ids` must be all the layouts, each once. */
export async function reorderLayouts(ids: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const p = z.array(idParam).max(MAX_LAYOUTS).safeParse(ids);
  if (!p.success) return { ok: false, message: "Invalid request." };
  const rows = await db.templateLayout.findMany({ select: { id: true } });
  if (rows.length !== p.data.length || new Set(p.data).size !== p.data.length || !rows.every((r) => p.data.includes(r.id))) return { ok: false, message: "The list changed. Reload the page and try again." };
  await db.$transaction(p.data.map((rowId, i) => db.templateLayout.update({ where: { id: rowId }, data: { sortOrder: i + 1 } })));
  refresh();
  return { ok: true, message: "Order saved." };
}
