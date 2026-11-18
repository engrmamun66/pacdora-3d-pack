import { flattenOutline, type DielineGeometry } from "@packaging/dieline-engine";

type Panel = DielineGeometry["foldTree"]["panels"][number];

/** The panel as one path (sheet mm): its outline, and its window holes as inner loops (fill it with the "evenodd" rule). */
export function panelFillPath(panel: Panel): Path2D {
  const path = new Path2D();
  const loop = (pts: readonly { x: number; y: number }[]) => {
    pts.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)));
    path.closePath();
  };
  loop(flattenOutline({ points: panel.polygon, ...(panel.bulges ? { bulges: panel.bulges } : {}) }));
  for (const h of panel.holes ?? []) loop(h);
  return path;
}

/** Fill the panels that have a face colour. The caller has set the transform to the sheet's frame. */
export function paintFaces(ctx: CanvasRenderingContext2D, geo: DielineGeometry, faces: Readonly<Record<string, string>>): void {
  for (const panel of geo.foldTree.panels) {
    const color = faces[panel.id];
    if (!color) continue;
    ctx.fillStyle = color;
    ctx.fill(panelFillPath(panel), "evenodd");
  }
}
