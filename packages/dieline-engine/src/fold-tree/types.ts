import type { Vec2 } from "../primitives/vec2";

/**
 * - closure: outer lid/bottom panel, printed side faces outward.
 * - bottom-flap: outer layer of a glued (crash-lock) bottom, printed outward.
 * - lock-flap: inner layer of a crash-lock bottom, rests on the other half.
 * - glue-flap: any area that receives glue (side seam strip, crash-lock tabs).
 */
export type PanelRole = "body" | "closure" | "tuck" | "dust-flap" | "glue-flap" | "bottom-flap" | "lock-flap";

/** A flat piece of board, polygon in flat sheet coordinates (mm, y down). */
export interface Panel {
  readonly id: string;
  readonly role: PanelRole;
  readonly label: string;
  readonly polygon: readonly Vec2[];
  /**
   * Optional bulge per edge (edge i = vertex i -> i+1), DXF convention; see
   * primitives/arc.ts. Missing or 0 = straight. Hinge edges must be straight.
   */
  readonly bulges?: readonly number[];
  /** True if artwork may be printed on this panel (gets a safe area). */
  readonly printable: boolean;
}

/**
 * A fold between two panels. `a`-`b` is the hinge segment in flat coordinates
 * and MUST coincide exactly with one edge of both parent and child polygons.
 * All folds bring the unprinted (inside) faces toward each other, i.e. the
 * printed side ends up outside the carton.
 */
export interface Hinge {
  readonly id: string;
  readonly parentId: string;
  readonly childId: string;
  readonly a: Vec2;
  readonly b: Vec2;
  /** Target fold angle when closed, in degrees (90 = right angle). */
  readonly foldAngleDeg: number;
  /**
   * Optional 1-based fold step for staged animation. Hinges with the same
   * number fold together; lower numbers fold first. See stagedHingeProgress().
   */
  readonly foldOrder?: number;
}

/**
 * Where an extra part (a second piece such as a lid, drawn next to the main body on the
 * same sheet) goes in 3D once everything is folded.
 * - closed: flipped over and set on top of the main body, like a closed lid.
 * - open: the same, then swung up about the back edge by `openDeg` (default 30).
 * - beside: stands next to the main body on the same ground.
 */
export type PartPlacementMode = "closed" | "open" | "beside";

export interface PartPlacement {
  readonly mode: PartPlacementMode;
  /** Only for "open": how far the part is lifted, 0..120 degrees. */
  readonly openDeg?: number;
}

/** A second (third...) folded piece. Its panels hang off `rootId`, not off the main root. */
export interface FoldPart {
  readonly rootId: string;
  readonly placement: PartPlacement;
}

/** Panels joined by hinges. Single source for flat layout (2D) and folding (3D). */
export interface FoldTree {
  readonly rootId: string;
  readonly panels: readonly Panel[];
  readonly hinges: readonly Hinge[];
  /** Extra separately folded pieces, placed relative to the main body (see FoldPart). */
  readonly parts?: readonly FoldPart[];
  /**
   * Cut segments lying on an edge shared by two panels (e.g. tuck-lock slits at
   * the ends of a tuck crease). Each must coincide exactly with one shared edge.
   */
  readonly slits?: readonly Slit[];
}

export interface Slit {
  readonly id: string;
  readonly a: Vec2;
  readonly b: Vec2;
}

/** Dimension annotation, rendered by the SVG/PDF backends. */
export interface LinearAnnotation {
  readonly id: string;
  readonly kind: "linear";
  readonly p1: Vec2;
  readonly p2: Vec2;
  /** Distance of the dimension line from p1-p2, along the normal (mm). */
  readonly offset: number;
  /** Text shown, e.g. "W 100.00". */
  readonly text: string;
}
