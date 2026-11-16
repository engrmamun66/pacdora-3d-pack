/**
 * Draws 60 box-background pictures (original, procedural: landscapes, paper-cut waves, bokeh,
 * watercolour, marble, liquid lines) in the category "Background Image" and writes them to assets/artworks/,
 * plus assets/artworks/backgrounds.json and the migration that adds the rows to the database.
 * The editor's "Box background" panel lists this category (the artwork Library tab leaves it out).
 * Seeded, so a re-run gives the same files. Run from the repo root:
 *   node scripts/artworks/generate-backgrounds.mjs [--sheet <file.png>]   (--sheet writes a contact sheet only)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, "../../apps/web/package.json"));
const sharp = require("sharp");
const OUT = path.resolve(here, "../../assets/artworks");
const MIG = path.resolve(here, "../../apps/web/prisma/migrations/20261116130000_seed_background_images");
const CATEGORY = "Background Image";
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
const grad = (id, stops, x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>`;

/** A smooth ridge across the picture, closed at the bottom: points every `step` px, joined by curves. */
function ridge(rnd, base, amp, step = 150) {
  const pts = [];
  for (let x = -step; x <= S + step * 2; x += step) pts.push([x, base + (rnd() - 0.5) * 2 * amp]);
  let d = `M ${pts[0][0]} ${S} L ${pts[0][0]} ${n1(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q ${pts[i][0]} ${n1(pts[i][1])} ${n1(mx)} ${n1(my)}`;
  }
  return d + ` L ${S + step * 2} ${S} Z`;
}

/* ---------- families: [name, tag, palettes[], draw(p, rnd, i)] ---------- */
const FAMILIES = [
  {
    key: "landscape", label: "Landscape", tags: ["landscape", "hills"],
    pals: [
      ["Dawn", "dawn", "#ffd9c0", "#f7a8b8", "#fff3d6", ["#c78fb3", "#9c6fa8", "#6b5a9a", "#41447e"]],
      ["Meadow", "meadow", "#bfe6f7", "#eaf8ee", "#fff8c9", ["#b7e0a1", "#86c77f", "#55a868", "#2f7d4f"]],
      ["Sunset", "sunset", "#5b3a8c", "#ff9a5c", "#ffe9a8", ["#d6577b", "#a63d78", "#6e2b73", "#3d1d5c"]],
      ["Dusk", "dusk", "#27336b", "#e0829a", "#ffd6a0", ["#6b4a8f", "#4b3a7d", "#33306a", "#1f2554"]],
      ["Night", "night", "#0b1230", "#2a3a78", "#f4f1d0", ["#1e2c63", "#17224f", "#111a3d", "#0a1029"]],
      ["Autumn", "autumn", "#ffe3b5", "#ffc77a", "#fff2d1", ["#e59a4a", "#c9702f", "#9a4a24", "#6a2f1c"]],
      ["Forest", "forest", "#cfe8d8", "#eef6e2", "#fffbd6", ["#7fb88a", "#4f9068", "#2f6b4d", "#1b4636"]],
      ["Desert", "desert", "#ffd7a1", "#ffeccb", "#fff6df", ["#efb878", "#d9945a", "#b36d44", "#8a4d37"]],
      ["Snow", "snow", "#cddcf2", "#f4f8ff", "#ffffff", ["#e6eefb", "#c9d9ef", "#a9bfdf", "#869dc7"]],
      ["Candy", "candy", "#ffd1e8", "#fff0c9", "#ffffff", ["#ffa6c9", "#c8a2ff", "#8fd0ff", "#7be0c3"]],
    ],
    draw: (p, rnd) => {
      const [, , top, bot, sun, hills] = p;
      let b = `<defs>${grad("sky", [[0, top], [1, bot]])}</defs><rect width="${S}" height="${S}" fill="url(#sky)"/>`;
      const sx = 250 + rnd() * 700;
      b += `<circle cx="${n1(sx)}" cy="${n1(330 + rnd() * 120)}" r="${n1(95 + rnd() * 50)}" fill="${sun}" opacity="0.95"/>`;
      hills.forEach((c, i) => { b += `<path d="${ridge(rnd, 560 + i * 140, 55 + i * 12, 180 - i * 15)}" fill="${c}"/>`; });
      return b;
    },
  },
  {
    key: "paperwaves", label: "Paper waves", tags: ["waves", "layers"],
    pals: [
      ["Ocean", "ocean", "#e8f6fb", "#a6dcef", "#5db6dc", "#2d86be", "#175a96", "#0c3a6b"],
      ["Sunrise", "sunrise", "#fff1d6", "#ffd09a", "#ffa66b", "#f4745f", "#c94a67", "#8b3a6e"],
      ["Mint", "mint", "#f1fbf6", "#c9f0de", "#94dcc0", "#5cc2a2", "#33a085", "#1e7c68"],
      ["Berry", "berry", "#fdeef5", "#f8c4dc", "#ee93bd", "#d95d98", "#aa3677", "#6f2056"],
      ["Lavender", "lavender", "#f4f0fd", "#d9cdf6", "#b9a3ec", "#957bdb", "#6f55bb", "#473a8f"],
      ["Sand", "sand", "#fbf3e6", "#f0dcb8", "#e2c08a", "#cc9c63", "#a87647", "#7d5336"],
      ["Forest", "forest", "#eef6e6", "#cfe5b9", "#a3cf86", "#6fb063", "#44894d", "#2a6038"],
      ["Citrus", "citrus", "#fffbdc", "#ffee9a", "#ffd24f", "#ffab2e", "#ef7d1d", "#c9561a"],
      ["Slate", "slate", "#f1f3f6", "#cfd6e0", "#a2aebf", "#73839b", "#4c5d78", "#2e3b54"],
      ["Rose gold", "rosegold", "#fff1ee", "#fbd3c8", "#f2ad9d", "#e0867a", "#bd605e", "#8a4146"],
    ],
    draw: (p, rnd) => {
      const cols = p.slice(2);
      let b = rect(cols[0]);
      const amp = 40 + rnd() * 30;
      for (let i = 1; i < cols.length; i++) {
        const y = 140 + i * 165;
        const ph = rnd() * 6.28;
        const fr = 1.2 + rnd() * 1.4;
        let d = `M 0 ${S} L 0 ${n1(y)}`;
        for (let x = 0; x <= S; x += 30) d += ` L ${x} ${n1(y + Math.sin((x / S) * fr * 6.283 + ph) * amp)}`;
        d += ` L ${S} ${S} Z`;
        b += `<path d="${d}" transform="translate(0 -9)" fill="#000" opacity="0.13"/><path d="${d}" fill="${cols[i]}"/>`;
      }
      return b;
    },
  },
  {
    key: "bokeh", label: "Bokeh", tags: ["bokeh", "lights"],
    pals: [
      ["Midnight", "midnight", "#0a1030", "#1c2c6e", ["#7aa2ff", "#c0d4ff", "#ffffff", "#8a7bff"]],
      ["Gold", "gold", "#1b1208", "#4a3010", ["#ffd36a", "#ffb84a", "#fff1b8", "#ff9d3a"]],
      ["Rose", "rose", "#2a0b1f", "#6a1f4a", ["#ff8fc2", "#ffc2de", "#ffffff", "#ff6aa8"]],
      ["Emerald", "emerald", "#04201a", "#0f5a48", ["#5be8b8", "#a6f5d8", "#ffffff", "#2fcf9a"]],
      ["Violet", "violet", "#160a30", "#3f1f7a", ["#b48aff", "#dcc6ff", "#ffffff", "#8a5cf5"]],
      ["Sunset", "sunset", "#2b0f1a", "#8a2f3a", ["#ff9a5c", "#ffd08a", "#ffffff", "#ff6a5c"]],
      ["Ice", "ice", "#071a2e", "#1a5578", ["#8fdcff", "#d0f2ff", "#ffffff", "#5fc2f2"]],
      ["Candy", "candy", "#2a1030", "#7a2f7a", ["#ff9ad6", "#9ae6ff", "#fff59a", "#c49aff"]],
      ["Warm white", "warmwhite", "#231a14", "#5a4636", ["#fff1d6", "#ffe0a8", "#ffffff", "#ffd08a"]],
      ["Teal", "teal", "#04222a", "#0f6a78", ["#6ff0ea", "#b8fbf6", "#ffffff", "#3acfd0"]],
    ],
    draw: (p, rnd) => {
      const [, , c0, c1, lights] = p;
      let b = `<defs>${grad("g", [[0, c0], [1, c1]], 0.3, 1)}<filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter><filter id="l" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22"/></filter></defs><rect width="${S}" height="${S}" fill="url(#g)"/>`;
      b += `<g filter="url(#l)">`;
      for (let i = 0; i < 9; i++) b += `<circle cx="${n1(rnd() * S)}" cy="${n1(rnd() * S)}" r="${n1(110 + rnd() * 120)}" fill="${lights[i % 4]}" opacity="${n1(0.18 + rnd() * 0.2)}"/>`;
      b += `</g><g filter="url(#s)">`;
      for (let i = 0; i < 46; i++) {
        const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 70, c = lights[Math.floor(rnd() * 4)];
        b += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" fill="${c}" opacity="${n1(0.18 + rnd() * 0.5)}"/><circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" fill="none" stroke="${c}" stroke-width="3" opacity="0.5"/>`;
      }
      return b + `</g>`;
    },
  },
  {
    key: "watercolor", label: "Watercolor", tags: ["watercolor", "paint"],
    pals: [
      ["Blush", "blush", ["#f6b6c4", "#fbd5b5", "#f2a0b8"]],
      ["Sky", "sky", ["#9fd3f2", "#c7e6fb", "#82b8ea"]],
      ["Spring", "spring", ["#bfe39a", "#fff0a0", "#8fd1b0"]],
      ["Lilac", "lilac", ["#cdb6f2", "#f2bfe6", "#a79af0"]],
      ["Peach", "peach", ["#ffc9a0", "#ffe0b0", "#ffa890"]],
      ["Teal", "teal", ["#8fd9d0", "#bdeee0", "#6fc2d6"]],
      ["Coral", "coral", ["#ff9f8f", "#ffc2a8", "#f57e90"]],
      ["Dusk", "dusk", ["#8f9bf0", "#d29bf0", "#f09bb8"]],
      ["Sage", "sage", ["#b5cfa6", "#d8e4bd", "#9fbfae"]],
      ["Sunny", "sunny", ["#ffe083", "#ffb86a", "#fff2b0"]],
    ],
    draw: (p, rnd, i) => {
      const cols = p[2];
      const seed = 11 + i;
      let b = `<defs><filter id="w" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.009" numOctaves="3" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="150" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="7"/></filter><filter id="g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed}" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0 0.35  0 0 0 0.16 0"/></filter></defs>`;
      b += rect("#fbf8f2") + `<g filter="url(#w)">`;
      for (let k = 0; k < 12; k++) b += `<ellipse cx="${n1(rnd() * S)}" cy="${n1(rnd() * S)}" rx="${n1(220 + rnd() * 260)}" ry="${n1(170 + rnd() * 230)}" transform="rotate(${n1(rnd() * 180)} 600 600)" fill="${cols[k % 3]}" opacity="${n1(0.38 + rnd() * 0.3)}"/>`;
      return b + `</g><rect width="${S}" height="${S}" filter="url(#g)"/>`;
    },
  },
  {
    key: "marble", label: "Marble", tags: ["marble", "stone"],
    pals: [
      ["White", "white", "#f7f6f3", "#c9c6c0", "#8d8a85"],
      ["Black gold", "blackgold", "#16161a", "#3a3a42", "#d9b45a"],
      ["Rose", "rose", "#fbeeee", "#e9bcc0", "#b87480"],
      ["Emerald", "emerald", "#e9f4ef", "#6fb095", "#1d5e4a"],
      ["Navy", "navy", "#e8edf6", "#6f86b8", "#1c2f62"],
      ["Sand", "sand", "#f6efe3", "#d3bd96", "#8a6e46"],
      ["Slate", "slate", "#eceef1", "#9099a8", "#4a5466"],
      ["Lilac", "lilac", "#f3eefa", "#b9a6dc", "#6c54a0"],
      ["Terracotta", "terracotta", "#fbefe6", "#e0a98a", "#a8573a"],
      ["Ice blue", "iceblue", "#f0f7fb", "#a8d0e6", "#4d84a8"],
    ],
    draw: (p, rnd, i) => {
      const [, , light, mid, dark] = p;
      const seed = 5 + i * 3;
      const ang = rnd();
      return `<defs>${grad("m", [[0, light], [0.08, mid], [0.1, light], [0.2, light], [0.24, dark], [0.26, mid], [0.3, light], [0.4, light], [0.43, mid], [0.45, light], [0.55, light], [0.6, dark], [0.62, mid], [0.67, light], [0.78, light], [0.82, mid], [0.84, light], [0.92, mid], [1, light]], ang, 1)}<filter id="f" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.006" numOctaves="4" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="380" xChannelSelector="R" yChannelSelector="B"/></filter></defs>${rect(light)}<rect x="-500" y="-500" width="2200" height="2200" fill="url(#m)" filter="url(#f)"/>`;
    },
  },
  {
    key: "contour", label: "Liquid lines", tags: ["liquid", "flow"],
    pals: [
      ["Kraft", "kraft", "#ead9b8", "#a87a45"],
      ["Mint", "mint", "#e4f5ec", "#3a9a78"],
      ["Navy", "navy", "#13233f", "#8fb4f0"],
      ["Blush", "blush", "#fbe7e4", "#d9605f"],
      ["Charcoal", "charcoal", "#222427", "#aab0b8"],
      ["Forest", "forest", "#18382b", "#9ad0a8"],
      ["Ocean", "ocean", "#e1f1fa", "#2b7fb8"],
      ["Plum", "plum", "#2c1636", "#d49af0"],
      ["Sun", "sun", "#fff1c4", "#e08a1e"],
      ["Paper", "paper", "#f6f4ef", "#5a5750"],
    ],
    draw: (p, rnd, i) => {
      const [, , bg, line] = p;
      const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255);
      const [a, c] = [hex(bg), hex(line)];
      // The noise is cut into 28 levels; every fourth one is drawn in the line colour, so the level edges read as contour lines.
      const ramp = (ch) => Array.from({ length: 28 }, (_, k) => (k % 4 === 1 ? c[ch] : a[ch]).toFixed(3)).join(" ");
      const seed = 21 + i * 2;
      return `<defs><filter id="t" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.0026 0.0034" numOctaves="2" seed="${seed}"/><feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1"/><feComponentTransfer><feFuncR type="discrete" tableValues="${ramp(0)}"/><feFuncG type="discrete" tableValues="${ramp(1)}"/><feFuncB type="discrete" tableValues="${ramp(2)}"/></feComponentTransfer></filter></defs><rect width="${S}" height="${S}" filter="url(#t)"/>`;
    },
  },
];

/* ---------- build ---------- */
const pack = [];
FAMILIES.forEach((f, fi) => {
  f.pals.forEach((p, i) => {
    const rnd = rng(9000 + fi * 100 + i);
    pack.push({
      slug: `bgimg-${String(pack.length + 1).padStart(2, "0")}`,
      name: `${f.label} ${p[0]}`,
      tags: ["background", "image", ...f.tags, p[1]],
      svg: svgDoc(f.draw(p, rnd, i)),
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
writeFileSync(path.join(OUT, "backgrounds.json"), JSON.stringify(meta, null, 2) + "\n");
writeFileSync(
  path.join(MIG, "migration.sql"),
  `-- 60 box-background pictures in the category "Background Image" (generated by scripts/artworks/generate-backgrounds.mjs).\n` +
    `-- Files: assets/artworks/<name>.jpg, served by apps/web/src/server/storage.ts for keys artworks/seed-<name>.jpg.\n` +
    `INSERT INTO "artwork_item" ("id", "name", "tags", "category", "storageKey", "mime", "widthPx", "heightPx", "sizeBytes", "updatedAt") VALUES\n` +
    rows.join(",\n") +
    `\nON CONFLICT ("storageKey") DO NOTHING;\n`,
);
console.log(`${pack.length} files, ${(total / 1e6).toFixed(1)} MB`);
