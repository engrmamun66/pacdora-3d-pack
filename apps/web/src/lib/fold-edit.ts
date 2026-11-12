import type { Construction, FoldHingeSpec, FoldPanelSpec, FoldSetup, PartPlacement } from "@packaging/dieline-engine";

/** Pure edits of a fold setup, used by the admin fold screen. Every function returns a new setup. */

export function updatePanel(setup: FoldSetup, id: string, patch: Partial<Pick<FoldPanelSpec, "label" | "role" | "printable">>): FoldSetup {
  return { ...setup, panels: setup.panels.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

export function updateHinge(setup: FoldSetup, id: string, patch: Partial<Pick<FoldHingeSpec, "angleDeg" | "order">>): FoldSetup {
  return { ...setup, hinges: setup.hinges.map((h) => (h.id === id ? { ...h, ...patch } : h)) };
}

/** Base panels: the main one first, then one per extra part. */
export const rootsOf = (setup: FoldSetup): string[] => [setup.rootId, ...(setup.parts ?? []).map((p) => p.rootId)];

/** Which piece a panel belongs to: 0 for the main body, 1.. for extra parts (-1 if none). */
export function pieceOf(setup: FoldSetup, panelId: string): number {
  const roots = rootsOf(setup);
  const adj = new Map<string, string[]>();
  for (const h of setup.hinges) {
    (adj.get(h.parentId) ?? adj.set(h.parentId, []).get(h.parentId)!).push(h.childId);
    (adj.get(h.childId) ?? adj.set(h.childId, []).get(h.childId)!).push(h.parentId);
  }
  const seen = new Set([panelId]);
  const queue = [panelId];
  for (let i = 0; i < queue.length; i++) {
    const at = roots.indexOf(queue[i]!);
    if (at >= 0) return at;
    for (const o of adj.get(queue[i]!) ?? []) {
      if (!seen.has(o)) {
        seen.add(o);
        queue.push(o);
      }
    }
  }
  return -1;
}

/**
 * Make another panel the one that stays flat (in its own piece: the main body or an extra
 * part). Hinges are turned around where needed so the parent is always the side nearer to
 * the new base. The folded result is the same shape (only its position in space changes).
 */
export function rootAt(setup: FoldSetup, newRootId: string): FoldSetup {
  if (!setup.panels.some((p) => p.id === newRootId)) return setup;
  const roots = rootsOf(setup);
  if (roots.includes(newRootId)) return setup;
  const piece = pieceOf(setup, newRootId);
  if (piece < 0) return setup;
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
  const hinges = setup.hinges.map((h) => next.get(h.id) ?? h);
  if (piece === 0) return { ...setup, rootId: newRootId, hinges };
  return { ...setup, hinges, parts: (setup.parts ?? []).map((p, i) => (i === piece - 1 ? { ...p, rootId: newRootId } : p)) };
}

/** Change how an extra part is placed in 3D. */
export function updatePart(setup: FoldSetup, rootId: string, placement: PartPlacement): FoldSetup {
  return { ...setup, parts: (setup.parts ?? []).map((p) => (p.rootId === rootId ? { ...p, placement } : p)) };
}

/** Rename a piece (empty = back to the default name) or change when it folds. */
export function updatePartMeta(setup: FoldSetup, rootId: string, patch: { name?: string; timing?: "together" | "after" }): FoldSetup {
  return {
    ...setup,
    parts: (setup.parts ?? []).map((p) => {
      if (p.rootId !== rootId) return p;
      const { name: _n, timing: _t, ...rest } = p;
      void _n;
      void _t;
      const name = patch.name !== undefined ? patch.name.trim().slice(0, 40) : p.name;
      const timing = patch.timing !== undefined ? patch.timing : p.timing;
      return { ...rest, ...(name ? { name } : {}), ...(timing === "after" ? { timing } : {}) };
    }),
  };
}

/** Rename the main body (empty = back to "Main body"). */
export function setMainName(setup: FoldSetup, name: string): FoldSetup {
  const { mainName: _old, ...rest } = setup;
  void _old;
  const n = name.trim().slice(0, 40);
  return n ? { ...rest, mainName: n } : rest;
}

/** The name of the piece whose base panel is `rootId`: the one the admin gave it, else "Main body" or "Part 2", "Part 3"... */
export function pieceNameOf(setup: FoldSetup, rootId: string): string {
  if (rootId === setup.rootId) return setup.mainName || "Main body";
  const i = (setup.parts ?? []).findIndex((p) => p.rootId === rootId);
  return (i >= 0 ? setup.parts![i]!.name : undefined) || `Part ${i + 2}`;
}

/**
 * Swap the main body with an extra part: the part's piece becomes the main one, the old main takes its place.
 * Names go with the pieces. Parts that were placed against the part (or the old main) follow it.
 */
export function makeMain(setup: FoldSetup, partRootId: string): FoldSetup {
  const parts = setup.parts ?? [];
  const chosen = parts.find((p) => p.rootId === partRootId);
  if (!chosen) return setup;
  const oldRoot = setup.rootId;
  const swap = (id: string | undefined) => (id === partRootId ? oldRoot : id === oldRoot ? partRootId : id);
  const { mainName: _old, ...rest } = setup;
  void _old;
  return {
    ...rest,
    rootId: partRootId,
    ...(chosen.name ? { mainName: chosen.name } : {}),
    parts: parts.map((p) => {
      const placement = p.placement.relativeTo !== undefined ? { ...p.placement, relativeTo: swap(p.placement.relativeTo) } : p.placement;
      if (p.rootId !== partRootId) return { ...p, placement };
      // the old main body becomes this part: it keeps the main body's name and is placed against the new main body
      const { relativeTo: _r, ...free } = placement;
      void _r;
      const { name: _n, ...noName } = p;
      void _n;
      return { ...noName, rootId: oldRoot, placement: free, ...(setup.mainName ? { name: setup.mainName } : {}) };
    }),
  };
}

/** Index of the piece (0 = main body, 1.. = extra parts, in order) each panel belongs to. */
export function pieceMap(setup: FoldSetup): Map<string, number> {
  const roots = rootsOf(setup);
  const children = new Map<string, string[]>();
  for (const h of setup.hinges) (children.get(h.parentId) ?? children.set(h.parentId, []).get(h.parentId)!).push(h.childId);
  const out = new Map<string, number>();
  roots.forEach((r, i) => {
    out.set(r, i);
    const queue = [r];
    for (let k = 0; k < queue.length; k++) {
      for (const c of children.get(queue[k]!) ?? []) {
        if (!out.has(c)) {
          out.set(c, i);
          queue.push(c);
        }
      }
    }
  });
  return out;
}

/** The fold lines of one piece (0 = main body). Without a piece: all of them. */
function inPiece(setup: FoldSetup, piece: number | undefined): FoldHingeSpec[] {
  if (piece === undefined) return [...setup.hinges];
  const map = pieceMap(setup);
  return setup.hinges.filter((h) => (map.get(h.childId) ?? 0) === piece);
}

/** Distinct fold steps in the order they happen (of one piece, or of all). */
export const stepsOf = (setup: FoldSetup, piece?: number): number[] => [...new Set(inPiece(setup, piece).map((h) => h.order))].sort((a, b) => a - b);

/** Fold lines in the order they happen (ties keep a stable order); of one piece, or of all. */
export const sortedHinges = (setup: FoldSetup, piece?: number): FoldHingeSpec[] => inPiece(setup, piece).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

/** Renumber the steps of the given lines (a piece's) 1, 2, 3... in the order of `seq`; the rest of the setup is untouched. */
function renumber(setup: FoldSetup, order: Map<string, number>): FoldSetup {
  return { ...setup, hinges: setup.hinges.map((h) => ({ ...h, order: order.get(h.id) ?? h.order })) };
}

/**
 * Move one fold line to another place in its piece's sequence and renumber that piece's steps 1, 2, 3...
 * Lines that shared a step keep sharing it. The moved line gets its own step, unless it is
 * dropped between two lines of the same step: then it joins them.
 */
export function moveHinge(setup: FoldSetup, id: string, toIndex: number): FoldSetup {
  const piece = pieceMap(setup).get(setup.hinges.find((h) => h.id === id)?.childId ?? "");
  const list = sortedHinges(setup, piece);
  const from = list.findIndex((h) => h.id === id);
  if (from < 0) return setup;
  const to = Math.min(list.length - 1, Math.max(0, Math.round(toIndex)));
  if (to === from) return setup;
  const moved = list[from]!;
  const rest = list.filter((h) => h.id !== id);
  const prev = rest[to - 1];
  const next = rest[to];
  const joins = prev && next && prev.order === next.order ? prev.order : null;
  const seq = [...rest.slice(0, to), moved, ...rest.slice(to)];
  const group = (h: FoldHingeSpec) => (h.id === id ? (joins ?? `own:${id}`) : h.order);
  const order = new Map<string, number>();
  let n = 0;
  seq.forEach((h, i) => {
    if (i === 0 || group(h) !== group(seq[i - 1]!)) n += 1;
    order.set(h.id, n);
  });
  return renumber(setup, order);
}

/**
 * Quick sort: fold the listed lines one after another, in the given order (step 1, 2, 3...).
 * Lines that are not listed come after them and keep their current order and any steps they
 * share. Unknown and repeated ids in the list are skipped. Each piece is sorted on its own:
 * a piece's listed lines are its first steps, in the order they were listed.
 */
export function applyFoldSequence(setup: FoldSetup, ids: readonly string[]): FoldSetup {
  const known = new Set(setup.hinges.map((h) => h.id));
  const chosen = [...new Set(ids)].filter((id) => known.has(id));
  if (!chosen.length) return setup;
  const map = pieceMap(setup);
  const pieceOfHinge = (id: string) => map.get(setup.hinges.find((h) => h.id === id)!.childId) ?? 0;
  const order = new Map<string, number>();
  for (let piece = 0; piece <= (setup.parts?.length ?? 0); piece++) {
    const mine = chosen.filter((id) => pieceOfHinge(id) === piece);
    if (!mine.length) continue;
    const picked = new Set(mine);
    mine.forEach((id, i) => order.set(id, i + 1));
    // The rest keep their relative steps: lines with the same old step still share one new step.
    let n = mine.length;
    let last: number | null = null;
    for (const h of sortedHinges(setup, piece).filter((x) => !picked.has(x.id))) {
      if (h.order !== last) n += 1;
      last = h.order;
      order.set(h.id, n);
    }
  }
  return renumber(setup, order);
}

/** Close gaps in the step numbers (1, 3, 3, 7 becomes 1, 2, 2, 3), piece by piece. */
export function compactOrders(setup: FoldSetup): FoldSetup {
  const order = new Map<string, number>();
  for (let piece = 0; piece <= (setup.parts?.length ?? 0); piece++) {
    const steps = stepsOf(setup, piece);
    for (const h of inPiece(setup, piece)) order.set(h.id, steps.indexOf(h.order) + 1);
  }
  return renumber(setup, order);
}

/** Number of hinges between a panel and the base panel. */
export function depthOf(setup: FoldSetup): Map<string, number> {
  const roots = rootsOf(setup);
  const depth = new Map<string, number>(roots.map((r) => [r, 0]));
  const queue = [...roots];
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

/** Choose the panel that lies flat on the ground in 3D (its printed side down); null = automatic. */
export function setGround(fold: FoldSetup, panelId: string | null): FoldSetup {
  const { groundId: _old, ...rest } = fold;
  void _old;
  return panelId && fold.panels.some((p) => p.id === panelId) ? { ...rest, groundId: panelId } : rest;
}

/**
 * Replace the box settings. Empty fields are dropped, and nothing left removes them (the page then
 * uses its guessed values).
 */
export function setConstruction(fold: FoldSetup, c: Construction | null): FoldSetup {
  const { construction: _old, ...rest } = fold;
  void _old;
  const clean = c ? (Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined && !(typeof v === "object" && v !== null && Object.keys(v).length === 0))) as Construction) : null;
  return clean && Object.keys(clean).length > 0 ? { ...rest, construction: clean } : rest;
}
