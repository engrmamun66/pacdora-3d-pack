import { Ellipse, FabricImage, type FabricObject, Line, Point, Rect, Textbox, util } from "fabric";
import { type AnchorIndex, anchorFor, objectCentre } from "@packaging/artwork";
import { MM_PER_PT, artworkObject, type ArtworkObject } from "@packaging/schema";

/**
 * Two-way mapping between our artwork objects and Fabric objects. Scene units
 * are millimetres; every Fabric object uses a centre origin, so left/top ARE
 * the object's centre on the flat sheet.
 */

export interface ObjectMeta {
  readonly id: string;
  name: string;
  readonly type: ArtworkObject["type"];
  readonly assetId?: string;
  locked: boolean;
}

const metas = new WeakMap<FabricObject, ObjectMeta>();
export const metaOf = (o: FabricObject): ObjectMeta | undefined => metas.get(o);

export const assetUrl = (assetId: string) => `/api/assets/${encodeURIComponent(assetId)}`;

const LOCK_KEYS = ["lockMovementX", "lockMovementY", "lockRotation", "lockScalingX", "lockScalingY"] as const;

export function applyLock(o: FabricObject, locked: boolean) {
  for (const k of LOCK_KEYS) o.set(k, locked);
  o.set({ hasControls: !locked, lockSkewingX: true, lockSkewingY: true });
  const m = metas.get(o);
  if (m) m.locked = locked;
}

/** Create the Fabric object for an artwork object (images load asynchronously). */
export async function toFabric(a: ArtworkObject, idx: AnchorIndex): Promise<FabricObject> {
  const c = objectCentre(idx, a);
  const common = { left: c.x, top: c.y, originX: "center", originY: "center", angle: a.angle, opacity: a.opacity, visible: a.visible } as const;
  let o: FabricObject;
  switch (a.type) {
    case "text":
      o = new Textbox(a.text, {
        ...common,
        width: a.width,
        fontFamily: a.fontFamily,
        fontSize: a.fontSizePt * MM_PER_PT,
        fontWeight: a.fontWeight,
        fontStyle: a.fontStyle,
        textAlign: a.textAlign,
        lineHeight: a.lineHeight,
        fill: a.fill,
        splitByGrapheme: false,
      });
      break;
    case "image": {
      const img = await FabricImage.fromURL(assetUrl(a.assetId), {}, { ...common, flipX: a.flipX, flipY: a.flipY });
      img.set({ scaleX: a.width / img.width, scaleY: a.height / img.height });
      o = img;
      break;
    }
    case "rect":
      o = new Rect({ ...common, width: a.width, height: a.height, rx: a.cornerRadius, ry: a.cornerRadius, fill: a.fill, stroke: a.stroke, strokeWidth: a.stroke ? a.strokeWidth : 0, strokeUniform: true });
      break;
    case "ellipse":
      o = new Ellipse({ ...common, rx: a.width / 2, ry: a.height / 2, fill: a.fill, stroke: a.stroke, strokeWidth: a.stroke ? a.strokeWidth : 0, strokeUniform: true });
      break;
    case "line":
      o = new Line([-a.length / 2, 0, a.length / 2, 0], { ...common, stroke: a.stroke, strokeWidth: a.strokeWidth, strokeUniform: true });
      o.setPositionByOrigin(new Point(c.x, c.y), "center", "center");
      break;
  }
  metas.set(o, { id: a.id, name: a.name, type: a.type, ...(a.type === "image" ? { assetId: a.assetId } : {}), locked: a.locked });
  applyLock(o, a.locked);
  return o;
}

/** Make `o` stand in for `a`, e.g. a grey box for an image that failed to load. */
export function retag(o: FabricObject, a: ArtworkObject) {
  metas.set(o, { id: a.id, name: a.name, type: a.type, ...(a.type === "image" ? { assetId: a.assetId } : {}), locked: a.locked });
  if (a.type === "image") o.set({ flipX: a.flipX, flipY: a.flipY });
}

/**
 * Read a Fabric object back. Uses the full transform (so objects inside a
 * multi-selection report absolute values) and folds scale into sizes.
 */
export function fromFabric(o: FabricObject, idx: AnchorIndex): ArtworkObject | null {
  const m = metas.get(o);
  if (!m) return null;
  const t = util.qrDecompose(o.calcTransformMatrix());
  const sx = Math.abs(t.scaleX);
  const sy = Math.abs(t.scaleY);
  const anchor = anchorFor(idx, { x: t.translateX, y: t.translateY });
  const a360 = ((t.angle % 360) + 360) % 360;
  const angle = a360 > 180 ? a360 - 360 : a360; // -180..180
  const base = { id: m.id, name: m.name, ...anchor, angle, opacity: o.opacity, visible: o.visible, locked: m.locked };
  const color = (v: unknown): string | null => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null);
  let a: unknown;
  switch (m.type) {
    case "text": {
      const tb = o as Textbox;
      a = {
        ...base,
        type: "text",
        text: tb.text,
        fontFamily: tb.fontFamily,
        fontSizePt: (tb.fontSize * sy) / MM_PER_PT,
        fontWeight: tb.fontWeight === "bold" || tb.fontWeight === 700 ? "bold" : "normal",
        fontStyle: tb.fontStyle === "italic" ? "italic" : "normal",
        textAlign: ["left", "center", "right"].includes(tb.textAlign) ? tb.textAlign : "left",
        lineHeight: tb.lineHeight,
        width: tb.width * sx,
        fill: color(tb.fill) ?? "#000000",
      };
      break;
    }
    case "image":
      a = { ...base, type: "image", assetId: m.assetId, width: o.width * sx, height: o.height * sy, flipX: o.flipX, flipY: o.flipY };
      break;
    case "rect": {
      const r = o as Rect;
      const stroke = color(r.stroke);
      a = { ...base, type: "rect", width: r.width * sx, height: r.height * sy, cornerRadius: r.rx * Math.min(sx, sy), fill: color(r.fill), stroke, strokeWidth: stroke ? r.strokeWidth : 0 };
      break;
    }
    case "ellipse": {
      const e = o as Ellipse;
      const stroke = color(e.stroke);
      a = { ...base, type: "ellipse", width: 2 * e.rx * sx, height: 2 * e.ry * sy, fill: color(e.fill), stroke, strokeWidth: stroke ? e.strokeWidth : 0 };
      break;
    }
    case "line": {
      const l = o as Line;
      a = { ...base, type: "line", length: Math.hypot(l.x2 - l.x1, l.y2 - l.y1) * sx, stroke: color(l.stroke) ?? "#000000", strokeWidth: l.strokeWidth };
      break;
    }
  }
  const parsed = artworkObject.safeParse(a);
  return parsed.success ? parsed.data : null;
}
