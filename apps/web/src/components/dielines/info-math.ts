import type { DielineGeometry } from "@packaging/dieline-engine";
import { flattenOutline } from "@packaging/dieline-engine";
import { MM_PER_INCH, type Unit } from "./units";

export interface DielineStats {
  /** Whole sheet with bleed, mm. */
  area: { w: number; h: number };
  /** Total length of cut lines (outlines and slits), mm. */
  cutLength: number;
  /** Total length of fold lines, mm. */
  creaseLength: number;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Size of the sheet and the length of the cut and fold lines. */
export function dielineStats(geo: DielineGeometry): DielineStats {
  let cut = 0;
  for (const loop of geo.cutLoops) {
    const pts = flattenOutline(loop, 0.05);
    for (let i = 0; i < pts.length; i++) cut += dist(pts[i]!, pts[(i + 1) % pts.length]!);
  }
  for (const s of geo.slitLines) cut += dist(s.a, s.b);
  let crease = 0;
  for (const c of geo.creaseLines) crease += dist(c.a, c.b);
  const b = geo.bleedBounds;
  return { area: { w: b.max.x - b.min.x, h: b.max.y - b.min.y }, cutLength: cut, creaseLength: crease };
}

export interface BoxSizes {
  manufacturing: [number, number, number];
  inner: [number, number, number];
  outer: [number, number, number];
}

/**
 * Width x depth x height three ways, from the engine's simple allowance rule (panel size = inside size
 * + factor x thickness). `entered` is what the customer typed in the chosen size mode.
 */
export function boxSizes(entered: [number, number, number], sizeMode: string, thickness: number, allowanceFactor: number): BoxSizes {
  const k = allowanceFactor * thickness;
  const inner = sizeMode === "inner";
  const manufacturing = entered.map((v) => (inner ? v + k : v)) as [number, number, number];
  const insideSize = manufacturing.map((v) => v - k) as [number, number, number];
  const outer = insideSize.map((v) => v + 2 * thickness) as [number, number, number];
  return { manufacturing, inner: insideSize, outer };
}

const trim = (n: number, digits: number) => String(Math.round(n * 10 ** digits) / 10 ** digits);
/** "260 × 120 × 60 mm" or "10.236 × 4.724 × 2.362 in". */
export function fmtSize(mm: readonly number[], unit: Unit): string {
  const f = (v: number) => (unit === "mm" ? trim(v, 2) : trim(v / MM_PER_INCH, 3));
  return `${mm.map(f).join(" × ")} ${unit}`;
}
export function fmtLen(mm: number, unit: Unit): string {
  return unit === "mm" ? `${trim(mm, 2)} mm` : `${trim(mm / MM_PER_INCH, 2)} in`;
}

