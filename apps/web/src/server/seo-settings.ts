import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "./db";
import { DEFAULT_SEO, parseSeoSettings, type SeoSettings } from "@/lib/seo-settings";

export const SEO_TAG = "seo-settings";
const KEY = "seo";

/**
 * SEO data for the public pages. Cached, and refreshed within a minute or at once when an admin saves. If the database
 * cannot be read the built-in data is used, so no page breaks.
 */
export async function getSeoSettings(): Promise<SeoSettings> {
  "use cache";
  cacheTag(SEO_TAG);
  cacheLife({ stale: 30, revalidate: 60, expire: 3600 });
  try {
    const row = await db.siteSetting.findUnique({ where: { key: KEY }, select: { value: true } });
    return row ? parseSeoSettings(row.value) : DEFAULT_SEO;
  } catch {
    return DEFAULT_SEO;
  }
}

/** Uncached read for the admin form (always the stored value). */
export async function readSeoSettings(): Promise<{ settings: SeoSettings; updatedAt: Date | null }> {
  const row = await db.siteSetting.findUnique({ where: { key: KEY }, select: { value: true, updatedAt: true } });
  return { settings: row ? parseSeoSettings(row.value) : DEFAULT_SEO, updatedAt: row?.updatedAt ?? null };
}
