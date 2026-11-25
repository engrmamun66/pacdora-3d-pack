// Turns a screenshot of a dieline (coloured lines on a plain background) into a clean SVG in millimetres.
// Pure JavaScript, no DOM and no libraries: it runs in the extension page and in Node (tests).
//
// How: every pixel is sorted into the role whose colour it is closest to (cut, crease, bleed). Cut and bleed lines are thinned to
// one pixel and followed from end to end, then simplified. Crease lines (dotted, straight along x or y) are found as long rows or columns.
// Breaks where one line hid another are closed, nearly straight lines are made straight.

/** Colours of the three roles and how close a pixel has to be to count (a bigger tolerance accepts more shades). */
export const DEFAULTS = {
  colors: { cut: "#2030b0", bleed: "#40c000", crease: "#ff4040" },
  tolerance: 85,
};

export const MAX_PIXELS = 6_000_000;

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Not a colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The lightest value within `rad` pixels, per channel: the colour of the paper next to a line (white on the sheet, grey outside it). */
function paperColour(img, rad) {
  const { width: w, height: h, data } = img;
  const tmp = new Uint8Array(w * h * 3);
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let m = 0;
      for (let dx = -rad; dx <= rad; dx++) {
        const X = x + dx;
        if (X >= 0 && X < w) m = Math.max(m, data[(y * w + X) * 4 + c]);
      }
      tmp[(y * w + x) * 3 + c] = m;
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let m = 0;
      for (let dy = -rad; dy <= rad; dy++) {
        const Y = y + dy;
        if (Y >= 0 && Y < h) m = Math.max(m, tmp[(Y * w + x) * 3 + c]);
      }
      out[(y * w + x) * 3 + c] = m;
    }
  }
  return out;
}

/**
 * Sort each pixel into a role mask (1 = that role). A line is ink on paper, and at its edges (thin lines, or a scaled picture) the ink
 * is mixed with the paper. So a pixel is judged by how it differs from the paper next to it: the *direction* of that difference
 * must match the role's colour (that is what tells blue from light blue, and any colour from grey), and the difference must be big
 * enough. Grey watermarks and the light-blue size arrows point another way than the three roles. The best match wins.
 * `tolerance` is how far the direction may be off (bigger accepts more shades).
 */
export function classify(img, colors, tolerance, paper = paperColour(img, 2)) {
  const { width: w, height: h, data } = img;
  const targets = ["cut", "bleed", "crease"].map((role) => {
    const rgb = hexToRgb(colors[role]);
    const dir = rgb.map((v) => 255 - v); // from white to the colour
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    return { role, len, unit: len ? dir.map((v) => v / len) : [0, 0, 0] };
  });
  const masks = { cut: new Uint8Array(w * h), bleed: new Uint8Array(w * h), crease: new Uint8Array(w * h) };
  const maxSin = Math.min(0.6, tolerance / 530); // 85 -> 0.16, about 9 degrees
  for (let i = 0; i < w * h; i++) {
    const dr = paper[i * 3] - data[i * 4], dg = paper[i * 3 + 1] - data[i * 4 + 1], db = paper[i * 3 + 2] - data[i * 4 + 2];
    const mag = Math.hypot(dr, dg, db);
    if (mag < 30) continue; // paper
    let best = null;
    let bestSin = maxSin;
    for (const t of targets) {
      if (!t.len || mag < 0.22 * t.len) continue; // too faint to be this line
      const cos = (dr * t.unit[0] + dg * t.unit[1] + db * t.unit[2]) / mag;
      if (cos <= 0) continue;
      const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
      if (sin <= bestSin) { bestSin = sin; best = t.role; }
    }
    if (best) masks[best][i] = 1;
  }
  return masks;
}

function dilate(m, w, h, rad) {
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!m[y * w + x]) continue;
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h) o[Y * w + X] = 1;
    }
  }
  return o;
}

/** Zhang-Suen thinning: every line becomes one pixel wide. */
function thin(src, w, h) {
  const m = Uint8Array.from(src);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y * w + x]);
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      const del = [];
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        if (!m[y * w + x]) continue;
        const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y), p5 = at(x + 1, y + 1), p6 = at(x, y + 1), p7 = at(x - 1, y + 1), p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
        let A = 0;
        for (let i = 0; i < 8; i++) if (seq[i] === 0 && seq[i + 1] === 1) A++;
        if (A !== 1) continue;
        if (pass === 0 ? p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0 : p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0) del.push(y * w + x);
      }
      for (const i of del) m[i] = 0;
      if (del.length) changed = true;
    }
  }
  return m;
}

/** Follow the thinned lines from end or junction to the next (and round closed loops). Each chain is a list of [x, y]. */
function chains(sk, w, h) {
  const key = (x, y) => y * w + x;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && sk[key(x, y)] === 1;
  const ring = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  const nbrs = (x, y) => N8.map(([dx, dy]) => [x + dx, y + dy]).filter(([X, Y]) => on(X, Y));
  // How many separate lines meet at a pixel (0 to 1 changes round its ring): 1 = an end, 2 = along a line (even at a staircase corner), 3+ = a junction.
  const crossing = (x, y) => {
    let n = 0;
    for (let i = 0; i < 8; i++) {
      const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % 8];
      if (!on(x + ax, y + ay) && on(x + bx, y + by)) n++;
    }
    return n;
  };
  const seen = new Set();
  const out = [];
  const nodes = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y) && crossing(x, y) !== 2) nodes.push(key(x, y));
  const isNode = new Set(nodes);
  for (const k of nodes) seen.add(k);
  const walk = (sx, sy) => {
    const pts = [[sx, sy]];
    let x = sx, y = sy;
    for (;;) {
      const next = nbrs(x, y).filter(([X, Y]) => !seen.has(key(X, Y)));
      next.sort((a, b) => Math.abs(a[0] - x) + Math.abs(a[1] - y) - (Math.abs(b[0] - x) + Math.abs(b[1] - y))); // straight steps before diagonal ones
      if (!next.length) {
        // arrived next to a node: close the chain on it
        const end = nbrs(x, y).find(([X, Y]) => isNode.has(key(X, Y)) && !(X === sx && Y === sy));
        if (end && pts.length > 1) pts.push(end);
        break;
      }
      [x, y] = next[0];
      seen.add(key(x, y));
      pts.push([x, y]);
    }
    return pts;
  };
  for (const k of nodes) {
    const x = k % w, y = (k - x) / w;
    for (const [X, Y] of nbrs(x, y)) {
      if (isNode.has(key(X, Y))) { out.push([[x, y], [X, Y]]); continue; }
      if (seen.has(key(X, Y))) continue;
      seen.add(key(X, Y));
      out.push([[x, y], ...walk(X, Y)]);
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (on(x, y) && !seen.has(key(x, y))) { seen.add(key(x, y)); out.push([[x, y], ...walk(x, y)]); } // loops without a junction
  }
  return out;
}

/** Douglas-Peucker: fewest points that keep the line within `eps` pixels. */
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  if (len < 1.5) {
    // A closed loop (the ends meet): the "line" from end to end is nothing, so split at the point farthest from the start.
    let far = 1, fd = -1;
    for (let i = 1; i < pts.length - 1; i++) { const d = Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]); if (d > fd) { fd = d; far = i; } }
    if (fd <= eps) return [a, b];
    return [...simplify(pts.slice(0, far + 1), eps).slice(0, -1), ...simplify(pts.slice(far), eps)];
  }
  let idx = 0, dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

/** Long straight dotted lines along x or y: rows (or columns) with a long run of the colour, dash gaps bridged. */
function straightLines(mask, w, h, k) {
  const GAP = Math.round(20 * k), MIN = Math.round(40 * k);
  const runs = (get, len, lines) => {
    const out = [];
    for (let l = 0; l < lines; l++) {
      let start = -1, last = -1;
      for (let p = 0; p <= len; p++) {
        const on = p < len && get(l, p);
        if (on) {
          if (start < 0) start = p;
          last = p;
        } else if (start >= 0 && (p >= len || p - last > GAP)) {
          if (last - start >= MIN) out.push({ l, a: start, b: last });
          start = -1;
        }
      }
    }
    return out;
  };
  const merge = (rs) => {
    rs.sort((p, q) => p.l - q.l);
    const groups = [];
    for (const r of rs) {
      const g = groups.find((g) => r.l - g.l1 <= 2 && r.a <= g.b + GAP && r.b >= g.a - GAP);
      if (g) {
        g.rows.push(r.l);
        g.l1 = r.l;
        g.a = Math.min(g.a, r.a);
        g.b = Math.max(g.b, r.b);
      } else groups.push({ rows: [r.l], l1: r.l, a: r.a, b: r.b });
    }
    return groups.map((g) => ({ l: Math.round(g.rows.reduce((x, y) => x + y, 0) / g.rows.length), a: g.a, b: g.b }));
  };
  const out = [];
  for (const g of merge(runs((y, x) => mask[y * w + x] === 1, w, h))) out.push([[g.a, g.l], [g.b, g.l]]);
  for (const g of merge(runs((x, y) => mask[y * w + x] === 1, h, w))) out.push([[g.l, g.a], [g.l, g.b]]);
  return out;
}

/** Do the end of `a` and the start of `b` meet: close together, or a longer gap with both lines pointing straight across it? */
function meets(p, q, dirP, dirQ, near, far) {
  const gap = Math.hypot(p[0] - q[0], p[1] - q[1]);
  if (gap > far) return false;
  if (gap <= near) return true;
  const g = [(q[0] - p[0]) / gap, (q[1] - p[1]) / gap];
  // One end must point straight across the gap; the other may be turned (a corner was lost in the gap) but not away.
  const a1 = dirP[0] * g[0] + dirP[1] * g[1];
  const a2 = -(dirQ[0] * g[0] + dirQ[1] * g[1]);
  return Math.min(a1, a2) >= -0.2 && Math.max(a1, a2) >= 0.95;
}

/** Join chains whose ends meet (a line was hidden under another one, or a label was on top). Then close a chain whose own two ends meet. */
function joinChains(list, near, far, look = 1) {
  const cs = list.map((c) => c.slice());
  // The direction a chain is heading at one end, over the last few pixels (not just the last step).
  const dir = (c, atEnd) => {
    const n = Math.min(c.length - 1, Math.round(10 * look));
    if (n < 1) return [0, 0];
    const [u, v] = atEnd ? [c[c.length - 1 - n], c[c.length - 1]] : [c[n], c[0]];
    const l = Math.hypot(v[0] - u[0], v[1] - u[1]) || 1;
    return [(v[0] - u[0]) / l, (v[1] - u[1]) / l];
  };
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const A = cs[i], B = cs[j];
      for (const [ea, eb] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
        const p = ea ? A[A.length - 1] : A[0];
        const q = eb ? B[B.length - 1] : B[0];
        if (!meets(p, q, dir(A, !!ea), dir(B, !!eb), near, far)) continue;
        const a = ea ? A : A.slice().reverse();
        const b = eb ? B.slice().reverse() : B;
        cs[i] = [...a, ...b];
        cs.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  for (const c of cs) {
    if (c.length < 8) continue;
    const first = c[0], last = c[c.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) continue;
    if (meets(last, first, dir(c, true), dir(c, false), near, far)) c.push([first[0], first[1]]); // a loop with a gap in it: close it
  }
  return cs;
}

/** Nearly straight segments along x or y are made exactly straight. */
function straighten(c, minLen, tol) {
  const o = c.map((p) => p.slice());
  for (let i = 0; i + 1 < o.length; i++) {
    const p = o[i], q = o[i + 1];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    if (Math.hypot(dx, dy) < minLen) continue;
    if (Math.abs(dy) <= tol) { const y = Math.round((p[1] + q[1]) / 2); p[1] = y; q[1] = y; }
    else if (Math.abs(dx) <= tol) { const x = Math.round((p[0] + q[0]) / 2); p[0] = x; q[0] = x; }
  }
  return o;
}

/** The lines of each role, in pixels of the picture. */
export function trace(img, opts = {}) {
  const { width: w, height: h } = img;
  if (w * h > MAX_PIXELS) throw new Error("The picture is too big. Select a smaller area.");
  const colors = { ...DEFAULTS.colors, ...(opts.colors ?? {}) };
  const tolerance = opts.tolerance ?? DEFAULTS.tolerance;
  const k = Math.min(3, Math.max(0.6, Math.max(w, h) / 1300)); // the pixel sizes below were tuned on a picture about 1300 px wide
  const masks = classify(img, colors, tolerance);
  const lines = { cut: [], bleed: [], crease: [] };
  for (const role of ["cut", "bleed"]) {
    const sk = thin(dilate(masks[role], w, h, 1), w, h);
    // Join on the full-resolution chains (their direction at the ends is reliable), then simplify.
    const found = chains(sk, w, h).filter((c) => c.length >= Math.round(8 * k));
    lines[role] = joinChains(found, 14 * k, 70 * k, k).map((c) => {
      const closed = c.length > 2 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1];
      const out = straighten(simplify(c, 1.1 * k), 25 * k, 2.5 * k);
      if (closed) out[out.length - 1] = [...out[0]]; // straightening must not open a closed outline
      return out;
    });
  }
  lines.crease = straightLines(masks.crease, w, h, k);
  return lines;
}

const fmt = (v) => (Math.round(v * 100) / 100).toString();

/** The SVG (mm) for traced lines. `mmPerPx` is the size of one picture pixel. */
export function toSvg(lines, mmPerPx) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const role of ["cut", "bleed", "crease"]) for (const c of lines[role]) for (const [x, y] of c) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  if (!Number.isFinite(x0)) return { svg: null, widthMm: 0, heightMm: 0 };
  const P = (c) => c.map(([x, y], i) => `${i ? "L" : "M"}${fmt((x - x0) * mmPerPx)} ${fmt((y - y0) * mmPerPx)}`).join(" ");
  const widthMm = (x1 - x0) * mmPerPx;
  const heightMm = (y1 - y0) * mmPerPx;
  const group = (id, stroke, dash, list) => (list.length ? `<g id="${id}" fill="none" stroke="${stroke}" stroke-width="0.25"${dash}>\n${list.map((c) => `<path d="${P(c)}"/>`).join("\n")}\n</g>\n` : "");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(widthMm)}mm" height="${fmt(heightMm)}mm" viewBox="0 0 ${fmt(widthMm)} ${fmt(heightMm)}">\n` +
    group("bleed", "#4cc000", ' stroke-dasharray="2 1.5"', lines.bleed) +
    group("crease", "#e6001a", ' stroke-dasharray="3 1.5"', lines.crease) +
    group("cut", "#1a1ab0", "", lines.cut) +
    "</svg>\n";
  return { svg, widthMm, heightMm };
}

/** Picture in, SVG out. */
export function vectorize(img, opts = {}) {
  const lines = trace(img, opts);
  const out = toSvg(lines, opts.mmPerPx ?? 1);
  return { ...out, lines, counts: { cut: lines.cut.length, bleed: lines.bleed.length, crease: lines.crease.length } };
}
