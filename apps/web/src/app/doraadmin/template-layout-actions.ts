"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { STARTER_LAYOUTS, layoutSpecSchema } from "@/lib/scene-layout";
import { SAMPLE_BOXES, SAMPLE_STYLES } from "@/lib/sample-boxes";
import { saveIconSettings } from "@/server/layouts";
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
export async function createLayout(input: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const p = saveSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]!.message };
  if ((await db.templateLayout.count()) >= MAX_LAYOUTS) return { ok: false, message: `At most ${MAX_LAYOUTS} layouts.` };
  const last = await db.templateLayout.aggregate({ _max: { sortOrder: true } });
  await db.templateLayout.create({ data: { name: p.data.name, active: p.data.active, spec: p.data.spec, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  refresh();
  return { ok: true, message: "Layout added." };
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
  const p = z.string().refine((v) => SAMPLE_STYLES.some((x) => x.id === v)).safeParse(id);
  if (!p.success) return { ok: false, message: "Unknown style." };
  await saveIconSettings({ style: p.data }, admin.id);
  refresh();
  return { ok: true, message: "Icon style saved." };
}
