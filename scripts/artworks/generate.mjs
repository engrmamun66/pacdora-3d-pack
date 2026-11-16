/**
 * Draws the starter packaging artworks (original vector designs) and writes them as PNG to
 * assets/artworks/. Run from the repo root:  node scripts/artworks/generate.mjs
 * Then add them to the library with:         npm run db:seed:artworks -w web
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../apps/web/package.json"));
const sharp = require("sharp");
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/artworks");
mkdirSync(OUT, { recursive: true });

const F = 'font-family="Helvetica, Arial, sans-serif"';
const INK = "#2b2118";
const svg = (body, w = 1200, h = 1200) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

/** Text spread evenly around a full circle (one glyph per slot, upright toward the outside); no textPath, so every renderer agrees. */
const ringText = (_id, r, text, size, fill, cx = 600, cy = 600) => {
  const chars = [...text];
  return chars
    .map((ch, i) => {
      if (ch === " ") return "";
      const a = -90 + (i * 360) / chars.length;
      return `<text ${F} font-size="${size}" font-weight="700" fill="${fill}" text-anchor="middle" transform="rotate(${a.toFixed(2)} ${cx} ${cy}) translate(${cx} ${cy - r})">${ch === "&" ? "&amp;" : ch}</text>`;
    })
    .join("");
};

const star = (cx, cy, ro, ri, n) => {
  const p = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 ? ri : ro;
    p.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return p.join(" ");
};

const items = [];
const add = (file, name, tags, category, body, w, h) => items.push({ file, name, tags, category, svg: svg(body, w, h) });

// 1 Recycle badge: three chasing arrows on a ring
{
  const cx = 600, cy = 560, R = 250;
  const pt = (deg, r = R) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const arrow = (a0) => {
    const a1 = a0 + 78;
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    const [hx, hy] = pt(a1 + 14), [ix, iy] = pt(a1 - 4, R + 85), [ox, oy] = pt(a1 - 4, R - 85);
    const tip = pt(a1 + 22);
    return `<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="#2f7d3b" stroke-width="70" stroke-linecap="butt"/>` +
      `<polygon points="${ix.toFixed(1)},${iy.toFixed(1)} ${ox.toFixed(1)},${oy.toFixed(1)} ${tip[0].toFixed(1)},${tip[1].toFixed(1)}" fill="#2f7d3b"/>`;
  };
  add("recycle-badge", "Recycle badge", "recycle,eco,green,badge", "Eco",
    `<circle cx="600" cy="600" r="560" fill="#e8f3df" stroke="#2f7d3b" stroke-width="24"/>` +
    `<circle cx="600" cy="600" r="500" fill="none" stroke="#2f7d3b" stroke-width="6" stroke-dasharray="4 18" stroke-linecap="round"/>` +
    arrow(-80) + arrow(40) + arrow(160) +
    `<text x="600" y="1000" ${F} font-size="84" font-weight="800" text-anchor="middle" fill="#2f7d3b" letter-spacing="8">RECYCLABLE</text>`);
}

// 2 Fragile glass
add("fragile-glass", "Fragile glass", "fragile,handle with care,glass,warning", "Handling",
  `<rect x="60" y="60" width="1080" height="1080" rx="120" fill="#fff" stroke="${INK}" stroke-width="28"/>` +
  `<path d="M 380 220 H 820 L 780 560 Q 770 640 700 660 V 880 H 800 V 940 H 400 V 880 H 500 V 660 Q 430 640 420 560 Z" fill="#e5473d" stroke="${INK}" stroke-width="26" stroke-linejoin="round"/>` +
  `<path d="M 560 220 L 520 360 L 600 420 L 540 540" fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<text x="600" y="1060" ${F} font-size="96" font-weight="900" text-anchor="middle" fill="${INK}" letter-spacing="14">FRAGILE</text>`);

// 3 This side up
add("this-side-up", "This side up", "arrows,this side up,handling,logistics", "Handling",
  `<rect x="60" y="60" width="1080" height="1080" rx="120" fill="#fff" stroke="${INK}" stroke-width="28"/>` +
  [330, 870].map((x) => `<g fill="${INK}"><polygon points="${x},180 ${x + 190},470 ${x + 70},470 ${x + 70},800 ${x - 70},800 ${x - 70},470 ${x - 190},470"/></g>`).join("").replace(/<polygon points="(\d+),180 (\d+),470 (\d+),470 (\d+),800 (\d+),800 (\d+),470 (\d+),470"\/>/g, (m, x) => m) +
  `<text x="600" y="1000" ${F} font-size="110" font-weight="900" text-anchor="middle" fill="${INK}" letter-spacing="10">THIS SIDE UP</text>`);

// 4 Keep dry
add("keep-dry", "Keep dry umbrella", "keep dry,umbrella,rain,handling", "Handling",
  `<rect x="60" y="60" width="1080" height="1080" rx="120" fill="#e8f2fb" stroke="#1d5f9e" stroke-width="28"/>` +
  `<path d="M 200 560 Q 200 230 600 210 Q 1000 230 1000 560 Q 930 480 860 560 Q 790 480 730 560 Q 670 480 600 560 Q 530 480 470 560 Q 400 480 340 560 Q 270 480 200 560 Z" fill="#1d5f9e"/>` +
  `<path d="M 600 560 V 820 Q 600 900 530 900 Q 470 900 470 840" fill="none" stroke="${INK}" stroke-width="40" stroke-linecap="round"/>` +
  [[330, 650], [850, 700], [730, 820], [420, 780]].map(([x, y]) => `<path d="M ${x} ${y - 40} Q ${x + 30} ${y} ${x} ${y + 24} Q ${x - 30} ${y} ${x} ${y - 40} Z" fill="#1d5f9e"/>`).join("") +
  `<text x="600" y="1050" ${F} font-size="104" font-weight="900" text-anchor="middle" fill="#1d5f9e" letter-spacing="12">KEEP DRY</text>`);

// 5 Leaf seal
add("natural-leaf-seal", "Natural leaf seal", "natural,leaf,organic,seal,eco", "Eco",
  `<circle cx="600" cy="600" r="560" fill="#2f6b3a"/>` +
  `<circle cx="600" cy="600" r="520" fill="none" stroke="#cfe8c4" stroke-width="8"/>` +
  `<path d="M 380 760 Q 340 360 760 300 Q 860 700 470 820 Z" fill="#cfe8c4"/>` +
  `<path d="M 400 800 Q 560 560 720 380" fill="none" stroke="#2f6b3a" stroke-width="22" stroke-linecap="round"/>` +
  [[500, 680, 600, 650], [540, 600, 650, 560], [590, 520, 690, 480]].map(([a, b, c, d]) => `<path d="M ${a} ${b} L ${c} ${d}" stroke="#2f6b3a" stroke-width="14" stroke-linecap="round"/>`).join("") +
  ringText("lt", 440, "100% NATURAL • ORGANIC • ECO •", 84, "#cfe8c4", 600, 600, 0) +
  `<text x="600" y="1020" ${F} font-size="1" fill="none">.</text>`);

// 6 Handmade stamp
add("handmade-stamp", "Handmade with love stamp", "handmade,stamp,love,craft,heart", "Stamps",
  `<circle cx="600" cy="600" r="540" fill="none" stroke="#a3322a" stroke-width="26"/>` +
  `<circle cx="600" cy="600" r="470" fill="none" stroke="#a3322a" stroke-width="8"/>` +
  `<circle cx="600" cy="600" r="250" fill="none" stroke="#a3322a" stroke-width="8"/>` +
  ringText("hm", 360, "HANDMADE WITH LOVE • SMALL BATCH •", 64, "#a3322a", 600, 600, 0) +
  `<path d="M 600 760 C 380 600 440 430 600 520 C 760 430 820 600 600 760 Z" fill="#a3322a"/>`);

// 7 Cookie badge
{
  const chips = [[480, 470], [680, 430], [560, 640], [740, 640], [430, 650], [620, 520]]
    .map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="${34 + (i % 3) * 6}" ry="${26 + (i % 2) * 6}" transform="rotate(${i * 40} ${x} ${y})" fill="#4a2b17"/>`).join("");
  add("fresh-baked-cookie", "Fresh baked cookie", "cookie,bakery,fresh baked,food,badge", "Food",
    `<circle cx="600" cy="600" r="560" fill="#fbeed3" stroke="#b9722f" stroke-width="22"/>` +
    `<circle cx="600" cy="560" r="290" fill="#d79a52" stroke="#a9692a" stroke-width="18"/>` + chips +
    `<text x="600" y="960" ${F} font-size="86" font-weight="900" text-anchor="middle" fill="#8a4f1c" letter-spacing="6">FRESH BAKED</text>` +
    `<text x="600" y="150" ${F} font-size="60" font-weight="700" text-anchor="middle" fill="#b9722f" letter-spacing="16">EVERY DAY</text>`);
}

// 8 Starburst sticker
add("natural-starburst", "Starburst sticker", "starburst,sticker,sale,new,badge", "Stickers",
  `<polygon points="${star(600, 600, 570, 470, 18)}" fill="#f5c518" stroke="${INK}" stroke-width="20" stroke-linejoin="round"/>` +
  `<text x="600" y="540" ${F} font-size="230" font-weight="900" text-anchor="middle" fill="${INK}">100%</text>` +
  `<text x="600" y="700" ${F} font-size="130" font-weight="900" text-anchor="middle" fill="${INK}" letter-spacing="6">NATURAL</text>` +
  `<text x="600" y="800" ${F} font-size="60" font-weight="700" text-anchor="middle" fill="${INK}" letter-spacing="14">NO PRESERVATIVES</text>`);

// 9 Geometric semicircle pattern (tile)
{
  const t = 200, cols = 6, rows = 6;
  const cols_ = ["#e9d8bd", "#c9a56a", "#8a5a2b", "#f3ead9"];
  let b = `<rect width="1200" height="1200" fill="#f3ead9"/>`;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * t, y = r * t, k = (r + c) % 4;
    b += `<path d="M ${x} ${y + t} A ${t / 2} ${t / 2} 0 0 1 ${x + t} ${y + t} Z" fill="${cols_[k]}"/>` +
         `<circle cx="${x + t / 2}" cy="${y + t / 2 - 10}" r="${t / 6}" fill="${cols_[(k + 2) % 4]}"/>`;
  }
  add("pattern-semicircles", "Semicircle pattern", "pattern,geometric,kraft,seamless,background", "Patterns", b);
}

// 10 Dots and waves pattern
{
  let b = `<rect width="1200" height="1200" fill="#fdf4e3"/>`;
  for (let r = 0; r < 8; r++) {
    const y = 80 + r * 150;
    b += `<path d="M 0 ${y} ` + Array.from({ length: 12 }, (_, i) => `Q ${i * 100 + 50} ${y + (i % 2 ? 50 : -50)} ${(i + 1) * 100} ${y}`).join(" ") + `" fill="none" stroke="#d9663a" stroke-width="14" stroke-linecap="round"/>`;
    for (let c = 0; c < 6; c++) b += `<circle cx="${c * 200 + (r % 2 ? 100 : 0) + 50}" cy="${y + 70}" r="14" fill="#2f6b6b"/>`;
  }
  add("pattern-waves-dots", "Waves and dots pattern", "pattern,waves,dots,retro,background", "Patterns", b);
}

const meta = [];
for (const it of items) {
  const file = `${it.file}.png`;
  const png = await sharp(Buffer.from(it.svg)).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(path.join(OUT, file), png);
  meta.push({ file, name: it.name, tags: it.tags, category: it.category });
  console.log(file, png.length);
}
// Production gets these rows from a migration (a migration cannot write files, so the PNGs are served from assets/artworks
// by apps/web/src/server/storage.ts). Rows are keyed seed-<name>; re-running the migration never duplicates or overwrites.
const q = (v) => `'${String(v).replaceAll("'", "''")}'`;
const rows = [];
for (const m of meta) {
  const slug = m.file.replace(/\.png$/, "");
  const info = await sharp(path.join(OUT, m.file)).metadata();
  const bytes = readFileSync(path.join(OUT, m.file)).length;
  rows.push(`  (${q("seed-" + slug)}, ${q(m.name)}, ARRAY[${m.tags.split(",").map(q).join(", ")}]::TEXT[], ${q(m.category)}, ${q("artworks/seed-" + slug + ".png")}, 'image/png', ${info.width}, ${info.height}, ${bytes}, CURRENT_TIMESTAMP)`);
}
const MIG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../apps/web/prisma/migrations/20261116100000_seed_artworks");
mkdirSync(MIG, { recursive: true });
writeFileSync(
  path.join(MIG, "migration.sql"),
  `-- Starter packaging artworks (generated by scripts/artworks/generate.mjs). Files: assets/artworks/<name>.png.\n` +
    `INSERT INTO "artwork_item" ("id", "name", "tags", "category", "storageKey", "mime", "widthPx", "heightPx", "sizeBytes", "updatedAt") VALUES\n` +
    rows.join(",\n") +
    `\nON CONFLICT ("storageKey") DO NOTHING;\n`,
);
writeFileSync(path.join(OUT, "artworks.json"), JSON.stringify(meta, null, 2) + "\n");
