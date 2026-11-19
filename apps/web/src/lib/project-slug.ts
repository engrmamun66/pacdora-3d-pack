/**
 * Slugs: the short, address-friendly form of a project name ("Crash-lock bottom box" -> "crash-lock-bottom-box").
 * Free of the DOM, React and the database so a mobile app can share it.
 */
export const SLUG_MAX = 60;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Lower case letters and digits joined by single dashes, at most SLUG_MAX long; "project" when nothing is left. */
export function projectSlug(text: string): string {
  const base = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  return base || "project";
}

/** True when `text` is already a slug (not just something that could be turned into one). */
export function isProjectSlug(text: string): boolean {
  return text.length > 0 && text.length <= SLUG_MAX && SLUG.test(text);
}

/** The first of `base`, `base-2`, `base-3` ... that `taken` says is free. */
export function firstFree(base: string, taken: (candidate: string) => boolean, limit = SLUG_MAX): string {
  const cut = (stem: string, suffix: string) => `${stem.slice(0, Math.max(1, limit - suffix.length)).replace(/-+$/g, "")}${suffix}`;
  if (!taken(cut(base, ""))) return cut(base, "");
  for (let n = 2; n < 10_000; n++) {
    const candidate = cut(base, `-${n}`);
    if (!taken(candidate)) return candidate;
  }
  return cut(base, `-${Date.now()}`);
}
