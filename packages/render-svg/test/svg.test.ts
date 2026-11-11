import { describe, expect, it } from "vitest";
import { generateDieline } from "@packaging/dieline-engine";
import { renderDielineSvg } from "../src";

const geo = generateDieline("tuck-end-carton", { width: 100, depth: 50, height: 150 });

describe("renderDielineSvg", () => {
  const svg = renderDielineSvg(geo);

  it("declares physical size in millimetres matching the viewBox", () => {
    const m = svg.match(/width="([\d.]+)mm" height="([\d.]+)mm" viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/);
    expect(m).not.toBeNull();
    const [, w, h, , , vw, vh] = m!;
    expect(Number(w)).toBeCloseTo(Number(vw), 6);
    expect(Number(h)).toBeCloseTo(Number(vh), 6);
    const expectedW = geo.bleedBounds.max.x - geo.bleedBounds.min.x + 2 * 22;
    expect(Number(w)).toBeCloseTo(expectedW, 3);
  });

  it("has one named layer per line type", () => {
    for (const id of ["bleed", "glue", "safe", "crease", "cut", "annotations"]) {
      expect(svg).toContain(`<g id="${id}" inkscape:groupmode="layer"`);
    }
  });

  it("draws one crease line per hinge and one cut path per loop", () => {
    expect((svg.match(/<line id="crease-/g) ?? []).length).toBe(geo.foldTree.hinges.length);
    const cutLayer = svg.slice(svg.indexOf('<g id="cut"'), svg.indexOf("</g>", svg.indexOf('<g id="cut"')));
    expect((cutLayer.match(/<path /g) ?? []).length).toBe(geo.cutLoops.length);
  });

  it("styles cut and crease differently (crease is dashed, cut is solid)", () => {
    const cutLayer = svg.slice(svg.indexOf('<g id="cut"'));
    expect(cutLayer.split("</g>")[0]).not.toContain("stroke-dasharray");
    const creaseLayer = svg.slice(svg.indexOf('<g id="crease"')).split("</g>")[0]!;
    expect(creaseLayer).toContain("stroke-dasharray");
  });

  it("can hide optional layers", () => {
    const min = renderDielineSvg(geo, { showBleed: false, showSafe: false, showGlue: false, showAnnotations: false });
    expect(min).not.toContain('id="bleed"');
    expect(min).not.toContain('id="annotations"');
    expect(min).toContain('id="cut"');
  });

  it("includes dimension text with the real dimensions", () => {
    expect(svg).toContain("Width 100.00");
    expect(svg).toContain("Depth 50.00");
    expect(svg).toContain("Height 150.00");
    expect(svg).toContain("Sheet 315.00");
  });
});

describe("arc output", () => {
  it("writes true SVG arcs for rounded corners", () => {
    const g = generateDieline("tuck-end-carton", { width: 100, depth: 50, height: 150, tuckCornerStyle: "round" });
    const svg = renderDielineSvg(g);
    const cut = svg.slice(svg.indexOf('<g id="cut"')).split("</g>")[0]!;
    expect(cut).toMatch(/ A\d/);
  });

  it("draws slits as cut lines", () => {
    const g = generateDieline("tuck-end-carton", { width: 100, depth: 50, height: 150, tuckSlitLength: 4 });
    const svg = renderDielineSvg(g);
    expect((svg.match(/<line id="slit-/g) ?? []).length).toBe(4);
  });
});

describe("part sizes", () => {
  it("is off by default", () => {
    expect(renderDielineSvg(geo)).not.toContain('id="part-sizes"');
  });

  it("writes every panel's width x height in millimetres", () => {
    const svg = renderDielineSvg(geo, { showPartSizes: "mm" });
    expect(svg).toContain('id="part-sizes"');
    expect(svg.match(/<text [^>]*font-weight="600"/g)).toHaveLength(geo.foldTree.panels.length);
    // The front panel of this carton is 100 x 150 mm.
    expect(svg).toContain("100 × 150 mm");
  });

  it("converts to inches", () => {
    const svg = renderDielineSvg(geo, { showPartSizes: "in" });
    expect(svg).toContain("3.94 × 5.91 in");
    expect(svg).not.toContain("100 × 150 mm");
  });
});
