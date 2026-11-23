import { describe, expect, it } from "vitest";
import { SvgImportError, applyLineEdits, importSvg } from "../src";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="60mm" viewBox="0 0 100 60">
  <rect x="0" y="0" width="100" height="60" fill="none" stroke="#000000" stroke-width="0.3"/>
  <line x1="50" y1="10" x2="50" y2="50" stroke="#ff0000" stroke-width="0.25" stroke-dasharray="2 1"/>
</svg>`;

const open = () => {
  const d = importSvg(svg);
  const line = d.paths.find((p) => !p.closed)!;
  return { d, line, outline: d.paths.find((p) => p.closed)! };
};

describe("applyLineEdits", () => {
  it("replaces the points of an open line and leaves everything else as it was", () => {
    const { d, line, outline } = open();
    const out = applyLineEdits(d, [{ id: line.id!, pts: [50, 0, 50, 60] }]);
    expect(out.paths.find((p) => p.id === line.id)!.pts).toEqual([50, 0, 50, 60]);
    expect(out.paths.find((p) => p.id === outline.id)).toBe(outline);
    expect(d.paths.find((p) => p.id === line.id)!.pts).not.toEqual([50, 0, 50, 60]);
  });

  it("no edits gives the same drawing back", () => {
    const { d } = open();
    expect(applyLineEdits(d, [])).toBe(d);
  });

  it("refuses a closed shape, an unknown line and bad points", () => {
    const { d, line, outline } = open();
    expect(() => applyLineEdits(d, [{ id: outline.id!, pts: [0, 0, 1, 1] }])).toThrow(SvgImportError);
    expect(() => applyLineEdits(d, [{ id: 999, pts: [0, 0, 1, 1] }])).toThrow(/not in this drawing/);
    expect(() => applyLineEdits(d, [{ id: line.id!, pts: [0, 0, 1] }])).toThrow(/x, y pairs/);
    expect(() => applyLineEdits(d, [{ id: line.id!, pts: [0, 0, Number.NaN, 1] }])).toThrow(/not a number/);
    expect(() => applyLineEdits(d, [{ id: line.id!, pts: [0, 0, 100000, 1] }])).toThrow(/far outside/);
  });
});
