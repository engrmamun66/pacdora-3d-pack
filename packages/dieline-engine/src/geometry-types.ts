import type { CreaseLine, CutSegment, GlueArea } from "./fold-tree/extract";
import type { Outline } from "./primitives/arc";
import type { FoldTree, LinearAnnotation } from "./fold-tree/types";
import type { Bounds } from "./primitives/polygon";
import type { Vec2 } from "./primitives/vec2";

export interface CheckResult {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

export interface SafeArea {
  readonly panelId: string;
  readonly polygon: readonly Vec2[];
}

/** Complete, validated flat dieline. Pure data: JSON-serialisable. */
export interface DielineGeometry {
  readonly unit: "mm";
  readonly templateId: string;
  readonly engineVersion: string;
  readonly params: unknown;
  /** Parameters filled from unverified built-in defaults. */
  readonly unverifiedDefaultsUsed: readonly string[];
  readonly foldTree: FoldTree;
  /** Closed cut outlines with arc bulges (outer first). */
  readonly cutLoops: readonly Outline[];
  /** Open cut segments (slits) on shared edges. */
  readonly slitLines: readonly CutSegment[];
  readonly creaseLines: readonly CreaseLine[];
  readonly glueAreas: readonly GlueArea[];
  /** Bleed outline (flattened polygon; arcs approximated to 5 micrometres). */
  readonly bleedLoop: readonly Vec2[];
  readonly safeAreas: readonly SafeArea[];
  readonly annotations: readonly LinearAnnotation[];
  readonly cutBounds: Bounds;
  readonly bleedBounds: Bounds;
  readonly checks: readonly CheckResult[];
}

export class DielineValidationError extends Error {
  constructor(public readonly failed: readonly CheckResult[]) {
    super(`Dieline failed validation: ${failed.map((c) => `${c.name} (${c.detail})`).join("; ")}`);
    this.name = "DielineValidationError";
  }
}
