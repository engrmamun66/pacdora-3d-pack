import { z } from "zod";
import type { Role } from "@packaging/svg-import";

/** Roles an admin can attach colours to, in the order the settings page shows them. */
export const COLOR_ROLES = ["cut", "crease", "bleed", "guide", "ignore"] as const satisfies readonly Role[];

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((s) => s.toLowerCase());

const list = z.array(hex).max(50).default([]);

export const svgColorSchema = z
  .object({ cut: list, crease: list, bleed: list, guide: list, ignore: list })
  .superRefine((v, ctx) => {
    // One colour can mean only one thing.
    const seen = new Map<string, Role>();
    for (const role of COLOR_ROLES) {
      for (const c of v[role]) {
        const other = seen.get(c);
        if (other) ctx.addIssue({ code: "custom", message: `${c} is in both ${other} and ${role}.`, path: [role] });
        else seen.set(c, role);
      }
    }
  });
export type SvgColorSettings = z.output<typeof svgColorSchema>;

export const EMPTY_SVG_COLORS: SvgColorSettings = { cut: [], crease: [], bleed: [], guide: [], ignore: [] };

/** Tolerant read of a stored value: anything unusable means "no colour rules". */
export function parseSvgColors(raw: unknown): SvgColorSettings {
  const r = svgColorSchema.safeParse(raw);
  return r.success ? r.data : EMPTY_SVG_COLORS;
}

/**
 * Role for each style whose stroke colour an admin has assigned. Styles with
 * other colours are left out, so the importer's own guess still applies to them.
 */
export function colorRoles(styles: readonly { key: string; stroke: string | null }[], settings: SvgColorSettings): Record<string, Role> {
  const byColor = new Map<string, Role>();
  for (const role of COLOR_ROLES) for (const c of settings[role]) byColor.set(c, role);
  const out: Record<string, Role> = {};
  for (const s of styles) {
    const role = s.stroke ? byColor.get(s.stroke.toLowerCase()) : undefined;
    if (role) out[s.key] = role;
  }
  return out;
}
