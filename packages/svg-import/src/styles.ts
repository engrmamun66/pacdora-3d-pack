import { assignRoles } from "./roles";
import type { ImportedPath, SvgStyle } from "./types";

/** Splits a style key ("rrggbb|d|0.25") back into its parts. */
export function parseStyleKey(key: string): { stroke: string; dashed: boolean; width: number } {
  const [stroke = "000000", dash = "s", width = "0"] = key.split("|");
  return { stroke, dashed: dash === "d", width: Number(width) || 0 };
}

const pathLength = (p: ImportedPath): number => {
  const pts = p.pts;
  let len = 0;
  for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i]! - pts[i - 2]!, pts[i + 1]! - pts[i - 1]!);
  if (p.closed && pts.length >= 4) len += Math.hypot(pts[0]! - pts[pts.length - 2]!, pts[1]! - pts[pts.length - 1]!);
  return len;
};

/** The distinct line styles of a set of paths, most used first, each with the importer's suggested role. */
export function buildStyles(paths: ImportedPath[]): SvgStyle[] {
  interface Acc { key: string; stroke: string; dashed: boolean; width: number; count: number; length: number; fillOnly: boolean }
  const accs = new Map<string, Acc>();
  for (const p of paths) {
    let acc = accs.get(p.style);
    if (!acc) {
      const k = parseStyleKey(p.style);
      acc = { key: p.style, stroke: k.stroke, dashed: k.dashed, width: k.width, count: 0, length: 0, fillOnly: true };
      accs.set(p.style, acc);
    }
    acc.count++;
    acc.length += pathLength(p);
    if (!p.fill) acc.fillOnly = false;
  }
  const list = [...accs.values()].sort((a, b) => b.count - a.count || b.length - a.length || (a.key < b.key ? -1 : 1));
  const roles = assignRoles(list.map((a) => ({ key: a.key, color: a.stroke, dashed: a.dashed, length: a.length, width: a.width, fillOnly: a.fillOnly })));
  return list.map((a) => ({
    key: a.key,
    stroke: `#${a.stroke}`,
    dashed: a.dashed,
    strokeWidthMm: a.width,
    count: a.count,
    suggestedRole: roles.get(a.key) ?? "guide",
  }));
}
