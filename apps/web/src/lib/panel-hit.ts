import { flattenOutline, type DielineGeometry } from "@packaging/dieline-engine";
import { pointIn, type P } from "./window-guides";

export interface PanelShape {
  id: string;
  poly: P[];
}

/** Every panel of the box as a plain polygon (sheet mm), arcs flattened. */
export function panelShapes(geo: DielineGeometry): PanelShape[] {
  return geo.foldTree.panels.map((p) => ({ id: p.id, poly: flattenOutline({ points: p.polygon, ...(p.bulges ? { bulges: p.bulges } : {}) }) }));
}

/** The panel under a point of the sheet (the smallest one when flaps overlap), or null. */
export function panelAt(shapes: readonly PanelShape[], pt: P): PanelShape | null {
  let best: PanelShape | null = null;
  let bestArea = Infinity;
  for (const s of shapes) {
    if (!pointIn(pt, s.poly)) continue;
    let a = 0;
    for (let i = 0; i < s.poly.length; i++) {
      const u = s.poly[i]!;
      const v = s.poly[(i + 1) % s.poly.length]!;
      a += u.x * v.y - v.x * u.y;
    }
    a = Math.abs(a) / 2;
    if (a < bestArea) {
      best = s;
      bestArea = a;
    }
  }
  return best;
}
