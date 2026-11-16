/** Name, tags and category of an artwork-library picture: one place that cleans and limits them. */
export const MAX_NAME = 80;
export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 30;
export const MAX_CATEGORY = 40;
/** Library pictures in this category are the editor's box backgrounds: the Background panel lists them, the Artwork Library tab leaves them out. */
export const BACKGROUND_CATEGORY = "Background Image";
/** The seeded background sets are named "Backgrounds: Geometric", "Backgrounds: Festive" and so on: they are box backgrounds too. */
const BACKGROUND_SET_PREFIX = "Backgrounds:";

/** True for a category whose pictures are box backgrounds (not artwork to place on top). */
export const isBackgroundCategory = (category: string) => category === BACKGROUND_CATEGORY || category.startsWith(BACKGROUND_SET_PREFIX);

/** Collapse white space and cut to a length. */
const tidy = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

export const cleanName = (s: string) => tidy(s, MAX_NAME);
export const cleanCategory = (s: string) => tidy(s, MAX_CATEGORY);

/**
 * Tags from text ("Gift, Logo; gold") or a list: lower case, no empty ones, no repeats,
 * at most MAX_TAGS of at most MAX_TAG_LENGTH characters. Order is kept.
 */
export function parseTags(input: string | readonly string[]): string[] {
  const parts = typeof input === "string" ? input.split(/[,;\n]/) : input;
  const out: string[] = [];
  for (const p of parts) {
    const t = tidy(p.replace(/^#/, ""), MAX_TAG_LENGTH).toLowerCase();
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/**
 * Names for a batch added together: one picture keeps the name; several get 1, 2, 3 after it
 * ("Star 1", "Star 2", ...). The base is cut so the number always fits in MAX_NAME.
 */
export function numberedNames(base: string, count: number): string[] {
  const clean = cleanName(base);
  if (count <= 1) return [clean];
  const room = MAX_NAME - ` ${count}`.length;
  const stem = clean.slice(0, room).trim();
  return Array.from({ length: count }, (_, i) => `${stem} ${i + 1}`);
}
