import { type Vec2 } from "../primitives/vec2";
import type { Outline } from "../primitives/arc";
import type { FoldTree, Panel } from "./types";

export class DielineBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DielineBuildError";
  }
}

export interface CreaseLine {
  readonly id: string;
  readonly hingeId: string;
  readonly a: Vec2;
  readonly b: Vec2;
  readonly foldAngleDeg: number;
}

export interface CutSegment {
  readonly id: string;
  readonly a: Vec2;
  readonly b: Vec2;
}

export interface GlueArea {
  readonly panelId: string;
  readonly outline: Outline;
}

export interface ExtractedLines {
  /** Closed cut loops (with arc bulges), largest (outer) first. */
  readonly cutLoops: Outline[];
  /** Open cut segments on shared edges (slits). */
  readonly slitLines: CutSegment[];
  readonly creaseLines: CreaseLine[];
  readonly glueAreas: GlueArea[];
}

/** A panel's own outline (vertices + bulges). */
export const panelOutline = (p: Panel): Outline => ({ points: p.polygon, bulges: p.bulges });

/** Quantisation for matching vertices: 0.1 micrometre. */
const Q = 1e-4;
const vKey = (p: Vec2): string => `${Math.round(p.x / Q)},${Math.round(p.y / Q)}`;
const eKey = (a: Vec2, b: Vec2): string => {
  const ka = vKey(a);
  const kb = vKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

interface EdgeRecord {
  readonly a: Vec2;
  readonly b: Vec2;
  /** Bulge for travel a -> b. */
  readonly bulge: number;
  readonly panelIds: string[];
}

/**
 * Derive cut loops, slits, crease lines and glue areas from a fold tree.
 *
 * Rules: an edge used by exactly one panel is a CUT edge (may be an arc). An
 * edge shared by two panels must be straight and declared either as a hinge
 * (CREASE) or a slit (CUT). Anything else throws, so invalid geometry never
 * reaches a renderer.
 */
export function extractLines(tree: FoldTree): ExtractedLines {
  const edges = new Map<string, EdgeRecord>();
  for (const panel of tree.panels) {
    const poly = panel.polygon;
    if (panel.bulges && panel.bulges.length !== poly.length) {
      throw new DielineBuildError(`Panel "${panel.id}" has ${panel.bulges.length} bulges for ${poly.length} edges.`);
    }
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const bulge = panel.bulges?.[i] ?? 0;
      const key = eKey(a, b);
      const rec = edges.get(key);
      if (rec) {
        if (rec.bulge !== 0 || bulge !== 0) {
          throw new DielineBuildError(`Curved edge shared by panels "${rec.panelIds[0]}" and "${panel.id}"; shared edges must be straight.`);
        }
        rec.panelIds.push(panel.id);
      } else {
        edges.set(key, { a, b, bulge, panelIds: [panel.id] });
      }
    }
  }

  const declared = new Map<string, string>(); // shared edge key -> hinge/slit id
  for (const h of tree.hinges) {
    const key = eKey(h.a, h.b);
    const rec = edges.get(key);
    if (!rec || rec.panelIds.length !== 2 || !rec.panelIds.includes(h.parentId) || !rec.panelIds.includes(h.childId)) {
      throw new DielineBuildError(
        `Hinge "${h.id}" does not coincide with exactly one shared edge of panels "${h.parentId}" and "${h.childId}".`,
      );
    }
    declared.set(key, h.id);
  }
  for (const s of tree.slits ?? []) {
    const key = eKey(s.a, s.b);
    const rec = edges.get(key);
    if (!rec || rec.panelIds.length !== 2) throw new DielineBuildError(`Slit "${s.id}" does not lie on a shared edge.`);
    if (declared.has(key)) throw new DielineBuildError(`Slit "${s.id}" overlaps hinge "${declared.get(key)}".`);
    declared.set(key, s.id);
  }

  const cutEdges: EdgeRecord[] = [];
  for (const [key, rec] of edges) {
    if (rec.panelIds.length > 2) {
      throw new DielineBuildError(`Edge shared by ${rec.panelIds.length} panels: ${rec.panelIds.join(", ")}.`);
    }
    if (rec.panelIds.length === 2) {
      if (!declared.has(key)) {
        throw new DielineBuildError(`Panels "${rec.panelIds.join('" and "')}" share an edge that is neither a hinge nor a slit.`);
      }
    } else {
      cutEdges.push(rec);
    }
  }

  return {
    cutLoops: chainLoops(cutEdges),
    slitLines: (tree.slits ?? []).map((s) => ({ id: s.id, a: s.a, b: s.b })),
    creaseLines: tree.hinges.map((h) => ({
      id: `crease-${h.id}`,
      hingeId: h.id,
      a: h.a,
      b: h.b,
      foldAngleDeg: h.foldAngleDeg,
    })),
    glueAreas: tree.panels.filter((p) => p.role === "glue-flap").map((p) => ({ panelId: p.id, outline: panelOutline(p) })),
  };
}

function chainLoops(cutEdges: readonly EdgeRecord[]): Outline[] {
  const byVertex = new Map<string, number[]>();
  cutEdges.forEach((e, i) => {
    for (const p of [e.a, e.b]) {
      const k = vKey(p);
      const list = byVertex.get(k) ?? [];
      list.push(i);
      byVertex.set(k, list);
    }
  });
  for (const [k, list] of byVertex) {
    if (list.length !== 2) {
      throw new DielineBuildError(`Cut outline is not a set of simple loops: vertex ${k} has ${list.length} cut edges.`);
    }
  }

  const used = new Set<number>();
  const loops: Outline[] = [];
  for (let start = 0; start < cutEdges.length; start++) {
    if (used.has(start)) continue;
    const points: Vec2[] = [];
    const bulges: number[] = [];
    let edgeIdx = start;
    let current = cutEdges[start]!.a;
    for (;;) {
      used.add(edgeIdx);
      const e = cutEdges[edgeIdx]!;
      const forward = vKey(e.a) === vKey(current);
      points.push(current);
      bulges.push(forward ? e.bulge : -e.bulge);
      const next = forward ? e.b : e.a;
      const nextEdge = byVertex.get(vKey(next))!.find((i) => i !== edgeIdx)!;
      current = next;
      if (nextEdge === start) break;
      if (used.has(nextEdge)) throw new DielineBuildError("Cut outline chaining failed (revisited edge).");
      edgeIdx = nextEdge;
    }
    loops.push(mergeStraightCollinear({ points, bulges }));
  }
  return loops.sort((p, q) => outlineAbsShoelace(q) - outlineAbsShoelace(p));
}

/** Rough size for sorting loops (vertex shoelace is enough to find the outer one). */
function outlineAbsShoelace(o: Outline): number {
  let s = 0;
  const n = o.points.length;
  for (let i = 0; i < n; i++) {
    const a = o.points[i]!;
    const b = o.points[(i + 1) % n]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s / 2);
}

/** Drop vertices between two STRAIGHT collinear edges (arcs are left intact). */
function mergeStraightCollinear(o: { points: Vec2[]; bulges: number[] }): Outline {
  const pts = [...o.points];
  const bl = [...o.bulges];
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const prevI = (i - 1 + pts.length) % pts.length;
      if (bl[prevI] !== 0 || bl[i] !== 0) continue;
      const prev = pts[prevI]!;
      const cur = pts[i]!;
      const next = pts[(i + 1) % pts.length]!;
      const cr = (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x);
      const dot = (cur.x - prev.x) * (next.x - cur.x) + (cur.y - prev.y) * (next.y - cur.y);
      if (Math.abs(cr) < 1e-9 && dot > 0) {
        pts.splice(i, 1);
        bl.splice(i, 1); // edge prev->cur and cur->next become one straight edge prev->next
        changed = true;
        break;
      }
    }
  }
  return { points: pts, bulges: bl };
}
