/**
 * Sample boxes for the Template Layouts preview: a few shapes (slim, cube, flat, wide ...) so a layout can be tried on
 * the kind of box it will be used for. Only the admin preview uses them; customers see their own template.
 */
export interface SampleBox {
  id: string;
  label: string;
  /** Which dieline generator, and its sizes in mm. */
  generatorId: string;
  params: Record<string, unknown>;
}

export const SAMPLE_BOXES: readonly SampleBox[] = [
  { id: "cube", label: "Cube box", generatorId: "tuck-end-carton", params: { variant: "straight", width: 90, depth: 90, height: 90 } },
  { id: "flat", label: "Flat box (pizza style)", generatorId: "tuck-end-carton", params: { variant: "straight", width: 200, depth: 200, height: 40 } },
  { id: "wide", label: "Wide box", generatorId: "tuck-end-carton", params: { variant: "straight", width: 150, depth: 50, height: 80 } },
  { id: "shipping", label: "Shipping box", generatorId: "slotted-box", params: { width: 300, depth: 200, height: 200 } },
];

/** A look to dress the sample box in: the plain board, a solid colour, or a gradient across the sheet. */
export interface SampleStyle {
  id: string;
  label: string;
  /** Board colour outside and inside (for a gradient, the outside is only the fallback; the gradient is painted over it). */
  outside: string;
  inside: string;
  /** A gradient painted on the outside: two colours and the direction in degrees (like CSS: 90 = left to right, 180 = top to bottom). */
  gradient?: { from: string; to: string; angleDeg: number };
}

/** The first one, "None", is the plain board: it takes the style away again. */
export const SAMPLE_STYLES: readonly SampleStyle[] = [
  { id: "none", label: "None", outside: "#c9a574", inside: "#bd9763" },
  { id: "yellow", label: "Color: yellow", outside: "#f2c14e", inside: "#dfae3a" },
  { id: "gold", label: "Gradient: gold", outside: "#d9b25a", inside: "#f1e6c8", gradient: { from: "#f6e08f", to: "#b88a2e", angleDeg: 135 } },
];

/** The CSS background of a style (for a swatch). */
export const styleCss = (x: SampleStyle) => (x.gradient ? `linear-gradient(${x.gradient.angleDeg}deg, ${x.gradient.from}, ${x.gradient.to})` : x.outside);

/** A style value that names a custom design is "design:<id>"; the others are the ready-made styles above. */
export const designStyle = (id: string) => `design:${id}`;
export const isDesignStyle = (v: string) => v.startsWith("design:");
export const designIdOf = (v: string) => v.slice("design:".length);
