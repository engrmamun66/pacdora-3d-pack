/**
 * Draws 60 decorative patterns (original, procedural: scallops, chevrons, quatrefoils, art deco fans, plaid,
 * memphis shapes) in the category "Patterns" and writes them to assets/artworks/, plus
 * assets/artworks/patterns.json and the migration that adds the rows to the database.
 * Seeded, so a re-run gives the same files. Run from the repo root:
 *   node scripts/artworks/generate-patterns.mjs [--sheet <file.png>]   (--sheet writes a contact sheet only)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, "../../apps/web/package.json"));
const sharp = require("sharp");
const OUT = path.resolve(here, "../../assets/artworks");
const MIG = path.resolve(here, "../../apps/web/prisma/migrations/20261116140000_seed_patterns");
const CATEGORY = "Patterns";
const S = 1200;

const n1 = (v) => (Math.round(v * 10) / 10).toString();
const svgDoc = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${body}</svg>`;
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

/** [name, tag, background, a, b, c] */
const PALS = [
  ["Kraft", "kraft", "#efe0c4", "#c9a56a", "#8a5a2b", "#fff8e8"],
  ["Mint", "mint", "#e6f6ee", "#8fd3b6", "#2e9c7a", "#ffffff"],
  ["Blush", "blush", "#fdebe8", "#f4a6a0", "#d9534f", "#fff7f5"],
  ["Navy and gold", "navy", "#162743", "#d8b45a", "#4a6aa0", "#f4ead0"],
  ["Sunset", "sunset", "#ffeed4", "#ff9a5c", "#e04a5f", "#7a2e6e"],
  ["Ocean", "ocean", "#e4f3fb", "#6fb7e6", "#1d6fae", "#0c3c66"],
  ["Forest", "forest", "#e9f1df", "#9cc07a", "#4d7f3a", "#244a25"],
  ["Lavender", "lavender", "#f1ebfb", "#b9a2e8", "#7653c4", "#ffffff"],
  ["Mono", "mono", "#f3f3f1", "#b9b9b4", "#55554f", "#1f1f1c"],
  ["Berry", "berry", "#fae9f2", "#e58ab8", "#a3245f", "#4b1b5a"],
];

const FAMILIES = [
  {
    label: "Scallops", tags: ["scallop", "fish scale"],
    draw: (p) => {
      const [, , bg, a, b, c] = p;
      let s = rect(bg);
      for (let r = 0; r < 18; r++) for (let col = -1; col < 9; col++) {
        const x = col * 150 + (r % 2 ? 75 : 0), y = r * 75;
        s += `<circle cx="${x}" cy="${y}" r="75" fill="${b}"/><circle cx="${x}" cy="${y}" r="62" fill="${bg}"/><circle cx="${x}" cy="${y}" r="49" fill="${a}"/><circle cx="${x}" cy="${y}" r="36" fill="${bg}"/><circle cx="${x}" cy="${y}" r="22" fill="${c}"/>`;
      }
      return s;
    },
  },
  {
    label: "Chevron", tags: ["chevron", "zigzag"],
    draw: (p) => {
      const [, , bg, a, b, c] = p;
      let s = rect(bg);
      const cols = [a, b, c];
      for (let k = -2; k < 14; k++) {
        let d = "";
        for (let x = 0; x <= S + 100; x += 100) d += `${x ? "L" : "M"} ${x} ${(k * 100 + ((x / 100) % 2 ? -100 : 0)) + 50} `;
        s += `<path d="${d}" fill="none" stroke="${cols[((k % 3) + 3) % 3]}" stroke-width="${k % 3 === 0 ? 56 : 30}" stroke-linejoin="miter"/>`;
      }
      return s;
    },
  },
  {
    label: "Quatrefoil", tags: ["quatrefoil", "tile"],
    draw: (p) => {
      const [, , bg, a, b, c] = p;
      let s = rect(bg);
      for (let r = 0; r < 7; r++) for (let col = 0; col < 7; col++) {
        const x = col * 200, y = r * 200;
        s += `<g transform="translate(${x} ${y})">${[[100, 62], [100, 138], [62, 100], [138, 100]].map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="44" fill="${a}" stroke="${b}" stroke-width="6"/>`).join("")}<circle cx="100" cy="100" r="18" fill="${c}"/><circle cx="0" cy="0" r="14" fill="${b}"/><circle cx="200" cy="0" r="14" fill="${b}"/><circle cx="0" cy="200" r="14" fill="${b}"/><circle cx="200" cy="200" r="14" fill="${b}"/></g>`;
      }
      return s;
    },
  },
  {
    label: "Art deco fans", tags: ["art deco", "fan"],
    draw: (p) => {
      const [, , bg, a, b, c] = p;
      let s = rect(bg);
      for (let r = 0; r < 14; r++) for (let col = -1; col < 7; col++) {
        const x = col * 200 + (r % 2 ? 100 : 0), y = r * 100 + 100;
        let rays = "";
        for (let k = 1; k < 8; k++) { const t = Math.PI + (k * Math.PI) / 8; rays += `<line x1="${x}" y1="${y}" x2="${n1(x + 100 * Math.cos(t))}" y2="${n1(y + 100 * Math.sin(t))}" stroke="${bg}" stroke-width="4"/>`; }
        s += `<path d="M ${x - 100} ${y} A 100 100 0 0 1 ${x + 100} ${y} Z" fill="${a}"/><path d="M ${x - 70} ${y} A 70 70 0 0 1 ${x + 70} ${y} Z" fill="${b}"/><path d="M ${x - 40} ${y} A 40 40 0 0 1 ${x + 40} ${y} Z" fill="${c}"/>${rays}`;
      }
      return s;
    },
  },
  {
    label: "Plaid", tags: ["plaid", "tartan"],
    draw: (p) => {
      const [, , bg, a, b, c] = p;
      let s = rect(bg);
      for (let i = 0; i < 5; i++) s += `<rect x="${i * 240 + 20}" width="90" height="${S}" fill="${a}" opacity="0.6"/><rect y="${i * 240 + 20}" width="${S}" height="90" fill="${a}" opacity="0.6"/>`;
      for (let i = 0; i < 5; i++) s += `<rect x="${i * 240 + 130}" width="22" height="${S}" fill="${b}" opacity="0.85"/><rect y="${i * 240 + 130}" width="${S}" height="22" fill="${b}" opacity="0.85"/><rect x="${i * 240 + 190}" width="5" height="${S}" fill="${c}" opacity="0.9"/><rect y="${i * 240 + 190}" width="${S}" height="5" fill="${c}" opacity="0.9"/>`;
      return s;
    },
  },
  {
    label: "Memphis", tags: ["memphis", "retro"],
    draw: (p, rnd) => {
      const [, , bg, a, b, c] = p;
      const cols = [a, b, c];
      let s = rect(bg);
      for (let r = 0; r < 8; r++) for (let col = 0; col < 8; col++) {
        const x = col * 150 + 75 + (rnd() - 0.5) * 36, y = r * 150 + 75 + (rnd() - 0.5) * 36;
        const k = Math.floor(rnd() * 6), cl = cols[Math.floor(rnd() * 3)], rot = Math.floor(rnd() * 360);
        const shape = [
          `<path d="M -34 0 Q -17 -26 0 0 T 34 0" fill="none" stroke="${cl}" stroke-width="10" stroke-linecap="round"/>`,
          `<polygon points="0,-34 32,26 -32,26" fill="none" stroke="${cl}" stroke-width="9" stroke-linejoin="round"/>`,
          `<circle r="26" fill="none" stroke="${cl}" stroke-width="10"/>`,
          `<g fill="${cl}"><circle cx="-18" cy="-18" r="6"/><circle cx="0" cy="-18" r="6"/><circle cx="18" cy="-18" r="6"/><circle cx="-18" cy="0" r="6"/><circle cx="0" cy="0" r="6"/><circle cx="18" cy="0" r="6"/></g>`,
          `<path d="M -26 0 H 26 M 0 -26 V 26" stroke="${cl}" stroke-width="10" stroke-linecap="round"/>`,
          `<path d="M -32 14 A 32 32 0 0 1 32 14 Z" fill="${cl}"/>`,
        ][k];
        s += `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${rot}) scale(1.45)">${shape}</g>`;
      }
      return s;
    },
  },
];

const pack = [];
FAMILIES.forEach((f, fi) => {
  PALS.forEach((p, i) => {
    pack.push({
      slug: `pat-${String(pack.length + 1).padStart(2, "0")}`,
      name: `${f.label} ${p[0]}`,
      tags: ["pattern", ...f.tags, p[1]],
      // Palettes rotate between families so the same colours do not line up in one row.
      svg: svgDoc(f.draw(PALS[(i + fi * 3) % PALS.length], rng(7000 + fi * 100 + i))),
    });
  });
});
// The name must match the palette the picture really uses.
pack.forEach((it, idx) => { const fi = Math.floor(idx / 10), i = idx % 10; it.name = `${FAMILIES[fi].label} ${PALS[(i + fi * 3) % PALS.length][0]}`; it.tags[it.tags.length - 1] = PALS[(i + fi * 3) % PALS.length][1]; });

const sheetAt = process.argv.indexOf("--sheet");
if (sheetAt > 0) {
  const cell = 240, cols = 10;
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
  const file = `${it.slug}.png`;
  const bytes = await sharp(Buffer.from(it.svg)).png({ palette: true, quality: 92, effort: 8, compressionLevel: 9 }).toBuffer();
  writeFileSync(path.join(OUT, file), bytes);
  total += bytes.length;
  const tags = [...new Set(it.tags.map((t) => t.toLowerCase().trim().slice(0, 30)).filter(Boolean))].slice(0, 12);
  meta.push({ file, name: it.name, tags, category: CATEGORY });
  rows.push(`  (${q("seed-" + it.slug)}, ${q(it.name)}, ARRAY[${tags.map(q).join(", ")}]::TEXT[], ${q(CATEGORY)}, ${q("artworks/seed-" + it.slug + ".png")}, 'image/png', ${S}, ${S}, ${bytes.length}, CURRENT_TIMESTAMP)`);
}
writeFileSync(path.join(OUT, "patterns.json"), JSON.stringify(meta, null, 2) + "\n");
writeFileSync(
  path.join(MIG, "migration.sql"),
  `-- 60 decorative patterns in the category "Patterns" (generated by scripts/artworks/generate-patterns.mjs).\n` +
    `-- Files: assets/artworks/<name>.png, served by apps/web/src/server/storage.ts for keys artworks/seed-<name>.png.\n` +
    `INSERT INTO "artwork_item" ("id", "name", "tags", "category", "storageKey", "mime", "widthPx", "heightPx", "sizeBytes", "updatedAt") VALUES\n` +
    rows.join(",\n") +
    `\nON CONFLICT ("storageKey") DO NOTHING;\n`,
);
console.log(`${pack.length} files, ${(total / 1e6).toFixed(1)} MB`);
