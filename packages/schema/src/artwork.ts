import { z } from "zod";

/**
 * Artwork placed on the dieline. Our own format (not a canvas library's
 * serialisation), so exporters and the 3D view never depend on the editor.
 *
 * Coordinates: millimetres in the flat sheet frame (x right, y down). Every
 * object is anchored to a panel: (dx, dy) is the object's CENTRE relative to
 * the anchor panel's bounding-box centre. When the box dimensions change, the
 * panel moves and the artwork moves with it. panelId null = anchored to the
 * sheet centre.
 */

/** Fonts we ship (SIL Open Font Licence, via @fontsource). Same files serve editor and exports. */
export const ARTWORK_FONTS = ["Inter", "Roboto", "Montserrat", "Oswald", "Lora", "Playfair Display"] as const;
export type ArtworkFont = (typeof ARTWORK_FONTS)[number];

/** 1 pt = 25.4 / 72 mm. */
export const MM_PER_PT = 25.4 / 72;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a #rrggbb colour");
const finite = z.number().finite();
const size = finite.min(0.1).max(5000);

const base = {
  id: z.string().min(1).max(40),
  name: z.string().max(80),
  panelId: z.string().min(1).max(60).nullable(),
  dx: finite.min(-10000).max(10000),
  dy: finite.min(-10000).max(10000),
  /** Clockwise rotation, degrees. */
  angle: finite.min(-360).max(360),
  opacity: finite.min(0).max(1),
  visible: z.boolean(),
  locked: z.boolean(),
};

const stroked = {
  fill: hex.nullable(),
  stroke: hex.nullable(),
  strokeWidth: finite.min(0).max(100),
};

export const textObject = z.object({
  ...base,
  type: z.literal("text"),
  text: z.string().max(5000),
  fontFamily: z.enum(ARTWORK_FONTS),
  fontSizePt: finite.min(1).max(1000),
  fontWeight: z.enum(["normal", "bold"]),
  fontStyle: z.enum(["normal", "italic"]),
  textAlign: z.enum(["left", "center", "right"]),
  lineHeight: finite.min(0.5).max(4),
  /** Text box width, mm (lines wrap inside it). */
  width: size,
  fill: hex,
});

export const imageObject = z.object({
  ...base,
  type: z.literal("image"),
  assetId: z.string().min(1).max(40),
  width: size,
  height: size,
  flipX: z.boolean(),
  flipY: z.boolean(),
});

export const rectObject = z.object({ ...base, ...stroked, type: z.literal("rect"), width: size, height: size, cornerRadius: finite.min(0).max(2500) });
export const ellipseObject = z.object({ ...base, ...stroked, type: z.literal("ellipse"), width: size, height: size });
export const lineObject = z.object({ ...base, type: z.literal("line"), length: size, stroke: hex, strokeWidth: finite.min(0.05).max(100) });

export const artworkObject = z.discriminatedUnion("type", [textObject, imageObject, rectObject, ellipseObject, lineObject]);
export type ArtworkObject = z.infer<typeof artworkObject>;
export type ArtworkType = ArtworkObject["type"];

export const artworkSchema = z
  .object({
    /** Bottom to top. */
    objects: z.array(artworkObject).max(2000),
  })
  .superRefine((a, ctx) => {
    const seen = new Set<string>();
    a.objects.forEach((o, i) => {
      if (seen.has(o.id)) ctx.addIssue({ code: "custom", path: ["objects", i, "id"], message: "duplicate object id" });
      seen.add(o.id);
    });
  });
export type Artwork = z.infer<typeof artworkSchema>;

/** Hard cap on the serialised artwork size accepted by the server. */
export const MAX_ARTWORK_JSON_BYTES = 1_000_000;
