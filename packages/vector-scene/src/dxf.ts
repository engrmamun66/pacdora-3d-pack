import { type DielineGeometry, type Outline, type WatermarkSpec, layoutWatermark } from "@packaging/dieline-engine";

/**
 * DXF (AutoCAD R12 / AC1009, ASCII) of the die lines only, for cutting tables
 * and CAD. Layers CUT and CREASE (and WATERMARK when a watermark is asked for). Units are millimetres (R12 has no unit
 * field). Y is flipped to DXF's y-up frame with the sheet's lower-left corner
 * at (0, 0); arcs are kept as true arcs (polyline bulges).
 */
export function dielineToDxf(geo: DielineGeometry, watermark: WatermarkSpec | null = null): string {
  const { min, max } = geo.cutBounds;
  const X = (x: number) => x - min.x;
  const Y = (y: number) => max.y - y;
  const f = (v: number) => (Math.round(v * 1e6) / 1e6).toString();
  const out: string[] = [];
  const g = (code: number, value: string | number) => out.push(String(code), typeof value === "number" ? f(value) : value);

  g(0, "SECTION");
  g(2, "HEADER");
  g(9, "$ACADVER");
  g(1, "AC1009");
  g(9, "$EXTMIN");
  g(10, 0);
  g(20, 0);
  g(9, "$EXTMAX");
  g(10, max.x - min.x);
  g(20, max.y - min.y);
  g(0, "ENDSEC");

  g(0, "SECTION");
  g(2, "TABLES");
  g(0, "TABLE");
  g(2, "LTYPE");
  g(70, "1");
  g(0, "LTYPE");
  g(2, "CONTINUOUS");
  g(70, "0");
  g(3, "Solid line");
  g(72, "65");
  g(73, "0");
  g(40, 0);
  g(0, "ENDTAB");
  g(0, "TABLE");
  g(2, "LAYER");
  const mark = watermark && watermark.text.trim() ? layoutWatermark(geo, watermark) : null;
  g(70, mark ? "3" : "2");
  for (const [name, color] of [["CUT", "6"], ["CREASE", "4"], ...(mark ? ([["WATERMARK", "8"]] as const) : [])] as const) {
    g(0, "LAYER");
    g(2, name);
    g(70, "0");
    g(62, color);
    g(6, "CONTINUOUS");
  }
  g(0, "ENDTAB");
  g(0, "ENDSEC");

  g(0, "SECTION");
  g(2, "ENTITIES");
  const polyline = (o: Outline) => {
    g(0, "POLYLINE");
    g(8, "CUT");
    g(66, "1");
    g(70, "1"); // closed
    o.points.forEach((p, i) => {
      g(0, "VERTEX");
      g(8, "CUT");
      g(10, X(p.x));
      g(20, Y(p.y));
      const b = o.bulges?.[i] ?? 0;
      if (b !== 0) g(42, -b); // mirrored frame reverses arc direction
    });
    g(0, "SEQEND");
    g(8, "CUT");
  };
  const line = (layer: string, a: { x: number; y: number }, b: { x: number; y: number }) => {
    g(0, "LINE");
    g(8, layer);
    g(10, X(a.x));
    g(20, Y(a.y));
    g(11, X(b.x));
    g(21, Y(b.y));
  };
  geo.cutLoops.forEach(polyline);
  geo.slitLines.forEach((s) => line("CUT", s.a, s.b));
  geo.creaseLines.forEach((c) => line("CREASE", c.a, c.b));
  if (mark && watermark) {
    // On its own layer, so a cutter can leave it out. Centred text: both alignment points are the crossing.
    for (const [x1, y1, x2, y2] of mark.lines) line("WATERMARK", { x: x1, y: y1 }, { x: x2, y: y2 });
    for (const t of mark.texts) {
      g(0, "TEXT");
      g(8, "WATERMARK");
      g(10, X(t.x));
      g(20, Y(t.y));
      g(40, watermark.fontSize);
      g(1, watermark.text.trim());
      g(72, "1");
      g(11, X(t.x));
      g(21, Y(t.y));
      g(73, "2");
    }
  }
  g(0, "ENDSEC");
  g(0, "EOF");
  return out.join("\r\n") + "\r\n";
}
