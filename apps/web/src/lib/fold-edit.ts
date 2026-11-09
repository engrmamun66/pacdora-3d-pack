import type { FoldHingeSpec, FoldPanelSpec, FoldSetup } from "@packaging/dieline-engine";

/** Pure edits of a fold setup, used by the admin fold screen. Every function returns a new setup. */

export function updatePanel(setup: FoldSetup, id: string, patch: Partial<Pick<FoldPanelSpec, "label" | "role" | "printable">>): FoldSetup {
  return { ...setup, panels: setup.panels.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

export function updateHinge(setup: FoldSetup, id: string, patch: Partial<Pick<FoldHingeSpec, "angleDeg" | "order">>): FoldSetup {
  return { ...setup, hinges: setup.hinges.map((h) => (h.id === id ? { ...h, ...patch } : h)) };
}

/**
 * Make another panel the one that stays flat. Hinges are turned around where needed so
 * the parent is always the side nearer to the new base. The folded result is the same
 * shape (only its position in space changes).
 */
export function rootAt(setup: FoldSetup, newRootId: string): FoldSetup {
  if (!setup.panels.some((p) => p.id === newRootId) || newRootId === setup.rootId) return setup;
  const adj = new Map<string, FoldHingeSpec[]>();
  for (const h of setup.hinges) {
    (adj.get(h.parentId) ?? adj.set(h.parentId, []).get(h.parentId)!).push(h);
    (adj.get(h.childId) ?? adj.set(h.childId, []).get(h.childId)!).push(h);
  }
  const seen = new Set([newRootId]);
  const queue = [newRootId];
  const next = new Map<string, FoldHingeSpec>();
  while (queue.length) {
    const cur = queue.shift()!;
    for (const h of adj.get(cur) ?? []) {
      const other = h.parentId === cur ? h.childId : h.parentId;
      if (seen.has(other)) continue;
      seen.add(other);
      next.set(h.id, { ...h, parentId: cur, childId: other });
      queue.push(other);
    }
  }
  return { ...setup, rootId: newRootId, hinges: setup.hinges.map((h) => next.get(h.id) ?? h) };
}

/** Distinct fold steps in the order they happen. */
export const stepsOf = (setup: FoldSetup): number[] => [...new Set(setup.hinges.map((h) => h.order))].sort((a, b) => a - b);

/** Close gaps in the step numbers (1, 3, 3, 7 becomes 1, 2, 2, 3). */
export function compactOrders(setup: FoldSetup): FoldSetup {
  const steps = stepsOf(setup);
  return { ...setup, hinges: setup.hinges.map((h) => ({ ...h, order: steps.indexOf(h.order) + 1 })) };
}

/** Number of hinges between a panel and the base panel. */
export function depthOf(setup: FoldSetup): Map<string, number> {
  const depth = new Map<string, number>([[setup.rootId, 0]]);
  const queue = [setup.rootId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const h of setup.hinges) {
      if (h.parentId === cur && !depth.has(h.childId)) {
        depth.set(h.childId, depth.get(cur)! + 1);
        queue.push(h.childId);
      }
    }
  }
  return depth;
}

/** Short stable text for a set of lines, used to notice that the dieline changed under a fold setup. */
export function linesKey(flat: { cut: readonly { pts: readonly number[]; closed: boolean }[]; crease: readonly { pts: readonly number[]; closed: boolean }[] }): string {
  let h = 2166136261;
  const feed = (n: number) => {
    h ^= Math.round(n * 1000);
    h = Math.imul(h, 16777619);
  };
  for (const group of [flat.cut, flat.crease]) {
    feed(group.length);
    for (const p of group) {
      feed(p.closed ? 1 : 0);
      feed(p.pts.length);
      for (const v of p.pts) feed(v);
    }
  }
  return (h >>> 0).toString(36);
}
