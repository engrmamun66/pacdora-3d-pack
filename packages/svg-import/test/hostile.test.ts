import { describe, expect, it } from "vitest";
import { importSvg, SvgImportError } from "../src";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const mm = (body: string, w = 200, h = 200) => `<svg ${NS} width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const OK = '<rect width="20" height="20" stroke="#000" fill="none"/>';

describe("hostile input", () => {
  it("never expands entities (billion laughs) and stays fast", () => {
    let dtd = '<!ENTITY lol0 "lol">';
    for (let i = 1; i <= 9; i++) dtd += `<!ENTITY lol${i} "${`&lol${i - 1};`.repeat(10)}">`;
    const svg = `<?xml version="1.0"?><!DOCTYPE svg [${dtd}]>${mm(`<text>&lol9;</text><rect id="&lol9;" width="20" height="20" stroke="&lol9;" fill="none"/><path stroke="#000" fill="none" d="M0 0 L5 5 L9 0"/>`)}`;
    const t0 = performance.now();
    const d = importSvg(svg);
    expect(performance.now() - t0).toBeLessThan(250);
    expect(d.report.ignored.text).toBe(1);
    expect(JSON.stringify(d).length).toBeLessThan(5000);
  });

  it("hides '>' inside DOCTYPE quotes and comments", () => {
    const svg = `<!DOCTYPE svg [<!-- it's > odd --><!ENTITY a "x>y">]>${mm(OK)}`;
    expect(importSvg(svg).paths).toHaveLength(1);
  });

  it("decodes only predefined and numeric references", () => {
    const d = importSvg(mm(`<path stroke="&#35;f00" fill="none" d="M0 0 L5 5 L9 0"/>`));
    expect(d.styles[0]!.key).toBe("ff0000|s|1");
    const unknown = importSvg(mm(`<path stroke="&unknown;" d="M0 0 L5 5 L9 0"/>`));
    expect(unknown.styles[0]!.key).toBe("000000|s|0"); // stays a literal, unusable colour -> falls back to the default black fill
  });

  it("rejects nesting deeper than 64", () => {
    const deep = `<svg ${NS}>${"<g>".repeat(100)}${OK}${"</g>".repeat(100)}</svg>`;
    expect(() => importSvg(deep)).toThrow(SvgImportError);
    expect(() => importSvg(deep)).toThrow(/nested too deeply/);
    const fine = `<svg ${NS} width="50mm" height="50mm" viewBox="0 0 50 50">${"<g>".repeat(60)}${OK}${"</g>".repeat(60)}</svg>`;
    expect(importSvg(fine).paths).toHaveLength(1);
  });

  it("rejects more than 50,000 elements", () => {
    const svg = mm("<g/>".repeat(50_001));
    expect(() => importSvg(svg)).toThrow(/too many elements/);
  });

  it("rejects more than 400,000 points", () => {
    const pts = "1,2 3,4 ".repeat(210_000);
    expect(pts.length).toBeLessThan(3_000_000);
    const t0 = performance.now();
    expect(() => importSvg(mm(`<polyline points="${pts}" stroke="#000" fill="none"/>`))).toThrow(/too detailed/);
    expect(performance.now() - t0).toBeLessThan(1500);
  });

  it("rejects text longer than 3,000,000 characters", () => {
    expect(() => importSvg(" ".repeat(3_000_001))).toThrow(/too large/);
  });

  it("bounds <use> amplification", () => {
    // each level references the previous one ten times: 10^12 expansions if unchecked
    let defs = `<g id="l0">${OK}</g>`;
    for (let i = 1; i <= 12; i++) defs += `<g id="l${i}">${`<use href="#l${i - 1}"/>`.repeat(10)}</g>`;
    const t0 = performance.now();
    expect(() => importSvg(mm(`<defs>${defs}</defs><use href="#l12"/>`))).toThrow(SvgImportError);
    expect(performance.now() - t0).toBeLessThan(1500);
  });

  it("does not let NaN or Infinity leak into geometry", () => {
    const d = importSvg(
      mm(`<path stroke="#000" fill="none" d="M0 0 L1e999 5 L10 10"/>
          <path stroke="#000" fill="none" d="M0 0 L10 NaN L20 20"/>
          <rect width="NaN" height="10" stroke="#000" fill="none"/>
          <polyline points="0,0 Infinity,5 10,10" stroke="#000" fill="none"/>
          <g transform="scale(1e200) scale(1e200)"><path stroke="#000" fill="none" d="M0 0 L1 1"/></g>
          <g transform="scale(1e300)"><path stroke="#000" fill="none" d="M0 0 L1e300 1"/></g>
          <path stroke="#000" stroke-width="1e999" fill="none" d="M0 0 L30 0 L30 30"/>
          <path stroke="#000" fill="none" d="M0 0 L40 0 L40 40"/>`),
    );
    for (const v of d.paths.flatMap((p) => p.pts)) expect(Number.isFinite(v)).toBe(true);
    for (const s of d.styles) expect(Number.isFinite(s.strokeWidthMm)).toBe(true);
    expect(Number.isFinite(d.widthMm) && Number.isFinite(d.heightMm)).toBe(true);
  });

  it("rejects non-SVG input", () => {
    for (const bad of ["", "hello", "<html><body><svg/></body></html>", "{}", "<?xml version='1.0'?><root/>", "\u0000\u0001"]) {
      expect(() => importSvg(bad)).toThrow("This file is not an SVG.");
    }
  });

  it("rejects an SVG without geometry", () => {
    expect(() => importSvg(`<svg ${NS}><g/></svg>`)).toThrow("No lines or shapes were found in this SVG.");
    expect(() => importSvg(`<svg ${NS}><text>hi</text><defs><path d="M0 0 L9 9" stroke="#000"/></defs></svg>`)).toThrow("No lines or shapes were found in this SVG.");
    expect(() => importSvg(`<svg ${NS}/>`)).toThrow("No lines or shapes were found in this SVG.");
  });

  it("enforces a sane final size", () => {
    expect(() => importSvg(mm('<rect width="0.5" height="0.5" stroke="#000" fill="none"/>'))).toThrow(/outside the supported/);
    expect(() => importSvg(mm('<rect width="150" height="150" stroke="#000" fill="none"/>'), { scale: 1000 })).toThrow(SvgImportError);
    expect(() => importSvg(mm('<path d="M0 0 L50 0" stroke="#000"/>'))).toThrow(SvgImportError); // zero height
  });

  it("rejects invalid options", () => {
    expect(() => importSvg(mm(OK), { scale: 0 })).toThrow(SvgImportError);
    expect(() => importSvg(mm(OK), { pxPerInch: -1 })).toThrow(SvgImportError);
    expect(() => importSvg(mm(OK), { scale: NaN })).toThrow(SvgImportError);
  });

  it("tolerates truncated and sloppy markup", () => {
    expect(importSvg(`<svg ${NS} width="50mm" height="50mm" viewBox="0 0 50 50"><rect width=20 height='20' stroke=red fill=none>`).paths).toHaveLength(1);
    expect(importSvg(`<svg ${NS} width="50mm" height="50mm" viewBox="0 0 50 50"><g><rect width="20" height="20" stroke="red" fill="none"/></g></g></svg><svg><rect/></svg>`).paths).toHaveLength(1);
    expect(importSvg(`<svg:svg xmlns:svg="http://www.w3.org/2000/svg" width="50mm" height="50mm" viewBox="0 0 50 50"><svg:rect width="20" height="20" stroke="red" fill="none"/></svg:svg>`).paths).toHaveLength(1);
  });

  it("is not tripped by prototype-polluting names", () => {
    const d = importSvg(mm(`<rect __proto__="x" constructor="y" class="__proto__ constructor" id="toString" width="20" height="20" stroke="#000" fill="none"/>`));
    expect(d.paths).toHaveLength(1);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});

describe("performance", () => {
  it("parses ~4000 paths (about 2 MB) quickly", () => {
    const parts: string[] = [];
    for (let i = 0; i < 4000; i++) {
      const x = (i % 80) * 10;
      const y = Math.floor(i / 80) * 10;
      parts.push(
        `<path class="st${i % 3}" transform="translate(${x} ${y})" d="M0 0 C1 3 4 3 5 0 S9 -3 9 1 Q5 6 1 4 A3 3 0 0 1 8 8 L0 0 Z M2 2 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 l1.25 1.5 1.5 -1.25 "/>`,
      );
    }
    const svg = `<svg ${NS} width="1000mm" height="1000mm" viewBox="0 0 1000 1000"><style>.st0{stroke:#f00;fill:none}.st1{stroke:#00f;fill:none;stroke-dasharray:2 1}.st2{stroke:#0a0;fill:none}</style>${parts.join("")}</svg>`;
    expect(svg.length).toBeGreaterThan(1_500_000);
    const t0 = performance.now();
    const d = importSvg(svg);
    const ms = performance.now() - t0;
    expect(d.paths.length).toBeGreaterThan(4000);
    expect(d.styles).toHaveLength(3);
    expect(ms).toBeLessThan(1500);
  });
});
