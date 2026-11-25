import { describe, expect, it } from "vitest";
import { classify, DEFAULTS, trace, vectorize } from "../vectorize.js";

/** A white picture with lines drawn in (2 px wide), as the pages show them. */
function picture(w, h, draw) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const put = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  };
  const hline = (x0, x1, y, c, dash = 0) => { for (let x = x0; x <= x1; x++) if (!dash || x % (dash * 2) < dash) { put(x, y, c); put(x, y + 1, c); } };
  const vline = (x, y0, y1, c, dash = 0) => { for (let y = y0; y <= y1; y++) if (!dash || y % (dash * 2) < dash) { put(x, y, c); put(x + 1, y, c); } };
  draw({ hline, vline, put });
  return { width: w, height: h, data };
}
const CUT = [32, 48, 176];
const CREASE = [255, 64, 64];
const BLEED = [64, 192, 0];

/** A grey page with a white sheet on it, as a canvas editor shows a dieline; `draw` gets helpers that paint 1 px lines. */
function sheetOnGrey(w, h, draw) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const white = x > 40 && x < w - 40 && y > 40 && y < h - 40;
    data.set(white ? [255, 255, 255, 255] : [238, 239, 239, 255], (y * w + x) * 4);
  }
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) data.set([...c, 255], (y * w + x) * 4); };
  const line = (x0, y0, x1, y1, c) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) put(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
  };
  draw({ put, line });
  return { width: w, height: h, data };
}
const PALE_CUT = [144, 144, 216]; // a 1 px blue line as the screen mixes it with white
const ARROW = [72, 168, 240]; // light-blue size arrows
const PALE_ARROW = [170, 200, 245];

describe("pictures from a real page (grey around a white sheet, pale 1 px lines)", () => {
  it("follows a pale diagonal line from end to end as one line", () => {
    const img = sheetOnGrey(500, 400, ({ line }) => line(80, 80, 400, 330, PALE_CUT));
    const lines = trace(img);
    expect(lines.cut).toHaveLength(1);
    const c = lines.cut[0];
    const [a, b] = [c[0], c[c.length - 1]];
    const ends = [a, b].sort((p, q) => p[0] - q[0]);
    expect(Math.hypot(ends[0][0] - 80, ends[0][1] - 80)).toBeLessThan(4);
    expect(Math.hypot(ends[1][0] - 400, ends[1][1] - 330)).toBeLessThan(4);
  });

  it("bridges a gap where a watermark covers the line", () => {
    const img = sheetOnGrey(500, 400, ({ line, put }) => {
      line(80, 80, 400, 330, PALE_CUT);
      for (let x = 230; x < 250; x++) for (let y = 195; y < 215; y++) put(x, y, [225, 225, 225]); // grey letters on top of it
    });
    expect(trace(img).cut).toHaveLength(1);
  });

  it("does not take light-blue size arrows or grey letters for lines", () => {
    const img = sheetOnGrey(500, 400, ({ line, put }) => {
      line(60, 60, 440, 60, ARROW);
      line(60, 340, 440, 340, PALE_ARROW);
      for (let x = 100; x < 400; x += 3) put(x, 200, [224, 224, 224]);
    });
    const lines = trace(img);
    expect(lines.cut).toHaveLength(0);
    expect(lines.crease).toHaveLength(0);
    expect(lines.bleed).toHaveLength(0);
  });

  it("finds a line on the grey page as well as on the sheet", () => {
    const img = sheetOnGrey(500, 400, ({ line }) => line(10, 20, 10, 380, [150, 220, 150]));
    expect(trace(img).bleed).toHaveLength(1);
  });
});

describe("classify", () => {
  it("sorts pixels by the closest role and leaves the background alone", () => {
    const img = picture(30, 10, ({ put }) => { put(1, 1, CUT); put(2, 1, CREASE); put(3, 1, BLEED); put(4, 1, [0, 128, 255]); put(5, 1, [224, 224, 224]); });
    const m = classify(img, DEFAULTS.colors, DEFAULTS.tolerance);
    expect([m.cut[31], m.crease[32], m.bleed[33]]).toEqual([1, 1, 1]);
    expect(m.cut[34] + m.crease[34] + m.bleed[34]).toBe(0); // the lighter blue of the size arrows
    expect(m.cut[35] + m.crease[35] + m.bleed[35]).toBe(0); // grey watermark
  });
});

describe("trace and vectorize", () => {
  const box = picture(500, 400, ({ hline, vline }) => {
    hline(50, 450, 50, CUT); hline(50, 450, 350, CUT); vline(50, 50, 350, CUT); vline(450, 50, 350, CUT); // the outline
    hline(50, 450, 200, CREASE, 6); vline(250, 50, 350, CREASE, 6); // dotted creases
    hline(30, 470, 30, BLEED); hline(30, 470, 370, BLEED); vline(30, 30, 370, BLEED); vline(470, 30, 370, BLEED); // bleed round it
  });

  it("finds the outline, the creases and the bleed", () => {
    const lines = trace(box);
    expect(lines.crease).toHaveLength(2);
    expect(lines.cut.length).toBeGreaterThanOrEqual(1);
    expect(lines.bleed.length).toBeGreaterThanOrEqual(1);
    const horizontal = lines.crease.find((c) => c[0][1] === c[1][1]);
    expect(horizontal).toBeTruthy();
    expect(Math.abs(horizontal[1][0] - horizontal[0][0])).toBeGreaterThan(380);
  });

  it("writes millimetres with the given scale and one group per role", () => {
    const out = vectorize(box, { mmPerPx: 0.3 });
    expect(out.svg).toContain('<g id="cut"');
    expect(out.svg).toContain('<g id="crease"');
    expect(out.svg).toContain('<g id="bleed"');
    // the bleed (30..470 by 30..370) is the biggest shape: 440 x 340 px
    expect(out.widthMm).toBeCloseTo(440 * 0.3, 0);
    expect(out.heightMm).toBeCloseTo(340 * 0.3, 0);
    expect(out.svg).not.toMatch(/<script|<image|href=/i);
  });

  it("keeps a closed outline as a whole shape, not a single point", () => {
    const ring = picture(300, 300, ({ hline, vline }) => { hline(60, 240, 60, BLEED); hline(60, 240, 240, BLEED); vline(60, 60, 240, BLEED); vline(240, 60, 240, BLEED); });
    const lines = trace(ring);
    expect(lines.bleed).toHaveLength(1);
    const xs = lines.bleed[0].map((p) => p[0]);
    const ys = lines.bleed[0].map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(170);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(170);
    expect(lines.bleed[0].length).toBeGreaterThanOrEqual(5);
  });

  it("closes a small break in a line", () => {
    const broken = picture(500, 200, ({ hline }) => { hline(20, 230, 100, CUT); hline(246, 480, 100, CUT); });
    const lines = trace(broken);
    expect(lines.cut).toHaveLength(1);
  });

  it("closes an outline that has a gap where a corner was hidden", () => {
    // a square outline whose lower-right corner is covered by a label: both loose ends are 40 px from the corner
    const gap = picture(400, 400, ({ hline, vline }) => {
      hline(60, 340, 60, CUT); vline(60, 60, 340, CUT); hline(60, 340, 340, CUT); // top, left, bottom
      vline(340, 60, 300, CUT); // right side, stopping 40 px short of the corner...
      // ...and the bottom line also stops short, so the break holds the corner
    });
    const lines = trace(gap);
    expect(lines.cut).toHaveLength(1);
    const c = lines.cut[0];
    expect(c[0][0]).toBe(c[c.length - 1][0]); // closed: it ends where it started
    expect(c[0][1]).toBe(c[c.length - 1][1]);
  });

  it("reports an empty picture without lines", () => {
    const out = vectorize(picture(100, 100, () => {}));
    expect(out.svg).toBeNull();
  });

  it("refuses a huge picture", () => {
    expect(() => trace({ width: 4000, height: 4000, data: new Uint8ClampedArray(4) })).toThrow(/too big/);
  });
});
