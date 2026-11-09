import type { CreaseLine, CutSegment } from "../fold-tree/extract";
import type { LinearAnnotation, Panel } from "../fold-tree/types";
import type { CheckResult, DielineGeometry, SafeArea } from "../geometry-types";
import type { Outline } from "../primitives/arc";
import { area, bounds, offsetPolygon } from "../primitives/polygon";
import { type Vec2, vec } from "../primitives/vec2";
import { ENGINE_VERSION, ParamValidationError } from "./carton-common";
import type { GeneratorDefinition } from "./registry";

/**
 * Dielines that were drawn elsewhere (imported from an SVG) as a generator.
 *
 * The shape is fixed: there are no panels or fold hinges to rebuild, so these
 * dielines have a flat sheet only (artwork, exports) and no 3D fold. The only
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

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Width (mm) of the outer cut outline, as imported. */
export function importedCutSize(flat: FlatDieline): { width: number; height: number } {
  const outer = closedCutLoops(flat)[0];
  if (!outer) throw new ImportedDielineError("No closed cut outline.");
  const b = bounds(outer);
  return { width: b.max.x - b.min.x, height: b.max.y - b.min.y };
}

/** Starting parameters: original width, and the bleed the file itself drew (3 mm if none). */
export function importedDefaults(flat: FlatDieline): { width: number; bleed: number } {
  const outer = closedCutLoops(flat)[0];
  if (!outer) throw new ImportedDielineError("No closed cut outline.");
  const cb = bounds(outer);
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

const MAX_SEGMENTS = 60_000;

/** Generator for one imported dieline. `id` is only used as the geometry's template id. */
export function createImportedGenerator(templateId: string, flat: FlatDieline): GeneratorDefinition {
  assertImportable(flat);
  const { width: baseW } = importedCutSize(flat);
  const defaults = importedDefaults(flat);
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
    if (issues.length) throw new ParamValidationError(issues);

    const loops = closedCutLoops(flat);
    const outerRaw = loops[0]!;
    const ob = bounds(outerRaw);
    const k = width / (ob.max.x - ob.min.x);
    // Scale about the outline's corner so everything keeps its place relative to it.
    const map = (p: Vec2): Vec2 => vec(ob.min.x + (p.x - ob.min.x) * k, ob.min.y + (p.y - ob.min.y) * k);
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

    let bleedLoop: readonly Vec2[] = outer;
    if (bleed > 0) {
      const pieces = offsetPolygon(outer, bleed);
      const largest = [...pieces].sort((a, b) => area(b) - area(a))[0];
      if (largest) bleedLoop = largest;
    }

    const safeAreas: SafeArea[] = flat.guide
      .filter((p) => p.closed)
      .map((p) => mapAll(toPoints(p)))
      .filter((pts) => pts.length >= 3)
      .map((polygon) => ({ panelId: "sheet", polygon }));

    const sheet: Panel = { id: "sheet", role: "body", label: "Sheet", polygon: outer, printable: true };
    const cutBounds = bounds(outer);
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
      { name: "Imported shape", pass: true, detail: "Fixed shape from an SVG file: only the overall size can change. No 3D fold." },
    ];

    return {
      unit: "mm",
      templateId,
      engineVersion: ENGINE_VERSION,
      params: { width, bleed },
      unverifiedDefaultsUsed: [],
      foldTree: { rootId: "sheet", panels: [sheet], hinges: [] },
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
    schemaKeys: ["width", "bleed"],
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
      { key: "bleed", kind: "number", label: "Bleed", unit: "mm", group: "Print", min: 0, max: 20, step: 0.5, optional: true, help: "Print area outside the cut line." },
    ],
  };
}
