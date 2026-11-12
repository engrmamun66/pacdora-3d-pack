export type Role = "cut" | "crease" | "bleed" | "guide" | "ignore";

export interface ImportOptions {
  /** Unit of the SVG's user coordinates when the file gives no real-world size. Default "auto". */
  unit?: "auto" | "mm" | "cm" | "in" | "pt" | "px";
  /** Pixels per inch for "px" (default 96). */
  pxPerInch?: number;
  /** Extra multiplier applied after unit conversion (default 1). */
  scale?: number;
}

export interface SvgStyle {
  /** Stable id from stroke colour + dash + width bucket, e.g. "ff0000|d|0.25". */
  key: string;
  stroke: string | null;
  dashed: boolean;
  strokeWidthMm: number;
  /** Number of paths using this style. */
  count: number;
  suggestedRole: Role;
}

/** Flat x,y,... in mm, y-down, drawing's bounding-box min corner = (0,0). */
export interface ImportedPath {
  style: string;
  closed: boolean;
  pts: number[];
  /** Position of this path in the file (document order). Stable for the same file, so exclusions can refer to it. */
  id?: number;
  /** True when the line is the outline of a filled shape that has no stroke. */
  fill?: true;
}

/** A named group (layer) of the SVG: it owns the paths with ids from `from` up to, not including, `to`. */
export interface SvgGroup {
  label: string;
  from: number;
  to: number;
  /** 0 = top level; nested groups count up. */
  depth: number;
}

export interface ImportReport {
  unit: "mm" | "cm" | "in" | "pt" | "px";
  /** svg-size = real-world width/height from the file; option = caller's unit; assumed = px at 96 dpi. */
  unitSource: "svg-size" | "option" | "assumed";
  warnings: string[];
  ignored: Record<string, number>;
  elementCount: number;
  pointCount: number;
}

export interface ImportedDieline {
  widthMm: number;
  heightMm: number;
  styles: SvgStyle[];
  paths: ImportedPath[];
  /** Named groups of the file, in document order (for the clean-up step). */
  groups?: SvgGroup[];
  report: ImportReport;
}

/** Message is safe to show to the user. */
export class SvgImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SvgImportError";
  }
}
