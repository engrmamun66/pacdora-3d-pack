import type { CreaseLine, CutSegment } from "../fold-tree/extract";
import type { FoldPart, Hinge, LinearAnnotation, Panel } from "../fold-tree/types";
import type { CheckResult, DielineGeometry, SafeArea } from "../geometry-types";
import type { Outline } from "../primitives/arc";
import { area, bounds, offsetPolygon } from "../primitives/polygon";
import { type Vec2, vec } from "../primitives/vec2";
import { ENGINE_VERSION, ParamValidationError } from "./carton-common";
import { type FoldSetup, validateFoldSetup } from "./imported-fold";
import { type PartSizes, planResize, sheetMap } from "./imported-resize";
import type { GeneratorDefinition, ParamDescriptor } from "./registry";

/**
 * Dielines that were drawn elsewhere (imported from an SVG) as a generator.
 *
 * The shape is fixed. Without a fold setup these dielines have one flat sheet
 * panel (artwork, exports) and no 3D fold. With a FoldSetup (see imported-fold.ts)
 * the panels and hinges come from it and the dieline folds in 3D. The only
 * dimension is the overall width; the whole sheet is scaled uniformly.
 */

/** One drawn line, coordinates x,y,x,y,... in millimetres (y down). */
export interface FlatPath {
  readonly pts: readonly number[];
  readonly closed: boolean;
}

/** An imported dieline sorted into what each line means. */
export interface FlatDieline {
  readonly cut: readonly FlatPath[];
  /** Fold lines. */
  readonly crease: readonly FlatPath[];
  /** Bleed outlines drawn in the file (only used to suggest a default bleed). */
  readonly bleed: readonly FlatPath[];
  /** Reference lines such as the safe area (closed ones become safe areas). */
  readonly guide: readonly FlatPath[];
  /**
   * Ignored lines the admin chose to keep as an optional picture behind the dieline
   * (not part of the geometry, exports or 3D). Drawn faint on request.
   */
  readonly reference?: readonly FlatPath[];
}

export const IMPORTED_GENERATOR_ID = "svg-import";

export class ImportedDielineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportedDielineError";
  }
}

const toPoints = (p: FlatPath): Vec2[] => {
  const out: Vec2[] = [];
  for (let i = 0; i + 1 < p.pts.length; i += 2) {
    const v = vec(p.pts[i]!, p.pts[i + 1]!);
    const last = out[out.length - 1];
    if (!last || Math.hypot(v.x - last.x, v.y - last.y) > 1e-9) out.push(v);
  }
  const first = out[0];
  const end = out[out.length - 1];
  if (p.closed && first && end && out.length > 1 && Math.hypot(first.x - end.x, first.y - end.y) <= 1e-9) out.pop();
  return out;
};

/** Closed cut shapes, largest (the outer outline) first. */
function closedCutLoops(flat: FlatDieline): Vec2[][] {
  return flat.cut
    .filter((p) => p.closed)
    .map(toPoints)
    .filter((pts) => pts.length >= 3 && area(pts) > 1e-6)
    .sort((a, b) => area(b) - area(a));
}

/** Throws ImportedDielineError if the lines cannot make a dieline (used when an admin saves a template). */
export function assertImportable(flat: FlatDieline): void {
  if (closedCutLoops(flat).length === 0) {
    throw new ImportedDielineError("The Cut lines do not form a closed outline. Close the outer shape in the SVG, or mark the closed shape as Cut.");
  }
}

/** Ray-cast containment test (points exactly on the edge may go either way). */
function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The separate pieces of the sheet: closed cut shapes that are not inside another one
 * (those are holes or cut-outs). Largest first. Usually one; a box with its lid drawn
 * next to it has two.
 */
function sheetPieces(loops: readonly Vec2[][]): Vec2[][] {
  const out: Vec2[][] = [];
  for (const l of loops) if (!out.some((o) => pointInPolygon(l[0]!, o))) out.push(l);
  return out;
}

/** Box around all the pieces. */
function unionBounds(pieces: readonly (readonly Vec2[])[]) {
  const all = pieces.map(bounds);
  return {
    min: vec(Math.min(...all.map((b) => b.min.x)), Math.min(...all.map((b) => b.min.y))),
    max: vec(Math.max(...all.map((b) => b.max.x)), Math.max(...all.map((b) => b.max.y))),
  };
}

const rectangle = (min: Vec2, max: Vec2): Vec2[] => [vec(min.x, min.y), vec(max.x, min.y), vec(max.x, max.y), vec(min.x, max.y)];

/** Width (mm) of the whole sheet's cut outline (all separate pieces together), as imported. */
export function importedCutSize(flat: FlatDieline): { width: number; height: number } {
  const loops = closedCutLoops(flat);
  if (loops.length === 0) throw new ImportedDielineError("No closed cut outline.");
  const b = unionBounds(sheetPieces(loops));
  return { width: b.max.x - b.min.x, height: b.max.y - b.min.y };
}

/** Starting parameters: original width, and the bleed the file itself drew (3 mm if none). */
export function importedDefaults(flat: FlatDieline): { width: number; bleed: number } {
  const loops = closedCutLoops(flat);
  if (loops.length === 0) throw new ImportedDielineError("No closed cut outline.");
  const cb = unionBounds(sheetPieces(loops));
  let bleed = 3;
  const bleeds = flat.bleed.filter((p) => p.closed).map(toPoints).filter((pts) => pts.length >= 3);
  const big = bleeds.sort((a, b) => area(b) - area(a))[0];
  if (big) {
    const bb = bounds(big);
    const d = Math.min(cb.min.x - bb.min.x, cb.min.y - bb.min.y, bb.max.x - cb.max.x, bb.max.y - cb.max.y);
    if (Number.isFinite(d) && d > 0.1 && d <= 20) bleed = Math.round(d * 10) / 10;
  }
  return { width: round1(cb.max.x - cb.min.x), bleed };
}

/**
 * Move paths from the imported frame into the frame of a generated dieline of overall
 * `width` (the same uniform scale about the outline's corner the generator uses).
 */
export function scaleImportedPaths(flat: FlatDieline, width: number, paths: readonly FlatPath[], fold?: FoldSetup | null, sizes: PartSizes = {}): FlatPath[] {
  const loops = closedCutLoops(flat);
  if (loops.length === 0) return [];
  const ob = unionBounds(sheetPieces(loops));
  const k = width / (ob.max.x - ob.min.x);
  const map = sheetMap(ob.min, k, planResize(fold), sizes);
  return paths.map((p) => {
    const pts: number[] = [];
    for (let i = 0; i + 1 < p.pts.length; i += 2) {
      const q = map(vec(p.pts[i]!, p.pts[i + 1]!));
      pts.push(q.x, q.y);
    }
    return { closed: p.closed, pts };
  });
}

const MAX_SEGMENTS = 60_000;

/** Generator for one imported dieline. `id` is only used as the geometry's template id. */
export function createImportedGenerator(templateId: string, flat: FlatDieline, fold?: FoldSetup | null): GeneratorDefinition {
  assertImportable(flat);
  if (fold) {
    const problems = validateFoldSetup(fold);
    if (problems.length > 0) throw new ImportedDielineError(problems[0]!);
  }
  const { width: baseW } = importedCutSize(flat);
  const defaults = importedDefaults(flat);
  const plan = planResize(fold);
  const minW = Math.max(10, round1(baseW * 0.05));
  const maxW = Math.min(5000, Math.max(minW + 1, round1(baseW * 20)));

  const generate = (input: unknown): DielineGeometry => {
    const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const issues: { path: string; message: string }[] = [];
    const read = (key: "width" | "bleed", fallback: number, min: number, max: number) => {
      const v = raw[key];
      if (v === undefined || v === "") return fallback;
      if (typeof v !== "number" || !Number.isFinite(v)) {
        issues.push({ path: key, message: "must be a number" });
        return fallback;
      }
      if (v < min || v > max) issues.push({ path: key, message: `must be between ${min} and ${max} mm` });
      return v;
    };
    const width = read("width", defaults.width, minW, maxW);
    const bleed = read("bleed", defaults.bleed, 0, 20);
    // The part sizes: left empty they follow the overall scale; typed, they must stay within 0.1x..10x of it.
    const scale0 = width / baseW;
    const readSize = (key: keyof PartSizes, natural: number): number | undefined => {
      const v = raw[key];
      if (!plan || v === undefined || v === "") return undefined;
      if (typeof v !== "number" || !Number.isFinite(v)) {
        issues.push({ path: key, message: "must be a number" });
        return undefined;
      }
      const lo = round1(natural * scale0 * 0.1);
      const hi = round1(natural * scale0 * 10);
      if (v < lo || v > hi) issues.push({ path: key, message: `must be between ${lo} and ${hi} mm` });
      return v;
    };
    const sizes: PartSizes = plan
      ? {
          ...optionalSize("baseWidth", readSize("baseWidth", plan.natural.baseWidth)),
          ...optionalSize("baseHeight", readSize("baseHeight", plan.natural.baseHeight)),
          ...optionalSize("boxHeight", readSize("boxHeight", plan.natural.boxHeight)),
        }
      : {};
    if (issues.length) throw new ParamValidationError(issues);

    const loops = closedCutLoops(flat);
    const pieces = sheetPieces(loops);
    const ob = unionBounds(pieces);
    const k = width / (ob.max.x - ob.min.x);
    // Scale about the outline's corner so everything keeps its place relative to it, then stretch the chosen parts.
    const map = sheetMap(ob.min, k, plan, sizes);
    const mapAll = (pts: readonly Vec2[]) => pts.map(map);

    const cutLoops: Outline[] = loops.map((l) => ({ points: mapAll(l) }));
    const outer = cutLoops[0]!.points;

    let segments = 0;
    const segs = (paths: readonly FlatPath[], prefix: string): { id: string; a: Vec2; b: Vec2 }[] => {
      const out: { id: string; a: Vec2; b: Vec2 }[] = [];
      paths.forEach((p, pi) => {
        const pts = mapAll(toPoints(p));
        const n = p.closed ? pts.length : pts.length - 1;
        for (let i = 0; i < n; i++) {
          const a = pts[i]!;
          const b = pts[(i + 1) % pts.length]!;
          if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-9) continue;
          if (++segments > MAX_SEGMENTS) throw new ImportedDielineError("This dieline has too many line segments.");
          out.push({ id: `${prefix}-${pi}-${i}`, a, b });
        }
      });
      return out;
    };
    // Open cut lines are slits; closed ones that are not the outline or a hole already are loops.
    const slitLines: CutSegment[] = segs(flat.cut.filter((p) => !p.closed), "slit");
    const creaseLines: CreaseLine[] = segs(flat.crease, "fold").map((s) => ({ ...s, hingeId: s.id, foldAngleDeg: 90 }));

    // One piece: the cut outline grown by the bleed. Several pieces: one box around all of them.
    const sheetBox = { min: vec(ob.min.x, ob.min.y), max: map(vec(ob.max.x, ob.max.y)) };
    let bleedLoop: readonly Vec2[] = pieces.length > 1 ? rectangle(sheetBox.min, sheetBox.max) : outer;
    if (bleed > 0) {
      if (pieces.length > 1) {
        bleedLoop = rectangle(vec(sheetBox.min.x - bleed, sheetBox.min.y - bleed), vec(sheetBox.max.x + bleed, sheetBox.max.y + bleed));
      } else {
        const grown = offsetPolygon(outer, bleed);
        const largest = [...grown].sort((a, b) => area(b) - area(a))[0];
        if (largest) bleedLoop = largest;
      }
    }

    const guides = flat.guide
      .filter((p) => p.closed)
      .map((p) => mapAll(toPoints(p)))
      .filter((pts) => pts.length >= 3);

    let panels: Panel[];
    let hinges: Hinge[];
    let rootId: string;
    let parts: FoldPart[] = [];
    let groundId: string | undefined;
    let safeAreas: SafeArea[];
    if (fold) {
      panels = fold.panels.map((p) => {
        const polygon: Vec2[] = [];
        for (let i = 0; i + 1 < p.polygon.length; i += 2) polygon.push(map(vec(p.polygon[i]!, p.polygon[i + 1]!)));
        return { id: p.id, role: p.role, label: p.label, polygon, printable: p.printable };
      });
      hinges = fold.hinges.map((h) => ({
        id: h.id,
        parentId: h.parentId,
        childId: h.childId,
        a: map(vec(h.line[0], h.line[1])),
        b: map(vec(h.line[2], h.line[3])),
        foldAngleDeg: h.angleDeg,
        foldOrder: h.order,
      }));
      rootId = fold.rootId;
      groundId = fold.groundId;
      parts = (fold.parts ?? []).map((q) => ({ rootId: q.rootId, placement: q.placement }));
      // A guide belongs to the panel that contains its first point (else its centre, else the root panel).
      safeAreas = guides.map((polygon) => {
        const centre = vec(polygon.reduce((a, v) => a + v.x, 0) / polygon.length, polygon.reduce((a, v) => a + v.y, 0) / polygon.length);
        const host = panels.find((p) => pointInPolygon(polygon[0]!, p.polygon)) ?? panels.find((p) => pointInPolygon(centre, p.polygon));
        return { panelId: host?.id ?? rootId, polygon };
      });
    } else {
      panels = [{ id: "sheet", role: "body", label: "Sheet", polygon: pieces.length > 1 ? rectangle(sheetBox.min, sheetBox.max) : outer, printable: true }];
      hinges = [];
      rootId = "sheet";
      safeAreas = guides.map((polygon) => ({ panelId: "sheet", polygon }));
    }
    const cutBounds = pieces.length > 1 ? sheetBox : bounds(outer);
    const bleedBounds = bounds(bleedLoop);
    const w = cutBounds.max.x - cutBounds.min.x;
    const h = cutBounds.max.y - cutBounds.min.y;
    const annotations: LinearAnnotation[] = [
      { id: "dim-width", kind: "linear", p1: vec(cutBounds.min.x, cutBounds.max.y), p2: vec(cutBounds.max.x, cutBounds.max.y), offset: bleed + 6, text: `Width ${w.toFixed(2)}` },
      { id: "dim-height", kind: "linear", p1: vec(cutBounds.min.x, cutBounds.min.y), p2: vec(cutBounds.min.x, cutBounds.max.y), offset: bleed + 6, text: `Height ${h.toFixed(2)}` },
    ];
    const checks: CheckResult[] = [
      { name: "Closed cut outline", pass: true, detail: `${cutLoops.length} closed ${cutLoops.length === 1 ? "shape" : "shapes"}, ${slitLines.length} open cut ${slitLines.length === 1 ? "segment" : "segments"}` },
      { name: "Fold lines", pass: true, detail: `${creaseLines.length} ${creaseLines.length === 1 ? "segment" : "segments"}` },
      fold
        ? { name: "Imported shape", pass: true, detail: "Fixed shape from an SVG file: only the overall size can change." }
        : { name: "Imported shape", pass: true, detail: "Fixed shape from an SVG file: only the overall size can change. No 3D fold." },
    ];
    if (fold) checks.push({ name: "Folds into 3D", pass: true, detail: `${panels.length} ${panels.length === 1 ? "panel" : "panels"}, ${hinges.length} ${hinges.length === 1 ? "hinge" : "hinges"}` });

    return {
      unit: "mm",
      templateId,
      engineVersion: ENGINE_VERSION,
      params: {
        width,
        bleed,
        ...(plan
          ? {
              baseWidth: round2(sizes.baseWidth ?? plan.natural.baseWidth * k),
              baseHeight: round2(sizes.baseHeight ?? plan.natural.baseHeight * k),
              boxHeight: round2(sizes.boxHeight ?? plan.natural.boxHeight * k),
            }
          : {}),
      },
      unverifiedDefaultsUsed: [],
      foldTree: { rootId, panels, hinges, ...(parts.length > 0 ? { parts } : {}), ...(groundId ? { groundId } : {}) },
      cutLoops,
      slitLines,
      creaseLines,
      glueAreas: [],
      bleedLoop,
      safeAreas,
      annotations,
      cutBounds,
      bleedBounds,
      checks,
    };
  };

  return {
    id: IMPORTED_GENERATOR_ID,
    name: "Imported dieline",
    schemaVersion: 1,
    schemaKeys: plan ? ["width", "bleed", "baseWidth", "baseHeight", "boxHeight"] : ["width", "bleed"],
    generate,
    params: [
      {
        key: "width",
        kind: "number",
        label: "Width",
        unit: "mm",
        group: "Dimensions",
        min: minW,
        max: maxW,
        step: 1,
        optional: true,
        help: `Overall width of the flat shape. Height follows the original proportions (original ${round1(baseW)} mm wide). The whole sheet is scaled.`,
      },
      ...(plan
        ? [
            sizeParam("baseWidth", "Base width", "Width of the base panel. The panels along it follow."),
            sizeParam("baseHeight", "Base height", "Height of the base panel. The panels along it follow."),
            sizeParam("boxHeight", "Box height", "How tall the box stands: the height of the side walls."),
          ]
        : []),
      { key: "bleed", kind: "number", label: "Bleed", unit: "mm", group: "Print", min: 0, max: 20, step: 0.5, optional: true, help: "Print area outside the cut line." },
    ],
  };
}

const optionalSize = (key: keyof PartSizes, v: number | undefined): PartSizes => (v === undefined ? {} : { [key]: v });

const sizeParam = (key: string, label: string, help: string): ParamDescriptor => ({ key, kind: "number", label, unit: "mm", group: "Dimensions", min: 1, max: 5000, step: 1, optional: true, help });
