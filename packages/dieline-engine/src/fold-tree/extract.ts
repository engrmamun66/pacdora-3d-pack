import { type Vec2 } from "../primitives/vec2";
import { area, simplifyCollinear } from "../primitives/polygon";
import type { FoldTree } from "./types";

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

export interface GlueArea {
  readonly panelId: string;
  readonly polygon: readonly Vec2[];
}

export interface ExtractedLines {
  /** Closed cut loops, largest (outer) first. */
  readonly cutLoops: Vec2[][];
  readonly creaseLines: CreaseLine[];
  readonly glueAreas: GlueArea[];
}

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
  readonly panelIds: string[];
}

/**
 * Derive cut loops, crease lines and glue areas from a fold tree.
 *
 * Rule: an edge used by exactly one panel is a CUT edge; an edge shared by two
 * panels must be a declared hinge (CREASE). Anything else (overlap, an
 * undeclared shared edge, a hinge with no matching edge) is a modelling error
 * and throws, so invalid geometry never reaches a renderer.
 */
export function extractLines(tree: FoldTree): ExtractedLines {
  const edges = new Map<string, EdgeRecord>();
  for (const panel of tree.panels) {
    const poly = panel.polygon;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const key = eKey(a, b);
      const rec = edges.get(key);
      if (rec) rec.panelIds.push(panel.id);
      else edges.set(key, { a, b, panelIds: [panel.id] });
    }
  }

  const hingeKeys = new Map<string, string>();
  for (const h of tree.hinges) {
    const key = eKey(h.a, h.b);
    const rec = edges.get(key);
    if (!rec || rec.panelIds.length !== 2 || !rec.panelIds.includes(h.parentId) || !rec.panelIds.includes(h.childId)) {
      throw new DielineBuildError(
        `Hinge "${h.id}" does not coincide with exactly one shared edge of panels "${h.parentId}" and "${h.childId}".`,
      );
    }
    hingeKeys.set(key, h.id);
  }

  const cutEdges: EdgeRecord[] = [];
  for (const [key, rec] of edges) {
    if (rec.panelIds.length > 2) {
      throw new DielineBuildError(`Edge shared by ${rec.panelIds.length} panels: ${rec.panelIds.join(", ")}.`);
    }
    if (rec.panelIds.length === 2) {
      if (!hingeKeys.has(key)) {
        throw new DielineBuildError(`Panels "${rec.panelIds.join('" and "')}" share an edge without a hinge.`);
      }
    } else {
      cutEdges.push(rec);
    }
  }

  return {
    cutLoops: chainLoops(cutEdges),
    creaseLines: tree.hinges.map((h) => ({
      id: `crease-${h.id}`,
      hingeId: h.id,
      a: h.a,
      b: h.b,
      foldAngleDeg: h.foldAngleDeg,
    })),
    glueAreas: tree.panels
      .filter((p) => p.role === "glue-flap")
      .map((p) => ({ panelId: p.id, polygon: p.polygon })),
  };
}

function chainLoops(cutEdges: readonly EdgeRecord[]): Vec2[][] {
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
  const loops: Vec2[][] = [];
  for (let start = 0; start < cutEdges.length; start++) {
    if (used.has(start)) continue;
    const loop: Vec2[] = [];
    let edgeIdx = start;
    let current = cutEdges[start]!.a;
    for (;;) {
      used.add(edgeIdx);
      loop.push(current);
      const e = cutEdges[edgeIdx]!;
      const next = vKey(e.a) === vKey(current) ? e.b : e.a;
      const nextList = byVertex.get(vKey(next))!;
      const nextEdge = nextList.find((i) => i !== edgeIdx)!;
      current = next;
      if (nextEdge === start) break;
      if (used.has(nextEdge)) throw new DielineBuildError("Cut outline chaining failed (revisited edge).");
      edgeIdx = nextEdge;
    }
    loops.push(simplifyCollinear(loop));
  }
  return loops.sort((p, q) => area(q) - area(p));
}
