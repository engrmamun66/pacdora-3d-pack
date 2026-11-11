import type { WatermarkSpec } from "@packaging/dieline-engine";
import { z } from "zod";

/** Text of the watermark when an admin has not set one. */
export const DEFAULT_WATERMARK_TEXT = "pacdorabd.com";
export const WATERMARK_TEXT_MAX = 40;
/** Ranges the admin may pick from (mm on the sheet). Line thickness 0 hides the lines. */
export const WATERMARK_FONT_RANGE = { min: 1.5, max: 12, step: 0.1 } as const;
export const WATERMARK_LINE_RANGE = { min: 0, max: 2, step: 0.05 } as const;
export const DEFAULT_WATERMARK_STYLE = { textColor: "#6b7280", lineColor: "#6b7280", fontSize: 3.6, lineWidth: 0.25 } as const;

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Colours must look like #6b7280.")
  .transform((s) => s.toLowerCase());

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
  textColor: hex.default(DEFAULT_WATERMARK_STYLE.textColor),
  lineColor: hex.default(DEFAULT_WATERMARK_STYLE.lineColor),
  /** Letter size on the sheet, in mm. */
  fontSize: z.number({ error: "Enter a font size." }).finite().min(WATERMARK_FONT_RANGE.min, "Font size must be between 1.5 and 12 mm.").max(WATERMARK_FONT_RANGE.max, "Font size must be between 1.5 and 12 mm.").default(DEFAULT_WATERMARK_STYLE.fontSize),
  /** Thickness of the diagonal lines, in mm; 0 = no lines. */
  lineWidth: z.number({ error: "Enter a line thickness." }).finite().min(WATERMARK_LINE_RANGE.min, "Line thickness must be between 0 and 2 mm.").max(WATERMARK_LINE_RANGE.max, "Line thickness must be between 0 and 2 mm.").default(DEFAULT_WATERMARK_STYLE.lineWidth),
});
export type WatermarkSettings = z.output<typeof watermarkSchema>;

export const DEFAULT_WATERMARK_SETTINGS: WatermarkSettings = { enabled: true, text: "", ...DEFAULT_WATERMARK_STYLE };

/** How the watermark looks. */
export type WatermarkStyle = Pick<WatermarkSettings, "textColor" | "lineColor" | "fontSize" | "lineWidth">;

export const watermarkStyle = (s: WatermarkStyle): WatermarkStyle => ({ textColor: s.textColor, lineColor: s.lineColor, fontSize: s.fontSize, lineWidth: s.lineWidth });

/** Tolerant read of a stored value: anything unusable means the defaults. */
export function parseWatermark(raw: unknown): WatermarkSettings {
  const r = watermarkSchema.safeParse(raw);
  return r.success ? r.data : DEFAULT_WATERMARK_SETTINGS;
}

/** What to draw: the text and its look, or null for no watermark. */
export function watermarkSpec(s: WatermarkSettings): WatermarkSpec | null {
  const text = watermarkText(s);
  return text ? { text, textColor: s.textColor, lineColor: s.lineColor, fontSize: s.fontSize, lineWidth: s.lineWidth } : null;
}

/** The text to draw on the sheet; an empty string means no watermark. */
export function watermarkText(s: Pick<WatermarkSettings, "enabled" | "text">): string {
  return s.enabled ? s.text || DEFAULT_WATERMARK_TEXT : "";
}
