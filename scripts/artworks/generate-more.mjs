/**
 * Draws the artwork library packs (original, procedural vector designs) and writes them to assets/artworks/:
 *   - 200 artworks in 10 categories (badges, stamps, stickers, labels, frames, icons, ...)
 *   - 300 package backgrounds in 6 groups (patterns, gradients, paper, festive, ...)
 * plus assets/artworks/library.json and the migration that adds the rows to the database.
 * Everything is seeded, so a re-run gives the same files. Run from the repo root:
 *   node scripts/artworks/generate-more.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, "../../apps/web/package.json"));
const sharp = require("sharp");
const OUT = path.resolve(here, "../../assets/artworks");
const MIG = path.resolve(here, "../../apps/web/prisma/migrations/20261116110000_seed_artwork_library");
mkdirSync(OUT, { recursive: true });
mkdirSync(MIG, { recursive: true });

const F = 'font-family="Helvetica, Arial, sans-serif"';
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;");
const title = (s) => s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
const svgDoc = (body, w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const n1 = (v) => (Math.round(v * 10) / 10).toString();

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const starPts = (cx, cy, ro, ri, n, rot = -90) => {
  const p = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (180 * i) / n) * Math.PI) / 180;
    const r = i % 2 ? ri : ro;
    p.push(`${n1(cx + r * Math.cos(a))},${n1(cy + r * Math.sin(a))}`);
  }
  return p.join(" ");
};

/** One-line text that is shrunk to fit a width. */
function fitText(label, maxW, base, { y, x = 600, fill, weight = 800, spacing = 6 }) {
  const chars = [...label].length;
  const size = Math.min(base, (maxW / Math.max(chars, 1) - spacing) / 0.68);
  return `<text x="${x}" y="${y}" ${F} font-size="${n1(size)}" font-weight="${weight}" text-anchor="middle" fill="${fill}" letter-spacing="${spacing}">${esc(label)}</text>`;
}

/** Glyphs drawn on a 100 x 100 box: f = main colour, s = detail colour. */
const GLYPHS = {
  leaf: (f, s) => `<path d="M18 82 Q8 28 72 14 Q92 62 40 86 Z" fill="${f}"/><path d="M22 80 Q45 50 68 22" stroke="${s}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  drop: (f, s) => `<path d="M50 8 C50 8 20 46 20 66 A30 30 0 0 0 80 66 C80 46 50 8 50 8Z" fill="${f}"/><path d="M36 66 A14 14 0 0 0 50 80" stroke="${s}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  sun: (f) =>
    `<circle cx="50" cy="50" r="19" fill="${f}"/>` +
    Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      return `<line x1="${n1(50 + 28 * Math.cos(a))}" y1="${n1(50 + 28 * Math.sin(a))}" x2="${n1(50 + 43 * Math.cos(a))}" y2="${n1(50 + 43 * Math.sin(a))}" stroke="${f}" stroke-width="7" stroke-linecap="round"/>`;
    }).join(""),
  heart: (f) => `<path d="M50 88 C6 56 18 16 50 36 C82 16 94 56 50 88Z" fill="${f}"/>`,
  star: (f) => `<polygon points="${starPts(50, 53, 43, 18, 5)}" fill="${f}" stroke="${f}" stroke-width="4" stroke-linejoin="round"/>`,
  cube: (f, s) => `<polygon points="50,8 88,29 88,71 50,92 12,71 12,29" fill="${f}"/><polyline points="12,29 50,50 88,29" stroke="${s}" stroke-width="5" fill="none" stroke-linejoin="round"/><line x1="50" y1="50" x2="50" y2="92" stroke="${s}" stroke-width="5"/>`,
  cookie: (f, s) =>
    `<circle cx="50" cy="50" r="40" fill="${f}"/>` +
    [[36, 36, 6], [62, 32, 5], [54, 56, 6], [30, 62, 5], [70, 62, 5], [48, 78, 4]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${s}"/>`).join(""),
  cup: (f) =>
    `<path d="M20 40 H72 V62 Q72 86 46 86 Q20 86 20 62 Z" fill="${f}"/><path d="M72 48 H80 Q92 48 92 58 Q92 70 76 70" stroke="${f}" stroke-width="6" fill="none"/>` +
    `<path d="M34 28 Q28 20 34 12 M48 28 Q42 20 48 12 M62 28 Q56 20 62 12" stroke="${f}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  gift: (f, s) =>
    `<rect x="16" y="42" width="68" height="46" rx="3" fill="${f}"/><rect x="10" y="30" width="80" height="16" rx="3" fill="${f}"/><rect x="44" y="30" width="12" height="58" fill="${s}"/>` +
    `<path d="M50 30 C34 8 14 18 30 30 Z M50 30 C66 8 86 18 70 30 Z" fill="none" stroke="${f}" stroke-width="6" stroke-linejoin="round"/>`,
  truck: (f, s) =>
    `<rect x="6" y="28" width="54" height="42" rx="3" fill="${f}"/><polygon points="62,40 80,40 94,56 94,70 62,70" fill="${f}"/>` +
    `<circle cx="26" cy="74" r="10" fill="${s}" stroke="${f}" stroke-width="5"/><circle cx="76" cy="74" r="10" fill="${s}" stroke="${f}" stroke-width="5"/>`,
  snowflake: (f) =>
    [0, 60, 120].map((r) => `<g transform="rotate(${r} 50 50)"><line x1="50" y1="8" x2="50" y2="92" stroke="${f}" stroke-width="6" stroke-linecap="round"/><polyline points="38,20 50,30 62,20" fill="none" stroke="${f}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><polyline points="38,80 50,70 62,80" fill="none" stroke="${f}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>`).join(""),
  umbrella: (f) =>
    `<path d="M8 52 Q8 14 50 12 Q92 14 92 52 Q80 42 71 52 Q60 42 50 52 Q40 42 29 52 Q20 42 8 52Z" fill="${f}"/><path d="M50 52 V80 Q50 90 41 90 Q34 90 34 82" stroke="${f}" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  glass: (f, s) => `<path d="M24 8 H76 L70 44 Q68 60 55 62 V84 H70 V92 H30 V84 H45 V62 Q32 60 30 44 Z" fill="${f}"/><path d="M48 8 L42 30 L54 40 L46 56" fill="none" stroke="${s}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  arrowUp: (f) => `<polygon points="50,6 90,48 64,48 64,94 36,94 36,48 10,48" fill="${f}" stroke="${f}" stroke-width="3" stroke-linejoin="round"/>`,
  flame: (f, s) => `<path d="M50 6 C58 26 80 38 80 62 A30 30 0 0 1 20 62 C20 46 31 40 35 27 C42 36 44 38 47 38 C46 26 46 16 50 6Z" fill="${f}"/><path d="M50 56 C58 64 62 70 62 76 A12 12 0 0 1 38 76 C38 68 46 64 50 56Z" fill="${s}"/>`,
  bolt: (f) => `<polygon points="58,4 22,54 46,54 38,96 78,42 54,42" fill="${f}" stroke="${f}" stroke-width="3" stroke-linejoin="round"/>`,
  clock: (f, s) => `<circle cx="50" cy="50" r="42" fill="${f}"/><polyline points="50,22 50,50 70,60" fill="none" stroke="${s}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
  tag: (f, s) => `<polygon points="8,48 48,8 92,8 92,52 52,92" fill="${f}" stroke="${f}" stroke-width="4" stroke-linejoin="round"/><circle cx="70" cy="30" r="8" fill="${s}"/>`,
  crown: (f, s) => `<polygon points="8,78 14,26 36,52 50,18 64,52 86,26 92,78" fill="${f}" stroke="${f}" stroke-width="3" stroke-linejoin="round"/><rect x="8" y="80" width="84" height="10" rx="3" fill="${f}"/><circle cx="50" cy="64" r="5" fill="${s}"/>`,
  cherry: (f, s) =>
    `<circle cx="32" cy="72" r="19" fill="${f}"/><circle cx="68" cy="72" r="19" fill="${f}"/><path d="M32 54 Q40 24 62 12 M68 54 Q64 30 62 12" stroke="${f}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M62 12 Q80 8 90 22 Q74 28 62 12Z" fill="${f}"/><circle cx="26" cy="66" r="4" fill="${s}"/><circle cx="62" cy="66" r="4" fill="${s}"/>`,
  wheat: (f) =>
    `<path d="M50 94 V30" stroke="${f}" stroke-width="5" stroke-linecap="round"/>` +
    [[26, 0], [44, 0], [62, 0]].map(([y]) => `<ellipse cx="38" cy="${y + 22}" rx="7" ry="13" transform="rotate(-35 38 ${y + 22})" fill="${f}"/><ellipse cx="62" cy="${y + 22}" rx="7" ry="13" transform="rotate(35 62 ${y + 22})" fill="${f}"/>`).join("") +
    `<ellipse cx="50" cy="16" rx="7" ry="13" fill="${f}"/>`,
  flower: (f, s) => Array.from({ length: 6 }, (_, i) => `<circle cx="${n1(50 + 25 * Math.cos((i * Math.PI) / 3))}" cy="${n1(50 + 25 * Math.sin((i * Math.PI) / 3))}" r="17" fill="${f}"/>`).join("") + `<circle cx="50" cy="50" r="12" fill="${s}"/>`,
  globe: (f) => `<circle cx="50" cy="50" r="40" fill="none" stroke="${f}" stroke-width="6"/><ellipse cx="50" cy="50" rx="18" ry="40" fill="none" stroke="${f}" stroke-width="5"/><line x1="10" y1="50" x2="90" y2="50" stroke="${f}" stroke-width="5"/><path d="M16 30 Q50 40 84 30 M16 70 Q50 60 84 70" fill="none" stroke="${f}" stroke-width="4"/>`,
  check: (f, s) => `<circle cx="50" cy="50" r="42" fill="${f}"/><polyline points="28,52 44,68 74,34" fill="none" stroke="${s}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`,
  cupcake: (f, s) =>
    `<path d="M22 56 H78 L70 90 H30 Z" fill="${f}"/><circle cx="34" cy="48" r="14" fill="${s}" stroke="${f}" stroke-width="4"/><circle cx="66" cy="48" r="14" fill="${s}" stroke="${f}" stroke-width="4"/><circle cx="50" cy="36" r="16" fill="${s}" stroke="${f}" stroke-width="4"/><circle cx="50" cy="16" r="6" fill="${f}"/>`,
  thermo: (f, s) => `<rect x="38" y="6" width="24" height="64" rx="12" fill="${f}"/><circle cx="50" cy="76" r="18" fill="${f}"/><rect x="46" y="22" width="8" height="50" rx="4" fill="${s}"/><circle cx="50" cy="76" r="9" fill="${s}"/>`,
  stack: (f, s) => `<rect x="18" y="64" width="64" height="28" rx="3" fill="${f}"/><rect x="26" y="36" width="48" height="26" rx="3" fill="${f}" stroke="${s}" stroke-width="3"/><rect x="34" y="10" width="32" height="24" rx="3" fill="${f}" stroke="${s}" stroke-width="3"/>`,
  moon: (f) => `<path d="M62 8 A42 42 0 1 0 92 66 A34 34 0 0 1 62 8Z" fill="${f}"/><polygon points="${starPts(74, 30, 12, 5, 5)}" fill="${f}"/>`,
  envelope: (f, s) => `<rect x="8" y="24" width="84" height="56" rx="6" fill="${f}"/><polyline points="10,28 50,58 90,28" fill="none" stroke="${s}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`,
  house: (f, s) => `<polygon points="50,8 94,48 82,48 82,90 18,90 18,48 6,48" fill="${f}" stroke="${f}" stroke-width="3" stroke-linejoin="round"/><rect x="42" y="60" width="16" height="30" fill="${s}"/>`,
  recycle: (f) => {
    const R = 28, pt = (d, r = R) => [50 + r * Math.cos((d * Math.PI) / 180), 50 + r * Math.sin((d * Math.PI) / 180)];
    return [-85, 35, 155].map((a0) => {
      const a1 = a0 + 78, [x0, y0] = pt(a0), [x1, y1] = pt(a1), [ix, iy] = pt(a1 - 4, R + 12), [ox, oy] = pt(a1 - 4, R - 12), tip = pt(a1 + 24);
      return `<path d="M ${n1(x0)} ${n1(y0)} A ${R} ${R} 0 0 1 ${n1(x1)} ${n1(y1)}" fill="none" stroke="${f}" stroke-width="10"/><polygon points="${n1(ix)},${n1(iy)} ${n1(ox)},${n1(oy)} ${n1(tip[0])},${n1(tip[1])}" fill="${f}"/>`;
    }).join("");
  },
};
const glyph = (name, cx, cy, size, f, s) => `<g transform="translate(${n1(cx - size / 2)} ${n1(cy - size / 2)}) scale(${n1(size / 100)})">${GLYPHS[name](f, s)}</g>`;

/** Colour themes for badge-like artworks. */
const T = (k, fill, stroke, glyphC, text = stroke) => ({ k, fill, stroke, glyph: glyphC, s: fill, text });
const TH = {
  green: T("green", "#e8f3df", "#2f7d3b", "#2f7d3b"),
  red: T("red", "#fdeceb", "#c0392b", "#c0392b"),
  blue: T("blue", "#e8f2fb", "#1d5f9e", "#1d5f9e"),
  ink: T("ink", "#ffffff", "#2b2118", "#2b2118"),
  gold: T("gold", "#1d2a44", "#d8b45a", "#d8b45a"),
  kraft: T("kraft", "#ead9bd", "#8a5a2b", "#8a5a2b", "#6b4420"),
  pink: T("pink", "#fde8f1", "#c2306f", "#c2306f"),
  purple: T("purple", "#efe8fa", "#6a45b8", "#6a45b8"),
  orange: T("orange", "#fff0de", "#e0731c", "#e0731c", "#b85a10"),
  teal: T("teal", "#e0f5f3", "#14867e", "#14867e"),
  darkgreen: T("darkgreen", "#2f6b3a", "#cfe8c4", "#cfe8c4", "#e3f3da"),
  black: T("black", "#222222", "#ffffff", "#ffffff"),
};

/** Badge shells on a 1200 x 1200 canvas; `w` is the width free for a label near the bottom. */
const SHELLS = {
  circle: (t) => ({ w: 780, d: `<circle cx="600" cy="600" r="560" fill="${t.fill}" stroke="${t.stroke}" stroke-width="26"/><circle cx="600" cy="600" r="500" fill="none" stroke="${t.stroke}" stroke-width="6" stroke-dasharray="4 18" stroke-linecap="round"/>` }),
  double: (t) => ({ w: 780, d: `<circle cx="600" cy="600" r="560" fill="${t.fill}" stroke="${t.stroke}" stroke-width="30"/><circle cx="600" cy="600" r="495" fill="none" stroke="${t.stroke}" stroke-width="8"/>` }),
  square: (t) => ({ w: 800, d: `<rect x="60" y="60" width="1080" height="1080" rx="150" fill="${t.fill}" stroke="${t.stroke}" stroke-width="28"/>` }),
  hex: (t) => ({ w: 700, d: `<polygon points="${starPts(600, 600, 580, 580, 3, -90).split(" ").length ? [0, 1, 2, 3, 4, 5].map((i) => `${n1(600 + 575 * Math.cos(((i * 60 - 90) * Math.PI) / 180))},${n1(600 + 575 * Math.sin(((i * 60 - 90) * Math.PI) / 180))}`).join(" ") : ""}" fill="${t.fill}" stroke="${t.stroke}" stroke-width="28" stroke-linejoin="round"/>` }),
  shield: (t) => ({ w: 600, d: `<path d="M600 50 L1070 160 V560 Q1070 900 600 1150 Q130 900 130 560 V160 Z" fill="${t.fill}" stroke="${t.stroke}" stroke-width="28" stroke-linejoin="round"/>` }),
  seal: (t) => ({ w: 720, d: `<polygon points="${starPts(600, 600, 575, 538, 36, -90)}" fill="${t.stroke}"/><circle cx="600" cy="600" r="505" fill="${t.fill}"/><circle cx="600" cy="600" r="470" fill="none" stroke="${t.stroke}" stroke-width="6"/>` }),
  burst: (t) => ({ w: 640, d: `<polygon points="${starPts(600, 600, 580, 450, 16, -90)}" fill="${t.fill}" stroke="${t.stroke}" stroke-width="24" stroke-linejoin="round"/>` }),
};

/** Text spread evenly around a circle, upright toward the outside (no textPath: every renderer agrees). */
function ringText(label, r, fill, cx = 600, cy = 600) {
  let text = label.toUpperCase() + " • ";
  while ([...text].length < 26) text += label.toUpperCase() + " • ";
  const chars = [...text];
  const size = Math.min(78, ((2 * Math.PI * r) / chars.length) * 1.15);
  return chars
    .map((ch, i) => {
      if (ch === " ") return "";
      const a = -90 + (i * 360) / chars.length;
      return `<text ${F} font-size="${n1(size)}" font-weight="700" fill="${fill}" text-anchor="middle" transform="rotate(${n1(a)} ${cx} ${cy}) translate(${cx} ${cy - r})">${esc(ch)}</text>`;
    })
    .join("");
}

const ban = `<circle cx="600" cy="500" r="290" fill="none" stroke="#d93a2b" stroke-width="42"/><line x1="395" y1="295" x2="805" y2="705" stroke="#d93a2b" stroke-width="42" stroke-linecap="round"/>`;

/** One badge-like artwork. layout: stack (glyph + label), ring (ring text + glyph), big (glyph only), text (label only). */
function badge({ shell, th, g, label, layout = "stack", banned = false }) {
  const t = TH[th];
  const sh = SHELLS[shell](t);
  let body = sh.d;
  if (layout === "stack") {
    body += glyph(g, 600, label ? 500 : 600, label ? 430 : 560, t.glyph, t.s);
    if (label) body += fitText(label.toUpperCase(), sh.w, 100, { y: 890, fill: t.text });
  } else if (layout === "ring") {
    body += ringText(label, 430, t.text) + glyph(g, 600, 600, 400, t.glyph, t.s);
  } else if (layout === "big") {
    body += glyph(g, 600, 600, 600, t.glyph, t.s);
  } else {
    const words = label.toUpperCase().split(" ");
    const lines = words.length > 1 && label.length > 8 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [label.toUpperCase()];
    lines.forEach((ln, i) => (body += fitText(ln, sh.w, lines.length > 1 ? 190 : 260, { y: lines.length > 1 ? 560 + i * 200 : 680, fill: t.text, weight: 900, spacing: 4 })));
  }
  if (banned) body += ban;
  return svgDoc(body, 1200, 1200);
}

/** Banner labels on a 1200 x 520 canvas. */
function banner({ kind, th, label, g }) {
  const t = TH[th];
  const W = 1200, H = 520;
  let shape;
  if (kind === "ribbon") shape = `<polygon points="150,90 1050,90 1130,260 1050,430 150,430 70,260" fill="${t.fill}" stroke="${t.stroke}" stroke-width="22" stroke-linejoin="round"/><polygon points="150,90 150,430 70,260" fill="${t.stroke}" opacity="0.25"/>`;
  else if (kind === "pill") shape = `<rect x="50" y="90" width="1100" height="340" rx="170" fill="${t.fill}" stroke="${t.stroke}" stroke-width="22"/>`;
  else if (kind === "flag") shape = `<polygon points="50,90 1090,90 1150,260 1090,430 50,430" fill="${t.fill}" stroke="${t.stroke}" stroke-width="22" stroke-linejoin="round"/>`;
  else if (kind === "tag") shape = `<polygon points="50,260 190,90 1150,90 1150,430 190,430" fill="${t.fill}" stroke="${t.stroke}" stroke-width="22" stroke-linejoin="round"/><circle cx="170" cy="260" r="26" fill="${t.stroke}"/>`;
  else shape = `<rect x="50" y="90" width="1100" height="340" rx="40" fill="${t.fill}" stroke="${t.stroke}" stroke-width="22"/><rect x="82" y="122" width="1036" height="276" rx="20" fill="none" stroke="${t.stroke}" stroke-width="6" stroke-dasharray="3 14" stroke-linecap="round"/>`;
  const left = kind === "tag" ? 260 : 180;
  const hasGlyph = !!g;
  let body = shape;
  if (hasGlyph) body += glyph(g, left + 20, 260, 170, t.glyph, t.s);
  const x0 = (hasGlyph ? 640 : 600) + (kind === "tag" ? 60 : 0);
  body += fitText(label.toUpperCase(), (hasGlyph ? 700 : 860) - (kind === "tag" ? 120 : 0), 130, { y: 300, x: x0, fill: t.text, weight: 900 });
  return svgDoc(body, W, H);
}

/** Transparent frames on a 1200 x 1200 canvas. */
function frame({ kind, th }) {
  const t = TH[th];
  const s = t.stroke;
  let b;
  if (kind === "double") b = `<rect x="60" y="60" width="1080" height="1080" fill="none" stroke="${s}" stroke-width="22"/><rect x="110" y="110" width="980" height="980" fill="none" stroke="${s}" stroke-width="7"/>`;
  else if (kind === "rounded") b = `<rect x="60" y="60" width="1080" height="1080" rx="170" fill="none" stroke="${s}" stroke-width="34"/><rect x="118" y="118" width="964" height="964" rx="120" fill="none" stroke="${s}" stroke-width="6"/>`;
  else if (kind === "corners")
    b = `<rect x="90" y="90" width="1020" height="1020" fill="none" stroke="${s}" stroke-width="8"/>` + [[60, 60, 0], [1140, 60, 90], [1140, 1140, 180], [60, 1140, 270]].map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r})"><path d="M0 0 H200 M0 0 V200 M40 40 H150 M40 40 V150" stroke="${s}" stroke-width="18" fill="none" stroke-linecap="round"/><circle cx="90" cy="90" r="22" fill="${s}"/></g>`).join("");
  else if (kind === "scallop") {
    const dots = [];
    for (let i = 0; i < 24; i++) {
      const p = 60 + (i * 1080) / 23;
      dots.push([p, 60], [p, 1140], [60, p], [1140, p]);
    }
    b = dots.map(([x, y]) => `<circle cx="${n1(x)}" cy="${n1(y)}" r="30" fill="${s}"/>`).join("") + `<rect x="100" y="100" width="1000" height="1000" fill="none" stroke="${s}" stroke-width="8"/>`;
  } else b = `<rect x="70" y="70" width="1060" height="1060" rx="30" fill="none" stroke="${s}" stroke-width="22" stroke-dasharray="1 40" stroke-linecap="round"/><rect x="130" y="130" width="940" height="940" rx="20" fill="none" stroke="${s}" stroke-width="6"/>`;
  return svgDoc(b, 1200, 1200);
}

function iconTile({ g, th, round }) {
  const t = TH[th];
  const bg = round ? `<circle cx="600" cy="600" r="560" fill="${t.fill}"/>` : `<rect x="60" y="60" width="1080" height="1080" rx="220" fill="${t.fill}"/>`;
  return svgDoc(bg + glyph(g, 600, 600, 620, t.glyph, t.s), 1200, 1200);
}

/* ---------- artwork specs ---------- */
const pack = [];
const add = (p) => pack.push(p);
const cyc = (arr, i) => arr[i % arr.length];

function addArt(catKey, category, specs, slugs) {
  specs.forEach((sp, i) => {
    const slug = `art-${catKey}-${String(i + 1).padStart(2, "0")}`;
    add({ slug, name: sp.name ?? title(sp.label ?? sp.g), tags: sp.tags, category, ext: "png", svg: sp.svg, w: sp.w ?? 1200, h: sp.h ?? 1200 });
  });
}
const tagsOf = (cat, label, g, th, extra = []) => [cat.toLowerCase(), ...label.toLowerCase().replace(/[^a-z0-9% ]/g, "").split(" ").filter((w) => w.length > 2).slice(0, 4), g, th, ...extra].filter(Boolean);

const SHELL_KEYS = ["circle", "double", "square", "hex", "shield", "seal", "burst"];
function badgeSpecs(cat, rows, themes, shells = SHELL_KEYS, layout = "stack") {
  return rows.map(([g, label, opts = {}], i) => {
    const th = opts.th ?? cyc(themes, i);
    const shell = opts.shell ?? cyc(shells, i);
    const lay = opts.layout ?? layout;
    return { label, g, tags: tagsOf(cat, label, g, th, [shell]), svg: badge({ shell, th, g, label, layout: lay, banned: opts.ban }) };
  });
}

addArt("eco", "Eco", badgeSpecs("Eco", [
  ["leaf", "Plant based"], ["recycle", "Recyclable"], ["globe", "Planet first"], ["drop", "Water saving"], ["leaf", "Eco friendly"],
  ["sun", "Solar powered"], ["recycle", "Reuse me"], ["flower", "Biodegradable"], ["leaf", "Compostable"], ["globe", "Carbon neutral"],
  ["heart", "Earth love"], ["recycle", "Recycled paper"], ["wheat", "Natural fibre"], ["drop", "Plastic free"], ["leaf", "Zero waste"],
  ["flower", "Organic"], ["cube", "Reduce reuse recycle"], ["globe", "Save the earth"], ["sun", "Green energy"], ["check", "Sustainable"],
], ["green", "darkgreen", "teal", "kraft"], ["circle", "double", "seal", "square", "hex"]));

addArt("handling", "Handling", badgeSpecs("Handling", [
  ["glass", "Fragile", { th: "ink" }], ["arrowUp", "This side up", { th: "ink" }], ["umbrella", "Keep dry", { th: "blue" }], ["thermo", "Keep cool", { th: "blue" }],
  ["stack", "Do not stack", { th: "ink", ban: true }], ["sun", "Away from sun", { th: "ink", ban: true }], ["drop", "No water", { th: "blue", ban: true }], ["flame", "Keep from heat", { th: "red", ban: true }],
  ["cube", "Handle with care", { th: "ink" }], ["truck", "Shipping", { th: "orange" }], ["envelope", "Open here", { th: "ink" }], ["clock", "Perishable", { th: "red" }],
  ["snowflake", "Keep frozen", { th: "blue" }], ["bolt", "Caution", { th: "orange" }], ["recycle", "Please recycle", { th: "green" }], ["gift", "Gift inside", { th: "pink" }],
  ["house", "Home delivery", { th: "teal" }], ["check", "Inspected", { th: "green" }], ["cube", "Heavy item", { th: "black" }], ["arrowUp", "Store upright", { th: "black" }],
], ["ink"], ["square", "circle", "hex"]));

addArt("food", "Food", badgeSpecs("Food", [
  ["cookie", "Fresh baked"], ["cupcake", "Sweet treats"], ["cup", "Coffee time"], ["cherry", "Fruit fresh"], ["wheat", "Whole grain"],
  ["flame", "Hot and fresh"], ["cookie", "Homemade cookies"], ["cupcake", "Baked with love"], ["cup", "Tea and cake"], ["cherry", "Sweet cherry"],
  ["wheat", "Artisan bread"], ["cookie", "Chocolate chip"], ["cupcake", "Cupcake box"], ["heart", "Tasty gift"], ["flame", "Spicy"],
  ["drop", "Pure honey"], ["leaf", "Fresh herbs"], ["cup", "Barista blend"], ["gift", "Sweet gift box"], ["star", "Chef's choice"],
], ["kraft", "orange", "red", "pink", "gold"], ["circle", "double", "seal", "square"]));

addArt("stamps", "Stamps", badgeSpecs("Stamps", [
  ["heart", "Handmade with love"], ["star", "Small batch"], ["leaf", "Original recipe"], ["crown", "Premium quality"], ["sun", "Fresh daily"],
  ["house", "Locally made"], ["heart", "Thank you"], ["check", "Best quality"], ["star", "Order number one"], ["check", "Quality checked"],
  ["flower", "Made with care"], ["cube", "Packed with love"], ["cookie", "Baked in small batches"], ["cup", "Brewed fresh"], ["globe", "Worldwide shipping"],
  ["wheat", "Farm to table"], ["flame", "Roasted fresh"], ["gift", "Gift edition"], ["tag", "Limited edition"], ["leaf", "Naturally made"],
], ["red", "ink", "blue", "darkgreen", "purple"], ["double", "circle"], "ring"));

addArt("stickers", "Stickers", badgeSpecs("Stickers", [
  [null, "Sale"], [null, "New"], [null, "-20%"], [null, "-50%"], [null, "Hot deal"], [null, "Best seller"], [null, "Limited"], [null, "Free gift"],
  [null, "100% natural"], [null, "Gluten free"], [null, "Vegan"], [null, "New flavour"], [null, "Special offer"], [null, "Top pick"], [null, "Only today"],
  [null, "Buy 1 get 1"], [null, "Free shipping"], [null, "Super saver"], [null, "Extra fresh"], [null, "Wow!"],
], ["orange", "red", "pink", "purple", "teal", "blue"], ["burst", "seal", "circle"], "text"));

addArt("badges", "Badges", badgeSpecs("Badges", [
  ["star", "Premium quality"], ["crown", "Best seller"], ["check", "Top rated"], ["star", "Gold standard"], ["crown", "Award winner"],
  ["check", "Trusted"], ["star", "Excellence"], ["check", "Guaranteed"], ["crown", "Authentic"], ["check", "Verified"],
  ["star", "Certified"], ["crown", "Luxury"], ["star", "Number one"], ["crown", "Champion"], ["check", "Select"],
  ["star", "Grand choice"], ["crown", "Master craft"], ["star", "Finest"], ["heart", "Heirloom"], ["crown", "Signature"],
], ["gold", "kraft", "ink", "darkgreen", "purple", "black"], ["seal", "shield", "hex", "double"]));

const bannerKinds = ["ribbon", "pill", "flag", "tag", "plaque"];
addArt("labels", "Labels", [
  "Thank you", "Open here", "Made with love", "Handle with care", "Fresh and tasty", "Just for you", "Best wishes", "Happy birthday", "Congratulations", "Welcome",
  "Enjoy!", "Gift for you", "Small batch", "Delivered with care", "Eat me", "Treat yourself", "Sweet moments", "Cookies inside", "Fresh today", "Hello",
].map((label, i) => {
  const kind = cyc(bannerKinds, i);
  const th = cyc(["kraft", "red", "blue", "green", "pink", "gold", "orange", "purple", "teal", "ink"], i * 3 + 1);
  const g = i % 3 === 0 ? cyc(["heart", "star", "gift", "flower", "cookie", "leaf", "cup"], i) : null;
  return { label, w: 1200, h: 520, tags: tagsOf("Labels", label, g ?? "text", th, [kind, "banner"]), svg: banner({ kind, th, label, g }) };
}));

const frameKinds = ["double", "rounded", "corners", "scallop", "dotted"];
const frameNames = { double: "Double line frame", rounded: "Rounded frame", corners: "Ornate corner frame", scallop: "Scalloped frame", dotted: "Dotted frame" };
addArt("frames", "Frames", Array.from({ length: 20 }, (_, i) => {
  const kind = frameKinds[i % 5];
  const th = ["kraft", "ink", "gold", "green"][Math.floor(i / 5)];
  const t = TH[th];
  const svg = frame({ kind, th });
  return { name: `${frameNames[kind]} ${title(th)}`, tags: ["frame", "border", kind, th, "label"], svg: gold(svg, th, t) };
}));
function gold(svg, th, t) {
  // A dark "gold" theme has a dark fill that frames do not use; the stroke colour is enough.
  return svg;
}

addArt("icons", "Icons", ["leaf", "drop", "sun", "heart", "star", "cube", "cookie", "cup", "gift", "truck", "snowflake", "umbrella", "flame", "bolt", "clock", "tag", "crown", "cherry", "flower", "globe"].map((g, i) => {
  const th = cyc(["green", "blue", "orange", "pink", "gold", "kraft", "red", "teal", "purple", "ink"], i);
  return { name: `${title(g)} icon`, tags: ["icon", g, th, "symbol"], svg: iconTile({ g, th, round: i % 2 === 0 }) };
}));

addArt("seasonal", "Seasonal", badgeSpecs("Seasonal", [
  ["snowflake", "Winter"], ["heart", "Valentine"], ["gift", "Holiday gift"], ["star", "New year"], ["flower", "Spring"],
  ["sun", "Summer"], ["leaf", "Autumn"], ["moon", "Eid Mubarak"], ["moon", "Ramadan Kareem"], ["gift", "Birthday"],
  ["heart", "Mother's day"], ["cherry", "Summer fruit"], ["snowflake", "Season's greetings"], ["star", "Festive season"], ["moon", "Eid special"],
  ["heart", "Wedding"], ["heart", "Anniversary"], ["flower", "Baby shower"], ["heart", "Thank you"], ["star", "Father's day"],
], ["red", "blue", "green", "gold", "pink", "orange", "purple", "teal"], ["circle", "double", "seal", "hex", "square"]));

/* ---------- backgrounds ---------- */
const PALS = [
  ["kraft", "Kraft", "#e6d3b3", "#c9a56a", "#8a5a2b", "#f4ead8"],
  ["mint", "Mint", "#e3f4ec", "#8fd3b6", "#2e9c7a", "#ffffff"],
  ["blush", "Blush", "#fde8e6", "#f4a6a0", "#d9534f", "#fff5f3"],
  ["navy", "Navy and gold", "#14233c", "#d8b45a", "#3d5a8c", "#f1e7c8"],
  ["sunset", "Sunset", "#ffe8c9", "#ff9a5c", "#e04a5f", "#7a2e6e"],
  ["ocean", "Ocean", "#e0f1fb", "#6fb7e6", "#1d6fae", "#0c3c66"],
  ["forest", "Forest", "#e7efdc", "#9cc07a", "#4d7f3a", "#244a25"],
  ["lavender", "Lavender", "#efe8fa", "#b9a2e8", "#7653c4", "#ffffff"],
  ["mono", "Mono", "#f2f2f0", "#b9b9b4", "#55554f", "#222222"],
  ["citrus", "Citrus", "#fff6d6", "#ffc93c", "#f08a24", "#7bb83d"],
  ["berry", "Berry", "#f9e6f0", "#e58ab8", "#a3245f", "#4b1b5a"],
  ["sand", "Sand", "#f6efe3", "#dfc9a3", "#b58b5a", "#6f8f8b"],
].map(([k, n, bg, a, b, c]) => ({ k, n, bg, a, b, c }));
const palFor = (family, i) => PALS[(i + family * 2) % PALS.length];
const S = 1200;
const bgRect = (c) => `<rect width="${S}" height="${S}" fill="${c}"/>`;

const BG = {
  geometric: [
    ["Semicircles", "semicircles", (p) => { let b = bgRect(p.bg); const t = 200, cl = [p.a, p.b, p.c, p.bg]; for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) { const x = c * t, y = r * t, k = (r + c) % 4; b += `<path d="M ${x} ${y + t} A 100 100 0 0 1 ${x + t} ${y + t} Z" fill="${cl[k]}"/><circle cx="${x + 100}" cy="${y + 90}" r="32" fill="${cl[(k + 2) % 4]}"/>`; } return b; }],
    ["Triangles", "triangles", (p) => { let b = bgRect(p.bg); const t = 150, cl = [p.a, p.b, p.c, p.bg]; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const x = c * t, y = r * t; b += `<polygon points="${x},${y} ${x + t},${y} ${x},${y + t}" fill="${cl[(r + c) % 4]}"/><polygon points="${x + t},${y} ${x + t},${y + t} ${x},${y + t}" fill="${cl[(r + c + 1 + (r % 2)) % 4]}"/>`; } return b; }],
    ["Hexagons", "hexagons", (p) => { let b = bgRect(p.bg); const R = 80, h = Math.sqrt(3) * R, cl = [p.a, p.b, p.c]; for (let c = -1; c < 12; c++) for (let r = -1; r < 10; r++) { const x = c * R * 1.5, y = r * h + (c % 2 ? h / 2 : 0); const pts = [0, 1, 2, 3, 4, 5].map((i) => `${n1(x + (R - 6) * Math.cos((i * Math.PI) / 3))},${n1(y + (R - 6) * Math.sin((i * Math.PI) / 3))}`).join(" "); b += `<polygon points="${pts}" fill="${cl[(((c + 2 * r) % 3) + 3) % 3]}"/>`; } return b; }],
    ["Diamonds", "diamonds", (p) => { let b = bgRect(p.bg); const t = 160; for (let r = 0; r < 17; r++) for (let c = 0; c < 9; c++) { const x = c * t + (r % 2 ? t / 2 : 0), y = r * t / 2; b += `<polygon points="${x},${y - t / 2} ${x + t / 2},${y} ${x},${y + t / 2} ${x - t / 2},${y}" fill="${(r + c) % 2 ? p.a : p.b}"/><circle cx="${x}" cy="${y}" r="12" fill="${p.c}"/>`; } return b; }],
    ["Rings", "rings", (p) => { let b = bgRect(p.bg); for (let r = 0; r < 14; r++) for (let c = 0; c < 8; c++) { const x = c * 200 + (r % 2 ? 100 : 0), y = r * 100; b += `<circle cx="${x}" cy="${y}" r="100" fill="none" stroke="${(r + c) % 2 ? p.b : p.a}" stroke-width="12"/><circle cx="${x}" cy="${y}" r="62" fill="none" stroke="${p.c}" stroke-width="6" opacity="0.7"/>`; } return b; }],
  ],
  stripes: [
    ["Vertical stripes", "stripes", (p) => { let b = bgRect(p.bg); for (let i = 0; i < 12; i++) b += `<rect x="${i * 100}" width="50" height="${S}" fill="${p.a}"/><rect x="${i * 100 + 50}" width="8" height="${S}" fill="${p.b}"/>`; return b; }],
    ["Diagonal stripes", "diagonal", (p) => { let b = bgRect(p.bg) + `<g transform="rotate(45 600 600)">`; for (let i = -10; i < 22; i++) b += `<rect x="${i * 90 - 600}" y="-600" width="44" height="2400" fill="${i % 3 ? p.a : p.b}"/>`; return b + "</g>"; }],
    ["Polka dots", "dots", (p) => { let b = bgRect(p.bg); for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) { const x = c * 150 + (r % 2 ? 75 : 0), y = r * 130; b += `<circle cx="${x}" cy="${y}" r="38" fill="${p.a}"/><circle cx="${x}" cy="${y}" r="14" fill="${p.b}"/>`; } return b; }],
    ["Checkerboard", "checker", (p) => { let b = bgRect(p.bg); for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) { if ((r + c) % 2) b += `<rect x="${c * 120}" y="${r * 120}" width="120" height="120" fill="${p.a}"/>`; else if (r % 3 === 0 && c % 3 === 0) b += `<rect x="${c * 120 + 40}" y="${r * 120 + 40}" width="40" height="40" fill="${p.b}"/>`; } return b; }],
    ["Gingham", "gingham", (p) => { let b = bgRect(p.bg); for (let i = 0; i < 12; i += 2) b += `<rect x="${i * 100}" width="100" height="${S}" fill="${p.b}" opacity="0.45"/><rect y="${i * 100}" width="${S}" height="100" fill="${p.b}" opacity="0.45"/>`; return b; }],
  ],
  organic: [
    ["Waves", "waves", (p) => { let b = bgRect(p.bg); for (let r = 0; r < 9; r++) { const y = 70 + r * 140; b += `<path d="M 0 ${y} ` + Array.from({ length: 12 }, (_, i) => `Q ${i * 100 + 50} ${y + (i % 2 ? 50 : -50)} ${(i + 1) * 100} ${y}`).join(" ") + `" fill="none" stroke="${r % 2 ? p.a : p.b}" stroke-width="16" stroke-linecap="round"/>`; } return b; }],
    ["Leaves", "leaves", (p, rnd) => { let b = bgRect(p.bg); for (let i = 0; i < 46; i++) { const x = rnd() * S, y = rnd() * S, r = rnd() * 360, s = 0.8 + rnd() * 0.9; b += `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${n1(r)}) scale(${n1(s)})"><path d="M0 40 Q-30 0 0 -40 Q30 0 0 40Z" fill="${[p.a, p.b, p.c][i % 3]}"/><line x1="0" y1="34" x2="0" y2="-26" stroke="${p.bg}" stroke-width="3"/></g>`; } return b; }],
    ["Flowers", "floral", (p, rnd) => { let b = bgRect(p.bg); for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) { const x = c * 200 + 100 + (rnd() - 0.5) * 60, y = r * 200 + 100 + (rnd() - 0.5) * 60, s = 0.8 + rnd() * 0.5; b += `<g transform="translate(${n1(x)} ${n1(y)}) scale(${n1(s)})">` + Array.from({ length: 5 }, (_, i) => `<circle cx="${n1(32 * Math.cos((i * 2 * Math.PI) / 5))}" cy="${n1(32 * Math.sin((i * 2 * Math.PI) / 5))}" r="22" fill="${(r + c) % 2 ? p.a : p.b}"/>`).join("") + `<circle r="14" fill="${p.c}"/></g>`; } return b; }],
    ["Terrazzo", "terrazzo", (p, rnd) => { let b = bgRect(p.bg); for (let i = 0; i < 130; i++) { const x = rnd() * S, y = rnd() * S, s = 14 + rnd() * 34, k = rnd(); const pts = Array.from({ length: 5 }, (_, j) => { const a = (j / 5) * 6.283 + rnd(); const r = s * (0.6 + rnd() * 0.5); return `${n1(x + r * Math.cos(a))},${n1(y + r * Math.sin(a))}`; }).join(" "); b += `<polygon points="${pts}" fill="${k < 0.4 ? p.a : k < 0.75 ? p.b : p.c}"/>`; } return b; }],
    ["Blobs", "blobs", (p, rnd) => { let b = bgRect(p.bg); for (let i = 0; i < 14; i++) { const x = rnd() * S, y = rnd() * S, rx = 90 + rnd() * 160, ry = 70 + rnd() * 130; b += `<ellipse cx="${n1(x)}" cy="${n1(y)}" rx="${n1(rx)}" ry="${n1(ry)}" transform="rotate(${n1(rnd() * 180)} ${n1(x)} ${n1(y)})" fill="${[p.a, p.b, p.c][i % 3]}" opacity="0.75"/>`; } return b; }],
  ],
  gradients: [
    ["Linear gradient", "gradient", (p) => `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.bg}"/><stop offset="1" stop-color="${p.a}"/></linearGradient></defs><rect width="${S}" height="${S}" fill="url(#g)"/>`],
    ["Radial glow", "radial", (p) => `<defs><radialGradient id="g" cx="0.5" cy="0.45" r="0.75"><stop offset="0" stop-color="${p.bg}"/><stop offset="0.6" stop-color="${p.a}"/><stop offset="1" stop-color="${p.b}"/></radialGradient></defs><rect width="${S}" height="${S}" fill="url(#g)"/>`],
    ["Diagonal blend", "diagonal", (p) => `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.a}"/><stop offset="0.5" stop-color="${p.b}"/><stop offset="1" stop-color="${p.c}"/></linearGradient></defs><rect width="${S}" height="${S}" fill="url(#g)"/>`],
    ["Soft mesh", "mesh", (p, rnd) => `<defs><filter id="bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="150"/></filter></defs>${bgRect(p.bg)}<g filter="url(#bl)">` + [p.a, p.b, p.c, p.a, p.b].map((c, i) => `<circle cx="${n1(150 + rnd() * 900)}" cy="${n1(150 + rnd() * 900)}" r="${n1(220 + rnd() * 160)}" fill="${c}" opacity="0.85"/>`).join("") + `</g>`],
    ["Horizon bands", "horizon", (p) => `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.c}"/><stop offset="0.45" stop-color="${p.b}"/><stop offset="0.7" stop-color="${p.a}"/><stop offset="1" stop-color="${p.bg}"/></linearGradient></defs><rect width="${S}" height="${S}" fill="url(#g)"/><circle cx="600" cy="760" r="150" fill="${p.bg}" opacity="0.8"/>`],
  ],
  paper: [
    ["Speckled kraft", "speckle", (p, rnd) => { let b = bgRect(p.bg); for (let i = 0; i < 1700; i++) b += `<circle cx="${n1(rnd() * S)}" cy="${n1(rnd() * S)}" r="${n1(1 + rnd() * 3)}" fill="${rnd() < 0.5 ? p.b : p.a}" opacity="${n1(0.25 + rnd() * 0.4)}"/>`; for (let i = 0; i < 160; i++) { const x = rnd() * S, y = rnd() * S, a = rnd() * 6.283, l = 8 + rnd() * 20; b += `<line x1="${n1(x)}" y1="${n1(y)}" x2="${n1(x + l * Math.cos(a))}" y2="${n1(y + l * Math.sin(a))}" stroke="${p.b}" stroke-width="1.5" opacity="0.3"/>`; } return b; }],
    ["Lined paper", "lined", (p) => { let b = bgRect(p.bg); for (let i = 1; i < 24; i++) b += `<line x1="0" y1="${i * 50}" x2="${S}" y2="${i * 50}" stroke="${p.a}" stroke-width="3"/>`; return b + `<line x1="150" y1="0" x2="150" y2="${S}" stroke="${p.b}" stroke-width="4" opacity="0.7"/>`; }],
    ["Grid paper", "grid", (p) => { let b = bgRect(p.bg); for (let i = 1; i < 24; i++) b += `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="${S}" stroke="${p.a}" stroke-width="${i % 5 ? 2 : 4}"/><line x1="0" y1="${i * 50}" x2="${S}" y2="${i * 50}" stroke="${p.a}" stroke-width="${i % 5 ? 2 : 4}"/>`; return b; }],
    ["Dot grid", "dotgrid", (p) => { let b = bgRect(p.bg); for (let r = 1; r < 24; r++) for (let c = 1; c < 24; c++) b += `<circle cx="${c * 50}" cy="${r * 50}" r="3.5" fill="${p.b}" opacity="0.7"/>`; return b; }],
    ["Corrugated", "corrugated", (p) => { let b = bgRect(p.bg); for (let i = 0; i < 40; i++) b += `<rect x="${i * 30}" width="15" height="${S}" fill="${p.a}" opacity="0.55"/><rect x="${i * 30 + 15}" width="4" height="${S}" fill="${p.b}" opacity="0.35"/>`; return b; }],
  ],
  festive: [
    ["Confetti", "confetti", (p, rnd) => { let b = bgRect(p.bg); for (let i = 0; i < 170; i++) { const x = rnd() * S, y = rnd() * S, r = rnd() * 360, c = [p.a, p.b, p.c][i % 3], k = i % 3; b += `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${n1(r)})">${k === 0 ? `<rect x="-12" y="-6" width="24" height="12" rx="2" fill="${c}"/>` : k === 1 ? `<circle r="9" fill="${c}"/>` : `<polygon points="0,-12 11,9 -11,9" fill="${c}"/>`}</g>`; } return b; }],
    ["Stars", "stars", (p, rnd) => { let b = bgRect(p.bg); for (let i = 0; i < 60; i++) { const x = rnd() * S, y = rnd() * S, s = 12 + rnd() * 26; b += `<polygon points="${starPts(x, y, s, s * 0.42, 5, -90 + rnd() * 70)}" fill="${[p.a, p.b, p.c][i % 3]}"/>`; } return b; }],
    ["Snowfall", "snow", (p, rnd) => { let b = bgRect(p.bg); for (let i = 0; i < 150; i++) b += `<circle cx="${n1(rnd() * S)}" cy="${n1(rnd() * S)}" r="${n1(3 + rnd() * 11)}" fill="${p.c}" opacity="${n1(0.4 + rnd() * 0.5)}"/>`; for (let i = 0; i < 26; i++) { const x = rnd() * S, y = rnd() * S, s = 12 + rnd() * 14; b += `<g stroke="${p.a}" stroke-width="3" stroke-linecap="round" transform="translate(${n1(x)} ${n1(y)})">${[0, 60, 120].map((r) => `<line x1="0" y1="${-s}" x2="0" y2="${s}" transform="rotate(${r})"/>`).join("")}</g>`; } return b; }],
    ["Hearts", "hearts", (p) => { let b = bgRect(p.bg); for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const x = c * 160 + (r % 2 ? 80 : 0), y = r * 150; b += `<g transform="translate(${x} ${y}) scale(0.7)"><path d="M50 88 C6 56 18 16 50 36 C82 16 94 56 50 88Z" fill="${(r + c) % 2 ? p.a : p.b}"/></g>`; } return b; }],
    ["Sprinkles", "sprinkles", (p, rnd) => { let b = bgRect(p.bg); for (let i = 0; i < 190; i++) { const x = rnd() * S, y = rnd() * S, a = rnd() * 6.283, l = 14 + rnd() * 10; b += `<line x1="${n1(x)}" y1="${n1(y)}" x2="${n1(x + l * Math.cos(a))}" y2="${n1(y + l * Math.sin(a))}" stroke="${[p.a, p.b, p.c][i % 3]}" stroke-width="8" stroke-linecap="round"/>`; } return b; }],
  ],
};
const GROUPS = [
  ["geometric", "Backgrounds: Geometric", "bg-geometric"],
  ["stripes", "Backgrounds: Stripes & Dots", "bg-stripes"],
  ["organic", "Backgrounds: Organic", "bg-organic"],
  ["gradients", "Backgrounds: Gradients", "bg-gradients"],
  ["paper", "Backgrounds: Paper & Kraft", "bg-paper"],
  ["festive", "Backgrounds: Festive", "bg-festive"],
];
GROUPS.forEach(([key, category, prefix], gi) => {
  let idx = 0;
  BG[key].forEach(([label, tag, fn], fi) => {
    for (let k = 0; k < 10; k++) {
      const p = palFor(fi + gi, k);
      const rnd = rng(1000 * gi + 100 * fi + k + 7);
      idx++;
      add({
        slug: `${prefix}-${String(idx).padStart(2, "0")}`,
        name: `${label} ${p.n}`,
        tags: ["background", "pattern", tag, p.k, key],
        category,
        ext: key === "gradients" ? "jpg" : "png",
        svg: svgDoc(fn(p, rnd), S, S),
        w: S,
        h: S,
      });
    }
  });
});

/* ---------- render + migration ---------- */
const q = (v) => `'${String(v).replaceAll("'", "''")}'`;
const rows = [];
const meta = [];
let total = 0;
for (const it of pack) {
  const file = `${it.slug}.${it.ext}`;
  let img = sharp(Buffer.from(it.svg));
  if (it.ext === "jpg") img = img.flatten({ background: "#ffffff" }).jpeg({ quality: 88, mozjpeg: true });
  else img = img.png({ palette: true, quality: 92, effort: 8, compressionLevel: 9 });
  const bytes = await img.toBuffer();
  writeFileSync(path.join(OUT, file), bytes);
  total += bytes.length;
  const tags = [...new Set(it.tags.map((t) => t.toLowerCase().trim().slice(0, 30)).filter(Boolean))].slice(0, 12);
  const name = it.name.slice(0, 80);
  meta.push({ file, name, tags, category: it.category });
  const mime = it.ext === "jpg" ? "image/jpeg" : "image/png";
  rows.push(`  (${q("seed-" + it.slug)}, ${q(name)}, ARRAY[${tags.map(q).join(", ")}]::TEXT[], ${q(it.category)}, ${q("artworks/seed-" + it.slug + "." + it.ext)}, '${mime}', ${it.w}, ${it.h}, ${bytes.length}, CURRENT_TIMESTAMP)`);
}
const names = new Set();
for (const m of meta) { const k = m.category + "|" + m.name; if (names.has(k)) console.warn("duplicate name", k); names.add(k); }
writeFileSync(path.join(OUT, "library.json"), JSON.stringify(meta, null, 2) + "\n");
writeFileSync(
  path.join(MIG, "migration.sql"),
  `-- Artwork library packs: 200 artworks and 300 package backgrounds (generated by scripts/artworks/generate-more.mjs).\n` +
    `-- Files: assets/artworks/<name>.<png|jpg>, served by apps/web/src/server/storage.ts for keys artworks/seed-<name>.<ext>.\n` +
    `INSERT INTO "artwork_item" ("id", "name", "tags", "category", "storageKey", "mime", "widthPx", "heightPx", "sizeBytes", "updatedAt") VALUES\n` +
    rows.join(",\n") +
    `\nON CONFLICT ("storageKey") DO NOTHING;\n`,
);
console.log(`${pack.length} files, ${(total / 1e6).toFixed(1)} MB`);
