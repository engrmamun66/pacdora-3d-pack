import { buildStyles } from "./styles";
import { SvgImportError, type ImportedDieline, type ImportedPath } from "./types";

const MIN_SIZE_MM = 1;
const MAX_SIZE_MM = 20_000;
const round = (v: number) => Math.round(v * 1e6) / 1e6;

/**
 * The dieline without the given paths (ids from `ImportedPath.id`). Everything left is moved back to
 * the origin, so the sheet size, the line styles and their suggested roles describe what remains.
 * Throws a user-safe `SvgImportError` when nothing usable is left.
 */
export function excludePaths(d: ImportedDieline, ids: Iterable<number>): ImportedDieline {
  const drop = new Set(ids);
  if (drop.size === 0) return d;
  const kept = d.paths.filter((p) => p.id === undefined || !drop.has(p.id));
  if (kept.length === d.paths.length) return d;
  if (kept.length === 0) throw new SvgImportError("Every line is excluded. Keep at least the cut outline.");

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of kept) {
    for (let i = 0; i < p.pts.length; i += 2) {
      const x = p.pts[i]!, y = p.pts[i + 1]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const widthMm = round(maxX - minX);
  const heightMm = round(maxY - minY);
  if (!(widthMm >= MIN_SIZE_MM && widthMm <= MAX_SIZE_MM && heightMm >= MIN_SIZE_MM && heightMm <= MAX_SIZE_MM)) {
    throw new SvgImportError("What is left is too small to be a dieline. Keep the cut outline.");
  }
  const paths: ImportedPath[] = kept.map((p) => {
    const pts = new Array<number>(p.pts.length);
    for (let i = 0; i < p.pts.length; i += 2) {
      pts[i] = round(p.pts[i]! - minX);
      pts[i + 1] = round(p.pts[i + 1]! - minY);
    }
    return { ...p, pts };
  });
  return {
    ...d,
    widthMm,
    heightMm,
    paths,
    styles: buildStyles(paths),
    report: { ...d.report, pointCount: paths.reduce((n, p) => n + p.pts.length / 2, 0), elementCount: paths.length },
  };
}

/** Something in the file that is probably not part of the box, offered to the admin for approval. */
export interface ExclusionSuggestion {
  /** Stable key, e.g. "legend:12". */
  key: string;
  /** Short name shown in the list, e.g. the group's name. */
  label: string;
  /** Why we think it can go, in plain words. */
  reason: string;
  /** Ids of the paths that would be excluded. */
  ids: number[];
}

const LEGEND = /(^|[^a-z])(legend|colou?r[-_ ]?key|colou?r[-_ ]?chart|swatch(es)?)([^a-z]|$)/i;
const ANNOTATION = /(^|[^a-z])(dimensions?|dims?|measure(ments?)?|annotations?|callouts?|notes?|title[-_ ]?block|info)([^a-z]|$)/i;

/**
 * Groups named like a legend or like dimension notes. Only whole named groups are suggested,
 * never loose lines, so a suggestion is never a guess about geometry.
 * Needs a dieline made by `importSvg` (it carries the groups and the path ids).
 */
export function suggestExclusions(d: ImportedDieline): ExclusionSuggestion[] {
  const out: ExclusionSuggestion[] = [];
  const taken: { from: number; to: number }[] = [];
  for (const g of d.groups ?? []) {
    let reason: string | null = null;
    if (LEGEND.test(g.label)) reason = "A colour key with sample lines. It explains the drawing and is not part of the box.";
    else if (ANNOTATION.test(g.label)) reason = "Dimension lines and notes for the reader. They are not part of the box.";
    if (!reason) continue;
    // a group inside one we already suggest adds nothing
    if (taken.some((t) => g.from >= t.from && g.to <= t.to)) continue;
    const ids = d.paths.filter((p) => p.id !== undefined && p.id >= g.from && p.id < g.to).map((p) => p.id!);
    if (ids.length === 0) continue;
    taken.push({ from: g.from, to: g.to });
    out.push({ key: `${g.from}-${g.to}:${g.label}`, label: g.label, reason, ids });
  }
  return out;
}

/** Ids of the paths in a group's range. */
export function groupPathIds(d: ImportedDieline, g: { from: number; to: number }): number[] {
  return d.paths.filter((p) => p.id !== undefined && p.id >= g.from && p.id < g.to).map((p) => p.id!);
}
