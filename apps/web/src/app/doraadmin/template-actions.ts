"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { ImportedDielineError, applyWindows, assertImportable, createImportedGenerator, getGenerator, getPreset, importedDefaults, validateFoldSetup, type FlatDieline, type FoldSetup, type GeneratorDefinition, type WindowSpec } from "@packaging/dieline-engine";
import { SvgImportError, excludePaths, importSvg, toFlatDieline, type ImportedDieline, type Role } from "@packaging/svg-import";
import { MAX_SVG_CHARS, thumbnailSvg } from "@/lib/template-import";
import { isValidSlug } from "@/lib/slug";
import { templateWindowsSchema } from "@/lib/template-windows";
import { importedStartParams } from "@/server/imported-templates";
import { TEMPLATE_STATUS_VALUES, isPublicStatus, isTemplateStatus, templateStatusLabel } from "@/lib/template-status";
import { db } from "@/server/db";
import { requireSuperAdmin } from "@/server/admin";
import { storage } from "@/server/storage";
import { TEMPLATES_TAG } from "@/server/templates-public";
import type { ActionResult } from "./template-category-actions";

function refresh(slug?: string) {
  revalidatePath("/doraadmin/templates");
  revalidatePath("/doraadmin/template-categories");
  revalidatePath("/templates");
  updateTag(TEMPLATES_TAG);
  if (slug) revalidatePath(`/template/dieline/${slug}`);
}

const slugParam = z.string().min(2).max(80);

/** Move a template to another status. Only "published" shows it on the public site (`published` follows). */
export async function setTemplateStatus(slug: string, status: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const s = slugParam.safeParse(slug);
  if (!s.success || !isTemplateStatus(status)) return { ok: false, message: "Invalid request." };
  const r = await db.template.updateMany({ where: { id: s.data }, data: { status, published: isPublicStatus(status) } });
  if (r.count === 0) return { ok: false, message: "Template not found." };
  refresh(s.data);
  return { ok: true, message: isPublicStatus(status) ? "Template is now published." : `Status set to ${templateStatusLabel(status)}. Customers do not see it.` };
}

/**
 * Delete an imported (SVG) template. Built-in templates come from code and would
 * return on the next seed, so they can only be hidden. Templates that already
 * have customer projects are kept (hide them instead).
 */
export async function deleteTemplate(slug: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const s = slugParam.safeParse(slug);
  if (!s.success) return { ok: false, message: "Invalid request." };
  const t = await db.template.findUnique({ where: { id: s.data }, select: { source: true, backgroundKey: true, productImageKey: true, _count: { select: { projects: true } } } });
  if (!t) return { ok: false, message: "Template not found." };
  if (t.source !== "svg") return { ok: false, message: "Built-in templates cannot be deleted. Hide it instead." };
  if (t._count.projects > 0) return { ok: false, message: `${t._count.projects} customer project(s) use this template. Hide it instead of deleting.` };
  await db.template.delete({ where: { id: s.data } });
  if (t.backgroundKey) await storage.delete(t.backgroundKey).catch(() => undefined); // the picture goes with the template
  if (t.productImageKey) await storage.delete(t.productImageKey).catch(() => undefined);
  refresh(s.data);
  return { ok: true, message: "Template deleted." };
}

// ---------------------------------------------------------------- create / edit

const roleSchema = z.enum(["cut", "crease", "bleed", "guide", "ignore"]);

const saveSchema = z.object({
  mode: z.enum(["create", "edit"]),
  slug: z.string().trim().max(80),
  /** Edit only: the address the template has now (differs from `slug` when it is renamed). */
  originalSlug: z.string().trim().max(80).optional(),
  /** Position in lists, lowest first. */
  sortOrder: z.number().int().min(0).max(100000).default(0),
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(120, "Name is too long (120 characters max)."),
  description: z.string().trim().max(500, "Description is too long (500 characters max).").default(""),
  status: z.enum(TEMPLATE_STATUS_VALUES),
  categoryIds: z.array(z.string().min(1).max(60)).min(1, "Choose at least one category.").max(24),
  /** SVG text. Required when creating; when editing, send it only to replace the geometry. */
  svg: z.string().max(MAX_SVG_CHARS, "That SVG is too large (3 MB max).").optional(),
  unit: z.enum(["auto", "mm", "cm", "in", "pt", "px"]).default("auto"),
  scale: z.number().finite().min(0.001).max(1000).default(1),
  pxPerInch: z.number().finite().min(1).max(2400).default(96),
  roles: z.record(z.string().max(80), roleSchema).default({}),
  /** Clean-up step: ids of the paths left out of the dieline (see ImportedPath.id). */
  excluded: z.array(z.number().int().min(0).max(1_000_000)).max(200_000).default([]),
  /** How it folds in 3D (imported templates); null = flat only. Validated again here. */
  fold: z.unknown().optional(),
  /** Ignored line styles kept as an optional faint "Reference" picture on the dieline page. */
  referenceStyles: z.array(z.string().max(80)).max(60).default([]),
  /** Built-in templates: board thickness (mm) new projects start with. null = the template's own default. */
  defaultThickness: z.number().finite().positive().max(100).nullable().optional(),
  /** Window holes new projects start with. Absent = keep what the template has; [] = none. */
  windows: templateWindowsSchema.optional(),
});

/** The windows must all fit the dieline a new project starts with (the engine decides); returns the reason when one does not. */
function windowsProblem(gen: GeneratorDefinition, params: Record<string, unknown>, windows: readonly WindowSpec[]): string | null {
  if (windows.length === 0) return null;
  try {
    const r = applyWindows(gen.generate(params), windows);
    return r.problems.length === 0 ? null : `A window hole does not fit: ${r.problems[0]!.message}`;
  } catch {
    return "The window holes could not be checked against this dieline.";
  }
}

const windowsData = (w: readonly WindowSpec[] | undefined) => (w === undefined ? {} : { windows: w.length === 0 ? Prisma.DbNull : (w as unknown as Prisma.InputJsonValue) });

export type SaveTemplateResult = ActionResult & { slug?: string };

interface StoredGeometry {
  v: 1;
  dieline: ImportedDieline;
  /** Set when some parts were excluded in the clean-up step: the dieline as imported, before that. */
  full?: ImportedDieline;
  /** Ids of the excluded paths (they refer to `full`). */
  excluded?: number[];
  roles: Record<string, Role>;
  options: { unit: string; scale: number; pxPerInch: number };
  /** 3D fold setup, or null for flat only. */
  fold: FoldSetup | null;
  /** Style keys of ignored lines offered as a reference picture. */
  referenceStyles: string[];
}

const dimName = z.enum(["width", "depth", "height"]);
const sizeMm = z.number().finite().min(0.1).max(10000).optional();
/** Box settings of an imported template (see engine imported-construction.ts). */
const constructionSchema = z.object({
  sizeMode: z.enum(["manufacture", "inner"]).optional(),
  thickness: z.number().finite().min(0.05).max(5).optional(),
  allowanceFactor: z.number().finite().min(0).max(5).optional(),
  cutGapFactor: z.number().finite().min(0).max(5).optional(),
  names: z.object({ baseWidth: dimName.optional(), baseHeight: dimName.optional(), boxHeight: dimName.optional() }).optional(),
  start: z.object({ baseWidth: sizeMm, baseHeight: sizeMm, boxHeight: sizeMm, tuckDepth: sizeMm, glueFlapWidth: sizeMm, dustFlapDepth: sizeMm }).optional(),
  flaps: z.array(z.enum(["tuckDepth", "glueFlapWidth", "dustFlapDepth"])).max(3).optional(),
});

/** A distance or shift of an extra part, in mm. */
const partShift = z.number().finite().min(-5000).max(5000);

const foldSchema = z.object({
  rootId: z.string().min(1).max(40),
  construction: constructionSchema.optional(),
  /** The panel lying flat on the ground in 3D; absent = automatic. */
  groundId: z.string().min(1).max(40).optional(),
  parts: z
    .array(
      z.object({
        rootId: z.string().min(1).max(40),
        placement: z.object({
          mode: z.enum(["closed", "open", "beside", "inside", "auto"]),
          openDeg: z.number().finite().min(0).max(120).optional(),
          side: z.enum(["right", "left", "front", "back"]).optional(),
          gap: partShift.optional(),
          offset: z.object({ x: partShift.optional(), y: partShift.optional(), z: partShift.optional() }).optional(),
          relativeTo: z.string().min(1).max(40).optional(),
          hop: z.number().finite().min(0).max(5000).optional(),
          start: z.object({ from: z.enum(["right", "left", "front", "back"]).optional(), x: partShift.optional(), y: partShift.optional(), z: partShift.optional() }).optional(),
        }),
        name: z.string().trim().min(1).max(40).optional(),
        timing: z.enum(["together", "after"]).optional(),
        link: z.object({ mode: z.enum(["follow", "own", "fixed"]).optional(), swap: z.boolean().optional() }).optional(),
      }),
    )
    .max(8)
    .optional(),
  mainName: z.string().trim().min(1).max(40).optional(),
  panels: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        label: z.string().trim().min(1).max(40),
        role: z.enum(["body", "closure", "tuck", "dust-flap", "glue-flap", "bottom-flap", "lock-flap"]),
        printable: z.boolean(),
        polygon: z.array(z.number().finite().min(-100000).max(100000)).min(6).max(8000),
      }),
    )
    .min(1)
    .max(200),
  hinges: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        parentId: z.string().min(1).max(40),
        childId: z.string().min(1).max(40),
        line: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]),
        angleDeg: z.number().finite().min(-180).max(180),
        order: z.number().int().min(1).max(100),
      }),
    )
    .max(400),
});

const MAX_GEOMETRY_JSON = 6_000_000;

/** Merge the admin's choices over the heuristic suggestions; every style gets a role, and one must be Cut. */
function finalRoles(d: ImportedDieline, chosen: Record<string, Role>): Record<string, Role> | string {
  const roles: Record<string, Role> = {};
  for (const st of d.styles) roles[st.key] = chosen[st.key] ?? st.suggestedRole;
  if (!Object.values(roles).includes("cut")) return "Choose at least one line style as Cut.";
  return roles;
}

/**
 * Create or update a template. Everything the client sent is validated again;
 * the SVG is parsed here, on the server, so stored geometry never comes from the browser.
 */
export async function saveTemplate(input: unknown): Promise<SaveTemplateResult> {
  await requireSuperAdmin();
  const p = saveSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]!.message };
  const v = p.data;
  if (!isValidSlug(v.slug)) return { ok: false, message: "Slug may use lowercase letters, digits and single dashes (2 to 80 characters)." };

  const found = await db.templateCategory.findMany({ where: { id: { in: v.categoryIds } }, select: { id: true } });
  if (found.length !== new Set(v.categoryIds).size) return { ok: false, message: "One of the chosen categories no longer exists. Reload and try again." };
  const categories = found.map((c) => ({ id: c.id }));

  // The row being edited is found by its current address; a new address is only used when renaming.
  const current = v.mode === "edit" ? (v.originalSlug ?? v.slug) : v.slug;
  const existing = await db.template.findUnique({ where: { id: current }, select: { source: true, generatorId: true, geometry: true, defaultThickness: true, _count: { select: { projects: true } } } });

  // ---- Edit a built-in template: details, order, categories and visibility (its geometry and address come from code).
  if (v.mode === "edit" && existing?.source === "builtin") {
    if (v.slug !== current) return { ok: false, message: "A built-in template keeps its address." };
    // The default board must be one this template's generator accepts.
    if (v.defaultThickness !== undefined && v.defaultThickness !== null) {
      const t = getGenerator(existing.generatorId).params.find((q) => q.key === "thickness");
      if (!t || t.kind !== "number") return { ok: false, message: "This template has no board thickness to set." };
      if (v.defaultThickness < t.min || v.defaultThickness > t.max) return { ok: false, message: `Default thickness must be between ${t.min} and ${t.max} mm for this template.` };
    }
    if (v.windows !== undefined) {
      const preset = getPreset(current);
      if (!preset) return { ok: false, message: "Template not found." };
      const thickness = v.defaultThickness !== undefined ? v.defaultThickness : existing.defaultThickness;
      const bad = windowsProblem(getGenerator(preset.generatorId), { ...preset.defaults, ...(thickness ? { thickness } : {}) }, v.windows as WindowSpec[]);
      if (bad) return { ok: false, message: bad };
    }
    await db.template.update({
      where: { id: current },
      data: {
        name: v.name, description: v.description, status: v.status, published: isPublicStatus(v.status), sortOrder: v.sortOrder, categories: { set: categories },
        ...(v.defaultThickness !== undefined ? { defaultThickness: v.defaultThickness } : {}),
        ...windowsData(v.windows as WindowSpec[] | undefined),
      },
    });
    refresh(current);
    return { ok: true, message: "Template saved.", slug: current };
  }

  if (v.mode === "create" && existing) return { ok: false, message: "A template with that slug already exists. Choose another slug." };
  if (v.mode === "edit" && !existing) return { ok: false, message: "Template not found." };
  const renamed = v.mode === "edit" && v.slug !== current;
  if (renamed) {
    if (existing!._count.projects > 0) return { ok: false, message: "Customer projects use this template, so its address cannot change." };
    if (await db.template.findUnique({ where: { id: v.slug }, select: { id: true } })) return { ok: false, message: "A template with the new slug already exists. Choose another slug." };
  }

  // ---- Geometry: parse a new SVG, or keep what is stored.
  let base: ImportedDieline;
  let options: StoredGeometry["options"] = { unit: v.unit, scale: v.scale, pxPerInch: v.pxPerInch };
  if (v.svg) {
    try {
      base = importSvg(v.svg, { unit: v.unit, scale: v.scale, pxPerInch: v.pxPerInch });
    } catch (e) {
      if (e instanceof SvgImportError) return { ok: false, message: e.message };
      throw e;
    }
  } else if (v.mode === "edit" && existing?.geometry) {
    const g = existing.geometry as unknown as StoredGeometry;
    base = g.full ?? g.dieline;
    options = g.options;
  } else {
    return { ok: false, message: "Upload an SVG file first." };
  }
  // Clean-up step: parts the admin left out. Done here again so the stored geometry never comes from the browser.
  const excluded = [...new Set(v.excluded)].filter((id) => base.paths.some((p) => p.id === id)).sort((a, b) => a - b);
  let dieline: ImportedDieline;
  try {
    dieline = excludePaths(base, excluded);
  } catch (e) {
    if (e instanceof SvgImportError) return { ok: false, message: e.message };
    throw e;
  }

  const roles = finalRoles(dieline, v.roles);
  if (typeof roles === "string") return { ok: false, message: roles };
  // Customers get a resizable sheet from the Cut lines, so they must form a closed outline.
  try {
    assertImportable(toFlatDieline(dieline, roles) as FlatDieline);
  } catch (e) {
    if (e instanceof ImportedDielineError) return { ok: false, message: e.message };
    throw e;
  }

  // 3D fold: checked again here (shape, then the engine itself at the default, smallest and largest size).
  let fold: FoldSetup | null = null;
  if (v.fold !== undefined && v.fold !== null) {
    const f = foldSchema.safeParse(v.fold);
    if (!f.success) return { ok: false, message: "The 3D fold data is not valid. Detect the panels again." };
    const problems = validateFoldSetup(f.data);
    if (problems.length) return { ok: false, message: problems[0]! };
    try {
      const flat = toFlatDieline(dieline, roles) as FlatDieline;
      const gen = createImportedGenerator("check", flat, f.data);
      const width = gen.params.find((p) => p.key === "width");
      gen.generate(importedDefaults(flat));
      if (width && width.kind === "number") {
        gen.generate({ width: width.min });
        gen.generate({ width: width.max });
      }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "This 3D fold does not work." };
    }
    fold = f.data;
  }

  // Only styles that really are ignored can be kept as reference.
  const referenceStyles = [...new Set(v.referenceStyles)].filter((k) => roles[k] === "ignore");

  // Window holes: they need the 3D fold (the panels) and must fit the dieline at its starting size.
  let windows = v.windows as WindowSpec[] | undefined;
  if (fold === null) windows = windows === undefined && v.mode === "create" ? undefined : [];
  else if (windows !== undefined && windows.length > 0) {
    const flatData = toFlatDieline(dieline, roles);
    const bad = windowsProblem(createImportedGenerator("check", flatData as FlatDieline, fold), importedStartParams(flatData, fold), windows);
    if (bad) return { ok: false, message: bad };
  }

  const geometry: StoredGeometry = { v: 1, dieline, ...(excluded.length ? { full: base, excluded } : {}), roles, options, fold, referenceStyles };
  if (JSON.stringify(geometry).length > MAX_GEOMETRY_JSON) return { ok: false, message: "This dieline is too detailed to store. Simplify the SVG and try again." };
  const thumbnail = thumbnailSvg(dieline, roles);
  const data = {
    name: v.name,
    description: v.description,
    status: v.status,
    published: isPublicStatus(v.status),
    sortOrder: v.sortOrder,
    hasFold: fold !== null,
    ...windowsData(windows),
    geometry: geometry as unknown as Prisma.InputJsonValue,
    widthMm: dieline.widthMm,
    heightMm: dieline.heightMm,
    thumbnail,
  };

  try {
    if (v.mode === "create") {
      await db.template.create({
        data: { id: v.slug, generatorId: "svg-import", category: "imported", schemaVersion: 1, defaultParameters: {}, source: "svg", ...data, categories: { connect: categories } },
      });
    } else {
      await db.template.update({ where: { id: current }, data: { ...data, ...(renamed ? { id: v.slug } : {}), categories: { set: categories } } });
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, message: "A template with that slug already exists." };
    throw e;
  }
  if (renamed) revalidatePath(`/template/dieline/${current}`);
  refresh(v.slug);
  return { ok: true, message: v.mode === "create" ? "Template created." : "Template saved.", slug: v.slug };
}
