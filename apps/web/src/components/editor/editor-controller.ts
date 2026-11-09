import { ActiveSelection, Canvas, Ellipse, type FabricObject, FabricImage, Line, Point, Rect, Textbox, type TMat2D } from "fabric";
import { type AnchorIndex, anchorIndex } from "@packaging/artwork";
import { type DielineGeometry, flattenOutline, panelOutline } from "@packaging/dieline-engine";
import { STYLE, outlinePathD } from "@packaging/render-svg";
import { type Artwork, type ArtworkObject, type BoxBackground, artworkObject, boxBackground, MM_PER_PT } from "@packaging/schema";
import { loadBackgroundImage, paintBackground } from "./background";
import { applyLock, assetUrl, fromFabric, metaOf, retag, toFabric } from "./fabric-map";

export interface Viewport {
  readonly zoom: number; // screen px per mm
  readonly x: number; // screen x of sheet x = 0
  readonly y: number;
}

export interface EditorCallbacks {
  onChange(artwork: Artwork): void;
  onSelection(ids: string[]): void;
  onViewport(v: Viewport): void;
  onHistory(h: { canUndo: boolean; canRedo: boolean }): void;
  onError(message: string): void;
}

export interface OverlayOptions {
  showGrid: boolean;
  showBleed: boolean;
  showSafe: boolean;
}

export type NewObjectKind = "text" | "rect" | "ellipse" | "line";
export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

const MAX_HISTORY = 100;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 60;

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, "").slice(0, 20);

const polyPath = (poly: readonly { x: number; y: number }[]) => {
  const p = new Path2D();
  poly.forEach((v, i) => (i === 0 ? p.moveTo(v.x, v.y) : p.lineTo(v.x, v.y)));
  p.closePath();
  return p;
};

/** Loads a font face before Fabric measures text with it. */
export async function ensureFont(family: string, weight: string, style: string) {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await document.fonts.load(`${style} ${weight === "bold" ? 700 : 400} 16px "${family}"`);
  } catch {
    /* the browser falls back to another font; text stays editable */
  }
}

/**
 * The 2D artwork editor: a Fabric canvas in millimetre scene units with the
 * dieline drawn as a locked guide layer. Artwork state lives in the Fabric
 * objects; `toArtwork()` reads it back into our own schema.
 */
export class EditorController {
  readonly canvas: Canvas;
  private idx: AnchorIndex;
  private paths!: { cut: Path2D; crease: Path2D; bleed: Path2D; safe: Path2D; sheet: Path2D; glue: Path2D };
  private overlay: OverlayOptions = { showGrid: true, showBleed: true, showSafe: true };
  private history: string[] = [];
  private hpos = -1;
  private busy = false;
  private bg: BoxBackground | null = null;
  private bgImg: HTMLImageElement | null = null;
  private textTimer: ReturnType<typeof setTimeout> | null = null;
  private panning: { x: number; y: number } | null = null;
  spaceDown = false;

  constructor(
    el: HTMLCanvasElement,
    private geo: DielineGeometry,
    private readonly cb: EditorCallbacks,
  ) {
    this.idx = anchorIndex(geo);
    this.buildPaths();
    this.canvas = new Canvas(el, {
      preserveObjectStacking: true,
      selectionColor: "rgba(0,120,255,0.08)",
      selectionBorderColor: "#0a84ff",
      uniformScaling: true,
      stopContextMenu: true,
      fireMiddleClick: true,
    });
    this.canvas.on("before:render", ({ ctx }) => this.drawUnder(ctx));
    this.canvas.on("after:render", ({ ctx }) => this.drawOver(ctx));
    this.canvas.on("object:modified", ({ target }) => {
      if (target && !(target instanceof ActiveSelection)) this.bakeScale(target);
      this.commit();
    });
    this.canvas.on("text:changed", () => {
      if (this.textTimer) clearTimeout(this.textTimer);
      this.textTimer = setTimeout(() => this.commit(), 500);
    });
    this.canvas.on("text:editing:exited", () => this.commit());
    const sel = () => this.cb.onSelection(this.selectedIds());
    this.canvas.on("selection:created", sel);
    this.canvas.on("selection:updated", sel);
    this.canvas.on("selection:cleared", sel);
    this.canvas.on("mouse:wheel", ({ e }) => this.onWheel(e as WheelEvent));
    this.canvas.on("mouse:down", ({ e }) => {
      const me = e as MouseEvent;
      if (this.spaceDown || me.button === 1) {
        this.panning = { x: me.clientX, y: me.clientY };
        this.canvas.selection = false;
        this.canvas.discardActiveObject();
      }
    });
    this.canvas.on("mouse:move", ({ e }) => {
      if (!this.panning) return;
      const me = e as MouseEvent;
      this.pan(me.clientX - this.panning.x, me.clientY - this.panning.y);
      this.panning = { x: me.clientX, y: me.clientY };
    });
    this.canvas.on("mouse:up", () => {
      this.panning = null;
      this.canvas.selection = true;
    });
  }

  // ---------------------------------------------------------------- geometry layer

  private buildPaths() {
    const g = this.geo;
    const cut = new Path2D();
    for (const loop of g.cutLoops) cut.addPath(new Path2D(outlinePathD(loop)));
    for (const s of g.slitLines) {
      cut.moveTo(s.a.x, s.a.y);
      cut.lineTo(s.b.x, s.b.y);
    }
    const crease = new Path2D();
    for (const c of g.creaseLines) {
      crease.moveTo(c.a.x, c.a.y);
      crease.lineTo(c.b.x, c.b.y);
    }
    const safe = new Path2D();
    for (const s of g.safeAreas) safe.addPath(polyPath(s.polygon));
    const sheet = new Path2D();
    for (const p of g.foldTree.panels) sheet.addPath(polyPath(flattenOutline(panelOutline(p), 0.05)));
    const glue = new Path2D();
    for (const a of g.glueAreas) glue.addPath(polyPath(flattenOutline(a.outline, 0.05)));
    this.paths = { cut, crease, bleed: polyPath(g.bleedLoop), safe, sheet, glue };
  }

  setOverlay(o: Partial<OverlayOptions>) {
    this.overlay = { ...this.overlay, ...o };
    this.canvas.requestRenderAll();
  }

  private applyVpt(ctx: CanvasRenderingContext2D) {
    const v = this.canvas.viewportTransform;
    ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
  }

  /** Background, bleed, sheet and grid: below the artwork. */
  private drawUnder(ctx: CanvasRenderingContext2D) {
    const z = this.canvas.getZoom();
    ctx.save();
    ctx.fillStyle = "#e9e8e4";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.applyVpt(ctx);
    if (this.overlay.showBleed) {
      ctx.fillStyle = "#fbe9f1";
      ctx.fill(this.paths.bleed);
    }
    ctx.shadowColor = "rgba(0,0,0,0.12)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#ffffff";
    ctx.fill(this.paths.sheet, "nonzero");
    ctx.shadowBlur = 0;
    if (this.bg && this.bgImg) paintBackground(ctx, this.geo, this.bg, this.bgImg);
    ctx.fillStyle = "rgba(245,185,66,0.25)";
    ctx.fill(this.paths.glue);
    if (this.overlay.showGrid) this.drawGrid(ctx, z);
    ctx.restore();
  }

  private drawGrid(ctx: CanvasRenderingContext2D, z: number) {
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500];
    const step = steps.find((s) => s * z >= 12) ?? 1000;
    const v = this.canvas.viewportTransform;
    const x0 = -v[4] / z;
    const y0 = -v[5] / z;
    const x1 = x0 + this.canvas.width / z;
    const y1 = y0 + this.canvas.height / z;
    ctx.lineWidth = 1 / z;
    for (const major of [false, true]) {
      const s = major ? step * 5 : step;
      ctx.strokeStyle = major ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.045)";
      ctx.beginPath();
      for (let x = Math.ceil(x0 / s) * s; x <= x1; x += s) {
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
      }
      for (let y = Math.ceil(y0 / s) * s; y <= y1; y += s) {
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
      }
      ctx.stroke();
    }
  }

  /** Dieline lines on top of the artwork (constant 1 px). */
  private drawOver(ctx: CanvasRenderingContext2D) {
    const z = this.canvas.getZoom();
    ctx.save();
    this.applyVpt(ctx);
    ctx.lineWidth = 1 / z;
    if (this.overlay.showBleed) {
      ctx.setLineDash([4 / z, 3 / z]);
      ctx.strokeStyle = STYLE.bleed.stroke;
      ctx.stroke(this.paths.bleed);
    }
    if (this.overlay.showSafe) {
      ctx.setLineDash([5 / z, 3 / z]);
      ctx.strokeStyle = STYLE.safe.stroke;
      ctx.stroke(this.paths.safe);
    }
    ctx.setLineDash([6 / z, 4 / z]);
    ctx.strokeStyle = STYLE.crease.stroke;
    ctx.stroke(this.paths.crease);
    ctx.setLineDash([]);
    ctx.lineWidth = 1.25 / z;
    ctx.strokeStyle = STYLE.cut.stroke;
    ctx.stroke(this.paths.cut);
    ctx.restore();
  }

  // ---------------------------------------------------------------- viewport

  get viewport(): Viewport {
    const v = this.canvas.viewportTransform;
    return { zoom: v[0], x: v[4], y: v[5] };
  }

  private emitViewport() {
    this.cb.onViewport(this.viewport);
  }

  resize(width: number, height: number) {
    this.canvas.setDimensions({ width, height });
    this.emitViewport();
  }

  zoomFit() {
    const b = this.geo.bleedBounds;
    const pad = 48;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const bw = b.max.x - b.min.x;
    const bh = b.max.y - b.min.y;
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh)));
    const vpt: TMat2D = [z, 0, 0, z, w / 2 - ((b.min.x + b.max.x) / 2) * z, h / 2 - ((b.min.y + b.max.y) / 2) * z];
    this.canvas.setViewportTransform(vpt);
    this.emitViewport();
  }

  zoomBy(factor: number, at?: { x: number; y: number }) {
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.canvas.getZoom() * factor));
    const p = at ?? { x: this.canvas.width / 2, y: this.canvas.height / 2 };
    this.canvas.zoomToPoint(new Point(p.x, p.y), z);
    this.emitViewport();
  }

  pan(dx: number, dy: number) {
    this.canvas.relativePan(new Point(dx, dy));
    this.emitViewport();
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      // Pinch-zoom on trackpads arrives as ctrl + wheel.
      const rect = this.canvas.upperCanvasEl.getBoundingClientRect();
      this.zoomBy(Math.exp(-e.deltaY * 0.01), { x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      this.pan(-e.deltaX, -e.deltaY);
    }
  }

  // ---------------------------------------------------------------- document

  /** Replace all artwork (initial load, undo/redo). */
  async load(artwork: Artwork) {
    this.busy = true;
    try {
      await Promise.all(
        artwork.objects.filter((o) => o.type === "text").map((o) => o.type === "text" && ensureFont(o.fontFamily, o.fontWeight, o.fontStyle)),
      );
      const objs = await Promise.all(artwork.objects.map((o) => this.create(o)));
      await this.applyBackground(artwork.background ?? null);
      this.canvas.discardActiveObject();
      this.canvas.remove(...this.canvas.getObjects());
      if (objs.length) this.canvas.add(...objs);
      this.canvas.requestRenderAll();
    } finally {
      this.busy = false;
    }
  }

  /** Use `bg` as the box background; a failed image load keeps the data (so saving does not lose it). */
  private async applyBackground(bg: BoxBackground | null) {
    this.bg = bg;
    this.bgImg = null;
    if (!bg) return;
    try {
      this.bgImg = await loadBackgroundImage(bg.assetId);
    } catch {
      this.cb.onError("The box background image could not be loaded.");
    }
  }

  getBackground(): BoxBackground | null {
    return this.bg;
  }

  /** Set, change (partial patch) or clear (null) the box background. One undo step. */
  async setBackground(patch: BoxBackground | Partial<BoxBackground> | null) {
    if (patch === null) {
      await this.applyBackground(null);
    } else {
      const parsed = boxBackground.safeParse({ ...this.bg, ...patch });
      if (!parsed.success) {
        this.cb.onError(parsed.error.issues[0]?.message ?? "Invalid value.");
        return;
      }
      if (parsed.data.assetId !== this.bg?.assetId || !this.bgImg) await this.applyBackground(parsed.data);
      else this.bg = parsed.data;
    }
    this.canvas.requestRenderAll();
    this.commit();
  }

  /** Fabric object for data; a missing image becomes a grey placeholder that keeps its data. */
  private async create(o: ArtworkObject): Promise<FabricObject> {
    try {
      return await toFabric(o, this.idx);
    } catch {
      if (o.type !== "image") throw new Error(`Could not create ${o.type}`);
      const ph = await toFabric({ ...o, type: "rect", fill: "#d4d4d4", stroke: "#999999", strokeWidth: 0.3, cornerRadius: 0 } as ArtworkObject, this.idx);
      // The placeholder stands in for the image, so saving keeps the asset reference.
      retag(ph, o);
      this.cb.onError(`Image "${o.name}" could not be loaded.`);
      return ph;
    }
  }

  async init(artwork: Artwork) {
    await this.load(artwork);
    this.zoomFit();
    this.history = [JSON.stringify(artwork)];
    this.hpos = 0;
    this.emitHistory();
  }

  toArtwork(): Artwork {
    const objects: ArtworkObject[] = [];
    for (const o of this.canvas.getObjects()) {
      const a = fromFabric(o, this.idx);
      if (a) objects.push(a);
    }
    return this.bg ? { objects, background: this.bg } : { objects };
  }

  /** Record the current state as one undo step and notify. */
  commit() {
    if (this.busy) return;
    const art = this.toArtwork();
    const json = JSON.stringify(art);
    if (json === this.history[this.hpos]) return;
    this.history = this.history.slice(0, this.hpos + 1);
    this.history.push(json);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.hpos = this.history.length - 1;
    this.emitHistory();
    this.cb.onChange(art);
    this.cb.onSelection(this.selectedIds());
  }

  private emitHistory() {
    this.cb.onHistory({ canUndo: this.hpos > 0, canRedo: this.hpos < this.history.length - 1 });
  }

  async undo() {
    if (this.hpos <= 0 || this.busy) return;
    this.hpos--;
    await this.restore();
  }

  async redo() {
    if (this.hpos >= this.history.length - 1 || this.busy) return;
    this.hpos++;
    await this.restore();
  }

  private async restore() {
    const art = JSON.parse(this.history[this.hpos]!) as Artwork;
    await this.load(art);
    this.emitHistory();
    this.cb.onChange(art);
    this.cb.onSelection([]);
  }

  /** After a single-object resize, fold scale into real sizes so the canvas matches the stored data. */
  private bakeScale(o: FabricObject) {
    const sx = o.scaleX;
    const sy = o.scaleY;
    if (sx === 1 && sy === 1) return;
    const centre = o.getCenterPoint();
    if (o instanceof Textbox) o.set({ width: o.width * sx, fontSize: o.fontSize * sy, scaleX: 1, scaleY: 1 });
    else if (o instanceof Rect) o.set({ width: o.width * sx, height: o.height * sy, rx: o.rx * Math.min(sx, sy), ry: o.ry * Math.min(sx, sy), scaleX: 1, scaleY: 1 });
    else if (o instanceof Ellipse) o.set({ rx: o.rx * sx, ry: o.ry * sy, scaleX: 1, scaleY: 1 });
    else if (o instanceof Line) {
      const len = Math.hypot(o.x2 - o.x1, o.y2 - o.y1) * sx;
      o.set({ x1: -len / 2, y1: 0, x2: len / 2, y2: 0, scaleX: 1, scaleY: 1 });
    } else return; // images keep their scale (that is their size)
    o.setPositionByOrigin(centre, "center", "center");
    o.setCoords();
  }

  // ---------------------------------------------------------------- queries

  selectedIds(): string[] {
    return this.canvas
      .getActiveObjects()
      .map((o) => metaOf(o)?.id)
      .filter((x): x is string => Boolean(x));
  }

  private find(id: string): FabricObject | undefined {
    return this.canvas.getObjects().find((o) => metaOf(o)?.id === id);
  }

  getData(id: string): ArtworkObject | null {
    const o = this.find(id);
    return o ? fromFabric(o, this.idx) : null;
  }

  /** Centre and size (mm) of the panel an object should go on by default. */
  private targetPanel() {
    const front = this.idx.panels.get("front");
    if (front) {
      const xs = front.polygon.map((p) => p.x);
      const ys = front.polygon.map((p) => p.y);
      return { centre: front.centre, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), panelId: "front" as string | null };
    }
    const b = this.geo.cutBounds;
    return { centre: this.idx.sheet, w: b.max.x - b.min.x, h: b.max.y - b.min.y, panelId: null };
  }

  // ---------------------------------------------------------------- editing

  private async insert(a: ArtworkObject, select = true) {
    const o = await this.create(a);
    this.canvas.add(o);
    if (select) this.canvas.setActiveObject(o);
    this.canvas.requestRenderAll();
    this.commit();
  }

  private baseFor(name: string) {
    const t = this.targetPanel();
    return { t, base: { id: newId(), name, panelId: t.panelId, dx: 0, dy: 0, angle: 0, opacity: 1, visible: true, locked: false } };
  }

  async add(kind: NewObjectKind) {
    const { t, base } = this.baseFor(kind[0]!.toUpperCase() + kind.slice(1));
    const s = Math.min(t.w, t.h);
    let a: ArtworkObject;
    switch (kind) {
      case "text":
        await ensureFont("Inter", "bold", "normal");
        a = { ...base, name: "Text", type: "text", text: "Your text", fontFamily: "Inter", fontSizePt: Math.max(6, Math.min(36, (t.w * 0.12) / MM_PER_PT)), fontWeight: "bold", fontStyle: "normal", textAlign: "center", lineHeight: 1.16, width: t.w * 0.8, fill: "#1d1d1b" };
        break;
      case "rect":
        a = { ...base, type: "rect", width: s * 0.5, height: s * 0.3, cornerRadius: 0, fill: "#e6007e", stroke: null, strokeWidth: 0 };
        break;
      case "ellipse":
        a = { ...base, type: "ellipse", width: s * 0.4, height: s * 0.4, fill: "#00a0e9", stroke: null, strokeWidth: 0 };
        break;
      case "line":
        a = { ...base, type: "line", length: t.w * 0.6, stroke: "#1d1d1b", strokeWidth: 0.5 };
        break;
    }
    await this.insert(a);
  }

  /** Place an uploaded image on the default panel, fitted to 60% of its width/height. */
  async addImage(assetId: string, fileName: string) {
    const probe = await FabricImage.fromURL(assetUrl(assetId));
    const { t, base } = this.baseFor(fileName.replace(/\.[a-z]+$/i, "").slice(0, 60) || "Image");
    const k = Math.min((t.w * 0.6) / probe.width, (t.h * 0.6) / probe.height);
    await this.insert({ ...base, type: "image", assetId, width: probe.width * k, height: probe.height * k, flipX: false, flipY: false });
  }

  /** Change properties of one object (validated by the artwork schema). */
  async update(id: string, patch: Partial<ArtworkObject>) {
    const o = this.find(id);
    if (!o) return;
    const current = fromFabric(o, this.idx);
    if (!current) return;
    const parsed = artworkObject.safeParse({ ...current, ...patch });
    if (!parsed.success) {
      this.cb.onError(parsed.error.issues[0]?.message ?? "Invalid value.");
      return;
    }
    const next = parsed.data;
    if (next.type === "text") await ensureFont(next.fontFamily, next.fontWeight, next.fontStyle);
    const wasActive = this.canvas.getActiveObjects().includes(o);
    const index = this.canvas.getObjects().indexOf(o);
    const fresh = await this.create(next);
    this.busy = true;
    this.canvas.discardActiveObject();
    this.canvas.remove(o);
    this.canvas.insertAt(index, fresh);
    this.busy = false;
    if (wasActive && next.visible) this.canvas.setActiveObject(fresh);
    this.canvas.requestRenderAll();
    this.commit();
  }

  setLocked(id: string, locked: boolean) {
    const o = this.find(id);
    if (!o) return;
    applyLock(o, locked);
    this.canvas.requestRenderAll();
    this.commit();
  }

  select(ids: string[]) {
    const objs = ids.map((id) => this.find(id)).filter((o): o is FabricObject => Boolean(o && o.visible));
    this.canvas.discardActiveObject();
    if (objs.length === 1) this.canvas.setActiveObject(objs[0]!);
    else if (objs.length > 1) this.canvas.setActiveObject(new ActiveSelection(objs, { canvas: this.canvas }));
    this.canvas.requestRenderAll();
    this.cb.onSelection(this.selectedIds());
  }

  removeSelected() {
    const objs = this.canvas.getActiveObjects();
    if (!objs.length) return;
    if (objs.some((o) => o instanceof Textbox && o.isEditing)) return;
    this.canvas.discardActiveObject();
    this.canvas.remove(...objs);
    this.canvas.requestRenderAll();
    this.commit();
  }

  remove(id: string) {
    const o = this.find(id);
    if (!o) return;
    this.canvas.discardActiveObject();
    this.canvas.remove(o);
    this.commit();
  }

  async duplicateSelected() {
    const ids = this.selectedIds();
    const data = ids.map((id) => this.getData(id)).filter((x): x is ArtworkObject => Boolean(x));
    const created: FabricObject[] = [];
    for (const d of data) {
      const copy = { ...d, id: newId(), name: `${d.name} copy`.slice(0, 80), dx: d.dx + 5, dy: d.dy + 5, locked: false };
      const o = await this.create(copy);
      this.canvas.add(o);
      created.push(o);
    }
    this.canvas.discardActiveObject();
    if (created.length === 1) this.canvas.setActiveObject(created[0]!);
    else if (created.length > 1) this.canvas.setActiveObject(new ActiveSelection(created, { canvas: this.canvas }));
    this.commit();
  }

  /** Move an object in the stack: +1 up, -1 down, Infinity to front, -Infinity to back. */
  reorder(id: string, delta: number) {
    const o = this.find(id);
    if (!o) return;
    const objs = this.canvas.getObjects();
    const i = objs.indexOf(o);
    const to = Math.max(0, Math.min(objs.length - 1, delta === Infinity ? objs.length - 1 : delta === -Infinity ? 0 : i + delta));
    if (to === i) return;
    this.canvas.moveObjectTo(o, to);
    this.canvas.requestRenderAll();
    this.commit();
  }

  /** Nudge the selection by (dx, dy) mm. */
  nudge(dx: number, dy: number) {
    const a = this.canvas.getActiveObject();
    if (!a || (a instanceof Textbox && a.isEditing)) return;
    if (metaOf(a)?.locked) return;
    a.set({ left: a.left + dx, top: a.top + dy });
    a.setCoords();
    this.canvas.requestRenderAll();
    this.commit();
  }

  /** Align each selected object to the edges/centre of the panel it sits on. */
  align(mode: AlignMode) {
    const objs = this.canvas.getActiveObjects();
    if (!objs.length) return;
    this.canvas.discardActiveObject(); // so coordinates are absolute
    for (const o of objs) {
      const data = fromFabric(o, this.idx);
      if (!data || data.locked) continue;
      const panel = data.panelId ? this.idx.panels.get(data.panelId) : undefined;
      const poly = panel?.polygon;
      const pb = poly
        ? { minX: Math.min(...poly.map((p) => p.x)), maxX: Math.max(...poly.map((p) => p.x)), minY: Math.min(...poly.map((p) => p.y)), maxY: Math.max(...poly.map((p) => p.y)) }
        : { minX: this.geo.cutBounds.min.x, maxX: this.geo.cutBounds.max.x, minY: this.geo.cutBounds.min.y, maxY: this.geo.cutBounds.max.y };
      const c = o.getCoords();
      const ob = { minX: Math.min(...c.map((p) => p.x)), maxX: Math.max(...c.map((p) => p.x)), minY: Math.min(...c.map((p) => p.y)), maxY: Math.max(...c.map((p) => p.y)) };
      let dx = 0;
      let dy = 0;
      if (mode === "left") dx = pb.minX - ob.minX;
      if (mode === "right") dx = pb.maxX - ob.maxX;
      if (mode === "hcenter") dx = (pb.minX + pb.maxX) / 2 - (ob.minX + ob.maxX) / 2;
      if (mode === "top") dy = pb.minY - ob.minY;
      if (mode === "bottom") dy = pb.maxY - ob.maxY;
      if (mode === "vcenter") dy = (pb.minY + pb.maxY) / 2 - (ob.minY + ob.maxY) / 2;
      o.set({ left: o.left + dx, top: o.top + dy });
      o.setCoords();
    }
    if (objs.length === 1) this.canvas.setActiveObject(objs[0]!);
    else this.canvas.setActiveObject(new ActiveSelection(objs, { canvas: this.canvas }));
    this.canvas.requestRenderAll();
    this.commit();
  }

  dispose() {
    if (this.textTimer) clearTimeout(this.textTimer);
    void this.canvas.dispose();
  }
}
