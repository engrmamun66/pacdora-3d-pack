import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateDieline } from "@packaging/dieline-engine";
import { buildScene } from "@packaging/vector-scene";
import { nodeFontSource } from "@packaging/vector-scene/node";
import { MM_TO_PT, ascii85, runLength, sceneToEps } from "../src";
import { makePng, testImages } from "./fixtures";

const geo = generateDieline("crash-lock-carton", { width: 80, depth: 60, height: 120 });
const c = { panelId: "front", dx: 0, dy: 0, angle: 0, visible: true, locked: false, opacity: 1 } as const;
const scenePromise = buildScene(
  geo,
  {
    objects: [
      { ...c, id: "t", name: "T", type: "text", text: "Hello", fontFamily: "Montserrat", fontSizePt: 20, fontWeight: "bold", fontStyle: "normal", textAlign: "center", lineHeight: 1.2, width: 60, fill: "#123456" },
      { ...c, id: "i", name: "I", type: "image", assetId: "img", width: 30, height: 15, flipX: false, flipY: false, dy: 30, opacity: 0.5 },
    ],
  },
  { fonts: nodeFontSource, images: testImages({ img: makePng(32, 16) }) },
);

const gs = (() => {
  try {
    execFileSync("gs", ["--version"]);
    return true;
  } catch {
    return false;
  }
})();

function decode85(s: string): Uint8Array {
  const body = s.replace(/\s/g, "").replace(/~>$/, "");
  const out: number[] = [];
  let group: number[] = [];
  const flush = (g: number[], n: number) => {
    let v = 0;
    for (const d of g) v = v * 85 + d;
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    out.push(...bytes.slice(0, n));
  };
  for (const ch of body) {
    if (ch === "z") {
      out.push(0, 0, 0, 0);
      continue;
    }
    group.push(ch.charCodeAt(0) - 33);
    if (group.length === 5) {
      flush(group, 4);
      group = [];
    }
  }
  if (group.length) {
    const n = group.length - 1;
    while (group.length < 5) group.push(84);
    flush(group, n);
  }
  return new Uint8Array(out);
}

function decodeRunLength(b: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  for (;;) {
    const len = b[i++]!;
    if (len === 128) break;
    if (len < 128) {
      out.push(...b.subarray(i, i + len + 1));
      i += len + 1;
    } else {
      out.push(...new Array(257 - len).fill(b[i++]!));
    }
  }
  return new Uint8Array(out);
}

describe("EPS encoders", () => {
  it("ASCII85 round-trips arbitrary bytes, including zero groups and tails", () => {
    for (const len of [0, 1, 2, 3, 4, 5, 9, 1000]) {
      const data = new Uint8Array(len).map((_, i) => (i % 7 === 0 ? 0 : (i * 37) & 255));
      expect([...decode85(ascii85(data))]).toEqual([...data]);
    }
  });
  it("RunLength round-trips runs and literals", () => {
    const data = new Uint8Array([1, 1, 1, 1, 2, 3, 4, 5, 5, ...new Array(300).fill(9), 7]);
    expect([...decodeRunLength(runLength(data))]).toEqual([...data]);
  });
});

describe("EPS export", () => {
  for (const level of [2, 3] as const) {
    it(`Level ${level}: DSC header, bounding box in points, spot colours, filters`, async () => {
      const scene = await scenePromise;
      const { bytes, losses } = sceneToEps(scene, { psLevel: level, title: "Box" });
      const text = new TextDecoder().decode(bytes);
      expect(text.startsWith("%!PS-Adobe-3.0 EPSF-3.0\n")).toBe(true);
      const hi = text.match(/%%HiResBoundingBox: 0 0 ([\d.]+) ([\d.]+)/)!;
      expect(Number(hi[1])).toBeCloseTo(scene.mediaBox.width * MM_TO_PT, 3);
      expect(Number(hi[2])).toBeCloseTo(scene.mediaBox.height * MM_TO_PT, 3);
      expect(text).toContain(`%%LanguageLevel: ${level}`);
      expect(text).toMatch(/%%DocumentCustomColors: .*\(CutContour\)/);
      expect(text).toMatch(/%%DocumentCustomColors: .*\(Crease\)/);
      expect(text).toContain("%%CMYKCustomColor: 0 1 0 0 (CutContour)");
      expect(text.includes("FlateDecode")).toBe(level === 3);
      expect(text.includes("RunLengthDecode")).toBe(level === 2);
      expect(/[^\x09\x0a\x0d\x20-\x7e]/.test(text)).toBe(false); // clean 7-bit
      expect(losses.join(" ")).toMatch(/no transparency/);
      expect(losses.join(" ")).toMatch(/no layers/);
    });
  }

  it.skipIf(!gs)("Ghostscript renders both levels without errors; die lines are separate spot plates", async () => {
    const scene = await scenePromise;
    const dir = mkdtempSync(path.join(tmpdir(), "eps-"));
    for (const level of [2, 3] as const) {
      const file = path.join(dir, `l${level}.eps`);
      writeFileSync(file, sceneToEps(scene, { psLevel: level }).bytes);
      const err = execFileSync("gs", ["-dSAFER", "-dBATCH", "-dNOPAUSE", "-dEPSCrop", "-sDEVICE=bbox", file], { stdio: ["ignore", "pipe", "pipe"] });
      expect(err.toString()).not.toMatch(/Error/);
      execFileSync("gs", ["-q", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-dEPSCrop", "-sDEVICE=tiffsep", "-r20", `-sOutputFile=${path.join(dir, `l${level}-%d.tif`)}`, file]);
    }
    const files = readdirSync(dir).join(" ");
    expect(files).toMatch(/l2-1\(CutContour\)/);
    expect(files).toMatch(/l3-1\(Crease\)/);
  });
});

describe("box background in EPS", () => {
  it("is clipped to the print area", async () => {
    const bgScene = await buildScene(geo, { objects: [], background: { assetId: "img", fit: "cover", scale: 1.5, dx: 0, dy: 0, opacity: 1 } }, { fonts: nodeFontSource, images: testImages({ img: makePng(32, 16) }) });
    const { bytes } = sceneToEps(bgScene, { psLevel: 3, title: "Box" });
    const text = Buffer.from(bytes).toString("latin1");
    expect(text).toContain("closepath clip newpath");
    expect(text.indexOf("closepath clip newpath")).toBeLessThan(text.indexOf("ImageType 1"));
    if (gs) {
      const dir = mkdtempSync(path.join(tmpdir(), "bg-eps-"));
      const file = path.join(dir, "bg.eps");
      writeFileSync(file, bytes);
      execFileSync("gs", ["-q", "-dNOPAUSE", "-dBATCH", "-dSAFER", "-dEPSCrop", "-sDEVICE=png16m", "-r30", `-sOutputFile=${path.join(dir, "o.png")}`, file]);
      expect(readdirSync(dir)).toContain("o.png");
    }
  });
});
