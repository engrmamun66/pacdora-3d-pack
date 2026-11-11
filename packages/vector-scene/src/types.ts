/**
 * Neutral vector scene shared by every vector export (SVG, PDF, AI, EPS).
 * Built once from geometry + artwork, so the backends cannot disagree.
 * Units: millimetres in the flat sheet frame (x right, y DOWN).
 */

/** Affine matrix [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f. */
export type Matrix = readonly [number, number, number, number, number, number];

export type PathCmd =
  | { readonly op: "M"; readonly x: number; readonly y: number }
  | { readonly op: "L"; readonly x: number; readonly y: number }
  | { readonly op: "C"; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly x: number; readonly y: number }
  | { readonly op: "Z" };

export interface RgbPaint {
  readonly kind: "rgb";
  /** #rrggbb */
  readonly hex: string;
}

/** Spot (Separation) colour, e.g. the die-cut line. `preview` is used where spots are unsupported. */
export interface SpotPaint {
  readonly kind: "spot";
  readonly name: string;
  readonly cmyk: readonly [number, number, number, number];
  readonly preview: string;
}

export type Paint = RgbPaint | SpotPaint;

export interface PathItem {
  readonly kind: "path";
  readonly name?: string;
  readonly d: readonly PathCmd[];
  readonly fill: Paint | null;
  readonly fillRule: "nonzero" | "evenodd";
  readonly stroke: Paint | null;
  /** mm */
  readonly strokeWidth: number;
  readonly opacity: number;
}

export interface ImageItem {
  readonly kind: "image";
  readonly name?: string;
  readonly mime: "image/png" | "image/jpeg";
  readonly bytes: Uint8Array;
  readonly pxWidth: number;
  readonly pxHeight: number;
  /** Maps the unit square (u, v in 0..1, v DOWN) onto the sheet (mm). */
  readonly matrix: Matrix;
  readonly opacity: number;
  /** Visible region (mm, sheet frame): the image is cut off outside it. Used by the box background. */
  readonly clip?: Box;
}

export type SceneItem = PathItem | ImageItem;

export type LayerId = "artwork" | "glue" | "bleed" | "safe" | "crease" | "cut" | "dimensions" | "watermark";

export interface SceneLayer {
  readonly id: LayerId;
  readonly name: string;
  /** False for technical layers (die lines, guides) that a printer must not print as ink. */
  readonly printable: boolean;
  readonly items: readonly SceneItem[];
}

export interface Box {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

export interface Scene {
  readonly unit: "mm";
  /** Page: bleed bounds, enlarged if dimension annotations are included. */
  readonly mediaBox: Box;
  /** Finished (cut) size. */
  readonly trimBox: Box;
  readonly bleedBox: Box;
  /** Bottom to top. */
  readonly layers: readonly SceneLayer[];
  /** Things that could not be represented exactly (shown to the user). */
  readonly losses: readonly string[];
}
