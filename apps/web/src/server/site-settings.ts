import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "./db";
import { DEFAULT_HERO, parseHeroSettings, type HeroSettings, type HeroTemplate } from "@/lib/hero-settings";
import { getPreset } from "@packaging/dieline-engine";
import { loadImportedSource } from "./imported-templates";
import { TEMPLATES_TAG } from "./templates-public";
import type { WatermarkSpec } from "@packaging/dieline-engine";
import { DEFAULT_WATERMARK_SETTINGS, parseWatermark, watermarkSpec, type WatermarkSettings } from "@/lib/watermark-settings";
import { EMPTY_SVG_COLORS, parseSvgColors, type SvgColorSettings } from "@/lib/svg-colors";

export const HERO_TAG = "site-hero";

/**
 * Hero options for the home page. Cached (and refreshed within a minute, or at
 * once when an admin saves). If the database cannot be read, the defaults are
 * used so the public home page never breaks.
 */
export async function getHeroSettings(): Promise<HeroSettings> {
  "use cache";
  cacheTag(HERO_TAG);
  cacheLife({ stale: 30, revalidate: 60, expire: 3600 });
  try {
    const row = await db.siteSetting.findUnique({ where: { key: "hero" }, select: { value: true } });
    return row ? parseHeroSettings(row.value) : DEFAULT_HERO;
  } catch {
    return DEFAULT_HERO;
  }
}

/**
 * The box the hero shows when an admin chose a template for it: a published template that has a 3D fold
 * (built-in, or imported with a fold). Null when none is chosen or the choice is no longer usable, so the hero
 * falls back to the standard box. Cached like the hero settings; template edits refresh it too.
 */
export async function getHeroTemplate(templateId: string | null): Promise<HeroTemplate | null> {
  "use cache";
  cacheTag(HERO_TAG, TEMPLATES_TAG);
  cacheLife({ stale: 30, revalidate: 60, expire: 3600 });
  if (!templateId) return null;
  try {
    const row = await db.template.findUnique({ where: { id: templateId }, select: { id: true, source: true, published: true, hasFold: true } });
    if (!row || !row.published) return null;
    if (row.source === "builtin") return getPreset(row.id) ? { kind: "builtin", presetId: row.id } : null;
    if (!row.hasFold) return null;
    const src = await loadImportedSource(row.id);
    return src?.fold ? { kind: "imported", templateId: row.id, flat: src.flat, fold: src.fold } : null;
  } catch {
    return null;
  }
}

/** Templates an admin can show in the hero: published, with a 3D fold. */
export async function listHeroTemplateChoices(): Promise<{ id: string; name: string }[]> {
  const rows = await db.template.findMany({
    where: { published: true, OR: [{ source: "builtin" }, { hasFold: true }] },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, source: true },
  });
  return rows.filter((r) => r.source !== "builtin" || getPreset(r.id)).map(({ id, name }) => ({ id, name }));
}

/** Uncached read for the admin form (always the stored value). */
export async function readHeroSettings(): Promise<{ settings: HeroSettings; updatedAt: Date | null }> {
  const row = await db.siteSetting.findUnique({ where: { key: "hero" }, select: { value: true, updatedAt: true } });
  return { settings: row ? parseHeroSettings(row.value) : DEFAULT_HERO, updatedAt: row?.updatedAt ?? null };
}

/** Colours an admin has tied to each SVG line meaning (Cut, Fold, Bleed, Guide, Ignore). Uncached: read when a template is added or edited. */
export async function readSvgColors(): Promise<{ settings: SvgColorSettings; updatedAt: Date | null }> {
  const row = await db.siteSetting.findUnique({ where: { key: "svg-colors" }, select: { value: true, updatedAt: true } });
  return { settings: row ? parseSvgColors(row.value) : EMPTY_SVG_COLORS, updatedAt: row?.updatedAt ?? null };
}

/** Uncached read for the admin form (always the stored value). */
export async function readWatermark(): Promise<{ settings: WatermarkSettings; updatedAt: Date | null }> {
  const row = await db.siteSetting.findUnique({ where: { key: "watermark" }, select: { value: true, updatedAt: true } });
  return { settings: row ? parseWatermark(row.value) : DEFAULT_WATERMARK_SETTINGS, updatedAt: row?.updatedAt ?? null };
}

/**
 * Does this viewer get a clean sheet and clean downloads? Not yet: everybody gets the watermark.
 * When paid plans exist, answer true here for subscribers: the pages and every download ask this one place.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the hook point for paid plans
export function watermarkSkipped(_viewer: { id: string } | null | undefined): boolean {
  return false;
}

/**
 * The watermark for this viewer: drawn on the dieline sheet and put into every downloadable file (null = none).
 * If the database cannot be read, the defaults are used so a page or download never breaks.
 */
export async function getWatermark(viewer?: { id: string } | null): Promise<WatermarkSpec | null> {
  if (watermarkSkipped(viewer)) return null;
  let s = DEFAULT_WATERMARK_SETTINGS;
  try {
    s = (await readWatermark()).settings;
  } catch {
    // keep the defaults
  }
  return watermarkSpec(s);
}
