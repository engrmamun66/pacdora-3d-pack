import type { ImportedDieline } from "./types";
import { SvgImportError } from "./types";

/** A new set of points for one line of the drawing (the `id` of an ImportedPath). */
export interface LineEdit {
  id: number;
  /** Flat x, y, ... in mm, in the drawing's own frame (y down, minimum corner at 0, 0). */
  pts: number[];
}

/** A line may not stray further than this many times the drawing's size from it (a typo guard, not a design rule). */
const FAR = 3;

/**
 * Replace the points of fold lines (open lines) by hand-edited ones, for example to make a line reach the cut outline.
 * Only open lines can change, so a cut outline is never touched. Every edit is checked (the id exists, the line is open,
 * at least two finite points, not absurdly far away) and a bad one throws `SvgImportError` with a message for the admin.
 * Pure: the drawing it is given is not changed.
 */
export function applyLineEdits(d: ImportedDieline, edits: readonly LineEdit[]): ImportedDieline {
  if (edits.length === 0) return d;
  const byId = new Map<number, LineEdit>();
  for (const e of edits) byId.set(e.id, e);
  const limit = FAR * Math.max(d.widthMm, d.heightMm, 1);
  const seen = new Set<number>();
  const paths = d.paths.map((p) => {
    const e = p.id === undefined ? undefined : byId.get(p.id);
    if (!e) return p;
    seen.add(e.id);
    if (p.closed) throw new SvgImportError(`Line ${e.id} is a closed shape. Only open fold lines can be edited.`);
    if (!Array.isArray(e.pts) || e.pts.length < 4 || e.pts.length % 2 !== 0) throw new SvgImportError(`Line ${e.id} needs at least two points, as x, y pairs.`);
    if (e.pts.some((v) => typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > limit)) throw new SvgImportError(`Line ${e.id} has a point that is not a number or is far outside the drawing.`);
    return { ...p, pts: [...e.pts] };
  });
  for (const e of edits) if (!seen.has(e.id)) throw new SvgImportError(`Line ${e.id} is not in this drawing.`);
  return { ...d, paths };
}
