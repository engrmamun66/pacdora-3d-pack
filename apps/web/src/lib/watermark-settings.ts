import { z } from "zod";

/** Text of the watermark when an admin has not set one. */
export const DEFAULT_WATERMARK_TEXT = "pacdorabd.com";
export const WATERMARK_TEXT_MAX = 40;

/**
 * The faint text repeated inside the cut area of the dieline sheet.
 * `.default()` keeps older or partial stored values readable.
 */
export const watermarkSchema = z.object({
  enabled: z.boolean().default(true),
  /** Empty means the default text. */
  text: z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(WATERMARK_TEXT_MAX, `The text can have at most ${WATERMARK_TEXT_MAX} characters.`))
    .default(""),
});
export type WatermarkSettings = z.output<typeof watermarkSchema>;

export const DEFAULT_WATERMARK_SETTINGS: WatermarkSettings = { enabled: true, text: "" };

/** Tolerant read of a stored value: anything unusable means the defaults. */
export function parseWatermark(raw: unknown): WatermarkSettings {
  const r = watermarkSchema.safeParse(raw);
  return r.success ? r.data : DEFAULT_WATERMARK_SETTINGS;
}

/** The text to draw on the sheet; an empty string means no watermark. */
export function watermarkText(s: WatermarkSettings): string {
  return s.enabled ? s.text || DEFAULT_WATERMARK_TEXT : "";
}
