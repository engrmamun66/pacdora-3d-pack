import type { DielineGeometry, ParamDescriptor } from "@packaging/dieline-engine";

/** Which panels a setting changes the size of, and the other way round. Free of the DOM and React. */
export interface ParamPanels {
  /** setting key -> ids of the panels that get bigger or smaller when it changes. */
  readonly byParam: ReadonlyMap<string, readonly string[]>;
  /** panel id -> keys of the settings that change that panel's size. */
  readonly byPanel: ReadonlyMap<string, readonly string[]>;
}

const sizesOf = (geo: DielineGeometry): Map<string, { w: number; h: number }> => {
  const out = new Map<string, { w: number; h: number }>();
  for (const p of geo.foldTree.panels) {
    if (p.polygon.length < 3) continue;
    const xs = p.polygon.map((v) => v.x);
    const ys = p.polygon.map((v) => v.y);
    out.set(p.id, { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
  }
  return out;
};

/**
 * Find out which panels each number setting reaches by trying it: change the setting a little, draw the dieline again and see
 * which panels came out a different size. This works for any template (built in or imported) without knowing its rules.
 * A setting that changes most of the panels (the board thickness, say) is left out, as pointing at everything says nothing.
 * `generate` may throw for a value it does not like; that setting is then skipped.
 */
export function computeParamPanels(generate: (input: Record<string, unknown>) => DielineGeometry, input: Record<string, unknown>, params: readonly ParamDescriptor[], base: Record<string, unknown> = input): ParamPanels {
  const byParam = new Map<string, string[]>();
  const byPanel = new Map<string, string[]>();
  let before: Map<string, { w: number; h: number }>;
  try {
    before = sizesOf(generate(input));
  } catch {
    return { byParam, byPanel };
  }
  for (const p of params) {
    if (p.kind !== "number") continue;
    const now = typeof input[p.key] === "number" ? (input[p.key] as number) : typeof base[p.key] === "number" ? (base[p.key] as number) : null;
    if (now === null) continue;
    const to = now + 1 <= p.max ? now + 1 : now - 1;
    if (to < p.min) continue;
    let after: Map<string, { w: number; h: number }>;
    try {
      after = sizesOf(generate({ ...input, [p.key]: to }));
    } catch {
      continue;
    }
    const hit: string[] = [];
    for (const [id, was] of before) {
      const is = after.get(id);
      if (is && (Math.abs(is.w - was.w) > 0.01 || Math.abs(is.h - was.h) > 0.01)) hit.push(id);
    }
    if (hit.length === 0 || hit.length > before.size * 0.6) continue;
    byParam.set(p.key, hit);
    for (const id of hit) byPanel.set(id, [...(byPanel.get(id) ?? []), p.key]);
  }
  return { byParam, byPanel };
}
