import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { site } from "@/config/site";
import { db } from "./db";
import { DEFAULT_IDENTITY, parseSiteIdentity, resolveIdentity, type ResolvedIdentity, type SiteIdentity } from "@/lib/site-identity";

export const IDENTITY_TAG = "site-identity";
const DEFAULT: ResolvedIdentity = resolveIdentity(DEFAULT_IDENTITY, site.name);

/**
 * Site title, logo and favicon for public pages. Cached (and refreshed within a
 * minute, or at once when an admin saves). If the database cannot be read, the
 * built-in identity is used so no page breaks.
 */
export async function getSiteIdentity(): Promise<ResolvedIdentity> {
  "use cache";
  cacheTag(IDENTITY_TAG);
  cacheLife({ stale: 30, revalidate: 60, expire: 3600 });
  try {
    const row = await db.siteSetting.findUnique({ where: { key: "identity" }, select: { value: true } });
    return row ? resolveIdentity(parseSiteIdentity(row.value), site.name) : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** Uncached read for the admin form and for code that runs outside page rendering (email). */
export async function readSiteIdentity(): Promise<{ identity: SiteIdentity; updatedAt: Date | null }> {
  const row = await db.siteSetting.findUnique({ where: { key: "identity" }, select: { value: true, updatedAt: true } });
  return { identity: row ? parseSiteIdentity(row.value) : DEFAULT_IDENTITY, updatedAt: row?.updatedAt ?? null };
}

/** Save the whole identity value (validated by the callers). */
export async function writeSiteIdentity(identity: SiteIdentity, adminId: string): Promise<void> {
  await db.siteSetting.upsert({
    where: { key: "identity" },
    create: { key: "identity", value: identity, updatedById: adminId },
    update: { value: identity, updatedById: adminId },
  });
}

/** The site name for emails; never throws. */
export async function getSiteTitle(): Promise<string> {
  try {
    return (await readSiteIdentity()).identity.title ?? site.name;
  } catch {
    return site.name;
  }
}
