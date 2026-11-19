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
