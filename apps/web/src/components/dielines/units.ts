import type { DielineGeometry } from "@packaging/dieline-engine";

export type Unit = "mm" | "in";
export const MM_PER_INCH = 25.4;

/** mm (as stored) -> text shown in the chosen unit. Empty stays empty. */
export function toDisplay(mmText: string, unit: Unit): string {
  if (unit === "mm" || mmText.trim() === "") return mmText;
  const v = Number(mmText);
  return Number.isFinite(v) ? String(Math.round((v / MM_PER_INCH) * 10_000) / 10_000) : mmText;
}

/** Text typed in the chosen unit -> mm text for storage. */
export function fromDisplay(text: string, unit: Unit): string {
  if (unit === "mm" || text.trim() === "") return text;
  const v = Number(text);
  return Number.isFinite(v) ? String(Math.round(v * MM_PER_INCH * 1_000_000) / 1_000_000) : text;
}

/**
 * Dimension labels come from the engine as "W 100.00" (millimetres). In inch
 * mode relabel them; the geometry itself is never changed.
 */
export function withUnitLabels(geo: DielineGeometry, unit: Unit): DielineGeometry {
  if (unit === "mm") return geo;
  return {
    ...geo,
    annotations: geo.annotations.map((a) => {
      const m = /^(.*?)\s*(-?\d+(?:\.\d+)?)\s*(?:mm)?$/.exec(a.text);
      return m ? { ...a, text: `${m[1]} ${(Number(m[2]) / MM_PER_INCH).toFixed(3)} in`.trim() } : a;
    }),
  };
}

export interface MaterialGrade {
  readonly id: string;
  readonly label: string;
  /** Typical caliper, mm. Typical value only: confirm with the board supplier. */
  readonly thickness: number;
}
export interface MaterialType {
  readonly id: string;
  readonly label: string;
  /** Board colour used in the 3D preview. */
  readonly color: string;
  readonly grades: readonly MaterialGrade[];
}

/**
 * Generic board families with typical calipers. These are approximations of
 * common industry values, not supplier data. Corrugated stops at single wall
 * (A-flute) because the engine accepts board up to 5 mm.
 */
export const MATERIAL_TYPES: readonly MaterialType[] = [
  {
    id: "white-paperboard",
    label: "White paperboard",
    color: "#f4f1ea",
    grades: [
      { id: "wp-250", label: "250 g (0.35 mm)", thickness: 0.35 },
      { id: "wp-300", label: "300 g (0.42 mm)", thickness: 0.42 },
      { id: "wp-350", label: "350 g (0.5 mm)", thickness: 0.5 },
    ],
  },
  {
    id: "kraft-paperboard",
    label: "Kraft paperboard",
    color: "#c9a574",
    grades: [
      { id: "kp-250", label: "250 g (0.33 mm)", thickness: 0.33 },
      { id: "kp-350", label: "350 g (0.46 mm)", thickness: 0.46 },
    ],
  },
  {
    id: "art-paper",
    label: "Art paper",
    color: "#fbfbf8",
    grades: [
      { id: "ap-200", label: "200 g (0.2 mm)", thickness: 0.2 },
      { id: "ap-350", label: "350 g (0.32 mm)", thickness: 0.32 },
    ],
  },
  {
    id: "corrugated",
    label: "Corrugated board",
    color: "#c9a574",
    grades: [
      { id: "cb-n", label: "N-flute (0.5 mm)", thickness: 0.5 },
      { id: "cb-f", label: "F-flute (0.8 mm)", thickness: 0.8 },
      { id: "cb-e", label: "E-flute (1.5 mm)", thickness: 1.5 },
      { id: "cb-b", label: "B-flute (3 mm)", thickness: 3 },
      { id: "cb-c", label: "C-flute (4 mm)", thickness: 4 },
      { id: "cb-a", label: "A-flute (4.8 mm)", thickness: 4.8 },
    ],
  },
];

export const CUSTOM_GRADE = "custom";

/** Starting selection for a stored thickness: the first grade with that caliper, else custom in the closest family. */
export function materialFor(thickness: number): { typeId: string; gradeId: string } {
  for (const t of MATERIAL_TYPES) {
    const g = t.grades.find((x) => Math.abs(x.thickness - thickness) < 1e-9);
    if (g) return { typeId: t.id, gradeId: g.id };
  }
  return { typeId: thickness >= 0.8 ? "corrugated" : "white-paperboard", gradeId: CUSTOM_GRADE };
}
