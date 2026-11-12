import type { DielineGeometry } from "@packaging/dieline-engine";

export type Unit = "mm" | "in";
export const MM_PER_INCH = 25.4;

/**
 * mm (as stored) -> text shown in the chosen unit, with at most `digits` digits after the point (default 2).
 * Only what is shown is rounded; the stored value keeps its precision. Empty stays empty.
 */
export function toDisplay(mmText: string, unit: Unit, digits = 2): string {
  if (mmText.trim() === "") return mmText;
  const v = Number(mmText);
  if (!Number.isFinite(v)) return mmText;
  const f = 10 ** digits;
  return String(Math.round((unit === "mm" ? v : v / MM_PER_INCH) * f) / f);
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
  /** Name without the thickness, e.g. "210g white paperboard". */
  readonly name: string;
  /** Caliper in mm. For a grade that is not `fixed`, the starting value. */
  readonly thickness: number;
  /** True: the material decides the thickness. False: the customer may change it (see `suggest`). */
  readonly fixed: boolean;
  /** Suggested range (mm) for a grade whose thickness can be changed. */
  readonly suggest?: readonly [number, number];
}
export interface MaterialType {
  readonly id: string;
  readonly label: string;
  /** Board colour used in the 3D preview. */
  readonly color: string;
  readonly grades: readonly MaterialGrade[];
}

const fixed = (id: string, name: string, thickness: number): MaterialGrade => ({ id, name, thickness, fixed: true });
const adjustable = (id: string, name: string, thickness: number, suggest: readonly [number, number]): MaterialGrade => ({ id, name, thickness, fixed: false, suggest });
const mid = (r: readonly [number, number]) => Math.round(((r[0] + r[1]) / 2) * 10) / 10;

export const CUSTOM_GRADE = "custom";

/**
 * Board families and grades (calipers in mm). Typical values, not supplier data.
 * A fixed grade sets the board thickness; a flute or a "Custom ..." grade lets the customer type it.
 * The thickness feeds the engine, which adds `allowanceFactor x thickness` at the folds.
 */
export const MATERIAL_TYPES: readonly MaterialType[] = [
  {
    id: "white-paperboard",
    label: "White paperboard",
    color: "#f4f1ea",
    grades: [
      fixed("wp-210", "210g white paperboard", 0.27),
      fixed("wp-250", "250g white paperboard", 0.35),
      fixed("wp-300", "300g white paperboard", 0.42),
      fixed("wp-350", "350g white paperboard", 0.5),
      fixed("wp-400", "400g white paperboard", 0.55),
      adjustable(CUSTOM_GRADE, "Custom white paperboard", 1.5, [0.2, 0.8]),
    ],
  },
  {
    id: "kraft-paperboard",
    label: "Kraft paperboard",
    color: "#c9a574",
    grades: [
      fixed("kp-190", "190g kraft paperboard", 0.26),
      fixed("kp-250", "250g kraft paperboard", 0.33),
      fixed("kp-350", "350g kraft paperboard", 0.46),
      adjustable(CUSTOM_GRADE, "Custom kraft paperboard", 0.5, [0.2, 0.8]),
    ],
  },
  {
    id: "art-paper",
    label: "Art paper",
    color: "#fbfbf8",
    grades: [
      fixed("ap-200", "200g art paper", 0.2),
      fixed("ap-350", "350g art paper", 0.32),
      adjustable(CUSTOM_GRADE, "Custom art paper", 0.2, [0.2, 0.5]),
    ],
  },
  {
    id: "corrugated",
    label: "Corrugated board",
    color: "#c9a574",
    grades: [
      adjustable("cb-n", "N-flute", mid([0.8, 1]), [0.8, 1]),
      adjustable("cb-f", "F-flute", mid([1, 1.2]), [1, 1.2]),
      adjustable("cb-e", "E-flute", 1.5, [1.1, 2]),
      adjustable("cb-b", "B-flute", 2.8, [2.5, 3]),
      adjustable(CUSTOM_GRADE, "Custom corrugated board", 1.5, [0.8, 3]),
    ],
  },
];

const trim = (n: number, digits: number) => String(Math.round(n * 10 ** digits) / 10 ** digits);

/** A length in mm shown in the chosen unit: "0.27 mm" or "0.0106 in". */
export function fmtLength(mm: number, unit: Unit): string {
  return unit === "mm" ? `${trim(mm, 3)} mm` : `${trim(mm / MM_PER_INCH, 4)} in`;
}

/** A range in mm shown in the chosen unit: "0.8~3 mm". */
export function fmtRange(r: readonly [number, number], unit: Unit): string {
  const f = (v: number) => (unit === "mm" ? trim(v, 3) : trim(v / MM_PER_INCH, 4));
  return `${f(r[0])}~${f(r[1])} ${unit}`;
}

/** Label of a grade in the sub-item list; a fixed grade shows its thickness. */
export const gradeLabel = (g: MaterialGrade, unit: Unit): string => (g.fixed ? `${g.name} (${fmtLength(g.thickness, unit)})` : g.name);

/**
 * The families and grades a template can use. A grade is offered when its thickness fits the
 * template's range (a slotted shipping box takes corrugated board, not 0.3 mm paperboard);
 * a family only when it has at least one such grade that is not "Custom".
 */
export function materialsFor(min: number, max: number): MaterialType[] {
  const ok = (g: MaterialGrade) => g.thickness >= min - 1e-9 && g.thickness <= max + 1e-9;
  return MATERIAL_TYPES.map((t) => ({ ...t, grades: t.grades.filter(ok) })).filter((t) => t.grades.some((g) => g.id !== CUSTOM_GRADE));
}

/** Starting selection for a stored thickness: the first fixed grade with that caliper, else "Custom" in the closest family. */
export function materialFor(thickness: number, types: readonly MaterialType[] = MATERIAL_TYPES): { typeId: string; gradeId: string } {
  for (const t of types) {
    const g = t.grades.find((x) => x.fixed && Math.abs(x.thickness - thickness) < 1e-9);
    if (g) return { typeId: t.id, gradeId: g.id };
  }
  const pref = thickness >= 0.8 ? "corrugated" : "white-paperboard";
  const t = types.find((x) => x.id === pref && x.grades.some((g) => g.id === CUSTOM_GRADE)) ?? types.find((x) => x.grades.some((g) => g.id === CUSTOM_GRADE)) ?? types[0]!;
  return { typeId: t.id, gradeId: t.grades.some((g) => g.id === CUSTOM_GRADE) ? CUSTOM_GRADE : t.grades[0]!.id };
}
