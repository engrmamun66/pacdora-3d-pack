import type { Font, Glyph } from "fontkit";
import type { PathCmd } from "./types";

/**
 * Text box layout that mirrors the editor's canvas library (Fabric Textbox),
 * so outlined text in exports sits where it sits on screen:
 * - hard breaks on \n, then greedy word wrap on spaces/tabs;
 * - the box widens to the longest single word;
 * - line height = fontSize x 1.13 x lineHeight (last line without lineHeight);
 * - baseline sits at 1.13 x (1 - 0.222) x fontSize below the line top.
 */
export const FONT_SIZE_MULT = 1.13;
export const FONT_SIZE_FRACTION = 0.222;

export interface LaidOutLine {
  readonly text: string;
  /** Left edge relative to the box centre, mm. */
  readonly x: number;
  /** Baseline relative to the box centre, mm. */
  readonly baseline: number;
  readonly width: number;
}

export interface TextLayout {
  readonly lines: readonly LaidOutLine[];
  readonly width: number;
  readonly height: number;
}

export function layoutTextbox(
  text: string,
  opts: { width: number; fontSize: number; lineHeight: number; align: "left" | "center" | "right" },
  measure: (s: string) => number,
): TextLayout {
  const hard = text.split(/\r?\n/);
  const wordsPerLine = hard.map((l) => l.split(/[ \t\r]/));
  const largestWord = Math.max(0, ...wordsPerLine.flat().map((w) => measure(w)));
  const maxWidth = Math.max(opts.width, largestWord);
  const space = measure(" ");

  const lines: string[] = [];
  for (const words of wordsPerLine) {
    let line: string[] = [];
    let lineWidth = 0;
    let infix = 0;
    let started = true;
    for (const word of words) {
      const w = measure(word);
      lineWidth += infix + w;
      if (lineWidth > maxWidth && !started) {
        lines.push(line.join(" "));
        line = [];
        lineWidth = w;
        started = true;
      }
      line.push(word);
      infix = space;
      started = false;
    }
    lines.push(line.join(" "));
  }

  const boxWidth = maxWidth;
  const h1 = opts.fontSize * FONT_SIZE_MULT;
  const step = h1 * opts.lineHeight;
  const height = (lines.length - 1) * step + h1;
  return {
    width: boxWidth,
    height,
    lines: lines.map((t, i) => {
      const w = measure(t);
      const diff = boxWidth - w;
      const off = opts.align === "center" ? diff / 2 : opts.align === "right" ? diff : 0;
      return { text: t, width: w, x: -boxWidth / 2 + off, baseline: -height / 2 + i * step + h1 * (1 - FONT_SIZE_FRACTION) };
    }),
  };
}

/** Advance width of a string in mm (kerning and standard features applied). */
export function measureWith(font: Font, fontSize: number) {
  const k = fontSize / font.unitsPerEm;
  const cache = new Map<string, number>();
  return (s: string) => {
    let w = cache.get(s);
    if (w === undefined) {
      w = s ? font.layout(s).positions.reduce((sum, p) => sum + p.xAdvance, 0) * k : 0;
      cache.set(s, w);
    }
    return w;
  };
}

/** Glyph outlines for one line, positioned at (x, baseline) in mm; y down. */
export function lineOutlines(font: Font, fontSize: number, text: string, x: number, baseline: number): { d: PathCmd[]; missing: number } {
  const k = fontSize / font.unitsPerEm;
  const run = font.layout(text);
  const d: PathCmd[] = [];
  let pen = x;
  let missing = 0;
  run.glyphs.forEach((g: Glyph, i: number) => {
    const pos = run.positions[i]!;
    if (g.id === 0 && text.trim()) missing++;
    const ox = pen + pos.xOffset * k;
    const oy = baseline - pos.yOffset * k;
    const P = (gx: number, gy: number) => ({ x: ox + gx * k, y: oy - gy * k });
    let cx = 0;
    let cy = 0;
    for (const c of g.path.commands) {
      const a = c.args;
      if (c.command === "moveTo") {
        const p = P(a[0]!, a[1]!);
        d.push({ op: "M", ...p });
        [cx, cy] = [a[0]!, a[1]!];
      } else if (c.command === "lineTo") {
        d.push({ op: "L", ...P(a[0]!, a[1]!) });
        [cx, cy] = [a[0]!, a[1]!];
      } else if (c.command === "quadraticCurveTo") {
        // Exact quadratic -> cubic conversion.
        const [qx, qy, x2, y2] = a as [number, number, number, number];
        const c1 = P(cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy));
        const c2 = P(x2 + (2 / 3) * (qx - x2), y2 + (2 / 3) * (qy - y2));
        const e = P(x2, y2);
        d.push({ op: "C", x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: e.x, y: e.y });
        [cx, cy] = [x2, y2];
      } else if (c.command === "bezierCurveTo") {
        const [x1, y1, x2, y2, x3, y3] = a as [number, number, number, number, number, number];
        const c1 = P(x1, y1);
        const c2 = P(x2, y2);
        const e = P(x3, y3);
        d.push({ op: "C", x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: e.x, y: e.y });
        [cx, cy] = [x3, y3];
      } else if (c.command === "closePath") {
        d.push({ op: "Z" });
      }
    }
    pen += pos.xAdvance * k;
  });
  return { d, missing };
}
