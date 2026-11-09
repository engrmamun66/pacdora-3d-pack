/** CSS colour parsing to lowercase "rrggbb". null = none/transparent, undefined = unusable (caller keeps the inherited value). */
const NAMED: Record<string, string> = {
  black: "000000", white: "ffffff", red: "ff0000", lime: "00ff00", blue: "0000ff", yellow: "ffff00",
  cyan: "00ffff", aqua: "00ffff", magenta: "ff00ff", fuchsia: "ff00ff", gray: "808080", grey: "808080",
  silver: "c0c0c0", maroon: "800000", olive: "808000", green: "008000", purple: "800080", teal: "008080",
  navy: "000080", orange: "ffa500", pink: "ffc0cb", brown: "a52a2a", gold: "ffd700", violet: "ee82ee",
  indigo: "4b0082", crimson: "dc143c", darkred: "8b0000", darkgreen: "006400", darkblue: "00008b",
  darkgray: "a9a9a9", darkgrey: "a9a9a9", lightgray: "d3d3d3", lightgrey: "d3d3d3", dimgray: "696969",
  dimgrey: "696969", gainsboro: "dcdcdc", whitesmoke: "f5f5f5", lightblue: "add8e6", lightgreen: "90ee90",
  skyblue: "87ceeb", royalblue: "4169e1", tomato: "ff6347", coral: "ff7f50", salmon: "fa8072",
  khaki: "f0e68c", beige: "f5f5dc", ivory: "fffff0", turquoise: "40e0d0", orchid: "da70d6",
  deeppink: "ff1493", hotpink: "ff69b4", darkorange: "ff8c00", limegreen: "32cd32", forestgreen: "228b22",
  slategray: "708090", slategrey: "708090", firebrick: "b22222",
};

const hex2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

interface Arg { v: number; pct: boolean }

function parseFn(body: string): Arg[] | null {
  const parts = body.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const out: Arg[] = [];
  for (let k = 0; k < 3; k++) {
    const p = parts[k]!;
    const v = parseFloat(p);
    if (!Number.isFinite(v)) return null;
    out.push({ v, pct: p.endsWith("%") });
  }
  return out;
}

export function parseColor(input: string): string | null | undefined {
  const s = input.trim().toLowerCase();
  if (!s || s === "inherit") return undefined;
  if (s === "none" || s === "transparent") return null;
  if (s === "currentcolor") return "000000";
  if (s.charCodeAt(0) === 35) {
    const h = s.slice(1);
    if (!/^[0-9a-f]+$/.test(h)) return undefined;
    if (h.length === 3 || h.length === 4) return h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
    if (h.length === 6 || h.length === 8) return h.slice(0, 6);
    return undefined;
  }
  if (s.startsWith("url(")) {
    // paint servers (gradients, patterns) are not supported; a fallback colour after the url is honoured
    const close = s.indexOf(")");
    const rest = close < 0 ? "" : s.slice(close + 1).trim();
    return rest ? parseColor(rest) ?? null : null;
  }
  const paren = s.indexOf("(");
  if (paren > 0 && s.endsWith(")")) {
    const fn = s.slice(0, paren).trim();
    const body = s.slice(paren + 1, -1);
    const vals = parseFn(body);
    if (!vals) return undefined;
    if (fn === "rgb" || fn === "rgba") {
      const [r, g, b] = vals.map((a) => (a.pct ? (a.v / 100) * 255 : a.v)) as [number, number, number];
      return hex2(r) + hex2(g) + hex2(b);
    }
    if (fn === "hsl" || fn === "hsla") {
      const sat = Math.max(0, Math.min(1, vals[1]!.v / 100));
      const lig = Math.max(0, Math.min(1, vals[2]!.v / 100));
      const [r, g, b] = hslToRgb(vals[0]!.v, sat, lig);
      return hex2(r) + hex2(g) + hex2(b);
    }
    return undefined;
  }
  return NAMED[s];
}

/** Hue 0-360, saturation and lightness 0-1 for a "rrggbb" string. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}
