import type { FlatDieline, FlatPath } from "./imported";
import type { DetectResult, FoldHingeSpec, FoldPanelSpec, FoldSetup } from "./imported-fold";
import { flatCentroid, flatSignedArea, segmentOnPolygonEdge, HINGE_TOLERANCE } from "./imported-fold-util";

/**
 * Detects panels and fold hinges in a flat dieline.
 *
 * Steps: snap endpoints, split lines where they touch or cross, drop dangling
 * lines, walk the faces of the resulting planar graph, keep the faces that lie
 * inside an odd number of closed cut loops, connect them through shared fold
 * lines and take a spanning tree from the largest panel.
 */

/** Endpoints closer than this (mm) are the same point. */
const SNAP = 0.02;
/** Faces smaller than this (mm^2) are noise, not panels. */
const MIN_FACE_AREA = 0.05;
/** Hinges shorter than this (mm) are ignored. */
const MIN_HINGE_LENGTH = 0.1;
/** Probe distance (mm) used to find a point just inside a face. */
const PROBE = 1e-3;

const CUT = 1;
const CREASE = 2;

/** Vertex store that merges points within SNAP of an existing vertex. */
class Points {
  readonly xs: number[] = [];
  readonly ys: number[] = [];
  private readonly cells = new Map<number, number[]>();
  private static readonly CELL = 0.05;

  private key(ix: number, iy: number): number {
    return (ix + 4194304) * 8388608 + (iy + 4194304);
  }

  at(x: number, y: number): number {
    const ix = Math.floor(x / Points.CELL);
    const iy = Math.floor(y / Points.CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = this.cells.get(this.key(ix + dx, iy + dy));
        if (!list) continue;
        for (const id of list) {
          if (Math.hypot(this.xs[id]! - x, this.ys[id]! - y) <= SNAP) return id;
        }
      }
    }
    const id = this.xs.length;
    this.xs.push(x);
    this.ys.push(y);
    const k = this.key(ix, iy);
    const list = this.cells.get(k);
    if (list) list.push(id);
    else this.cells.set(k, [id]);
    return id;
  }

  get size(): number {
    return this.xs.length;
  }
}

interface Seg {
  readonly a: number;
  readonly b: number;
  readonly kind: number;
}

interface Face {
  /** Outer boundary vertex ids, positive orientation. */
  vids: number[];
  area: number;
  /** Inner boundaries (holes) found while walking. */
  holes: number;
  /** Extra positive parts when the boundary touches itself. */
  extraParts: number;
  material: boolean;
}

const finitePath = (p: FlatPath): boolean => p.pts.length >= 4 && p.pts.every((v) => Number.isFinite(v));

/** Ray-cast point-in-polygon for a polygon given as vertex ids. */
function insideLoop(xs: readonly number[], ys: readonly number[], loop: readonly number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const xi = xs[loop[i]!]!;
    const yi = ys[loop[i]!]!;
    const xj = xs[loop[j]!]!;
    const yj = ys[loop[j]!]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Remove repeated points and vertices on a straight line (except `keep`). */
function simplifyLoop(vids: readonly number[], xs: readonly number[], ys: readonly number[], keep: ReadonlySet<number>): number[] {
  let pts = [...vids];
  for (let pass = 0; pass < 50; pass++) {
    const out: number[] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const cur = pts[i]!;
      if (keep.has(cur)) {
        out.push(cur);
        continue;
      }
      const prev = pts[(i - 1 + n) % n]!;
      const next = pts[(i + 1) % n]!;
      const ax = xs[cur]! - xs[prev]!;
      const ay = ys[cur]! - ys[prev]!;
      const bx = xs[next]! - xs[cur]!;
      const by = ys[next]! - ys[cur]!;
      const la = Math.hypot(ax, ay);
      const lb = Math.hypot(bx, by);
      const same = cur === prev || cur === next || la < 1e-9 || lb < 1e-9;
      const straight = la > 0 && lb > 0 && Math.abs(ax * by - ay * bx) / (la * lb) < 1e-6 && ax * bx + ay * by > 0;
      if (!same && !straight) out.push(cur);
    }
    if (out.length === n || out.length < 3) {
      pts = out.length < 3 ? pts : out;
      break;
    }
    pts = out;
  }
  return pts;
}

export function detectFoldSetup(flat: FlatDieline): DetectResult {
  const warnings: string[] = [];
  const pts = new Points();

  // 1. Snap every point and collect segments.
  const segs: Seg[] = [];
  const loopSegs: number[][] = []; // for each closed cut path, its segment indices in order
  const addPath = (p: FlatPath, kind: number) => {
    if (!finitePath(p)) return;
    const ids: number[] = [];
    for (let i = 0; i + 1 < p.pts.length; i += 2) {
      const id = pts.at(p.pts[i]!, p.pts[i + 1]!);
      if (ids[ids.length - 1] !== id) ids.push(id);
    }
    if (p.closed && ids.length > 1 && ids[0] === ids[ids.length - 1]) ids.pop();
    if (ids.length < 2) return;
    const mine: number[] = [];
    const count = p.closed ? ids.length : ids.length - 1;
    for (let i = 0; i < count; i++) {
      const a = ids[i]!;
      const b = ids[(i + 1) % ids.length]!;
      if (a === b) continue;
      mine.push(segs.length);
      segs.push({ a, b, kind });
    }
    if (kind === CUT && p.closed && ids.length >= 3) loopSegs.push(mine);
  };
  for (const p of flat.cut) addPath(p, CUT);
  for (const p of flat.crease) addPath(p, CREASE);
  if (segs.length === 0) {
    return { setup: { rootId: "", panels: [], hinges: [] }, warnings: ["No usable cut or fold lines were found."] };
  }

  // 2. Spatial grid over segments and vertices.
  const nVertsAtStart = pts.size;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < nVertsAtStart; i++) {
    minX = Math.min(minX, pts.xs[i]!);
    minY = Math.min(minY, pts.ys[i]!);
    maxX = Math.max(maxX, pts.xs[i]!);
    maxY = Math.max(maxY, pts.ys[i]!);
  }
  const cellSize = Math.max(Math.max(maxX - minX, maxY - minY) / 256, 0.5);
  const cellX = (x: number) => Math.floor((x - minX) / cellSize);
  const cellY = (y: number) => Math.floor((y - minY) / cellSize);
  const cellKey = (ix: number, iy: number) => ix * 4096 + iy;

  const ns = segs.length;
  const bx0 = new Float64Array(ns);
  const by0 = new Float64Array(ns);
  const bx1 = new Float64Array(ns);
  const by1 = new Float64Array(ns);
  const segCells = new Map<number, number[]>();
  segs.forEach((s, i) => {
    const ax = pts.xs[s.a]!;
    const ay = pts.ys[s.a]!;
    const bx = pts.xs[s.b]!;
    const by = pts.ys[s.b]!;
    bx0[i] = Math.min(ax, bx) - SNAP;
    by0[i] = Math.min(ay, by) - SNAP;
    bx1[i] = Math.max(ax, bx) + SNAP;
    by1[i] = Math.max(ay, by) + SNAP;
    for (let ix = cellX(bx0[i]!); ix <= cellX(bx1[i]!); ix++) {
      for (let iy = cellY(by0[i]!); iy <= cellY(by1[i]!); iy++) {
        const k = cellKey(ix, iy);
        const list = segCells.get(k);
        if (list) list.push(i);
        else segCells.set(k, [i]);
      }
    }
  });

  const splits: [number, number][][] = segs.map(() => []);
  const addSplit = (si: number, vid: number) => {
    const s = segs[si]!;
    if (vid === s.a || vid === s.b) return;
    const ax = pts.xs[s.a]!;
    const ay = pts.ys[s.a]!;
    const rx = pts.xs[s.b]! - ax;
    const ry = pts.ys[s.b]! - ay;
    const t = ((pts.xs[vid]! - ax) * rx + (pts.ys[vid]! - ay) * ry) / (rx * rx + ry * ry);
    splits[si]!.push([t, vid]);
  };

  // 3. Crossings between segments (new vertices where they cross).
  for (const [key, list] of segCells) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const s1 = list[i]!;
        const s2 = list[j]!;
        const mx = Math.max(bx0[s1]!, bx0[s2]!);
        const my = Math.max(by0[s1]!, by0[s2]!);
        if (mx > Math.min(bx1[s1]!, bx1[s2]!) || my > Math.min(by1[s1]!, by1[s2]!)) continue;
        if (cellKey(cellX(mx), cellY(my)) !== key) continue; // handled in another cell
        const A = segs[s1]!;
        const B = segs[s2]!;
        if (A.a === B.a || A.a === B.b || A.b === B.a || A.b === B.b) continue;
        const px = pts.xs[A.a]!;
        const py = pts.ys[A.a]!;
        const rx = pts.xs[A.b]! - px;
        const ry = pts.ys[A.b]! - py;
        const qx = pts.xs[B.a]!;
        const qy = pts.ys[B.a]!;
        const sx = pts.xs[B.b]! - qx;
        const sy = pts.ys[B.b]! - qy;
        const lr = Math.hypot(rx, ry);
        const ls = Math.hypot(sx, sy);
        const den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-9 * lr * ls) continue; // parallel: overlaps are handled by the vertex pass
        const t = ((qx - px) * sy - (qy - py) * sx) / den;
        const u = ((qx - px) * ry - (qy - py) * rx) / den;
        const tt = SNAP / lr;
        const tu = SNAP / ls;
        if (t < -tt || t > 1 + tt || u < -tu || u > 1 + tu) continue;
        const tc = Math.min(1, Math.max(0, t));
        const vid = pts.at(px + rx * tc, py + ry * tc);
        addSplit(s1, vid);
        addSplit(s2, vid);
      }
    }
  }

  // 4. Vertices lying on a segment (T junctions, overlapping lines).
  const vertCells = new Map<number, number[]>();
  for (let v = 0; v < pts.size; v++) {
    const k = cellKey(cellX(pts.xs[v]!), cellY(pts.ys[v]!));
    const list = vertCells.get(k);
    if (list) list.push(v);
    else vertCells.set(k, [v]);
  }
  for (let si = 0; si < ns; si++) {
    const s = segs[si]!;
    const ax = pts.xs[s.a]!;
    const ay = pts.ys[s.a]!;
    const rx = pts.xs[s.b]! - ax;
    const ry = pts.ys[s.b]! - ay;
    const len2 = rx * rx + ry * ry;
    const len = Math.sqrt(len2);
    const seen = new Set<number>();
    for (let ix = cellX(bx0[si]!); ix <= cellX(bx1[si]!); ix++) {
      for (let iy = cellY(by0[si]!); iy <= cellY(by1[si]!); iy++) {
        const list = vertCells.get(cellKey(ix, iy));
        if (!list) continue;
        for (const v of list) {
          if (v === s.a || v === s.b || seen.has(v)) continue;
          seen.add(v);
          const vx = pts.xs[v]! - ax;
          const vy = pts.ys[v]! - ay;
          const t = (vx * rx + vy * ry) / len2;
          if (t <= 0 || t >= 1) continue;
          if (Math.abs(vx * ry - vy * rx) / len <= SNAP) splits[si]!.push([t, v]);
        }
      }
    }
  }

  // 5. Edges between consecutive split points (a cut edge wins over a fold on the same line).
  const nv = pts.size;
  const edgeIndex = new Map<number, number>();
  const ea: number[] = [];
  const eb: number[] = [];
  const ekind: number[] = [];
  const addEdge = (u: number, v: number, kind: number) => {
    if (u === v) return;
    const lo = Math.min(u, v);
    const hi = Math.max(u, v);
    const key = lo * (nv + 1) + hi;
    const found = edgeIndex.get(key);
    if (found !== undefined) {
      if (kind === CUT) ekind[found] = CUT;
      return;
    }
    edgeIndex.set(key, ea.length);
    ea.push(lo);
    eb.push(hi);
    ekind.push(kind);
  };
  const chains: number[][] = segs.map((s, si) => {
    const list = splits[si]!.sort((p, q) => p[0] - q[0]);
    const chain = [s.a];
    for (const [, v] of list) if (chain[chain.length - 1] !== v) chain.push(v);
    if (chain[chain.length - 1] !== s.b) chain.push(s.b);
    return chain;
  });
  chains.forEach((chain, si) => {
    for (let i = 0; i + 1 < chain.length; i++) addEdge(chain[i]!, chain[i + 1]!, segs[si]!.kind);
  });

  // Closed cut loops as vertex id lists (for the odd/even material test).
  const loops: number[][] = [];
  for (const mine of loopSegs) {
    const loop: number[] = [];
    for (const si of mine) {
      const chain = chains[si]!;
      for (let i = 0; i + 1 < chain.length; i++) if (loop[loop.length - 1] !== chain[i]) loop.push(chain[i]!);
    }
    if (loop.length > 1 && loop[0] === loop[loop.length - 1]) loop.pop();
    if (loop.length >= 3 && Math.abs(flatSignedArea(loop.flatMap((v) => [pts.xs[v]!, pts.ys[v]!]))) > 1e-6) loops.push(loop);
  }

  // 6. Remove dangling edges (open slits and fold lines that end in the material).
  const ne = ea.length;
  const alive = new Array<boolean>(ne).fill(true);
  const adj: number[][] = Array.from({ length: nv }, () => []);
  for (let e = 0; e < ne; e++) {
    adj[ea[e]!]!.push(e);
    adj[eb[e]!]!.push(e);
  }
  const degree = adj.map((l) => l.length);
  const stack: number[] = [];
  for (let v = 0; v < nv; v++) if (degree[v] === 1) stack.push(v);
  let danglingCreases = 0;
  while (stack.length) {
    const v = stack.pop()!;
    if (degree[v] !== 1) continue;
    const e = adj[v]!.find((x) => alive[x]);
    if (e === undefined) continue;
    alive[e] = false;
    if (ekind[e] === CREASE) danglingCreases++;
    degree[ea[e]!]!--;
    degree[eb[e]!]!--;
    const other = ea[e] === v ? eb[e]! : ea[e]!;
    if (degree[other] === 1) stack.push(other);
  }
  if (danglingCreases > 0) warnings.push(`${danglingCreases} fold line ${danglingCreases === 1 ? "piece ends" : "pieces end"} inside a panel or does not connect two panels, so it was ignored.`);

  // 7. Half-edges: h = 2e goes ea -> eb, h = 2e+1 goes eb -> ea.
  const origin = (h: number) => ((h & 1) === 0 ? ea[h >> 1]! : eb[h >> 1]!);
  const dest = (h: number) => ((h & 1) === 0 ? eb[h >> 1]! : ea[h >> 1]!);
  const angle = new Float64Array(2 * ne);
  const out: number[][] = Array.from({ length: nv }, () => []);
  for (let e = 0; e < ne; e++) {
    if (!alive[e]) continue;
    for (const h of [2 * e, 2 * e + 1]) {
      angle[h] = Math.atan2(pts.ys[dest(h)]! - pts.ys[origin(h)]!, pts.xs[dest(h)]! - pts.xs[origin(h)]!);
      out[origin(h)]!.push(h);
    }
  }
  const pos = new Int32Array(2 * ne);
  for (const list of out) {
    list.sort((p, q) => angle[p]! - angle[q]!);
    list.forEach((h, i) => (pos[h] = i));
  }
  const next = (h: number) => {
    const list = out[dest(h)]!;
    return list[(pos[h ^ 1]! - 1 + list.length) % list.length]!;
  };

  const faceOf = new Int32Array(2 * ne).fill(-1);
  const visited = new Uint8Array(2 * ne);
  const faces: Face[] = [];
  const innerWalks: number[] = []; // first vertex of each negative (hole or outer) walk
  for (let e = 0; e < ne; e++) {
    if (!alive[e]) continue;
    for (const start of [2 * e, 2 * e + 1]) {
      if (visited[start]) continue;
      const walk: number[] = [];
      let h = start;
      do {
        visited[h] = 1;
        walk.push(h);
        h = next(h);
      } while (h !== start);
      const vids = walk.map(origin);
      const area = flatSignedArea(vids.flatMap((v) => [pts.xs[v]!, pts.ys[v]!]));
      if (area > 1e-9) {
        // Split a boundary that touches itself (bridges, spikes) into simple cycles.
        const cycles: number[][] = [];
        const st: number[] = [];
        const where = new Map<number, number>();
        for (const v of vids) {
          const at = where.get(v);
          if (at !== undefined) {
            const cyc = st.splice(at);
            for (const c of cyc) where.delete(c);
            cycles.push(cyc);
            where.set(v, st.length);
            st.push(v);
          } else {
            where.set(v, st.length);
            st.push(v);
          }
        }
        cycles.push(st);
        let best: number[] | undefined;
        let bestArea = 0;
        let holes = 0;
        let extra = 0;
        for (const c of cycles) {
          if (c.length < 3) continue;
          const a = flatSignedArea(c.flatMap((v) => [pts.xs[v]!, pts.ys[v]!]));
          if (a > 1e-9) {
            if (a > bestArea) {
              if (best) extra++;
              best = c;
              bestArea = a;
            } else extra++;
          } else if (a < -1e-9) holes++;
        }
        const fi = faces.length;
        for (const hh of walk) faceOf[hh] = fi;
        faces.push({ vids: best ?? vids, area: bestArea || area, holes, extraParts: extra, material: false });
      } else if (area < -1e-9) {
        innerWalks.push(vids[0]!);
      }
    }
  }

  // 8. Material test: inside an odd number of closed cut loops.
  const loopBounds = loops.map((l) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const v of l) {
      x0 = Math.min(x0, pts.xs[v]!);
      y0 = Math.min(y0, pts.ys[v]!);
      x1 = Math.max(x1, pts.xs[v]!);
      y1 = Math.max(y1, pts.ys[v]!);
    }
    return [x0, y0, x1, y1] as const;
  });
  let slivers = 0;
  for (const f of faces) {
    // Probe a point just inside the longest boundary edge.
    let bi = 0;
    let bl = -1;
    for (let i = 0; i < f.vids.length; i++) {
      const a = f.vids[i]!;
      const b = f.vids[(i + 1) % f.vids.length]!;
      const l = Math.hypot(pts.xs[b]! - pts.xs[a]!, pts.ys[b]! - pts.ys[a]!);
      if (l > bl) {
        bl = l;
        bi = i;
      }
    }
    const a = f.vids[bi]!;
    const b = f.vids[(bi + 1) % f.vids.length]!;
    const dx = pts.xs[b]! - pts.xs[a]!;
    const dy = pts.ys[b]! - pts.ys[a]!;
    const px = (pts.xs[a]! + pts.xs[b]!) / 2 - (dy / bl) * PROBE;
    const py = (pts.ys[a]! + pts.ys[b]!) / 2 + (dx / bl) * PROBE;
    let depth = 0;
    loops.forEach((loop, i) => {
      const bb = loopBounds[i]!;
      if (px < bb[0] || px > bb[2] || py < bb[1] || py > bb[3]) return;
      if (insideLoop(pts.xs, pts.ys, loop, px, py)) depth++;
    });
    if (depth % 2 === 1) {
      if (f.area < MIN_FACE_AREA) slivers++;
      else f.material = true;
    }
  }
  if (slivers > 0) warnings.push(`${slivers} tiny ${slivers === 1 ? "region" : "regions"} (under ${MIN_FACE_AREA} mm2) ${slivers === 1 ? "was" : "were"} ignored.`);

  // Which material face (if any) contains each inner walk (a hole or cut-out inside a panel).
  const holesIn = new Map<number, number>();
  faces.forEach((f, fi) => {
    if (f.holes > 0) holesIn.set(fi, f.holes);
  });
  for (const v of innerWalks) {
    let host = -1;
    let hostArea = Infinity;
    for (let fi = 0; fi < faces.length; fi++) {
      const f = faces[fi]!;
      if (!f.material || f.area >= hostArea) continue;
      if (f.vids.includes(v)) continue;
      if (insideLoop(pts.xs, pts.ys, f.vids, pts.xs[v]!, pts.ys[v]!)) {
        host = fi;
        hostArea = f.area;
      }
    }
    if (host >= 0) holesIn.set(host, (holesIn.get(host) ?? 0) + 1);
  }

  const materialFaces = faces.map((f, i) => (f.material ? i : -1)).filter((i) => i >= 0);
  if (materialFaces.length === 0) {
    return { setup: { rootId: "", panels: [], hinges: [] }, warnings: [...warnings, "No closed panel shapes were found. Check that the outer cut outline is closed."] };
  }

  // Outline of each material face with straight-through vertices removed (used to test hinge lines).
  const flatOf = (vids: readonly number[]) => vids.flatMap((v) => [pts.xs[v]!, pts.ys[v]!]);
  const maxPoly = new Map<number, number[]>();
  for (const fi of materialFaces) maxPoly.set(fi, flatOf(simplifyLoop(faces[fi]!.vids, pts.xs, pts.ys, new Set())));

  // 9. Fold lines between two material faces.
  const pairEdges = new Map<string, number[]>();
  let sameFace = 0;
  let notBetweenPanels = 0;
  for (let e = 0; e < ne; e++) {
    if (!alive[e] || ekind[e] !== CREASE) continue;
    const f1 = faceOf[2 * e]!;
    const f2 = faceOf[2 * e + 1]!;
    if (f1 >= 0 && f1 === f2) {
      sameFace++;
      continue;
    }
    if (f1 < 0 || f2 < 0 || !faces[f1]!.material || !faces[f2]!.material) {
      notBetweenPanels++;
      continue;
    }
    const key = `${Math.min(f1, f2)}:${Math.max(f1, f2)}`;
    const list = pairEdges.get(key);
    if (list) list.push(e);
    else pairEdges.set(key, [e]);
  }
  if (sameFace > 0) warnings.push(`${sameFace} fold line ${sameFace === 1 ? "piece has" : "pieces have"} the same panel on both sides, so ${sameFace === 1 ? "it was" : "they were"} ignored.`);
  if (notBetweenPanels > 0) warnings.push(`${notBetweenPanels} fold line ${notBetweenPanels === 1 ? "piece does" : "pieces do"} not separate two panels (for example along a cut-out), so ${notBetweenPanels === 1 ? "it was" : "they were"} ignored.`);

  interface Candidate {
    readonly fa: number;
    readonly fb: number;
    readonly lo: number;
    readonly hi: number;
  }
  const candidates: Candidate[] = [];
  const pairKeys = [...pairEdges.keys()].sort((p, q) => {
    const [a1, b1] = p.split(":").map(Number) as [number, number];
    const [a2, b2] = q.split(":").map(Number) as [number, number];
    return a1 - a2 || b1 - b2;
  });
  let curvedPairs = 0;
  let lostPairs = 0;
  for (const key of pairKeys) {
    const [fa, fb] = key.split(":").map(Number) as [number, number];
    const edges = pairEdges.get(key)!;
    const len = (e: number) => Math.hypot(pts.xs[ea[e]!]! - pts.xs[eb[e]!]!, pts.ys[ea[e]!]! - pts.ys[eb[e]!]!);
    edges.sort((p, q) => len(q) - len(p) || p - q);

    interface Group {
      px: number;
      py: number;
      ux: number;
      uy: number;
      items: { t0: number; t1: number; v0: number; v1: number; len: number }[];
    }
    const groups: Group[] = [];
    for (const e of edges) {
      const ax = pts.xs[ea[e]!]!;
      const ay = pts.ys[ea[e]!]!;
      const bx = pts.xs[eb[e]!]!;
      const by = pts.ys[eb[e]!]!;
      let g = groups.find((c) => Math.abs((ax - c.px) * c.uy - (ay - c.py) * c.ux) <= HINGE_TOLERANCE && Math.abs((bx - c.px) * c.uy - (by - c.py) * c.ux) <= HINGE_TOLERANCE);
      if (!g) {
        const l = len(e);
        g = { px: ax, py: ay, ux: (bx - ax) / l, uy: (by - ay) / l, items: [] };
        groups.push(g);
      }
      const t0 = (ax - g.px) * g.ux + (ay - g.py) * g.uy;
      const t1 = (bx - g.px) * g.ux + (by - g.py) * g.uy;
      g.items.push(t0 <= t1 ? { t0, t1, v0: ea[e]!, v1: eb[e]!, len: len(e) } : { t0: t1, t1: t0, v0: eb[e]!, v1: ea[e]!, len: len(e) });
    }
    const extent = (items: Group["items"]) => Math.max(...items.map((i) => i.t1)) - Math.min(...items.map((i) => i.t0));
    const ranked = [...groups].sort((p, q) => extent(q.items) - extent(p.items));
    const best = ranked[0]!;
    const otherLength = ranked.slice(1).reduce((s, g) => s + g.items.reduce((x, i) => x + i.len, 0), 0);
    if (otherLength >= MIN_HINGE_LENGTH) curvedPairs++;

    const endpoints = (items: Group["items"]) => {
      let lo = items[0]!;
      let hi = items[0]!;
      for (const i of items) {
        if (i.t0 < lo.t0) lo = i;
        if (i.t1 > hi.t1) hi = i;
      }
      return { lo: lo.v0, hi: hi.v1 };
    };
    const fits = (lo: number, hi: number) => {
      if (Math.hypot(pts.xs[hi]! - pts.xs[lo]!, pts.ys[hi]! - pts.ys[lo]!) < MIN_HINGE_LENGTH) return false;
      const line: [number, number, number, number] = [pts.xs[lo]!, pts.ys[lo]!, pts.xs[hi]!, pts.ys[hi]!];
      return segmentOnPolygonEdge(maxPoly.get(fa)!, line) && segmentOnPolygonEdge(maxPoly.get(fb)!, line);
    };
    let { lo, hi } = endpoints(best.items);
    if (!fits(lo, hi)) {
      // The fold line is interrupted by something that is not straight: use the longest unbroken run.
      const sorted = [...best.items].sort((p, q) => p.t0 - q.t0);
      let runs: Group["items"][] = [];
      for (const it of sorted) {
        const last = runs[runs.length - 1];
        if (last && it.t0 - last[last.length - 1]!.t1 <= HINGE_TOLERANCE) last.push(it);
        else runs.push([it]);
      }
      runs = runs.sort((p, q) => extent(q) - extent(p));
      const r = runs[0] ? endpoints(runs[0]) : undefined;
      if (!r || !fits(r.lo, r.hi)) {
        lostPairs++;
        continue;
      }
      lo = r.lo;
      hi = r.hi;
    }
    candidates.push({ fa, fb, lo, hi });
  }
  if (curvedPairs > 0) warnings.push(`${curvedPairs} pair${curvedPairs === 1 ? "" : "s"} of panels share fold lines that are not on one straight line. Only the longest straight fold was used for each.`);
  if (lostPairs > 0) warnings.push(`${lostPairs} fold line${lostPairs === 1 ? "" : "s"} between panels could not be used because ${lostPairs === 1 ? "it does" : "they do"} not run along a straight edge of both panels.`);

  // 10. Spanning tree from the largest panel.
  let root = materialFaces[0]!;
  for (const fi of materialFaces) if (faces[fi]!.area > faces[root]!.area + 1e-9) root = fi;
  const neighbours = new Map<number, { other: number; cand: number }[]>();
  candidates.forEach((c, i) => {
    for (const [x, y] of [
      [c.fa, c.fb],
      [c.fb, c.fa],
    ] as const) {
      const l = neighbours.get(x) ?? [];
      l.push({ other: y, cand: i });
      neighbours.set(x, l);
    }
  });
  for (const l of neighbours.values()) l.sort((p, q) => p.other - q.other);
  const depth = new Map<number, number>([[root, 0]]);
  const parentOf = new Map<number, number>();
  const treeHinges: { parent: number; child: number; cand: number }[] = [];
  const used = new Set<number>();
  const queue = [root];
  for (let qi = 0; qi < queue.length; qi++) {
    const u = queue[qi]!;
    for (const { other, cand } of neighbours.get(u) ?? []) {
      if (depth.has(other)) continue;
      depth.set(other, depth.get(u)! + 1);
      parentOf.set(other, u);
      treeHinges.push({ parent: u, child: other, cand });
      used.add(cand);
      queue.push(other);
    }
  }
  const loopClosing = candidates.filter((c, i) => !used.has(i) && depth.has(c.fa) && depth.has(c.fb)).length;
  if (loopClosing > 0) warnings.push(`${loopClosing} fold line${loopClosing === 1 ? "" : "s"} would fold a panel back onto one it is already attached to (a loop), so ${loopClosing === 1 ? "it was" : "they were"} ignored.`);
  const unreachable = materialFaces.filter((fi) => !depth.has(fi));
  if (unreachable.length > 0) {
    const where = unreachable.map((fi) => {
      const c = flatCentroid(flatOf(faces[fi]!.vids));
      return `(${c.x.toFixed(1)}, ${c.y.toFixed(1)})`;
    });
    warnings.push(`${unreachable.length} panel${unreachable.length === 1 ? " is" : "s are"} not connected to the main body by a fold line and ${unreachable.length === 1 ? "was" : "were"} left out. Near x, y (mm): ${where.join(", ")}.`);
  }

  // 11. Ids and labels: reading order of panel centres (left to right, then top to bottom).
  const kept = [...depth.keys()];
  const centre = new Map(kept.map((fi) => [fi, flatCentroid(flatOf(faces[fi]!.vids))]));
  kept.sort((p, q) => {
    const a = centre.get(p)!;
    const b = centre.get(q)!;
    return Math.round(a.x) - Math.round(b.x) || a.y - b.y || a.x - b.x;
  });
  const idOf = new Map(kept.map((fi, i) => [fi, `p${i + 1}`]));
  const labelOf = new Map(kept.map((fi, i) => [fi, `Panel ${i + 1}`]));

  // Hinges numbered in tree order.
  const hingeList = treeHinges.map((t, i) => ({ ...t, id: `h${i + 1}`, c: candidates[t.cand]! }));
  const keepVerts = new Map<number, Set<number>>();
  for (const h of hingeList) {
    for (const fi of [h.parent, h.child]) {
      const s = keepVerts.get(fi) ?? new Set<number>();
      s.add(h.c.lo);
      s.add(h.c.hi);
      keepVerts.set(fi, s);
    }
  }

  const panels: FoldPanelSpec[] = kept.map((fi) => {
    const f = faces[fi]!;
    const simple = simplifyLoop(f.vids, pts.xs, pts.ys, keepVerts.get(fi) ?? new Set());
    // Start at the top-left vertex so the output does not depend on where the walk began.
    let s = 0;
    for (let i = 1; i < simple.length; i++) {
      const a = simple[i]!;
      const b = simple[s]!;
      if (pts.ys[a]! < pts.ys[b]! - 1e-9 || (Math.abs(pts.ys[a]! - pts.ys[b]!) <= 1e-9 && pts.xs[a]! < pts.xs[b]!)) s = i;
    }
    const polygon = flatOf([...simple.slice(s), ...simple.slice(0, s)]);
    const d = depth.get(fi)!;
    let role: FoldPanelSpec["role"] = "body";
    if (d >= 2) {
      const parent = faces[parentOf.get(fi)!]!;
      role = f.area >= 0.6 * parent.area ? "closure" : "tuck";
    }
    return { id: idOf.get(fi)!, label: labelOf.get(fi)!, role, printable: role !== "tuck", polygon };
  });
  panels.sort((p, q) => Number(p.id.slice(1)) - Number(q.id.slice(1)));

  const hinges: FoldHingeSpec[] = hingeList.map((h) => ({
    id: h.id,
    parentId: idOf.get(h.parent)!,
    childId: idOf.get(h.child)!,
    line: [pts.xs[h.c.lo]!, pts.ys[h.c.lo]!, pts.xs[h.c.hi]!, pts.ys[h.c.hi]!],
    angleDeg: 90,
    order: depth.get(h.child)!,
  }));

  for (const fi of kept) {
    const n = holesIn.get(fi) ?? 0;
    if (n > 0) warnings.push(`${labelOf.get(fi)} has ${n} cut-out${n === 1 ? "" : "s"} or inner shape${n === 1 ? "" : "s"} inside it. The 3D model shows it as solid.`);
    if (faces[fi]!.extraParts > 0) warnings.push(`${labelOf.get(fi)} touches itself at a point. Only its largest part is used.`);
  }

  const setup: FoldSetup = { rootId: idOf.get(root)!, panels, hinges };
  return { setup, warnings };
}
