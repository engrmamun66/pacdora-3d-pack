import type { FoldSetup } from "./imported-fold";
import { type FlapClass, type PartSizes, type ResizePlan, planResize } from "./imported-resize";

/**
 * Box settings of an imported dieline, set by the admin (and first guessed from the file).
 * They give the dieline page the same kinds of options a built-in carton has: real box
 * Width / Depth / Height, board thickness, size mode (inner or crease-to-crease), flap sizes.
 *
 * The drawing itself is always crease-to-crease (that is what the lines are). "Inner" mode
 * shows the size of the inside of the box instead: crease-to-crease minus allowance x thickness.
 */

export type DimName = "width" | "depth" | "height";
export type SizeMode = "manufacture" | "inner";

export const DIM_NAMES: readonly DimName[] = ["width", "depth", "height"];
/** The three box sizes the sheet can follow: the base panel's x, its y, and how tall the walls stand. */
export const DIM_KEYS = ["baseWidth", "baseHeight", "boxHeight"] as const;
export type DimKey = (typeof DIM_KEYS)[number];
/** Flap sizes, offered only when the admin marked such flaps and the sheet allows stretching them. */
export const FLAP_SIZE_KEYS = ["tuckDepth", "glueFlapWidth", "dustFlapDepth"] as const;
export type FlapKey = (typeof FLAP_SIZE_KEYS)[number];

export interface Construction {
  /** Default size mode of the page. Default "manufacture". */
  readonly sizeMode?: SizeMode;
  /** Board thickness (mm) the page starts with, and the one the drawing was made for. Default 0.5. */
  readonly thickness?: number;
  /** Inner mode: crease-to-crease = inner + allowanceFactor x thickness. Default 1. */
  readonly allowanceFactor?: number;
  /** Slot between a dust flap and the closure beside it = cutGapFactor x thickness. Information only. Default 1. */
  readonly cutGapFactor?: number;
  /** What each of the three sizes is called. Missing = guessed from the sizes. */
  readonly names?: Partial<Record<DimKey, DimName>>;
  /** Sizes the page starts with, in mm (dimensions in the default size mode). Missing = as drawn. */
  readonly start?: PartSizes;
  /** Flap sizes customers may change. Off unless switched on: a flap can only be resized where nothing but flaps of its kind cover the sheet, so the panel kinds must be right first. */
  readonly flaps?: readonly FlapKey[];
}

export interface ResolvedConstruction {
  readonly sizeMode: SizeMode;
  readonly thickness: number;
  readonly allowanceFactor: number;
  readonly cutGapFactor: number;
  readonly names: Record<DimKey, DimName>;
  readonly start: PartSizes;
  readonly flaps: readonly FlapKey[];
}

export const CONSTRUCTION_DEFAULTS = { sizeMode: "manufacture", thickness: 0.5, allowanceFactor: 1, cutGapFactor: 1 } as const;
export const THICKNESS_RANGE = { min: 0.05, max: 5 } as const;
export const FACTOR_RANGE = { min: 0, max: 5 } as const;

const CLASS_OF_FLAP: Record<FlapKey, FlapClass> = { tuckDepth: "T", glueFlapWidth: "G", dustFlapDepth: "F" };

/** The resize plan of a fold setup, with the flap sizes the admin switched on. Null if the sheet cannot be stretched. */
export function importedPlan(fold: FoldSetup | null | undefined): ResizePlan | null {
  return planResize(fold, (fold?.construction?.flaps ?? []).map((k) => CLASS_OF_FLAP[k]));
}

/** The plan with every flap size measured (admin screen: shows what each could be). */
export function fullPlan(fold: FoldSetup | null | undefined): ResizePlan | null {
  return planResize(fold, ["T", "G", "F"]);
}

/**
 * Best guess of which size is the box's width, depth and height. A tube carton (it has tuck
 * flaps) is usually taller than wide: the largest size is its height. Anything else (tray,
 * mailer) is usually shallow: the smallest is its height. Of the other two, the larger is the width.
 */
export function predictNames(plan: ResizePlan): Record<DimKey, DimName> {
  const sizes = DIM_KEYS.map((key) => ({ key, v: plan.natural[key] }));
  const byLength = [...sizes].sort((a, b) => b.v - a.v);
  const tube = plan.tube;
  const height = tube ? byLength[0]! : byLength[2]!;
  const rest = byLength.filter((s) => s !== height);
  const out = { [height.key]: "height", [rest[0]!.key]: "width", [rest[1]!.key]: "depth" } as Record<DimKey, DimName>;
  return out;
}

/** Fill the gaps in what the admin saved. */
export function resolveConstruction(c: Construction | undefined, plan: ResizePlan): ResolvedConstruction {
  const guess = predictNames(plan);
  const names = { ...guess };
  // Chosen names win, as long as the three stay different (else fall back to the guess).
  const chosen = { ...guess, ...(c?.names ?? {}) };
  if (new Set(Object.values(chosen)).size === 3) Object.assign(names, chosen);
  return {
    sizeMode: c?.sizeMode ?? CONSTRUCTION_DEFAULTS.sizeMode,
    thickness: c?.thickness ?? CONSTRUCTION_DEFAULTS.thickness,
    allowanceFactor: c?.allowanceFactor ?? CONSTRUCTION_DEFAULTS.allowanceFactor,
    cutGapFactor: c?.cutGapFactor ?? CONSTRUCTION_DEFAULTS.cutGapFactor,
    names,
    start: c?.start ?? {},
    flaps: c?.flaps ?? [],
  };
}

/** Problems with what an admin saved (empty = fine). */
export function validateConstruction(c: Construction | undefined): string[] {
  if (!c) return [];
  const out: string[] = [];
  const num = (v: number | undefined, label: string, min: number, max: number) => {
    if (v !== undefined && !(Number.isFinite(v) && v >= min && v <= max)) out.push(`${label} must be between ${min} and ${max}.`);
  };
  if (c.sizeMode !== undefined && c.sizeMode !== "manufacture" && c.sizeMode !== "inner") out.push("Size mode must be manufacture or inner.");
  num(c.thickness, "Board thickness", THICKNESS_RANGE.min, THICKNESS_RANGE.max);
  num(c.allowanceFactor, "Allowance", FACTOR_RANGE.min, FACTOR_RANGE.max);
  num(c.cutGapFactor, "Cut gap", FACTOR_RANGE.min, FACTOR_RANGE.max);
  if (c.names) {
    const given = Object.values(c.names);
    if (given.some((n) => !DIM_NAMES.includes(n))) out.push("A box size has an unknown name.");
    else if (new Set(given).size !== given.length) out.push("Width, depth and height must each be used once.");
  }
  if (c.flaps && c.flaps.some((k) => !(FLAP_SIZE_KEYS as readonly string[]).includes(k))) out.push("A flap size has an unknown name.");
  for (const [k, v] of Object.entries(c.start ?? {})) num(v, `Starting ${k}`, 0.1, 10000);
  return out;
}

/** How much larger the sheet is than the box's inside, per dimension: allowance x thickness in inner mode. */
export const sizeOffset = (mode: SizeMode, allowance: number, thickness: number): number => (mode === "inner" ? allowance * thickness : 0);

export interface SizeInput {
  readonly mode: SizeMode;
  readonly thickness: number;
  readonly allowance: number;
  /** What the customer typed (dimensions in `mode`; flaps in mm). */
  readonly typed: PartSizes;
}

export interface SizeTargets {
  /** Crease-to-crease sizes the sheet must have (only those that differ from the plain scale). */
  readonly sizes: PartSizes;
  /** The value of every offered size as the customer sees it (dimensions in `mode`). */
  readonly shown: Record<string, number>;
  /** Allowed range (as shown) for each offered size. */
  readonly range: Record<string, { min: number; max: number }>;
}

/** Work out the sheet's part sizes from the box settings, the overall scale `k` and what the customer typed. */
export function sizeTargets(plan: ResizePlan, c: ResolvedConstruction, k: number, input: SizeInput): SizeTargets {
  const off = sizeOffset(input.mode, input.allowance, input.thickness);
  const adminOff = sizeOffset(c.sizeMode, input.allowance, c.thickness);
  const sizes: Record<string, number> = {};
  const shown: Record<string, number> = {};
  const range: Record<string, { min: number; max: number }> = {};
  const keys = [...DIM_KEYS, ...FLAP_SIZE_KEYS] as const;
  for (const key of keys) {
    const natural = plan.natural[key as keyof ResizePlan["natural"]];
    if (natural === undefined) continue;
    const plain = natural * k;
    const isDim = (DIM_KEYS as readonly string[]).includes(key);
    const typed = input.typed[key];
    const start = c.start[key];
    // Crease-to-crease size with nothing typed: the starting size, or as drawn; the inside stays the same when the board thickness changes.
    const base = start !== undefined ? start + (isDim ? adminOff : 0) : plain;
    const byDefault = isDim && input.mode === "inner" ? base + input.allowance * (input.thickness - c.thickness) : base;
    const crease = typed !== undefined ? typed + (isDim ? off : 0) : byDefault;
    if (Math.abs(crease - plain) > 1e-9) sizes[key] = crease;
    shown[key] = typed !== undefined ? typed : crease - (isDim ? off : 0);
    const dimOff = isDim ? off : 0;
    range[key] = { min: Math.max(0.1, plain * 0.1 - dimOff), max: plain * 10 - dimOff };
  }
  return { sizes: sizes as PartSizes, shown, range };
}

/**
 * Crease-to-crease sizes of a generated imported dieline, read back from its resolved `params`
 * (what `scaleImportedPaths` needs to put other lines of the file on the stretched sheet).
 */
export function creaseSizesOf(params: unknown): PartSizes {
  const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
  const n = (k: string) => (typeof p[k] === "number" && Number.isFinite(p[k]) ? (p[k] as number) : undefined);
  const mode: SizeMode = p.sizeMode === "inner" ? "inner" : "manufacture";
  const off = sizeOffset(mode, n("allowanceFactor") ?? CONSTRUCTION_DEFAULTS.allowanceFactor, n("thickness") ?? CONSTRUCTION_DEFAULTS.thickness);
  const out: Record<string, number> = {};
  for (const key of DIM_KEYS) {
    const v = n(key);
    if (v !== undefined) out[key] = v + off;
  }
  for (const key of FLAP_SIZE_KEYS) {
    const v = n(key);
    if (v !== undefined) out[key] = v;
  }
  return out as PartSizes;
}
