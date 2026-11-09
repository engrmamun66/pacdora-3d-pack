/** URL-safe slug: lowercase ascii letters, digits and single dashes. "Milk & Yogurt" -> "milk-yogurt". */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isValidSlug = (s: string) => s.length >= 2 && s.length <= 80 && SLUG_PATTERN.test(s);
