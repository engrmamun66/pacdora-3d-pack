import { describe, expect, it } from "vitest";
import { excludePaths, groupPathIds, importSvg, suggestExclusions, suggestRoles } from "../src";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
/** Wraps content in an svg whose user units are millimetres. */
const mm = (body: string, w = 200, h = 200) => `<svg ${NS} width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const bbox = (pts: number[]) => {
  const xs = pts.filter((_, i) => i % 2 === 0);
  const ys = pts.filter((_, i) => i % 2 === 1);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};
const allPts = (d: ReturnType<typeof importSvg>) => d.paths.flatMap((p) => p.pts);

describe("basic geometry", () => {
  const svg = mm(
    `<rect x="10" y="5" width="80" height="40" stroke="#ff0000" stroke-width="0.25" fill="none"/>
     <line x1="10" y1="25" x2="90" y2="25" stroke="#0000ff" stroke-width="0.25" stroke-dasharray="3 1.5"/>`,
    100,
    50,
  );

  it("reads a rect and a dashed line in exact millimetres", () => {
    const d = importSvg(svg);
    expect(d.widthMm).toBe(80);
    expect(d.heightMm).toBe(40);
    expect(d.paths).toHaveLength(2);
    const rect = d.paths.find((p) => p.closed)!;
    expect(rect.pts).toEqual([0, 0, 80, 0, 80, 40, 0, 40]);
    const line = d.paths.find((p) => !p.closed)!;
    expect(line.pts).toEqual([0, 20, 80, 20]);
    expect(d.report.unitSource).toBe("svg-size");
    expect(d.report.unit).toBe("mm");
    expect(d.report.elementCount).toBe(2);
    expect(d.report.pointCount).toBe(6);
    expect(d.report.warnings).toEqual([]);
  });

  it("builds styles with stable keys, counts and sorting", () => {
    const d = importSvg(svg);
    expect(d.styles.map((s) => s.key).sort()).toEqual(["0000ff|d|0.25", "ff0000|s|0.25"]);
    const red = d.styles.find((s) => s.key === "ff0000|s|0.25")!;
    expect(red).toMatchObject({ stroke: "#ff0000", dashed: false, strokeWidthMm: 0.25, count: 1 });
  });

  it("scales a viewBox to the stated width and height", () => {
    const d = importSvg(`<svg ${NS} width="210mm" height="297mm" viewBox="0 0 21 29.7"><rect x="1" y="1" width="19" height="27.7" stroke="#000" fill="none"/></svg>`);
    expect(d.widthMm).toBeCloseTo(190, 6);
    expect(d.heightMm).toBeCloseTo(277, 6);
    expect(d.report.unitSource).toBe("svg-size");
  });

  it("converts cm, in and pt sizes", () => {
    const rect = '<rect width="10" height="20" stroke="#000" fill="none"/>';
    const inch = importSvg(`<svg ${NS} width="1in" height="2in" viewBox="0 0 10 20">${rect}</svg>`);
    expect(inch.widthMm).toBeCloseTo(25.4, 6);
    expect(inch.report.unit).toBe("in");
    const cm = importSvg(`<svg ${NS} width="10cm" height="20cm" viewBox="0 0 10 20">${rect}</svg>`);
    expect(cm.widthMm).toBeCloseTo(100, 6);
    const pt = importSvg(`<svg ${NS} width="72pt" height="144pt" viewBox="0 0 10 20">${rect}</svg>`);
    expect(pt.widthMm).toBeCloseTo(25.4, 6);
  });

  it("uses the unit of a size given without a viewBox", () => {
    const d = importSvg(`<svg ${NS} width="100mm" height="50mm"><rect width="100" height="50" stroke="#000" fill="none"/></svg>`);
    expect(d.widthMm).toBe(100);
    expect(d.report.unitSource).toBe("svg-size");
  });
});

describe("unit fallbacks", () => {
  const bare = `<svg ${NS} viewBox="0 0 200 200"><rect width="96" height="192" stroke="#000" fill="none"/></svg>`;

  it("assumes px at 96 dpi and warns", () => {
    const d = importSvg(bare);
    expect(d.widthMm).toBeCloseTo(25.4, 6);
    expect(d.heightMm).toBeCloseTo(50.8, 6);
    expect(d.report.unitSource).toBe("assumed");
    expect(d.report.unit).toBe("px");
    expect(d.report.warnings.join(" ")).toMatch(/pixels at 96 dpi/);
  });

  it("honours opts.unit", () => {
    const d = importSvg(bare.replace("96", "1").replace("192", "2"), { unit: "in" });
    expect(d.widthMm).toBeCloseTo(25.4, 6);
    expect(d.heightMm).toBeCloseTo(50.8, 6);
    expect(d.report.unitSource).toBe("option");
    expect(d.report.warnings).toEqual([]);
  });

  it("honours pxPerInch and scale", () => {
    expect(importSvg(bare, { pxPerInch: 72 }).widthMm).toBeCloseTo(96 * 25.4 / 72, 6);
    expect(importSvg(bare, { scale: 2 }).widthMm).toBeCloseTo(50.8, 6);
    const sized = importSvg(mm('<rect width="10" height="10" stroke="#000" fill="none"/>'), { scale: 3 });
    expect(sized.widthMm).toBe(30);
  });

  it("lets an explicit unit override a px size but not a mm size", () => {
    const pxSized = `<svg ${NS} width="96px" height="96px" viewBox="0 0 96 96"><rect width="96" height="96" stroke="#000" fill="none"/></svg>`;
    expect(importSvg(pxSized).widthMm).toBeCloseTo(25.4, 6);
    expect(importSvg(pxSized, { unit: "mm" }).widthMm).toBeCloseTo(96, 6);
    const mmSized = `<svg ${NS} width="96mm" height="96mm" viewBox="0 0 96 96"><rect width="96" height="96" stroke="#000" fill="none"/></svg>`;
    expect(importSvg(mmSized, { unit: "in" }).widthMm).toBeCloseTo(96, 6);
  });

  it("treats unitless width/height with a viewBox as a rescale", () => {
    const d = importSvg(`<svg ${NS} width="400" height="400" viewBox="0 0 200 200"><rect width="100" height="100" stroke="#000" fill="none"/></svg>`, { unit: "mm" });
    expect(d.widthMm).toBe(200);
  });
});

describe("transforms", () => {
  it("combines nested translate, rotate and scale", () => {
    // scale(2) -> (0,0)(20,0)(20,10); rotate(90) -> (0,0)(0,20)(-10,20); translate(10,20) -> (10,20)(10,40)(0,40)
    const d = importSvg(mm(`<g transform="translate(10,20)"><g transform="rotate(90) scale(2)"><polyline points="0,0 10,0 10,5" stroke="#000" fill="none"/></g></g>`));
    expect(d.paths[0]!.pts.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([10, 0, 10, 20, 0, 20]);
    expect(d.widthMm).toBeCloseTo(10, 6);
    expect(d.heightMm).toBeCloseTo(20, 6);
  });

  it("rotates around a centre", () => {
    const d = importSvg(mm(`<polyline points="10,10 20,10 20,20" transform="rotate(90 10 10)" stroke="#000" fill="none"/>`));
    const p = d.paths[0]!.pts.map((v) => Math.round(v * 1e6) / 1e6);
    expect(p).toEqual([10, 0, 10, 10, 0, 10]);
  });

  it("supports matrix, skewX, skewY and separator-free lists", () => {
    const skew = importSvg(mm(`<polyline points="0,0 0,10 10,10" transform="skewX(45)" stroke="#000" fill="none"/>`));
    // x' = x + tan(45)*y
    expect(skew.paths[0]!.pts.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 0, 10, 10, 20, 10]);
    const skewY = importSvg(mm(`<polyline points="0,0 10,0 10,10" transform="skewY(45)" stroke="#000" fill="none"/>`));
    expect(skewY.paths[0]!.pts.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 0, 10, 10, 10, 20]);
    const mat = importSvg(mm(`<polyline points="0,0 10,0 10,10" transform="matrix(2 0 0 3 5 5)translate(1)" stroke="#000" fill="none"/>`));
    expect(mat.widthMm).toBe(20);
    expect(mat.heightMm).toBe(30);
  });

  it("skips elements with an invalid transform and says so", () => {
    const d = importSvg(mm(`<rect width="10" height="10" transform="rotate(" stroke="#000"/><rect width="10" height="10" stroke="#000" fill="none"/>`));
    expect(d.paths).toHaveLength(1);
    expect(d.report.warnings.join(" ")).toMatch(/invalid transform/);
  });
});

describe("path commands", () => {
  const one = (dAttr: string) => importSvg(mm(`<path d="${dAttr}" stroke="#000" fill="none"/>`, 300, 300));

  it("handles absolute, relative, H/V, implicit repeats and Z", () => {
    const d = one("M10 10 H50 V30 h-40 v-20 z");
    expect(d.paths[0]).toMatchObject({ closed: true });
    expect(d.paths[0]!.pts).toEqual([0, 0, 40, 0, 40, 20, 0, 20]);
    const r = one("m10 10 l40 0 0 20 -40 0 z");
    expect(r.paths[0]!.pts).toEqual([0, 0, 40, 0, 40, 20, 0, 20]);
    const m = one("M0 0 L10 0 20 0 30 10");
    expect(m.paths[0]!.pts).toEqual([0, 0, 10, 0, 20, 0, 30, 10]);
  });

  it("treats extra pairs after M as lineto", () => {
    const d = one("M0 0 10 0 10 10");
    expect(d.paths[0]!.pts).toEqual([0, 0, 10, 0, 10, 10]);
    expect(d.paths[0]!.closed).toBe(false);
  });

  it("parses compact number syntax", () => {
    const d = importSvg(mm(`<polyline points="0 0 10.5-5.5.5.5" stroke="#000" fill="none"/>`));
    expect(d.paths[0]!.pts).toEqual([0, 5.5, 10.5, 0, 0.5, 6]);
    const p = one("M0 0l1e1-5e0.5.5");
    expect(p.paths[0]!.pts[2]).toBeCloseTo(10);
  });

  it("splits subpaths and restarts after Z at the subpath start", () => {
    const d = one("M0 0 L10 0 L10 10 z l5 5 M20 20 L30 10");
    expect(d.paths).toHaveLength(3);
    expect(d.paths[0]!.closed).toBe(true);
    expect(d.paths[1]!.closed).toBe(false);
  });

  it("flattens cubic curves within tolerance and keeps endpoints", () => {
    const d = one("M0 0 C0 50 100 50 100 0");
    const p = d.paths[0]!.pts;
    expect(p.length).toBeGreaterThan(20);
    const b = bbox(p);
    expect(b.w).toBeCloseTo(100, 6);
    expect(b.h).toBeGreaterThan(37.5 - 0.06);
    expect(b.h).toBeLessThanOrEqual(37.5 + 1e-9);
    expect(p.slice(0, 2)).toEqual([0, 0]);
    expect(p.slice(-2)).toEqual([100, 0]);
  });

  it("supports S, Q and T with reflected control points", () => {
    const s = one("M0 0 C0 20 20 20 20 0 S40 -20 40 0");
    expect(bbox(s.paths[0]!.pts).w).toBeCloseTo(40, 6);
    expect(bbox(s.paths[0]!.pts).h).toBeGreaterThan(30 - 0.12);
    expect(bbox(s.paths[0]!.pts).h).toBeLessThanOrEqual(30 + 1e-9);
    const q = one("M0 0 Q50 50 100 0");
    expect(bbox(q.paths[0]!.pts).h).toBeGreaterThan(25 - 0.06);
    const t = one("M0 0 Q25 25 50 0 T100 0");
    const b = bbox(t.paths[0]!.pts);
    expect(b.w).toBeCloseTo(100, 6);
    expect(b.h).toBeGreaterThan(25 - 0.12);
    expect(b.h).toBeLessThanOrEqual(25 + 1e-9);
  });

  it("converts arcs: endpoints, sweep direction and radius scaling", () => {
    const up = one("M0 0 A50 50 0 0 1 100 0");
    const pu = up.paths[0]!.pts;
    expect(pu.slice(0, 2)).toEqual([0, 50]);
    expect(pu.slice(-2)).toEqual([100, 50]);
    expect(bbox(pu).h).toBeGreaterThan(50 - 0.06);
    expect(Math.max(...pu.filter((_, i) => i % 2 === 1))).toBeLessThanOrEqual(50 + 1e-9);
    const down = one("M0 0 A50 50 0 0 0 100 0");
    expect(down.paths[0]!.pts.slice(0, 2)).toEqual([0, 0]);
    expect(Math.min(...down.paths[0]!.pts.filter((_, i) => i % 2 === 1))).toBeGreaterThanOrEqual(0);
    expect(bbox(down.paths[0]!.pts).h).toBeGreaterThan(50 - 0.06);
    // radii too small are scaled up to the semicircle
    const scaled = one("M0 0 A10 10 0 0 1 100 0");
    expect(bbox(scaled.paths[0]!.pts).h).toBeGreaterThan(50 - 0.06);
    // compact flags: "01" then x=100
    const compact = one("M0 0a50,50,0,01100,0");
    expect(compact.paths[0]!.pts.slice(-2)).toEqual([100, 50]);
    // relative arc equals the absolute one
    expect(one("m0 0 a50 50 0 0 1 100 0").paths[0]!.pts).toEqual(pu);
  });

  it("arc large flag picks the long way round", () => {
    const small = one("M0 0 A60 60 0 0 1 100 0");
    const large = one("M0 0 A60 60 0 1 1 100 0");
    expect(bbox(large.paths[0]!.pts).h).toBeGreaterThan(bbox(small.paths[0]!.pts).h + 40);
  });

  it("keeps the valid part of malformed path data and warns", () => {
    const d = importSvg(mm(`<path d="M0 0 L10 10 L20 abc L30 30" stroke="#000" fill="none"/>`));
    expect(d.paths[0]!.pts).toEqual([0, 0, 10, 10]);
    expect(d.report.warnings.join(" ")).toMatch(/malformed/);
  });
});

describe("basic shapes", () => {
  it("flattens circles within 0.05 mm", () => {
    const d = importSvg(mm(`<circle cx="50" cy="50" r="10" stroke="#000" fill="none"/>`));
    const p = d.paths[0]!.pts;
    expect(d.paths[0]!.closed).toBe(true);
    expect(d.widthMm).toBeGreaterThan(19.9);
    expect(d.widthMm).toBeLessThanOrEqual(20 + 1e-9);
    const n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const mx = (p[2 * i]! + p[2 * j]!) / 2 - 10;
      const my = (p[2 * i + 1]! + p[2 * j + 1]!) / 2 - 10;
      expect(Math.hypot(mx, my)).toBeGreaterThanOrEqual(10 - 0.051);
    }
  });

  it("handles ellipse, rounded rect and polygon", () => {
    const e = importSvg(mm(`<ellipse cx="50" cy="50" rx="20" ry="10" stroke="#000" fill="none"/>`));
    expect(e.widthMm).toBeGreaterThan(39.9);
    expect(e.heightMm).toBeGreaterThan(19.9);
    const r = importSvg(mm(`<rect x="5" y="5" width="60" height="30" rx="5" stroke="#000" fill="none"/>`));
    expect(r.widthMm).toBe(60);
    expect(r.heightMm).toBe(30);
    expect(r.paths[0]!.pts.length / 2).toBeGreaterThan(8);
    const poly = importSvg(mm(`<polygon points="0,0 10,0 10,10" stroke="#000" fill="none"/>`));
    expect(poly.paths[0]!.closed).toBe(true);
    expect(poly.paths[0]!.pts).toHaveLength(6);
  });
});

describe("styles", () => {
  it("resolves <style> classes, ids, tags and comma lists", () => {
    const d = importSvg(
      mm(
        `<style>
          path { fill: none; }
          .a, .b { stroke: #f00; stroke-width: 0.5 }
          .b { stroke-dasharray: 4 2 }
          #x { stroke: rgb(0, 0, 255) !important }
          /* comment */
         </style>
         <path class="a" d="M0 0 L50 0 L50 50"/>
         <path class="b" d="M0 10 L50 10 L50 60"/>
         <path id="x" class="a" d="M0 20 L50 20 L50 70"/>`,
      ),
    );
    const byKey = Object.fromEntries(d.styles.map((s) => [s.key, s]));
    expect(byKey["ff0000|s|0.5"]!.count).toBe(1);
    expect(byKey["ff0000|d|0.5"]!.count).toBe(1);
    expect(byKey["0000ff|s|0.5"]!.count).toBe(1);
  });

  it("lets inline style beat CSS and CSS beat attributes", () => {
    const d = importSvg(
      mm(`<style>.a{stroke:#00ff00}</style><path class="a" stroke="#ff0000" style="stroke:#0000ff" fill="none" d="M0 0 L10 0 L10 10"/><path class="a" stroke="#ff0000" fill="none" d="M0 0 L20 0 L20 20"/>`),
    );
    expect(d.styles.map((s) => s.key).sort()).toEqual(["00ff00|s|1", "0000ff|s|1"].sort());
  });

  it("inherits stroke, width, dash and fill from groups", () => {
    const d = importSvg(
      mm(`<g stroke="#00a0e9" stroke-width="0.3" stroke-dasharray="3,1.5" fill="none"><g><path d="M0 0 L10 0 L10 10"/></g><path stroke="red" stroke-dasharray="none" d="M0 20 L10 20 L10 30"/></g>`),
    );
    const keys = d.styles.map((s) => s.key).sort();
    expect(keys).toEqual(["00a0e9|d|0.3", "ff0000|s|0.3"]);
  });

  it("parses named colours, short hex, rgb(), percentages and currentColor", () => {
    const mk = (c: string) => importSvg(mm(`<path stroke="${c}" fill="none" d="M0 0 L10 0 L10 10"/>`)).styles[0]!.stroke;
    expect(mk("red")).toBe("#ff0000");
    expect(mk("#f0a")).toBe("#ff00aa");
    expect(mk("RGB(10, 20, 30)")).toBe("#0a141e");
    expect(mk("rgb(100%, 0%, 50%)")).toBe("#ff0080");
    expect(mk("currentColor")).toBe("#000000");
    expect(mk("Magenta")).toBe("#ff00ff");
  });

  it("treats dasharray none or all zeros as solid", () => {
    const mk = (v: string) => importSvg(mm(`<path stroke="#000" stroke-dasharray="${v}" fill="none" d="M0 0 L10 0 L10 10"/>`)).styles[0]!.dashed;
    expect(mk("none")).toBe(false);
    expect(mk("0 0")).toBe(false);
    expect(mk("0,2")).toBe(true);
    expect(mk("5")).toBe(true);
  });

  it("scales stroke width by the transform and buckets to 0.05 mm", () => {
    const d = importSvg(mm(`<g transform="scale(2)"><path stroke="#000" stroke-width="0.13" fill="none" d="M0 0 L10 0 L10 10"/></g>`));
    expect(d.styles[0]!.strokeWidthMm).toBe(0.25);
    expect(d.styles[0]!.key).toBe("000000|s|0.25");
  });

  it("skips hidden, transparent and unpainted elements; keeps filled hairlines", () => {
    const d = importSvg(
      mm(
        `<path style="display:none" stroke="#000" d="M0 0 L10 0 L10 10"/>
         <path visibility="hidden" stroke="#000" d="M0 0 L10 0 L10 10"/>
         <g opacity="0"><path stroke="#000" d="M0 0 L10 0 L10 10"/></g>
         <rect width="30" height="30" fill="#ffffff"/>
         <rect width="30" height="30" fill="none"/>
         <rect width="30" height="30" stroke="none" fill="none"/>
         <rect x="5" y="5" width="20" height="20" stroke="none" fill="#336699"/>
         <path stroke="#000" d="M0 0 L40 0 L40 40" fill="none"/>`,
      ),
    );
    expect(d.paths).toHaveLength(2);
    expect(d.styles.map((s) => s.key).sort()).toEqual(["000000|s|1", "336699|s|0"].sort());
  });
});

describe("use and containers", () => {
  it("draws <use> of a defs path with x/y, href and xlink:href", () => {
    const d = importSvg(
      `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink" width="200mm" height="200mm" viewBox="0 0 200 200">
        <defs><path id="p" d="M0 0 L10 0 L10 10" stroke="#f00" fill="none"/></defs>
        <use href="#p" x="100" y="50"/>
        <use xlink:href="#p"/>
      </svg>`,
    );
    expect(d.paths).toHaveLength(2);
    expect(d.widthMm).toBe(110);
    expect(d.heightMm).toBe(60);
    expect(d.paths[0]!.pts).toEqual([100, 50, 110, 50, 110, 60]);
    expect(d.paths[1]!.pts).toEqual([0, 0, 10, 0, 10, 10]);
  });

  it("inherits paint through <use> and renders symbols", () => {
    const d = importSvg(
      `<svg ${NS} width="100mm" height="100mm" viewBox="0 0 100 100">
        <symbol id="s"><path d="M0 0 L20 0 L20 20" fill="none"/></symbol>
        <use href="#s" stroke="#00f" x="10"/>
      </svg>`,
    );
    expect(d.styles[0]!.key).toBe("0000ff|s|1");
    expect(d.paths[0]!.pts).toEqual([0, 0, 20, 0, 20, 20]);
  });

  it("survives reference cycles and ignores external references", () => {
    const d = importSvg(
      mm(`<g id="a"><path stroke="#000" fill="none" d="M0 0 L10 0 L10 10"/><use href="#a"/></g><use href="#b"/><use href="http://evil.example/x.svg#a"/><g id="b"><use href="#a"/></g>`),
    );
    expect(d.paths.length).toBeGreaterThan(0);
    expect(d.paths.length).toBeLessThan(10);
    expect(d.report.warnings.join(" ")).toMatch(/External references/);
  });

  it("does not draw defs, clipPath, mask, pattern or marker content", () => {
    const d = importSvg(
      mm(`<defs><path stroke="#f00" d="M0 0 L9 9"/></defs>
          <clipPath id="c"><rect width="5" height="5" stroke="#f00"/></clipPath>
          <mask><rect width="5" height="5" stroke="#f00"/></mask>
          <pattern><rect width="5" height="5" stroke="#f00"/></pattern>
          <marker><path stroke="#f00" d="M0 0 L5 5"/></marker>
          <metadata><rect width="5" height="5" stroke="#f00"/></metadata>
          <rect width="30" height="30" stroke="#000" fill="none"/>`),
    );
    expect(d.paths).toHaveLength(1);
  });

  it("applies nested svg viewports", () => {
    const d = importSvg(mm(`<svg x="10" y="10" width="50" height="50" viewBox="0 0 100 100"><rect width="100" height="100" stroke="#000" fill="none"/></svg><rect x="0" y="0" width="5" height="5" stroke="#000" fill="none"/>`));
    expect(d.widthMm).toBe(60);
  });
});

describe("ignored content", () => {
  it("counts text, images, foreignObject, gradients and filters", () => {
    const d = importSvg(
      mm(`<defs><linearGradient id="g"><stop offset="0"/></linearGradient><radialGradient id="r"/><filter id="f"/></defs>
          <text x="1" y="1">Hello</text><text>World</text><text>!</text>
          <image href="data:image/png;base64,AAAA" width="5" height="5"/>
          <foreignObject width="5" height="5"><div>hi</div></foreignObject>
          <rect width="30" height="30" stroke="#000" fill="url(#g)"/>`),
    );
    expect(d.report.ignored.text).toBe(3);
    expect(d.report.ignored.image).toBe(1);
    expect(d.report.ignored.foreignObject).toBe(1);
    expect(d.report.ignored.gradient).toBe(2);
    expect(d.report.ignored.filter).toBe(1);
    const w = d.report.warnings.join("\n");
    expect(w).toContain("Text was ignored (3 elements).");
    expect(w).toContain("Images were ignored (1 element).");
    expect(w).toMatch(/Gradients/);
    expect(w).toMatch(/Filters/);
  });

  it("reports unsupported CSS selectors", () => {
    const d = importSvg(mm(`<style>g > path { stroke: red } @media print { .a { stroke: blue } } .ok{stroke:#000;fill:none}</style><path class="ok" d="M0 0 L9 0 L9 9"/>`));
    expect(d.report.warnings.join(" ")).toMatch(/CSS/);
    expect(d.styles[0]!.key).toBe("000000|s|1");
  });
});

describe("role suggestions", () => {
  const d = importSvg(
    mm(
      `<g fill="none">
        <path stroke="#ff0000" d="M0 0 L100 0 L100 100 L0 100 Z"/>
        <path stroke="#0000ff" stroke-dasharray="4 2" d="M10 10 L90 10"/>
        <path stroke="#00ff00" stroke-dasharray="4 2" d="M5 5 L95 5"/>
        <path stroke="#00aa00" d="M3 3 L97 3"/>
        <path stroke="#ffffff" d="M20 20 L80 20"/>
        <path stroke="#dddddd" d="M20 30 L80 30"/>
        <path stroke="#cccccc" stroke-dasharray="2 2" d="M20 40 L80 40"/>
      </g>`,
    ),
  );
  const role = (key: string) => d.styles.find((s) => s.key.startsWith(key))!.suggestedRole;

  it("maps colour and dash to roles", () => {
    expect(role("ff0000")).toBe("cut");
    expect(role("0000ff|d")).toBe("crease");
    expect(role("00ff00|d")).toBe("bleed");
    expect(role("00aa00|s")).toBe("bleed");
    expect(role("ffffff")).toBe("ignore");
    expect(role("dddddd")).toBe("ignore");
    expect(role("cccccc|d")).toBe("crease");
  });

  it("suggestRoles mirrors the styles", () => {
    const r = suggestRoles(d.styles);
    expect(Object.keys(r)).toHaveLength(d.styles.length);
    expect(r[d.styles.find((s) => s.key.startsWith("ff0000"))!.key]).toBe("cut");
  });

  it("falls back to the longest solid style as cut", () => {
    const g = importSvg(
      mm(`<path stroke="#888888" fill="none" d="M0 0 L100 0 L100 100"/><path stroke="#ff9900" fill="none" d="M0 50 L10 50"/><path stroke="#0000ff" stroke-dasharray="3 1" fill="none" d="M0 70 L300 70"/>`),
    );
    const roles = Object.fromEntries(g.styles.map((s) => [s.key.slice(0, 6), s.suggestedRole]));
    expect(roles["888888"]).toBe("cut");
    expect(roles["ff9900"]).toBe("guide");
    expect(roles["0000ff"]).toBe("crease");
  });

  it("uses the longest style as cut when everything is dashed", () => {
    const g = importSvg(mm(`<path stroke="#0000ff" stroke-dasharray="3 1" fill="none" d="M0 0 L100 0 L100 100"/><path stroke="#ff00ff" stroke-dasharray="3 1" fill="none" d="M0 70 L10 70"/>`));
    expect(g.styles.filter((s) => s.suggestedRole === "cut")).toHaveLength(1);
    expect(g.styles.find((s) => s.suggestedRole === "cut")!.key.startsWith("0000ff")).toBe(true);
  });

  it("always yields a cut suggestion", () => {
    const g = importSvg(mm(`<path stroke="#ffffff" fill="none" d="M0 0 L100 0 L100 100"/>`));
    expect(g.styles.some((s) => s.suggestedRole === "cut")).toBe(true);
  });
});

describe("style keys", () => {
  it("are stable across runs and bucket nearby widths together", () => {
    const body = `<path stroke="#ff0000" stroke-width="0.26" fill="none" d="M0 0 L10 0 L10 10"/><path stroke="#FF0000" stroke-width="0.24" fill="none" d="M0 5 L20 5 L20 20"/>`;
    const a = importSvg(mm(body));
    const b = importSvg(mm(body));
    expect(a.styles).toEqual(b.styles);
    expect(a.styles).toHaveLength(1);
    expect(a.styles[0]).toMatchObject({ key: "ff0000|s|0.25", count: 2 });
  });

  it("sorts styles by count descending", () => {
    const d = importSvg(
      mm(`<g fill="none"><path stroke="#0000ff" d="M0 0 L9 0 L9 9"/><path stroke="#ff0000" d="M0 0 L9 0 L9 8"/><path stroke="#ff0000" d="M0 0 L9 0 L9 7"/></g>`),
    );
    expect(d.styles.map((s) => s.count)).toEqual([2, 1]);
  });
});

describe("artwork heuristics", () => {
  const wrap = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="100mm" viewBox="0 0 200 100">${body}</svg>`;

  it("ignores fill-only tints when real strokes exist", () => {
    const r = importSvg(
      wrap(
        `<polygon points="10,10 90,10 90,90 10,90" fill="#ead9bd" stroke="none"/>` +
          `<polygon points="10,10 90,10 90,90 10,90" fill="none" stroke="#e4002b" stroke-width="0.5"/>`,
      ),
    );
    const tint = r.styles.find((s) => s.stroke === "#ead9bd")!;
    expect(tint.suggestedRole).toBe("ignore");
    expect(r.styles.find((s) => s.stroke === "#e4002b")!.suggestedRole).toBe("cut");
  });

  it("keeps a fill-drawn outline when it is the only thing in the file", () => {
    const r = importSvg(wrap(`<polygon points="10,10 90,10 90,90 10,90" fill="#000000" stroke="none"/>`));
    expect(r.styles[0]!.suggestedRole).toBe("cut");
  });

  it("treats thin grey dashes as guide when a coloured dashed crease exists", () => {
    const r = importSvg(
      wrap(
        `<rect x="10" y="10" width="80" height="80" fill="none" stroke="#e4002b" stroke-width="0.5"/>` +
          `<line x1="10" y1="50" x2="90" y2="50" stroke="#0070c0" stroke-width="0.4" stroke-dasharray="4 2"/>` +
          `<line x1="50" y1="0" x2="50" y2="100" stroke="#888" stroke-width="0.25" stroke-dasharray="1 2"/>`,
      ),
    );
    expect(r.styles.find((s) => s.stroke === "#0070c0")!.suggestedRole).toBe("crease");
    expect(r.styles.find((s) => s.stroke === "#888888")!.suggestedRole).toBe("guide");
  });

  it("still reads grey dashes as crease when nothing else is dashed", () => {
    const r = importSvg(
      wrap(
        `<rect x="10" y="10" width="80" height="80" fill="none" stroke="#e4002b" stroke-width="0.5"/>` +
          `<line x1="10" y1="50" x2="90" y2="50" stroke="#888" stroke-width="0.25" stroke-dasharray="4 2"/>`,
      ),
    );
    expect(r.styles.find((s) => s.stroke === "#888888")!.suggestedRole).toBe("crease");
  });
})

describe("clean-up: groups, suggestions, exclusion", () => {
  const body =
    `<g id="art"><rect x="10" y="10" width="80" height="80" fill="none" stroke="#e4002b" stroke-width="0.5"/>` +
    `<line x1="10" y1="50" x2="90" y2="50" stroke="#0070c0" stroke-width="0.4" stroke-dasharray="4 2"/></g>` +
    `<g id="Legend"><line x1="120" y1="90" x2="190" y2="90" stroke="#e4002b" stroke-width="0.5"/><g id="swatch-row"><line x1="120" y1="95" x2="190" y2="95" stroke="#00a651" stroke-width="0.4"/></g></g>` +
    `<g id="dimensions"><line x1="10" y1="5" x2="90" y2="5" stroke="#888" stroke-width="0.25"/></g>`;
  const d = importSvg(mm(body, 200, 100));

  it("keeps everything by default and records ids and groups", () => {
    expect(d.paths.map((p) => p.id)).toEqual([0, 1, 2, 3, 4]);
    expect(d.widthMm).toBeCloseTo(180, 3);
    expect(d.groups?.map((g) => [g.label, g.from, g.to, g.depth])).toEqual([
      ["art", 0, 2, 0],
      ["Legend", 2, 4, 0],
      ["swatch-row", 3, 4, 1],
      ["dimensions", 4, 5, 0],
    ]);
  });

  it("suggests whole legend and dimension groups once (no nested duplicate)", () => {
    const s = suggestExclusions(d);
    expect(s.map((x) => [x.label, x.ids])).toEqual([["Legend", [2, 3]], ["dimensions", [4]]]);
  });

  it("excluding re-fits the sheet and rebuilds the styles", () => {
    const e = excludePaths(d, suggestExclusions(d).flatMap((x) => x.ids));
    expect(e.widthMm).toBeCloseTo(80, 3);
    expect(e.heightMm).toBeCloseTo(80, 3);
    expect(e.paths.map((p) => p.id)).toEqual([0, 1]);
    expect(e.styles.map((x) => x.stroke).sort()).toEqual(["#0070c0", "#e4002b"]);
    expect(Math.min(...e.paths.flatMap((p) => p.pts.filter((_, i) => i % 2 === 0)))).toBe(0);
  });

  it("returns the same object when nothing is excluded, and refuses to empty the drawing", () => {
    expect(excludePaths(d, [])).toBe(d);
    expect(excludePaths(d, [99])).toBe(d);
    expect(() => excludePaths(d, [0, 1, 2, 3, 4])).toThrow(/Every line is excluded/);
  });

  it("groupPathIds lists a group's paths", () => {
    const art = d.groups!.find((g) => g.label === "art")!;
    expect(groupPathIds(d, art)).toEqual([0, 1]);
  });

  it("group names do not change the geometry or the first-pass roles", () => {
    const plain = importSvg(mm(body.replace(/<g id="[^"]*">/g, "<g>"), 200, 100));
    expect(plain.groups).toBeUndefined();
    expect(plain.paths.map((p) => p.pts)).toEqual(d.paths.map((p) => p.pts));
  });
});
