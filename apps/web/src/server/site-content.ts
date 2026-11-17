import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { DEFAULT_CONTENT, parseSiteContent, type ContentPart, type SiteContent } from "@/lib/site-content";

export const SITE_CONTENT_TAG = "site-content";
const KEY = "site-content";

/**
 * The editable words of the public site (Admin > Pages). Cached, and refreshed within a minute or at once when an
 * admin saves. If the database cannot be read the built-in text is used, so the public pages never break.
 */
export async function getSiteContent(): Promise<SiteContent> {
  "use cache";
  cacheTag(SITE_CONTENT_TAG);
  cacheLife({ stale: 30, revalidate: 60, expire: 3600 });
  try {
    const row = await db.siteSetting.findUnique({ where: { key: KEY }, select: { value: true } });
    return row ? parseSiteContent(row.value) : DEFAULT_CONTENT;
  } catch {
    return DEFAULT_CONTENT;
  }
}

/** Uncached read for the admin forms (always the stored value). */
export async function readSiteContent(): Promise<{ content: SiteContent; updatedAt: Date | null }> {
  const row = await db.siteSetting.findUnique({ where: { key: KEY }, select: { value: true, updatedAt: true } });
  return { content: row ? parseSiteContent(row.value) : DEFAULT_CONTENT, updatedAt: row?.updatedAt ?? null };
}

/** Replace one part (already validated by the caller), keeping the other parts as they are stored. */
export async function writeSiteContentPart<K extends ContentPart>(part: K, value: SiteContent[K], adminId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"site-content"}, 0))`;
    const row = await tx.siteSetting.findUnique({ where: { key: KEY }, select: { value: true } });
    const next = { ...(row ? parseSiteContent(row.value) : DEFAULT_CONTENT), [part]: value } as unknown as Prisma.InputJsonValue;
    await tx.siteSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: next, updatedById: adminId }, update: { value: next, updatedById: adminId } });
  });
}
