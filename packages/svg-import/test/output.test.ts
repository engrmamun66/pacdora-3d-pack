import { describe, expect, it } from "vitest";
import { importSvg, toCleanSvg, toDxf, toFlatDieline, suggestRoles, type Role } from "../src";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const SRC = `<svg ${NS} width="100mm" height="60mm" viewBox="0 0 100 60">
  <g fill="none">
    <rect x="10" y="5" width="80" height="40" stroke="#ff0000" stroke-width="0.25"/>
    <line x1="10" y1="25" x2="90" y2="25" stroke="#0000ff" stroke-width="0.25" stroke-dasharray="3 1.5"/>
    <path d="M5 2 L95 2 L95 55" stroke="#00aa00" stroke-dasharray="2 1"/>
    <path d="M12 8 L40 8" stroke="#ff9900"/>
    <path d="M12 9 L40 9" stroke="#ffffff"/>
  </g>
</svg>`;
const d = importSvg(SRC);
const roles = suggestRoles(d.styles) as Record<string, Role>;

describe("toCleanSvg", () => {
  it("emits one group per used role with the house colours", () => {
    const svg = toCleanSvg(d, roles, { margin: 0 });
    expect(svg).toContain('id="cut"');
    expect(svg).toContain('id="crease"');
    expect(svg).toContain('id="bleed"');
    expect(svg).toContain('id="guide"');
    expect(svg).toContain("#e6007e");
    expect(svg).toContain("#00a0e9");
    expect(svg).toContain('stroke-dasharray="3 1.5"');
    expect(svg).toContain("#7a7a7a");
    expect(svg).toContain("#2ca02c");
    expect(svg).toMatch(/width="90mm" height="53mm" viewBox="0 0 90 53"/);
  });

  it("omits ignored roles and honours showBleed/showGuides", () => {
    const svg = toCleanSvg(d, roles, { showBleed: false, showGuides: false });
    expect(svg).not.toContain('id="bleed"');
    expect(svg).not.toContain('id="guide"');
    const manual = { ...roles };
    for (const k of Object.keys(manual)) manual[k] = "ignore";
    const first = d.styles[0]!.key;
    manual[first] = "cut";
    const only = toCleanSvg(d, manual);
    expect(only).toContain('id="cut"');
    expect(only).not.toContain('id="crease"');
    expect((only.match(/<path /g) ?? []).length).toBe(d.styles[0]!.count);
  });

  it("falls back to the suggestion for styles missing from the role map", () => {
    expect(toCleanSvg(d, {})).toContain('id="cut"');
  });

  it("round-trips through importSvg with the same bounding box", () => {
    const svg = toCleanSvg(d, roles, { margin: 3 });
    const again = importSvg(svg);
    expect(again.widthMm).toBeCloseTo(d.widthMm, 2);
    expect(again.heightMm).toBeCloseTo(d.heightMm, 2);
    expect(again.report.unitSource).toBe("svg-size");
    expect(again.paths.length).toBe(d.paths.filter((p) => roles[p.style] !== "ignore").length);
    // the clean file classifies back into the same roles
    const r = Object.fromEntries(again.styles.map((s) => [s.stroke, s.suggestedRole]));
    expect(r["#e6007e"]).toBe("cut");
    expect(r["#00a0e9"]).toBe("crease");
  });

  it("round-trips closed flags and curves", () => {
    const c = importSvg(`<svg ${NS} width="100mm" height="100mm" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" stroke="#f00" fill="none"/></svg>`);
    const back = importSvg(toCleanSvg(c, suggestRoles(c.styles)));
    expect(back.paths[0]!.closed).toBe(true);
    expect(back.widthMm).toBeCloseTo(c.widthMm, 2);
  });
});

describe("toDxf", () => {
  const dxf = toDxf(d, roles);
  const lines = dxf.split("\r\n");

  it("is R12 with CRLF endings like the repo writer", () => {
    expect(dxf.replace(/\r\n/g, "")).not.toContain("\n");
    expect(dxf.endsWith("EOF\r\n")).toBe(true);
    expect(lines.slice(0, 6)).toEqual(["0", "SECTION", "2", "HEADER", "9", "$ACADVER"]);
    expect(lines[7]).toBe("AC1009");
    expect(lines.indexOf("TABLES")).toBeGreaterThan(0);
  });

  it("declares CUT, CREASE and BLEED layers only", () => {
    for (const layer of ["CUT", "CREASE", "BLEED"]) expect(lines).toContain(layer);
    expect(lines).not.toContain("GUIDE");
    const used = new Set<string>();
    const ent = lines.slice(lines.indexOf("ENTITIES"));
    ent.forEach((l, i) => {
      if (l === "8") used.add(ent[i + 1]!);
    });
    expect([...used].sort()).toEqual(["BLEED", "CREASE", "CUT"]);
  });

  it("flips y to the y-up frame and closes polylines", () => {
    const start = lines.indexOf("ENTITIES");
    const entities = lines.slice(start);
    // the cut rectangle is the only closed polyline; its first vertex (0,0 in y-down) lands at y = height
    const cutIdx = entities.findIndex((l, i) => l === "CUT" && entities[i - 1] === "8" && entities[i + 1] === "66");
    expect(cutIdx).toBeGreaterThan(0);
    expect(entities[cutIdx + 4]).toBe("1"); // 70 closed flag value
    const v = entities.indexOf("VERTEX", cutIdx);
    const x = Number(entities[v + 4]);
    const y = Number(entities[v + 6]);
    const cutPath = d.paths.find((p) => roles[p.style] === "cut" && p.closed)!;
    expect(x).toBeCloseTo(cutPath.pts[0]!, 6);
    expect(y).toBeCloseTo(d.heightMm - cutPath.pts[1]!, 6);
    // the guide-coloured orange line and ignored white line are not exported
    expect(entities.filter((l) => l === "POLYLINE")).toHaveLength(d.paths.filter((p) => ["cut", "crease", "bleed"].includes(roles[p.style]!)).length);
    expect(entities).toContain("SEQEND");
    expect(lines.slice(-3)).toEqual(["0", "EOF", ""]);
  });

  it("writes open polylines with flag 0", () => {
    const only = importSvg(`<svg ${NS} width="50mm" height="50mm" viewBox="0 0 50 50"><path d="M0 0 L50 0 L50 50" stroke="#f00" fill="none"/></svg>`);
    const out = toDxf(only, suggestRoles(only.styles)).split("\r\n");
    const i = out.indexOf("POLYLINE");
    expect(out.slice(i + 1, i + 7)).toEqual(["8", "CUT", "66", "1", "70", "0"]);
  });
});

describe("toCleanSvg background", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgo=";
  it("draws the picture first, cut off at the closed cut outlines", () => {
    const svg = toCleanSvg(d, roles, { margin: 2, background: { href: PNG, opacity: 0.5 } });
    expect(svg.indexOf('id="background"')).toBeGreaterThan(-1);
    expect(svg.indexOf('id="background"')).toBeLessThan(svg.indexOf('id="cut"'));
    expect(svg).toContain('clip-rule="evenodd"');
    expect(svg).toContain('opacity="0.5"');
  });
  it("ignores anything that is not a png/jpeg data URL, and leaves the old output unchanged without one", () => {
    const evil = toCleanSvg(d, roles, { background: { href: 'https://x.test/a.png" onload="x' } });
    expect(evil).not.toContain("<image");
    expect(evil).toBe(toCleanSvg(d, roles));
  });
});

describe("toFlatDieline", () => {
  it("sorts paths by role and drops ignored ones", () => {
    const f = toFlatDieline(d, roles);
    expect(f.cut.length + f.crease.length + f.bleed.length + f.guide.length).toBe(d.paths.length - d.paths.filter((p) => roles[p.style] === "ignore").length);
    expect(f.cut.some((p) => p.closed)).toBe(true);
    expect(f.crease.length).toBeGreaterThan(0);
  });
});
