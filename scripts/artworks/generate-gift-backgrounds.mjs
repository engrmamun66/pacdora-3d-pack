/**
 * Draws 100 more box-background pictures in the category "Background Image": original gift-wrap style
 * designs (polka dots, windowpane grid, stripes, gingham, snowflakes, stars, hearts, zigzag, scales, arches),
 * 10 designs x 10 colour sets. Files go to assets/artworks/bgimg-61..160.jpg, plus assets/artworks/backgrounds-gift.json
 * and the migration that adds the rows. Seeded, so a re-run gives the same files. Run from the repo root:
 *   node scripts/artworks/generate-gift-backgrounds.mjs [--sheet <file.png>]   (--sheet writes a contact sheet only)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, "../../apps/web/package.json"));
const sharp = require("sharp");
const OUT = path.resolve(here, "../../assets/artworks");
const MIG = path.resolve(here, "../../apps/web/prisma/migrations/20261116150000_seed_gift_backgrounds");
const CATEGORY = "Background Image";
const FIRST = 61;
const S = 1200;

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
const rect = (c) => `<rect width="${S}" height="${S}" fill="${c}"/>`;
/** Light paper grain over the whole picture, so flat colour does not look digital. */
const grain = (seed) =>
  `<defs><filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${seed}" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 0.4  0 0 0 0 0.38  0 0 0 0 0.35  0 0 0 0.11 0"/></filter></defs><rect width="${S}" height="${S}" filter="url(#grain)"/>`;
const svgDoc = (body, seed) => `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${body}${grain(seed)}</svg>`;

/** [name, tag, ground, main, accent]: the same ten colour sets are used by every design. */
const PALS = [
  ["Mint", "mint", "#def5ec", "#6cc7a6", "#ffffff"],
  ["Lavender", "lavender", "#e6e0fa", "#9a86e0", "#ffffff"],
  ["Blush", "blush", "#fde4ea", "#ef8fab", "#ffffff"],
  ["Sunny", "sunny", "#fff0b8", "#f2b630", "#ffffff"],
  ["Sky", "sky", "#dcf0fb", "#6fb8e6", "#ffffff"],
  ["Kraft", "kraft", "#d9b98a", "#fbf1dd", "#8a6038"],
  ["Christmas", "christmas", "#f4f1ea", "#c2323a", "#2f7d57"],
  ["Navy gold", "navy", "#1f2d5a", "#f2d27a", "#ffffff"],
  ["Peach", "peach", "#ffe2cf", "#f2906b", "#fff7ef"],
  ["Charcoal", "charcoal", "#2b2d31", "#e8c97a", "#ffffff"],
];

const starPath = (cx, cy, r, rot) => {
  let d = "";
  for (let k = 0; k < 10; k++) {
    const a = rot + (k * Math.PI) / 5 - Math.PI / 2;
    const rr = k % 2 === 0 ? r : r * 0.45;
    d += `${k === 0 ? "M" : "L"} ${n1(cx + Math.cos(a) * rr)} ${n1(cy + Math.sin(a) * rr)} `;
  }
  return d + "Z";
};
const heartPath = (s) => `M 0 ${n1(s * 0.35)} C ${n1(-s * 0.9)} ${n1(-s * 0.2)} ${n1(-s * 0.5)} ${n1(-s * 0.95)} 0 ${n1(-s * 0.4)} C ${n1(s * 0.5)} ${n1(-s * 0.95)} ${n1(s * 0.9)} ${n1(-s * 0.2)} 0 ${n1(s * 0.35)} Z`;
const flake = (cx, cy, r, rot, color, w) => {
  let d = "";
  for (let k = 0; k < 6; k++) {
    const a = rot + (k * Math.PI) / 3;
    const ex = cx + Math.cos(a) * r, ey = cy + Math.sin(a) * r;
    d += `M ${n1(cx)} ${n1(cy)} L ${n1(ex)} ${n1(ey)} `;
    for (const t of [0.55, 0.8]) {
      const bx = cx + Math.cos(a) * r * t, by = cy + Math.sin(a) * r * t;
      for (const s of [-1, 1]) d += `M ${n1(bx)} ${n1(by)} L ${n1(bx + Math.cos(a + s * 0.8) * r * 0.22)} ${n1(by + Math.sin(a + s * 0.8) * r * 0.22)} `;
    }
  }
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
};

/* ---------- designs: draw(pal, rnd, i) returns SVG shapes ---------- */
const FAMILIES = [
  {
    label: "Polka dots", tags: ["polka", "dots", "gift"],
    draw: ([, , g, m, a]) => {
      let b = rect(g);
      const step = 150;
      for (let r = -1; r < 18; r++) for (let c = -1; c < 10; c++) {
        const x = c * step + (r % 2) * (step / 2), y = r * (step / 2);
        b += `<circle cx="${x}" cy="${y}" r="24" fill="${m}"/>`;
        b += `<circle cx="${x + step / 2}" cy="${y}" r="9" fill="${a}" opacity="0.9"/>`;
      }
      return b;
    },
  },
  {
    label: "Windowpane", tags: ["grid", "lines", "gift"],
    draw: ([, , g, m, a]) => {
      let b = rect(g);
      for (let k = -1; k < 9; k++) b += `<rect x="${k * 160 + 40}" y="0" width="9" height="${S}" fill="${m}"/><rect x="0" y="${k * 160 + 40}" width="${S}" height="9" fill="${m}"/>`;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) b += `<circle cx="${c * 160 + 124}" cy="${r * 160 + 124}" r="6" fill="${a}" opacity="0.85"/>`;
      return b;
    },
  },
  {
    label: "Candy stripes", tags: ["stripes", "diagonal", "gift"],
    draw: ([, , g, m, a]) => {
      let b = rect(g) + `<g transform="rotate(-35 600 600)">`;
      for (let k = -8; k < 18; k++) b += `<rect x="${k * 130 - 300}" y="-700" width="64" height="2600" fill="${m}"/><rect x="${k * 130 - 300 + 80}" y="-700" width="6" height="2600" fill="${a}" opacity="0.9"/>`;
      return b + `</g>`;
    },
  },
  {
    label: "Gingham", tags: ["gingham", "check", "gift"],
    draw: ([, , g, m, a]) => {
      let b = rect(g);
      for (let k = 0; k < 7; k++) b += `<rect x="${k * 200}" y="0" width="100" height="${S}" fill="${m}" opacity="0.42"/><rect x="0" y="${k * 200}" width="${S}" height="100" fill="${m}" opacity="0.42"/>`;
      for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) b += `<circle cx="${c * 200 + 150}" cy="${r * 200 + 50 + 100}" r="7" fill="${a}" opacity="0.8"/>`;
      return b;
    },
  },
  {
    label: "Snowflakes", tags: ["snowflake", "winter", "christmas"],
    draw: ([, , g, m, a], rnd) => {
      let b = rect(g);
      for (let k = 0; k < 36; k++) b += flake(rnd() * S, rnd() * S, 34 + rnd() * 40, rnd() * 3.14, k % 3 === 2 ? a : m, 5);
      for (let k = 0; k < 40; k++) b += `<circle cx="${n1(rnd() * S)}" cy="${n1(rnd() * S)}" r="${n1(3 + rnd() * 5)}" fill="${a}" opacity="0.8"/>`;
      return b;
    },
  },
  {
    label: "Stars", tags: ["stars", "night", "party"],
    draw: ([, , g, m, a], rnd) => {
      let b = rect(g);
      for (let k = 0; k < 44; k++) b += `<path d="${starPath(rnd() * S, rnd() * S, 22 + rnd() * 42, rnd() * 1.2)}" fill="${k % 3 === 2 ? a : m}" opacity="${n1(0.75 + rnd() * 0.25)}"/>`;
      for (let k = 0; k < 30; k++) b += `<circle cx="${n1(rnd() * S)}" cy="${n1(rnd() * S)}" r="${n1(3 + rnd() * 4)}" fill="${a}" opacity="0.8"/>`;
      return b;
    },
  },
  {
    label: "Hearts", tags: ["hearts", "love", "valentine"],
    draw: ([, , g, m, a], rnd) => {
      let b = rect(g);
      const step = 170;
      for (let r = -1; r < 11; r++) for (let c = -1; c < 8; c++) {
        const x = c * step + (r % 2) * (step / 2) + (rnd() - 0.5) * 18, y = r * step * 0.8 + (rnd() - 0.5) * 18;
        b += `<path transform="translate(${n1(x)} ${n1(y)}) rotate(${n1((rnd() - 0.5) * 40)})" d="${heartPath(40 + rnd() * 14)}" fill="${(r + c) % 3 === 0 ? a : m}"/>`;
      }
      return b;
    },
  },
  {
    label: "Zigzag", tags: ["zigzag", "chevron", "gift"],
    draw: ([, , g, m, a]) => {
      let b = rect(g);
      for (let r = -1; r < 11; r++) {
        let d = "";
        for (let x = -60, up = 0; x <= S + 120; x += 100, up ^= 1) d += `${d ? "L" : "M"} ${x} ${r * 120 + (up ? 0 : 60)} `;
        b += `<path d="${d}" fill="none" stroke="${m}" stroke-width="26" stroke-linejoin="round"/><path d="${d}" transform="translate(0 38)" fill="none" stroke="${a}" stroke-width="5" stroke-linejoin="round" opacity="0.85"/>`;
      }
      return b;
    },
  },
  {
    label: "Scales", tags: ["scales", "scallop", "gift"],
    draw: ([, , g, m, a]) => {
      let b = rect(g);
      for (let r = 0; r < 20; r++) for (let c = -1; c < 9; c++) {
        const x = c * 150 + (r % 2) * 75, y = r * 62;
        b += `<circle cx="${x}" cy="${y}" r="75" fill="${r % 2 ? g : m}" stroke="${a}" stroke-width="5" stroke-opacity="0.7"/><circle cx="${x}" cy="${y}" r="42" fill="none" stroke="${a}" stroke-width="3" stroke-opacity="0.5"/>`;
      }
      return b;
    },
  },
  {
    label: "Arches", tags: ["arches", "geometric", "modern"],
    draw: ([, , g, m, a], rnd) => {
      let b = rect(g);
      const cell = 300;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const x = c * cell, y = r * cell, k = Math.floor(rnd() * 5), col = rnd() < 0.5 ? m : a, h = cell / 2;
        if (k === 0) b += `<path d="M ${x + 40} ${y + cell - 40} L ${x + 40} ${y + h} A ${h - 40} ${h - 40} 0 0 1 ${x + cell - 40} ${y + h} L ${x + cell - 40} ${y + cell - 40} Z" fill="${col}"/>`;
        else if (k === 1) b += `<circle cx="${x + h}" cy="${y + h}" r="${h - 50}" fill="${col}"/>`;
        else if (k === 2) b += `<path d="M ${x + 40} ${y + 40} A ${cell - 80} ${cell - 80} 0 0 1 ${x + cell - 40} ${y + cell - 40} L ${x + 40} ${y + cell - 40} Z" fill="${col}"/>`;
        else if (k === 3) b += `<path d="M ${x + 40} ${y + h} A ${h - 40} ${h - 40} 0 0 1 ${x + cell - 40} ${y + h} Z" fill="${col}"/><path d="M ${x + 40} ${y + h + 20} A ${h - 40} ${h - 40} 0 0 0 ${x + cell - 40} ${y + h + 20} Z" fill="${m}" opacity="0.55"/>`;
        else b += `<rect x="${x + 60}" y="${y + 60}" width="${cell - 120}" height="${cell - 120}" rx="30" fill="none" stroke="${col}" stroke-width="14"/>`;
      }
      return b;
    },
  },
];

/* ---------- build ---------- */
const pack = [];
FAMILIES.forEach((f, fi) => {
  PALS.forEach((p, i) => {
    const rnd = rng(31000 + fi * 100 + i);
    pack.push({
      slug: `bgimg-${FIRST + pack.length}`,
      name: `${f.label} ${p[0]}`,
      tags: ["background", "image", ...f.tags, p[1]],
      svg: svgDoc(f.draw(p, rnd, i), 7 + fi * 10 + i),
    });
  });
});

const sheetAt = process.argv.indexOf("--sheet");
if (sheetAt > 0) {
  const cell = 240;
  const cols = 10;
  const tiles = await Promise.all(pack.map(async (it, i) => ({ input: await sharp(Buffer.from(it.svg)).resize(cell, cell).jpeg({ quality: 80 }).toBuffer(), left: (i % cols) * cell, top: Math.floor(i / cols) * cell })));
  await sharp({ create: { width: cols * cell, height: Math.ceil(pack.length / cols) * cell, channels: 3, background: "#fff" } }).composite(tiles).png().toFile(process.argv[sheetAt + 1]);
  console.log("sheet written");
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });
mkdirSync(MIG, { recursive: true });
const q = (v) => `'${String(v).replaceAll("'", "''")}'`;
const rows = [];
const meta = [];
let total = 0;
for (const it of pack) {
  const file = `${it.slug}.jpg`;
  const bytes = await sharp(Buffer.from(it.svg)).flatten({ background: "#ffffff" }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  writeFileSync(path.join(OUT, file), bytes);
  total += bytes.length;
  const tags = [...new Set(it.tags.map((t) => t.toLowerCase().trim().slice(0, 30)).filter(Boolean))].slice(0, 12);
  meta.push({ file, name: it.name, tags, category: CATEGORY });
  rows.push(`  (${q("seed-" + it.slug)}, ${q(it.name)}, ARRAY[${tags.map(q).join(", ")}]::TEXT[], ${q(CATEGORY)}, ${q("artworks/seed-" + it.slug + ".jpg")}, 'image/jpeg', ${S}, ${S}, ${bytes.length}, CURRENT_TIMESTAMP)`);
}
writeFileSync(path.join(OUT, "backgrounds-gift.json"), JSON.stringify(meta, null, 2) + "\n");
writeFileSync(
  path.join(MIG, "migration.sql"),
  `-- 100 gift-wrap style box-background pictures in the category "Background Image" (generated by scripts/artworks/generate-gift-backgrounds.mjs).\n` +
    `-- Files: assets/artworks/<name>.jpg, served by apps/web/src/server/storage.ts for keys artworks/seed-<name>.jpg.\n` +
    `INSERT INTO "artwork_item" ("id", "name", "tags", "category", "storageKey", "mime", "widthPx", "heightPx", "sizeBytes", "updatedAt") VALUES\n` +
    rows.join(",\n") +
    `\nON CONFLICT ("storageKey") DO NOTHING;\n`,
);
console.log(`${pack.length} files, ${(total / 1e6).toFixed(1)} MB`);
