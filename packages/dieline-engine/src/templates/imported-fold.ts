import type { FlatDieline } from "./imported";
import type { PanelRole, PartPlacement } from "../fold-tree/types";
import { type Construction, validateConstruction } from "./imported-construction";
import { detectFoldSetup as detect } from "./imported-fold-detect";
import { HINGE_TOLERANCE, flatSignedArea, segmentOnPolygonEdge } from "./imported-fold-util";

/**
 * How an imported (flat) dieline folds into 3D. Set up by a super admin (auto-detected
 * first, then corrected by hand). All coordinates are millimetres in the SAME frame as the
 * imported lines (x right, y down), before any width scaling.
 */

export interface FoldPanelSpec {
  readonly id: string;
  /** Shown to the admin, e.g. "Front", "Top lid". */
  readonly label: string;
  readonly role: PanelRole;
  /** True if artwork may be printed on it. */
  readonly printable: boolean;
  /** Outline, x,y,x,y,... (no repeated first point). */
  readonly polygon: readonly number[];
}

export interface FoldHingeSpec {
  readonly id: string;
  /** The panel that stays where it is when this hinge folds. */
  readonly parentId: string;
  /** The panel that swings about the hinge (with everything attached to it). */
  readonly childId: string;
  /** Hinge segment, [x1, y1, x2, y2]. Must lie on an edge of both panels. */
  readonly line: readonly [number, number, number, number];
  /**
   * Fold angle in degrees when the box is closed, -180..180 (not 0).
   * Positive: the child swings toward the inside, printed side stays outside (normal box fold).
   * Negative: the opposite direction.
   */
  readonly angleDeg: number;
  /** 1-based fold step. Steps happen one after another in the animation; equal numbers fold together. */
  readonly order: number;
}

/**
 * A second piece on the same sheet (for example the lid next to the box). Its panels hang
 * off `rootId`; `placement` says where it goes in 3D relative to the main body.
 */
export interface FoldPartSpec {
  /** The panel of this piece that stays flat (like the main `rootId`). */
  readonly rootId: string;
  readonly placement: PartPlacement;
}

export interface FoldSetup {
  /** Base panel of the main body. */
  readonly rootId: string;
  readonly panels: readonly FoldPanelSpec[];
  readonly hinges: readonly FoldHingeSpec[];
  /** Extra pieces (lid, insert...), each with its own base panel. Absent or empty for a single piece. */
  readonly parts?: readonly FoldPartSpec[];
  /**
   * The panel that lies flat on the ground in 3D, printed side down (the bottom of the box).
   * Absent = automatic.
   */
  readonly groundId?: string;
  /** Box settings (thickness, size mode, names of the sizes, flap sizes) the admin set. Absent = guessed. */
  readonly construction?: Construction;
}

export const MAX_FOLD_PARTS = 8;
export const PLACEMENT_MODES = ["closed", "open", "beside"] as const;

export interface DetectResult {
  readonly setup: FoldSetup;
  /** Plain-language notes for the admin (e.g. "2 fold lines could not be used"). */
  readonly warnings: readonly string[];
}

/** Find panels (regions enclosed by cut and fold lines) and a hinge tree. Never throws on odd input: returns warnings. */
export function detectFoldSetup(flat: FlatDieline): DetectResult {
  return detect(flat);
}

/** Problems that make a setup unusable (empty list = fine). Used on save, server side. */
export function validateFoldSetup(setup: FoldSetup): string[] {
  const problems: string[] = [];
  const panels = setup?.panels ?? [];
  const hinges = setup?.hinges ?? [];
  if (panels.length === 0) return ["The fold setup has no panels."];

  const name = (p: FoldPanelSpec) => (p.label ? `"${p.label}"` : `"${p.id}"`);
  const byId = new Map<string, FoldPanelSpec>();
  const dupPanels = new Set<string>();
  for (const p of panels) {
    if (byId.has(p.id)) dupPanels.add(p.id);
    else byId.set(p.id, p);
  }
  for (const id of dupPanels) problems.push(`Panel id "${id}" is used more than once.`);
  if (!byId.has(setup.rootId)) problems.push(`The root panel "${setup.rootId}" does not exist.`);
  if (setup.groundId !== undefined && !byId.has(setup.groundId)) problems.push(`The ground panel "${setup.groundId}" does not exist.`);

  for (const p of panels) {
    const poly = p.polygon ?? [];
    if (poly.length % 2 !== 0 || poly.length < 6 || !poly.every((v) => Number.isFinite(v))) {
      problems.push(`${name(p)} needs an outline of at least 3 points.`);
    } else if (Math.abs(flatSignedArea(poly)) < 1e-6) {
      problems.push(`${name(p)} has no area.`);
    }
  }

  const hingeIds = new Set<string>();
  const dupHinges = new Set<string>();
  for (const h of hinges) {
    if (hingeIds.has(h.id)) dupHinges.add(h.id);
    hingeIds.add(h.id);
  }
  for (const id of dupHinges) problems.push(`Fold id "${id}" is used more than once.`);

  const label = (id: string) => {
    const p = byId.get(id);
    return p ? name(p) : `"${id}"`;
  };
  const validHinges: FoldHingeSpec[] = [];
  for (const h of hinges) {
    const parent = byId.get(h.parentId);
    const child = byId.get(h.childId);
    if (!parent || !child) {
      problems.push(`Fold "${h.id}" refers to a panel that does not exist (${!parent ? h.parentId : h.childId}).`);
      continue;
    }
    if (parent === child) {
      problems.push(`Fold "${h.id}" joins ${name(parent)} to itself.`);
      continue;
    }
    validHinges.push(h);
    const where = `Fold between ${name(parent)} and ${name(child)}`;
    if (!Number.isFinite(h.angleDeg) || h.angleDeg === 0 || Math.abs(h.angleDeg) > 180) {
      problems.push(`${where} needs an angle between -180 and 180 degrees, not 0.`);
    }
    if (!Number.isInteger(h.order) || h.order < 1) {
      problems.push(`${where} needs a fold step that is a whole number of 1 or more.`);
    }
    const line = h.line;
    if (!line || line.length !== 4 || !line.every((v) => Number.isFinite(v))) {
      problems.push(`${where} has no valid fold line.`);
    } else if (Math.hypot(line[2] - line[0], line[3] - line[1]) < 1e-6) {
      problems.push(`${where} has a fold line with no length.`);
    } else if (!segmentOnPolygonEdge(parent.polygon, line, HINGE_TOLERANCE) || !segmentOnPolygonEdge(child.polygon, line, HINGE_TOLERANCE)) {
      problems.push(`${where} does not lie along an edge of both panels.`);
    }
  }

  // The folds must form trees hanging from the base panels: the main one, plus one per extra part.
  const parts = setup.parts ?? [];
  const roots = [setup.rootId, ...parts.map((p) => p.rootId)];
  if (parts.length > MAX_FOLD_PARTS) problems.push(`There can be at most ${MAX_FOLD_PARTS} extra parts.`);
  const partRoots = new Set<string>();
  for (const part of parts) {
    if (!byId.has(part.rootId)) problems.push(`The base panel "${part.rootId}" of an extra part does not exist.`);
    else if (part.rootId === setup.rootId) problems.push(`${label(part.rootId)} is the main base panel, so it cannot also be the base of an extra part.`);
    else if (partRoots.has(part.rootId)) problems.push(`${label(part.rootId)} is the base of more than one extra part.`);
    partRoots.add(part.rootId);
    const pl = part.placement;
    if (!pl || !(PLACEMENT_MODES as readonly string[]).includes(pl.mode)) problems.push(`The part with base ${label(part.rootId)} needs a placement: closed, open or beside.`);
    else if (pl.openDeg !== undefined && (!Number.isFinite(pl.openDeg) || pl.openDeg < 0 || pl.openDeg > 120)) problems.push(`The opening angle of the part with base ${label(part.rootId)} must be between 0 and 120 degrees.`);
  }
  if (byId.has(setup.rootId) && dupPanels.size === 0) {
    const incoming = new Map<string, number>();
    const children = new Map<string, string[]>();
    for (const h of validHinges) {
      incoming.set(h.childId, (incoming.get(h.childId) ?? 0) + 1);
      const l = children.get(h.parentId) ?? [];
      l.push(h.childId);
      children.set(h.parentId, l);
    }
    for (const r of roots) {
      if (incoming.has(r)) problems.push(`The base panel ${label(r)} cannot also fold off another panel.`);
    }
    for (const [id, n] of incoming) {
      if (n > 1 && !roots.includes(id)) problems.push(`${label(id)} is folded by ${n} different folds. A panel can only hang off one.`);
    }
    const reached = new Set<string>();
    const queue: string[] = [];
    for (const r of roots) {
      if (!byId.has(r) || reached.has(r)) continue;
      reached.add(r);
      queue.push(r);
    }
    for (let i = 0; i < queue.length; i++) {
      for (const c of children.get(queue[i]!) ?? []) {
        if (reached.has(c)) continue;
        reached.add(c);
        queue.push(c);
      }
    }
    const lost = panels.filter((p) => !reached.has(p.id));
    if (lost.length > 0) {
      problems.push(`The folds do not form one connected tree from the root (a loop, or no fold reaches): ${lost.map(name).join(", ")}.`);
    }
  }
  problems.push(...validateConstruction(setup.construction));
  return problems;
}
