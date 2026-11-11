import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "./db";
import { DEFAULT_HERO, parseHeroSettings, type HeroSettings } from "@/lib/hero-settings";
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
