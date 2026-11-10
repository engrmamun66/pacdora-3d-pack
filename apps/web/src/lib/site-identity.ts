import { z } from "zod";

/** Keys are made by the server (see the upload route): site/<uuid>.png|jpg. */
const FILE_KEY = /^site\/[a-f0-9-]{36}\.(png|jpg)$/;

export const SITE_TITLE_MAX = 60;

export const siteIdentitySchema = z.object({
  /** Site name shown in the header, browser tab and emails. null = the built-in default name. */
  title: z.string().trim().min(1).max(SITE_TITLE_MAX).nullable().default(null),
  /** Stored file of the logo, or null for the built-in mark. */
  logoKey: z.string().regex(FILE_KEY).nullable().default(null),
  /** Stored file of the browser-tab icon, or null for the default icon. */
  faviconKey: z.string().regex(FILE_KEY).nullable().default(null),
});
export type SiteIdentity = z.output<typeof siteIdentitySchema>;

export const DEFAULT_IDENTITY: SiteIdentity = { title: null, logoKey: null, faviconKey: null };

export type IdentityFile = "logo" | "favicon";
export const IDENTITY_FILES: readonly IdentityFile[] = ["logo", "favicon"];

/** Tolerant read of a stored value: anything unusable falls back to the defaults. */
export function parseSiteIdentity(raw: unknown): SiteIdentity {
  const r = siteIdentitySchema.safeParse(raw);
  return r.success ? r.data : DEFAULT_IDENTITY;
}

/** What the site pages use: the title with the default filled in, and public image URLs (the key's file id is the cache-buster). */
export interface ResolvedIdentity {
  title: string;
  logoUrl: string | null;
  faviconUrl: string | null;
}

export function resolveIdentity(i: SiteIdentity, defaultTitle: string): ResolvedIdentity {
  const url = (kind: IdentityFile, key: string | null) => (key ? `/api/site/${kind}?v=${key.slice("site/".length, -4)}` : null);
  return { title: i.title ?? defaultTitle, logoUrl: url("logo", i.logoKey), faviconUrl: url("favicon", i.faviconKey) };
}
