import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { generateDieline } from "@packaging/dieline-engine";
import type { Artwork } from "@packaging/schema";
import { buildScene } from "@packaging/vector-scene";
import { nodeFontSource } from "@packaging/vector-scene/node";
import { ILLUSTRATOR_PROFILES, MM_TO_PT, sceneToPdf } from "../src";
import { makePng, testImages } from "./fixtures";

const geo = generateDieline("tuck-end-carton", { width: 100, depth: 50, height: 150 });
const common = { panelId: "front", dx: 0, dy: 0, angle: 0, visible: true, locked: false } as const;
const artwork: Artwork = {
  objects: [
    { ...common, id: "r", name: "Band", type: "rect", width: 90, height: 30, cornerRadius: 2, fill: "#0a6b3a", stroke: null, strokeWidth: 0, opacity: 0.6 },
    { ...common, id: "t", name: "Title", type: "text", text: "Green Tea", fontFamily: "Lora", fontSizePt: 28, fontWeight: "bold", fontStyle: "italic", textAlign: "center", lineHeight: 1.16, width: 90, fill: "#7a1f3d", opacity: 1, dy: -40 },
    { ...common, id: "i", name: "Logo", type: "image", assetId: "img", width: 40, height: 20, flipX: false, flipY: false, opacity: 1, dy: 30 },
  ],
};
const scenePromise = buildScene(geo, artwork, { fonts: nodeFontSource, images: testImages({ img: makePng(64, 32) }) });

const gs = (() => {
  try {
    execFileSync("gs", ["--version"]);
    return true;
  } catch {
    return false;
  }
})();

const asText = (b: Uint8Array) => Buffer.from(b).toString("latin1");

describe("PDF export", () => {
  it("page boxes match the scene in points (1 mm = 72/25.4 pt)", async () => {
    const scene = await scenePromise;
    const { bytes } = await sceneToPdf(scene, { pdfVersion: "1.7", layers: true, transparency: "live" });
    const pdf = await PDFDocument.load(bytes);
    const page = pdf.getPage(0);
    const mb = page.getMediaBox();
    expect(mb.width).toBeCloseTo(scene.mediaBox.width * MM_TO_PT, 3);
    expect(mb.height).toBeCloseTo(scene.mediaBox.height * MM_TO_PT, 3);
    const trim = page.getTrimBox();
    expect(trim.width / MM_TO_PT).toBeCloseTo(geo.cutBounds.max.x - geo.cutBounds.min.x, 3);
    expect(trim.height / MM_TO_PT).toBeCloseTo(geo.cutBounds.max.y - geo.cutBounds.min.y, 3);
    // Bleed is 3 mm on every side of the trim box.
    expect((trim.x - page.getBleedBox().x) / MM_TO_PT).toBeCloseTo(3, 3);
  });

  it("writes spot colours, overprint and named layers", async () => {
    const { bytes } = await sceneToPdf(await scenePromise, { pdfVersion: "1.7", layers: true, transparency: "live" });
    const pdf = await PDFDocument.load(bytes);
    const oc = pdf.catalog.get(PDFName.of("OCProperties"));
    expect(oc).toBeDefined();
    const raw = asText(bytes);
    expect(raw.startsWith("%PDF-1.7")).toBe(true);
    expect(raw).toMatch(/\/Separation \/CutContour \/DeviceCMYK/);
    expect(raw).toMatch(/\/Separation \/Crease \/DeviceCMYK/);
    expect(raw).toMatch(/\/OP true/);
    for (const name of ["Artwork", "Crease", "Cut"]) expect(raw).toContain(`(${name})`);
  });

  for (const p of ILLUSTRATOR_PROFILES.filter((x) => x.ai)) {
    it(`AI profile ${p.id}: PDF ${p.ai!.pdfVersion} header, layers ${p.ai!.layers}, transparency ${p.ai!.transparency}`, async () => {
      const { bytes, losses } = await sceneToPdf(await scenePromise, p.ai!);
      const raw = asText(bytes);
      expect(raw.startsWith(`%PDF-${p.ai!.pdfVersion}`)).toBe(true);
      expect(raw.includes("/OCProperties")).toBe(p.ai!.layers);
      expect(raw.includes("/ObjStm")).toBe(false); // object streams need PDF 1.5
      if (p.ai!.transparency === "flatten") {
        expect(raw).not.toMatch(/\/SMask/);
        expect(raw).not.toMatch(/\/ca /);
        expect(losses.join(" ")).toMatch(/drawn fully opaque/);
        expect(losses.join(" ")).toMatch(/filled with white/);
      } else {
        expect(raw).toMatch(/\/SMask/);
        expect(raw).toMatch(/\/ca 0\.6/);
      }
      if (!p.ai!.layers) expect(losses.join(" ")).toMatch(/no layers/);
    });
  }

  it.skipIf(!gs)("Ghostscript renders it and sees CutContour and Crease as separate plates", async () => {
    const { bytes } = await sceneToPdf(await scenePromise, { pdfVersion: "1.7", layers: true, transparency: "live" });
    const dir = mkdtempSync(path.join(tmpdir(), "pdfsep-"));
    const file = path.join(dir, "box.pdf");
    writeFileSync(file, bytes);
    execFileSync("gs", ["-q", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=tiffsep", "-r20", `-sOutputFile=${path.join(dir, "out.tif")}`, file]);
    const plates = readdirSync(dir).join(" ");
    expect(plates).toMatch(/CutContour/);
    expect(plates).toMatch(/Crease/);
    expect(existsSync(path.join(dir, "out(Cyan).tif"))).toBe(true);
  });

  it.skipIf(!gs)("every AI profile renders in Ghostscript without errors", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pdfai-"));
    for (const p of ILLUSTRATOR_PROFILES.filter((x) => x.ai)) {
      const { bytes } = await sceneToPdf(await scenePromise, p.ai!);
      const file = path.join(dir, `${p.id}.ai`);
      writeFileSync(file, bytes);
      const out = execFileSync("gs", ["-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=bbox", file], { stdio: ["ignore", "pipe", "pipe"] }).toString();
      expect(out).not.toMatch(/Error/);
    }
  });
});
