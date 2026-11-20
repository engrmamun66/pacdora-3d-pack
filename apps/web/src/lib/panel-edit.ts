import { validateFoldSetup, type FoldHingeSpec, type FoldPanelSpec, type FoldSetup } from "@packaging/dieline-engine";
import { compactOrders } from "./fold-edit";

/**
 * Hand edits of the panels of an imported dieline, for the sheets the automatic detection gets wrong:
 *  - mergePanels: two panels joined by a fold line become one panel (the fold line goes away);
 *  - splitPanel: a panel is cut by a straight line into two panels joined by a new fold line.
 * Pure functions: each returns the new setup, or an `error` in plain words (the setup is then untouched).
 */

export type PanelEdit = { readonly setup: FoldSetup; readonly error?: undefined } | { readonly setup?: undefined; readonly error: string };

type Pt = readonly [number, number];

/** Distance (mm) under which two points are one point, or a point is on a line. */
const TOL = 0.05;
/** Smallest piece or cut that makes sense (mm, mm2). */
const MIN_CUT = 0.5;
const MIN_AREA = 1;

const toPts = (poly: readonly number[]): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < poly.length; i += 2) out.push([poly[i]!, poly[i + 1]!]);
  return out;
};
const flatten = (pts: readonly Pt[]): number[] => pts.flatMap((p) => [p[0], p[1]]);
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const signedArea = (pts: readonly Pt[]) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    s += pts[i]![0] * pts[j]![1] - pts[j]![0] * pts[i]![1];
  }
  return s / 2;
};

/** Distance from a point to a segment, and where along it (0..1). */
function toSegment(p: Pt, a: Pt, b: Pt): { d: number; t: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return { d: Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t)), t };
}

/** Distance from a point to the outline of a polygon. */
function toOutline(p: Pt, poly: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, toSegment(p, poly[i]!, poly[(i + 1) % poly.length]!).d);
  return best;
}

function inside(p: Pt, poly: readonly Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** A hinge line lies along the outline of a polygon (both ends and the middle). */
function lineOnOutline(line: readonly [number, number, number, number], poly: readonly Pt[]): boolean {
  const a: Pt = [line[0], line[1]];
  const b: Pt = [line[2], line[3]];
  const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return toOutline(a, poly) <= TOL && toOutline(b, poly) <= TOL && toOutline(m, poly) <= TOL;
}

/** Drop repeated points and points in a straight line between their neighbours, except the ones in `keep`. */
function simplify(pts: readonly Pt[], keep: readonly Pt[]): Pt[] {
  const cur = [...pts];
  const isKept = (p: Pt) => keep.some((k) => dist(k, p) <= TOL);
  for (let changed = true; changed && cur.length > 3; ) {
    changed = false;
    for (let i = 0; i < cur.length && cur.length > 3; i++) {
      const prev = cur[(i + cur.length - 1) % cur.length]!;
      const p = cur[i]!;
      const next = cur[(i + 1) % cur.length]!;
      const same = dist(prev, p) <= TOL;
      const cross = Math.abs((p[0] - prev[0]) * (next[1] - p[1]) - (p[1] - prev[1]) * (next[0] - p[0]));
      const run = dist(prev, next);
      const straight = run > 0 && cross / run <= TOL && (p[0] - prev[0]) * (next[0] - p[0]) + (p[1] - prev[1]) * (next[1] - p[1]) > 0;
      if (same || (straight && !isKept(p))) {
        cur.splice(i, 1);
        changed = true;
        i--;
      }
    }
  }
  return cur;
}

/** The ends of every hinge of these panels except `skip`: the points a panel outline must keep. */
function hingeEnds(setup: FoldSetup, panelIds: readonly string[], skip: readonly string[] = []): Pt[] {
  const out: Pt[] = [];
  for (const h of setup.hinges) {
    if (skip.includes(h.id) || !(panelIds.includes(h.parentId) || panelIds.includes(h.childId))) continue;
    out.push([h.line[0], h.line[1]], [h.line[2], h.line[3]]);
  }
  return out;
}

/** Put every point of `others` that lies on an edge of `poly` into `poly` as a point of its own, so shared edges line up. */
function withPointsOn(poly: readonly Pt[], others: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    out.push(a);
    const hits = others
      .map((q) => ({ q, ...toSegment(q, a, b) }))
      .filter((h) => h.d <= TOL && h.t > 0 && dist(h.q, a) > TOL && dist(h.q, b) > TOL)
      .sort((p, q) => p.t - q.t);
    for (const h of hits) out.push(h.q);
  }
  return out;
}

/** The panel under a point of the sheet (null when it is on none). */
export function panelAt(setup: FoldSetup, at: Pt): string | null {
  for (const p of setup.panels) if (inside(at, toPts(p.polygon))) return p.id;
  return null;
}

/** Turn the cut direction a..b to exactly horizontal or vertical when it is within 2 degrees of one, so a cut across a box comes out square. */
export function snapCut(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return b;
  const tol = Math.sin((2 * Math.PI) / 180);
  if (Math.abs(dy) / len < tol) return [b[0], a[1]];
  if (Math.abs(dx) / len < tol) return [a[0], b[1]];
  return b;
}

/** Where a cut from `a` toward `b` would run across the panel under `a` (for drawing it before it is made); null if it does not cross one. */
export function cutPreview(setup: FoldSetup, a: Pt, b: Pt): { p: Pt; q: Pt } | null {
  const id = panelAt(setup, a);
  const panel = id ? setup.panels.find((x) => x.id === id) : undefined;
  return panel ? chordAt(toPts(panel.polygon), a, snapCut(a, b)) : null;
}

const idNumber = (id: string, prefix: string) => {
  const m = new RegExp(`^${prefix}(\\d+)$`).exec(id);
  return m ? Number(m[1]) : 0;
};

/** The hinge between two panels, which must also be consistent: panels and hinges listed in the setup. */
function check(next: FoldSetup): PanelEdit {
  const problems = validateFoldSetup(next);
  return problems.length ? { error: problems[0]! } : { setup: next };
}

/**
 * Join the two panels of a fold line into one panel. The panel nearer the base keeps its name; the other one's own fold lines
 * (it may carry flaps) now hang off the merged panel.
 */
export function mergePanels(setup: FoldSetup, hingeId: string): PanelEdit {
  const hinge = setup.hinges.find((h) => h.id === hingeId);
  if (!hinge) return { error: "That fold line is not there any more." };
  const a = setup.panels.find((p) => p.id === hinge.parentId);
  const b = setup.panels.find((p) => p.id === hinge.childId);
  if (!a || !b) return { error: "A panel of that fold line is missing." };

  // Both outlines get the other's corner points that fall on their edges, then the edges they share (run in opposite directions) cancel out.
  let pa = toPts(a.polygon);
  let pb = toPts(b.polygon);
  if (signedArea(pa) < 0) pa = pa.reverse();
  if (signedArea(pb) < 0) pb = pb.reverse();
  const ra = withPointsOn(pa, pb);
  const rb = withPointsOn(pb, pa);
  const pool: Pt[] = [];
  const key = (p: Pt) => {
    const at = pool.findIndex((q) => dist(p, q) <= TOL);
    if (at >= 0) return at;
    pool.push(p);
    return pool.length - 1;
  };
  const edges: { from: number; to: number }[] = [];
  for (const ring of [ra, rb]) for (let i = 0; i < ring.length; i++) edges.push({ from: key(ring[i]!), to: key(ring[(i + 1) % ring.length]!) });
  const live = edges.filter((e, i) => e.from !== e.to && !edges.some((o, j) => j !== i && o.from === e.to && o.to === e.from));
  if (live.length === edges.length) return { error: "These two panels do not share an edge, so they cannot be joined." };

  const out = new Map<number, { to: number; used: boolean }[]>();
  for (const e of live) (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push({ to: e.to, used: false });
  const first = live[0]!;
  const ring: number[] = [first.from];
  let at = first.from;
  for (let guard = 0; guard < live.length + 2; guard++) {
    const step = (out.get(at) ?? []).find((s) => !s.used);
    if (!step) break;
    step.used = true;
    at = step.to;
    if (at === first.from) break;
    ring.push(at);
  }
  const unused = [...out.values()].some((l) => l.some((s) => !s.used));
  if (unused || ring.length < 3 || at !== first.from) return { error: "Joining these panels would leave a hole or a pinch between them, so it was not done." };

  const keep = hingeEnds(setup, [a.id, b.id], [hinge.id]);
  const merged = simplify(ring.map((i) => pool[i]!), keep);
  if (merged.length < 3 || Math.abs(signedArea(merged)) < MIN_AREA) return { error: "The joined panel would have no size." };

  const panel: FoldPanelSpec = { ...a, polygon: flatten(merged) };
  const gone = b.id;
  const next: FoldSetup = {
    ...setup,
    panels: setup.panels.filter((p) => p.id !== gone).map((p) => (p.id === a.id ? panel : p)),
    hinges: setup.hinges.filter((h) => h.id !== hinge.id).map((h) => (h.parentId === gone ? { ...h, parentId: a.id } : h)),
    ...(setup.groundId === gone ? { groundId: a.id } : {}),
  };
  return check(compactOrders(next));
}

/** The chord a straight line makes through a panel, starting at the point `from` (which must be inside the panel). */
function chordAt(poly: readonly Pt[], from: Pt, to: Pt): { p: Pt; q: Pt } | null {
  const len = dist(from, to);
  if (len < 1e-6) return null;
  const ux = (to[0] - from[0]) / len;
  const uy = (to[1] - from[1]) / len;
  // Where the infinite line crosses the outline, as distances along it from `from`.
  const ts: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const den = ux * ey - uy * ex;
    if (Math.abs(den) < 1e-12) continue; // parallel
    const t = ((a[0] - from[0]) * ey - (a[1] - from[1]) * ex) / den;
    const s = ((a[0] - from[0]) * uy - (a[1] - from[1]) * ux) / den;
    if (s >= -1e-9 && s <= 1 + 1e-9) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const spots: number[] = [];
  for (const t of ts) if (spots.length === 0 || t - spots[spots.length - 1]! > TOL / 2) spots.push(t);
  for (let i = 0; i + 1 < spots.length; i++) {
    const t0 = spots[i]!;
    const t1 = spots[i + 1]!;
    if (t0 > 1e-9 || t1 < -1e-9) continue; // the span must hold the starting point
    const mid: Pt = [from[0] + ux * ((t0 + t1) / 2), from[1] + uy * ((t0 + t1) / 2)];
    if (!inside(mid, poly)) continue;
    return { p: [from[0] + ux * t0, from[1] + uy * t0], q: [from[0] + ux * t1, from[1] + uy * t1] };
  }
  return null;
}

/** A point of the outline, set into it (on the edge it lies on) unless it is a corner already; returns its place in the list. */
function insertOnOutline(pts: Pt[], p: Pt): number {
  const corner = pts.findIndex((q) => dist(q, p) <= TOL);
  if (corner >= 0) return corner;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = toSegment(p, pts[i]!, pts[(i + 1) % pts.length]!).d;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  pts.splice(best + 1, 0, p);
  return best + 1;
}

/**
 * Cut a panel in two along the straight line through the points `a` and `b` (both in the sheet's millimetres; `a` must be inside the panel).
 * The line is cut where it enters and leaves the panel. The piece nearer the base keeps the name and the old fold lines of its side;
 * the other piece is a new panel joined to it by a new fold line (90 degrees, folding after the fold line the panel hangs on).
 */
export function splitPanel(setup: FoldSetup, panelId: string, a: Pt, b: Pt): PanelEdit {
  const panel = setup.panels.find((p) => p.id === panelId);
  if (!panel) return { error: "That panel is not there any more." };
  const outline = toPts(panel.polygon);
  if (!inside(a, outline)) return { error: "Start the cut line inside a panel." };
  const chord = chordAt(outline, a, snapCut(a, b));
  if (!chord) return { error: "The cut line does not cross that panel. Pick two points further apart." };
  const { p, q } = chord;
  if (dist(p, q) < MIN_CUT) return { error: "That cut line is too short." };

  const ring = [...outline];
  insertOnOutline(ring, p);
  insertOnOutline(ring, q);
  const ipAfter = ring.findIndex((r) => dist(r, p) <= TOL);
  const iq = ring.findIndex((r) => dist(r, q) <= TOL);
  if (ipAfter < 0 || iq < 0 || ipAfter === iq) return { error: "The cut line could not be placed on the panel." };
  const walk = (from: number, to: number) => {
    const out: Pt[] = [];
    for (let i = from; ; i = (i + 1) % ring.length) {
      out.push(ring[i]!);
      if (i === to) break;
    }
    return out;
  };
  const sideA = walk(ipAfter, iq);
  const sideB = walk(iq, ipAfter);
  if (sideA.length < 3 || sideB.length < 3 || Math.abs(signedArea(sideA)) < MIN_AREA || Math.abs(signedArea(sideB)) < MIN_AREA) return { error: "One of the two pieces would have no size." };

  // Which side every fold line of this panel is on. A fold line the cut runs through cannot be split.
  const touching = setup.hinges.filter((h) => h.parentId === panelId || h.childId === panelId);
  // A fold line the cut ends on (in the middle of it) is cut short: the longer part stays a fold line, on the piece it lies along.
  const sideOf = new Map<string, 0 | 1>();
  const clipped = new Map<string, [number, number, number, number]>();
  for (const h of touching) {
    const onA = lineOnOutline(h.line, sideA);
    const onB = lineOnOutline(h.line, sideB);
    if (onA || onB) {
      sideOf.set(h.id, onA ? 0 : 1);
      continue;
    }
    const e1: Pt = [h.line[0], h.line[1]];
    const e2: Pt = [h.line[2], h.line[3]];
    const at = [p, q].find((c) => toSegment(c, e1, e2).d <= TOL && dist(c, e1) > TOL && dist(c, e2) > TOL);
    const halves = at
      ? ([
          [e1[0], e1[1], at[0], at[1]],
          [at[0], at[1], e2[0], e2[1]],
        ] as [number, number, number, number][])
      : [];
    const fit = halves
      .map((l) => ({ l, side: lineOnOutline(l, sideA) ? 0 : lineOnOutline(l, sideB) ? 1 : -1, len: Math.hypot(l[2] - l[0], l[3] - l[1]) }))
      .filter((f) => f.side >= 0)
      .sort((x, y) => y.len - x.len)[0];
    if (!fit) return { error: "The cut line goes through a fold line of this panel in a way that cannot be split. Start and end it at a corner or between the fold lines." };
    clipped.set(h.id, fit.l);
    sideOf.set(h.id, fit.side as 0 | 1);
  }

  const roots = [setup.rootId, ...(setup.parts ?? []).map((r) => r.rootId)];
  const hangsOn = setup.hinges.find((h) => h.childId === panelId);
  // The side that keeps the old name: the one the panel hangs on its parent by, else (a base panel) the bigger one.
  const keepSide: 0 | 1 = hangsOn && !roots.includes(panelId) ? (sideOf.get(hangsOn.id) ?? 0) : Math.abs(signedArea(sideA)) >= Math.abs(signedArea(sideB)) ? 0 : 1;
  const sides = [sideA, sideB] as const;

  const newPanelNumber = Math.max(0, ...setup.panels.map((x) => idNumber(x.id, "p"))) + 1;
  const newPanelId = `p${newPanelNumber}`;
  const newHingeId = `h${Math.max(0, ...setup.hinges.map((x) => idNumber(x.id, "h"))) + 1}`;
  const labelNumber = Math.max(0, ...setup.panels.map((x) => /^Panel (\d+)$/.exec(x.label)?.[1] ? Number(/^Panel (\d+)$/.exec(x.label)![1]) : 0)) + 1;
  const newLabel = setup.panels.some((x) => /^Panel \d+$/.test(x.label)) ? `Panel ${labelNumber}` : `${panel.label} ${2}`;

  const keepEnds = hingeEnds(setup, [panelId]);
  const kept: FoldPanelSpec = { ...panel, polygon: flatten(simplify(sides[keepSide], [...keepEnds, p, q])) };
  const added: FoldPanelSpec = { ...panel, id: newPanelId, label: newLabel, polygon: flatten(simplify(sides[keepSide === 0 ? 1 : 0], [...keepEnds, p, q])) };

  // Old fold lines: those on the other side now belong to the new panel.
  const moved = (h: FoldHingeSpec): FoldHingeSpec => {
    const onOther = sideOf.get(h.id) !== keepSide;
    if (!onOther || h.id === hangsOn?.id) return h;
    return h.parentId === panelId ? { ...h, parentId: newPanelId } : h;
  };
  let hinges = setup.hinges.map(moved).map((h) => (clipped.has(h.id) ? { ...h, line: clipped.get(h.id)! } : h));
  const parentOrder = hangsOn?.order ?? 0;
  // The new fold line folds right after the one the panel hangs on; whatever hangs off the new panel folds after that.
  const below = new Set<string>([newPanelId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const h of hinges) if (below.has(h.parentId) && !below.has(h.childId)) {
      below.add(h.childId);
      grew = true;
    }
  }
  hinges = hinges.map((h) => (below.has(h.parentId) ? { ...h, order: h.order + 1 } : h));
  const line: [number, number, number, number] = [p[0], p[1], q[0], q[1]];
  const hingeNew: FoldHingeSpec = { id: newHingeId, parentId: panelId, childId: newPanelId, line, angleDeg: 90, order: parentOrder + 1 };
  const at = setup.panels.findIndex((x) => x.id === panelId);
  const panels = setup.panels.map((x) => (x.id === panelId ? kept : x));
  panels.splice(at + 1, 0, added);
  return check(compactOrders({ ...setup, panels, hinges: [...hinges, hingeNew] }));
}
