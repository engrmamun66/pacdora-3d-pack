import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { storage } from "./storage";
import { sniffImage } from "@/lib/image-sniff";
import { imageSize, imageSizeProblem } from "@packaging/vector-scene/images";

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Public address of a Client's logo (it is served under their user hash, so nothing else of the account shows).
 * The version in the address is the file's own id, so a new logo is fetched at once and an old one can be cached.
 */
export function businessLogoUrl(userHash: string, key: string | null): string | null {
  if (!key) return null;
  const version = key.split("/").pop()?.replace(/\.[a-z]+$/, "") ?? "";
  return `/api/portal/logo/${encodeURIComponent(userHash)}?v=${encodeURIComponent(version)}`;
}

export type LogoResult = { ok: true } | { ok: false; status: number; message: string };

/** Replace the Client's logo with this PNG or JPEG. The old file is deleted after the new one is saved. */
export async function saveBusinessLogo(userId: string, bytes: Uint8Array): Promise<LogoResult> {
  if (bytes.length === 0) return { ok: false, status: 400, message: "The file is empty." };
  if (bytes.length > MAX_LOGO_BYTES) return { ok: false, status: 413, message: "The logo is larger than 2 MB." };
  const type = sniffImage(bytes);
  if (!type) return { ok: false, status: 415, message: "Only PNG and JPEG images are supported." };
  const problem = imageSizeProblem(imageSize(bytes, type.mime));
  if (problem) return { ok: false, status: 422, message: `This image cannot be used: ${problem}.` };
  const key = `${userId}/logo-${randomUUID()}.${type.ext}`;
  await storage.put(key, bytes);
  const before = await db.user.findUnique({ where: { id: userId }, select: { businessLogoKey: true } });
  await db.user.update({ where: { id: userId }, data: { businessLogoKey: key, businessLogoMime: type.mime } });
  if (before?.businessLogoKey) await storage.delete(before.businessLogoKey).catch(() => undefined);
  return { ok: true };
}

export async function removeBusinessLogo(userId: string): Promise<void> {
  const before = await db.user.findUnique({ where: { id: userId }, select: { businessLogoKey: true } });
  await db.user.update({ where: { id: userId }, data: { businessLogoKey: null, businessLogoMime: null } });
  if (before?.businessLogoKey) await storage.delete(before.businessLogoKey).catch(() => undefined);
}
