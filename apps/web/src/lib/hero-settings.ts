import { z } from "zod";

/** Where the hero box starts (and what it shows when animation is off). */
export const HERO_POSITIONS = [
  { value: "closed", label: "Closed", hint: "Lid shut, box ready to ship." },
  { value: "lid-open", label: "Lid open", hint: "Box built, lid and flaps open." },
  { value: "flat", label: "Flat sheet", hint: "The unfolded dieline." },
] as const;

export const heroSettingsSchema = z.object({
  initial: z.enum(["closed", "lid-open", "flat"]),
  /** #rrggbb, or null for the default look. */
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  /** Panel behind the animated box: #rrggbb, or null for none (the hero shows through). Old saved values lack it. */
  boxBackground: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
});
export type HeroSettings = z.output<typeof heroSettingsSchema>;

export const DEFAULT_HERO: HeroSettings = { initial: "closed", background: null, boxBackground: null };

/** Tolerant read of a stored value: anything unusable falls back to the defaults. */
export function parseHeroSettings(raw: unknown): HeroSettings {
  const r = heroSettingsSchema.safeParse(raw);
  return r.success ? r.data : DEFAULT_HERO;
}

/** Relative luminance 0..1 of #rrggbb (sRGB). Used to pick light or dark text on the chosen background. */
export function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
