"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { FoldSetup, WindowSpec } from "@packaging/dieline-engine";
import { getPreset } from "@packaging/dieline-engine";
import type { FlatDielineData } from "@packaging/svg-import";
import { readViewSettings, viewSettingsSchema, type ViewSettings } from "@/lib/view-settings";
import { readTemplateWindows } from "@/lib/template-windows";
import { db } from "@/server/db";
import { requireSuperAdmin } from "@/server/admin";
import { loadImportedSource } from "@/server/imported-templates";
import type { ActionResult } from "./template-category-actions";

const slugParam = z.string().min(2).max(80);

/** Save (or clear, with null) the camera and fold amount the 3D preview of a template starts with. */
export async function saveTemplateView(slug: string, view: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const s = slugParam.safeParse(slug);
  if (!s.success) return { ok: false, message: "Invalid request." };
  let value: ViewSettings | null = null;
  if (view !== null) {
    const p = viewSettingsSchema.safeParse(view);
    if (!p.success) return { ok: false, message: "That view is not valid." };
    value = p.data;
  }
  const t = await db.template.findUnique({ where: { id: s.data }, select: { source: true, hasFold: true } });
  if (!t) return { ok: false, message: "Template not found." };
  if (t.source === "svg" && !t.hasFold) return { ok: false, message: "Set up the 3D fold of this template first." };
  await db.template.update({ where: { id: s.data }, data: { viewSettings: value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue) } });
  revalidatePath("/templates");
  revalidatePath(`/template/dieline/${s.data}`);
  revalidatePath("/doraadmin/templates");
  return { ok: true, message: value ? "Starting 3D view saved." : "Starting 3D view cleared." };
}

export type TemplateViewData =
  | { kind: "builtin"; generatorId: string; params: Record<string, unknown>; view: ViewSettings | null; productImage: string | null; windows: WindowSpec[] }
  | { kind: "imported"; templateId: string; flat: FlatDielineData; fold: FoldSetup; view: ViewSettings | null; productImage: string | null; windows: WindowSpec[] };

/** What the 3D view editor needs for one template (loaded when the editor opens). */
export async function loadTemplateViewData(slug: string): Promise<{ ok: true; data: TemplateViewData } | { ok: false; message: string }> {
  await requireSuperAdmin();
  const s = slugParam.safeParse(slug);
  if (!s.success) return { ok: false, message: "Invalid request." };
  const row = await db.template.findUnique({ where: { id: s.data }, select: { source: true, viewSettings: true, productImageKey: true, defaultThickness: true, windows: true } });
  if (!row) return { ok: false, message: "Template not found." };
  const productImage = row.productImageKey ? `/api/templates/${s.data}/product-image?v=${row.productImageKey.slice("templates/".length, -4)}` : null;
  if (row.source === "svg") {
    const src = await loadImportedSource(s.data);
    if (!src) return { ok: false, message: "Template not found." };
    if (!src.fold) return { ok: false, message: "This template has no 3D fold yet. Set it up first." };
    return { ok: true, data: { kind: "imported", templateId: src.templateId, flat: src.flat, fold: src.fold, view: readViewSettings(row.viewSettings), productImage, windows: readTemplateWindows(row.windows) } };
  }
  const preset = getPreset(s.data);
  if (!preset) return { ok: false, message: "Template not found." };
  return { ok: true, data: { kind: "builtin", generatorId: preset.generatorId, params: { ...preset.defaults, ...(row.defaultThickness ? { thickness: row.defaultThickness } : {}) }, view: readViewSettings(row.viewSettings), productImage, windows: readTemplateWindows(row.windows) } };
}
