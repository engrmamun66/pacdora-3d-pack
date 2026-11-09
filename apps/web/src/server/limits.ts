import "server-only";
import { db } from "./db";

/**
 * Per-user rate limit: allow at most `max` actions of `kind` in the last
 * `windowSec` seconds. Counting and recording happen in one transaction under a
 * per-user advisory lock, so parallel requests cannot all slip under the limit.
 * Returns true when the action may proceed (and has been counted).
 */
export async function takeToken(userId: string, kind: string, max: number, windowSec: number): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`rate:${userId}:${kind}`}, 0))`;
    const since = new Date(Date.now() - windowSec * 1000);
    const used = await tx.rateEvent.count({ where: { userId, kind, createdAt: { gte: since } } });
    if (used >= max) return false;
    await tx.rateEvent.create({ data: { userId, kind } });
    // Keep the table small: drop this user's events older than a day.
    await tx.rateEvent.deleteMany({ where: { userId, createdAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } } });
    return true;
  });
}

/** Limits for expensive actions (per user). */
export const LIMITS = {
  export: { max: 10, windowSec: 60 },
  upload: { max: 30, windowSec: 60 },
  saveArtwork: { max: 120, windowSec: 60 },
  saveThreeD: { max: 60, windowSec: 60 },
} as const;

/** Exports run CPU-heavy work (glyph outlines, image embedding): cap concurrency per server process. */
let activeExports = 0;
export const MAX_CONCURRENT_EXPORTS = 3;
export async function withExportSlot<T>(fn: () => Promise<T>): Promise<T | "busy"> {
  if (activeExports >= MAX_CONCURRENT_EXPORTS) return "busy";
  activeExports++;
  try {
    return await fn();
  } finally {
    activeExports--;
  }
}
