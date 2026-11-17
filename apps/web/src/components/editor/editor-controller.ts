import { ActiveSelection, Canvas, Ellipse, type FabricObject, FabricImage, Line, Point, Rect, Textbox, type TMat2D, util } from "fabric";
import { type AnchorIndex, anchorFor, anchorIndex, backgroundPlacement, panelAt } from "@packaging/artwork";
import { type DielineGeometry, flattenOutline, panelOutline } from "@packaging/dieline-engine";
import { STYLE, outlinePathD } from "@packaging/render-svg";
import { type Artwork, type ArtworkObject, type BoxBackground, MAX_BACKGROUNDS, artworkObject, backgroundsOf, boxBackground, MM_PER_PT } from "@packaging/schema";
import { loadBackgroundImage, paintBackground } from "./background";
import { applyLock, assetUrl, fromFabric, metaOf, retag, toFabric } from "./fabric-map";
import { installSelectionStyle, styleFrame } from "./selection-style";

installSelectionStyle();

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
  /** A right click (no drag) on artwork: where to show its menu (px from the canvas top-left); the artwork is selected. */
  onContextMenu?(at: { x: number; y: number }): void;
  /** A right click (no drag) on a background picture, with no artwork under it: where to show its menu, and which picture (it is chosen). */
  onBackgroundContextMenu?(at: { x: number; y: number; index: number }): void;
  /** The chosen background picture changed (index into the stack, -1 = none). */
  onBackgroundSelect?(index: number): void;
  /** The "adjust the background on the dieline" mode was switched on or off (also by the editor itself, e.g. when the background is removed). */
  onBackgroundEdit?(on: boolean): void;
}

export interface OverlayOptions {
  showGrid: boolean;
  showBleed: boolean;
  showSafe: boolean;
  /** Width and height of the sheet, written along dimension lines. */
  showDimensions: boolean;
}

export type NewObjectKind = "text" | "rect" | "ellipse" | "line";
export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

const MAX_HISTORY = 100;
/** Zoom limits in screen px per mm (also the ends of the zoom slider). */
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 60;

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
  private overlay: OverlayOptions = { showGrid: true, showBleed: true, showSafe: true, showDimensions: false };
  private history: string[] = [];
  private hpos = -1;
  private busy = false;
  /** Background pictures, bottom to top, with their loaded images (null = could not be loaded) and the chosen one. */
  private bgs: BoxBackground[] = [];
  private bgImgs: (HTMLImageElement | null)[] = [];
  private bgSel = -1;
  /** The chosen background picture: what the edit mode moves and resizes. */
  private get bg(): BoxBackground | null {
    return this.bgs[this.bgSel] ?? null;
  }
  private set bg(v: BoxBackground | null) {
    if (v && this.bgSel >= 0) this.bgs[this.bgSel] = v;
  }
  private get bgImg(): HTMLImageElement | null {
    return this.bgImgs[this.bgSel] ?? null;
  }
  private textTimer: ReturnType<typeof setTimeout> | null = null;
  private panning: { x: number; y: number } | null = null;
  spaceDown = false;
  private panMode = false;
  /** Background edit mode: the box background can be moved and resized with the pointer; artwork cannot be picked. */
  private bgEdit = false;
  private bgDrag:
    | { kind: "move"; px: number; py: number; dx: number; dy: number }
    | { kind: "scale"; cx: number; cy: number; hx: number; hy: number; scale: number }
    | null = null;
  private expanding = false;
  /** Guide lines (sheet mm) shown while artwork is being moved: x = vertical lines, y = horizontal ones. */
  private guides: { x: number[]; y: number[] } = { x: [], y: [] };
  /**
   * Right button: a drag moves the view (left/right/up/down, even over artwork); a click without a
   * drag on artwork selects it and asks for its menu. Holds the pointer, where it was last, and the artwork under it.
   */
  private rightPan: { id: number; x: number; y: number; moved: boolean; target: FabricObject | undefined } | null = null;
  private readonly offRightPan: () => void;

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
    this.canvas.on("object:moving", ({ target, e }) => this.snapMove(target, !(e as MouseEvent | undefined)?.altKey));
    this.canvas.on("mouse:up", () => this.clearGuides());
    this.canvas.on("object:modified", ({ target }) => {
      if (target && !(target instanceof ActiveSelection)) this.bakeScale(target);
      this.commit();
    });
    this.canvas.on("text:changed", () => {
      if (this.textTimer) clearTimeout(this.textTimer);
      this.textTimer = setTimeout(() => this.commit(), 500);
    });
    this.canvas.on("text:editing:exited", () => this.commit());
    const sel = () => {
      if (!this.expanding && this.expandToGroups()) return;
      styleFrame(this.canvas.getActiveObject());
      this.cb.onSelection(this.selectedIds());
    };
    this.canvas.on("selection:created", sel);
    this.canvas.on("selection:updated", sel);
    this.canvas.on("selection:cleared", sel);
    this.canvas.on("mouse:wheel", ({ e }) => this.onWheel(e as WheelEvent));
    this.canvas.on("mouse:down", ({ e }) => {
      const me = e as MouseEvent;
      if (this.spaceDown || this.panMode || me.button === 1) {
        this.panning = { x: me.clientX, y: me.clientY };
        this.canvas.selection = false;
        this.canvas.discardActiveObject();
      } else if (this.bgEdit && me.button === 0) {
        this.bgDown(me);
      }
    });
    this.canvas.on("mouse:move", ({ e }) => {
      if (this.bgEdit && !this.panning) return this.bgMove(e as MouseEvent);
      if (!this.panning) return;
      const me = e as MouseEvent;
      this.pan(me.clientX - this.panning.x, me.clientY - this.panning.y);
      this.panning = { x: me.clientX, y: me.clientY };
    });
    // A double-click on a background picture, while it is being moved and resized, finishes the editing (same as Done).
    this.canvas.on("mouse:dblclick", ({ e }) => {
      if (this.bgEdit && this.bgHit(this.pointerScene(e as MouseEvent)) === "move") this.setBackgroundEdit(false);
    });
    this.canvas.on("mouse:up", () => {
      this.panning = null;
      this.canvas.selection = !this.panMode && !this.bgEdit;
      this.bgUp();
    });

    // Right-button drag moves the view (left/right/up/down) wherever the pointer is, even over artwork.
    const host = this.canvas.upperCanvasEl;
    const down = (e: PointerEvent) => {
      if (e.button !== 2) return;
      e.preventDefault();
      this.rightPan = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, target: this.panMode ? undefined : this.canvas.findTarget(e).target };
      host.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const r = this.rightPan;
      if (!r || r.id !== e.pointerId) return;
      if (!r.moved) {
        if (Math.hypot(e.clientX - r.x, e.clientY - r.y) < 4) return; // still a click
        r.moved = true;
        this.canvas.discardActiveObject();
        this.setCursors("grabbing");
        this.canvas.requestRenderAll();
      }
      this.pan(e.clientX - r.x, e.clientY - r.y);
      r.x = e.clientX;
      r.y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      const r = this.rightPan;
      if (!r || r.id !== e.pointerId) return;
      this.rightPan = null;
      if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
      if (r.moved) return void this.setCursors(this.panMode ? "grab" : null);
      // The target is the selection itself when several objects (or a group) are chosen and the click is on one of them.
      const onSelection = r.target instanceof ActiveSelection;
      if (e.type === "pointerup" && r.target && (onSelection || metaOf(r.target))) {
        if (!onSelection && !this.canvas.getActiveObjects().includes(r.target)) this.canvas.setActiveObject(r.target);
        this.canvas.requestRenderAll();
        const box = host.getBoundingClientRect();
        this.cb.onContextMenu?.({ x: e.clientX - box.left, y: e.clientY - box.top });
      } else if (e.type === "pointerup" && !this.panMode && !onSelection && !(r.target && metaOf(r.target))) {
        // No artwork under the pointer (something that is not artwork, like a guide, may be): maybe a background picture.
        const index = this.bgAt(this.pointerScene(e));
        if (index >= 0) {
          this.canvas.discardActiveObject();
          this.selectBackground(index);
          const box = host.getBoundingClientRect();
          this.cb.onBackgroundContextMenu?.({ x: e.clientX - box.left, y: e.clientY - box.top, index });
        }
      }
    };
    host.addEventListener("pointerdown", down);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointercancel", up);
    this.offRightPan = () => {
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointercancel", up);
    };
  }

  /** The cursor over the canvas: a fixed one (hand), or null for the normal ones (arrow, move). */
  private setCursors(c: "grab" | "grabbing" | null) {
    this.canvas.defaultCursor = c ?? "default";
    this.canvas.hoverCursor = c ?? "move";
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
    this.bgs.forEach((b, i) => {
      const img = this.bgImgs[i];
      if (img) paintBackground(ctx, this.geo, b, img);
    });
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
    if (this.overlay.showDimensions) this.drawDimensions(ctx, z);
    this.drawGuides(ctx, z);
    this.drawBackgroundFrame(ctx, z);
    ctx.restore();
  }

  /** Dimension lines with end ticks under and left of the sheet (cut bounds), each with its length in mm. Sizes are screen pixels. */
  private drawDimensions(ctx: CanvasRenderingContext2D, z: number) {
    const { min, max } = this.geo.cutBounds;
    const gap = 22 / z;
    const tick = 5 / z;
    const label = (n: number) => `${Math.round(n * 100) / 100} mm`;
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 1 / z;
    ctx.strokeStyle = "#475569";
    ctx.fillStyle = "#334155";
    ctx.font = `${11 / z}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    // Width: below the sheet.
    const y = max.y + gap;
    ctx.beginPath();
    ctx.moveTo(min.x, y);
    ctx.lineTo(max.x, y);
    ctx.moveTo(min.x, y - tick);
    ctx.lineTo(min.x, y + tick);
    ctx.moveTo(max.x, y - tick);
    ctx.lineTo(max.x, y + tick);
    ctx.stroke();
    ctx.textBaseline = "top";
    ctx.fillText(label(max.x - min.x), (min.x + max.x) / 2, y + 4 / z);
    // Height: left of the sheet, its text turned to read from below.
    const x = min.x - gap;
    ctx.beginPath();
    ctx.moveTo(x, min.y);
    ctx.lineTo(x, max.y);
    ctx.moveTo(x - tick, min.y);
    ctx.lineTo(x + tick, min.y);
    ctx.moveTo(x - tick, max.y);
    ctx.lineTo(x + tick, max.y);
    ctx.stroke();
    ctx.translate(x - 4 / z, (min.y + max.y) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = "bottom";
    ctx.fillText(label(max.y - min.y), 0, 0);
    ctx.restore();
  }

  /** Orange dashed guides (the same as in the window editor), across the whole visible sheet area. */
  private drawGuides(ctx: CanvasRenderingContext2D, z: number) {
    const { x, y } = this.guides;
    if (!x.length && !y.length) return;
    const v = this.canvas.viewportTransform;
    const x0 = -v[4] / z;
    const x1 = (this.canvas.width - v[4]) / z;
    const y0 = -v[5] / z;
    const y1 = (this.canvas.height - v[5]) / z;
    ctx.setLineDash([5 / z, 3 / z]);
    ctx.lineWidth = 1.2 / z;
    ctx.strokeStyle = "#f97316";
    ctx.beginPath();
    for (const gx of x) {
      ctx.moveTo(gx, y0);
      ctx.lineTo(gx, y1);
    }
    for (const gy of y) {
      ctx.moveTo(x0, gy);
      ctx.lineTo(x1, gy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ---------------------------------------------------------------- background edit mode

  /** Switch the "move and resize the box background on the dieline" mode on or off. It needs a background that is loaded. */
  setBackgroundEdit(on: boolean) {
    const next = on && Boolean(this.bg && this.bgImg);
    if (next === this.bgEdit) return;
    this.bgEdit = next;
    this.bgDrag = null;
    this.canvas.skipTargetFind = next || this.panMode;
    this.canvas.selection = !next && !this.panMode;
    if (next) this.canvas.discardActiveObject();
    this.setCursors(this.panMode ? "grab" : null);
    this.clearGuides();
    this.canvas.requestRenderAll();
    this.cb.onBackgroundEdit?.(next);
  }

  isBackgroundEditing() {
    return this.bgEdit;
  }

  private bgPlacement(i = this.bgSel) {
    const b = this.bgs[i];
    const img = this.bgImgs[i];
    return b && img ? backgroundPlacement(this.geo, b, img.naturalWidth, img.naturalHeight) : null;
  }

  /** The topmost background picture under a point of the sheet, or -1. */
  private bgAt(pt: { x: number; y: number }): number {
    for (let i = this.bgs.length - 1; i >= 0; i--) {
      const p = this.bgPlacement(i);
      if (p && Math.abs(pt.x - p.cx) <= p.width / 2 && Math.abs(pt.y - p.cy) <= p.height / 2) return i;
    }
    return -1;
  }

  /** The grips sit on the corners of the part of the picture that shows inside the print area, so they are always reachable. */
  private bgGrips(): { x: number; y: number }[] {
    const p = this.bgPlacement();
    if (!p) return [];
    const x0 = Math.max(p.cx - p.width / 2, p.clip.minX);
    const x1 = Math.min(p.cx + p.width / 2, p.clip.minX + p.clip.width);
    const y0 = Math.max(p.cy - p.height / 2, p.clip.minY);
    const y1 = Math.min(p.cy + p.height / 2, p.clip.minY + p.clip.height);
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  }

  private pointerScene(e: MouseEvent) {
    const r = this.canvas.upperCanvasEl.getBoundingClientRect();
    return this.sceneAt(e.clientX - r.left, e.clientY - r.top);
  }

  private bgHit(pt: { x: number; y: number }): "scale" | "move" | null {
    const p = this.bgPlacement();
    if (!p) return null;
    const tol = 11 / this.canvas.getZoom();
    if (this.bgGrips().some((g) => Math.hypot(g.x - pt.x, g.y - pt.y) <= tol)) return "scale";
    return this.bgAt(pt) >= 0 ? "move" : null;
  }

  private bgDown(e: MouseEvent) {
    const pt = this.pointerScene(e);
    const hit = this.bgHit(pt);
    if (hit === "move") {
      // A press on another picture chooses it first.
      const at = this.bgAt(pt);
      if (at >= 0 && at !== this.bgSel) this.selectBackground(at);
    }
    const p = this.bgPlacement();
    if (!p || !this.bg) return;
    if (hit === "scale") {
      const g = this.bgGrips().reduce((a, b) => (Math.hypot(b.x - pt.x, b.y - pt.y) < Math.hypot(a.x - pt.x, a.y - pt.y) ? b : a));
      this.bgDrag = { kind: "scale", cx: p.cx, cy: p.cy, hx: g.x - p.cx, hy: g.y - p.cy, scale: this.bg.scale };
    } else if (hit === "move") {
      this.bgDrag = { kind: "move", px: pt.x, py: pt.y, dx: this.bg.dx, dy: this.bg.dy };
    }
  }

  private bgMove(e: MouseEvent) {
    const bg = this.bg;
    const p = this.bgPlacement();
    if (!bg || !p) return;
    const pt = this.pointerScene(e);
    const d = this.bgDrag;
    if (!d) {
      const hit = this.bgHit(pt);
      this.canvas.defaultCursor = this.canvas.hoverCursor = hit === "scale" ? "nwse-resize" : hit === "move" ? "move" : "default";
      return;
    }
    if (d.kind === "scale") {
      // Keep the centre; the grip follows the pointer along its diagonal.
      const k = ((pt.x - d.cx) * d.hx + (pt.y - d.cy) * d.hy) / (d.hx * d.hx + d.hy * d.hy);
      const scale = Math.min(10, Math.max(0.1, d.scale * Math.max(k, 0.01)));
      this.bg = { ...bg, scale: Math.round(scale * 1000) / 1000 };
    } else {
      let dx = d.dx + (pt.x - d.px);
      let dy = d.dy + (pt.y - d.py);
      const guides = { x: [] as number[], y: [] as number[] };
      if (!e.altKey) {
        // Snap the picture's edges and centre to the print area's (Alt = no snapping).
        const z = this.canvas.getZoom();
        const thr = 6 / z;
        const b = this.geo.bleedBounds;
        const baseX = (b.min.x + b.max.x) / 2;
        const baseY = (b.min.y + b.max.y) / 2;
        const snap = (centre: number, half: number, lo: number, hi: number, out: number[]) => {
          let best: { off: number; at: number } | null = null;
          for (const [mine, target] of [[centre - half, lo], [centre + half, hi], [centre, (lo + hi) / 2]] as const) {
            const off = target - mine;
            if (Math.abs(off) <= thr && (!best || Math.abs(off) < Math.abs(best.off))) best = { off, at: target };
          }
          if (best) out.push(best.at);
          return best ? best.off : 0;
        };
        dx += snap(baseX + dx, p.width / 2, b.min.x, b.max.x, guides.x);
        dy += snap(baseY + dy, p.height / 2, b.min.y, b.max.y, guides.y);
      }
      this.guides = guides;
      this.bg = { ...bg, dx: Math.round(dx * 100) / 100, dy: Math.round(dy * 100) / 100 };
    }
    this.canvas.requestRenderAll();
  }

  private bgUp() {
    if (!this.bgDrag) return;
    this.bgDrag = null;
    this.clearGuides();
    this.commit();
  }

  /** Frame of the whole picture (it may reach beyond the print area) and a round grip on each visible corner. */
  private drawBackgroundFrame(ctx: CanvasRenderingContext2D, z: number) {
    if (!this.bgEdit) return;
    const p = this.bgPlacement();
    if (!p) return;
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 2 / z;
    ctx.strokeStyle = "#3b82f6";
    ctx.strokeRect(p.cx - p.width / 2, p.cy - p.height / 2, p.width, p.height);
    for (const g of this.bgGrips()) {
      ctx.beginPath();
      ctx.arc(g.x, g.y, 7.2 / z, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(99,102,241,0.18)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(g.x, g.y, 6 / z, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 1 / z;
      ctx.strokeStyle = "#e4e1ff";
      ctx.stroke();
    }
    ctx.restore();
  }

  private clearGuides() {
    if (!this.guides.x.length && !this.guides.y.length) return;
    this.guides = { x: [], y: [] };
    this.canvas.requestRenderAll();
  }

  /**
   * While artwork is dragged: pull it onto nearby lines (edges and centre of its panel, of the sheet and of other
   * artwork, within 6 screen pixels) and remember the lines to draw. Holding Alt turns the snapping off.
   */
  private snapMove(target: FabricObject, on: boolean) {
    this.guides = { x: [], y: [] };
    if (!on) return;
    target.setCoords(); // fresh corner positions for this frame
    const moving = new Set<FabricObject>(target instanceof ActiveSelection ? target.getObjects() : [target]);
    const box = (o: FabricObject) => {
      const c = o.getCoords();
      const xs = c.map((p) => p.x);
      const ys = c.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return { minX, maxX, minY, maxY, midX: (minX + maxX) / 2, midY: (minY + maxY) / 2 };
    };
    const me = box(target);
    // Lines to snap to: the panel the object is over, the whole sheet, and every other visible object.
    const xs: number[] = [];
    const ys: number[] = [];
    const lines = (b: { minX: number; maxX: number; minY: number; maxY: number }) => {
      xs.push(b.minX, (b.minX + b.maxX) / 2, b.maxX);
      ys.push(b.minY, (b.minY + b.maxY) / 2, b.maxY);
    };
    const panelId = panelAt(this.idx, { x: me.midX, y: me.midY });
    const poly = panelId ? this.idx.panels.get(panelId)?.polygon : undefined;
    if (poly) lines({ minX: Math.min(...poly.map((p) => p.x)), maxX: Math.max(...poly.map((p) => p.x)), minY: Math.min(...poly.map((p) => p.y)), maxY: Math.max(...poly.map((p) => p.y)) });
    const cb = this.geo.cutBounds;
    lines({ minX: cb.min.x, maxX: cb.max.x, minY: cb.min.y, maxY: cb.max.y });
    for (const o of this.canvas.getObjects()) if (o.visible && !moving.has(o) && metaOf(o)) lines(box(o));

    const tol = 6 / this.canvas.getZoom();
    const best = (mine: number[], cands: number[]) => {
      let d = 0;
      let min = tol;
      for (const m of mine) for (const c of cands) if (Math.abs(c - m) < min) { min = Math.abs(c - m); d = c - m; }
      return min < tol ? d : 0;
    };
    const dx = best([me.minX, me.midX, me.maxX], xs);
    const dy = best([me.minY, me.midY, me.maxY], ys);
    if (dx || dy) {
      target.set({ left: target.left + dx, top: target.top + dy });
      target.setCoords();
    }
    const at = box(target);
    const hit = (mine: number[], cands: number[]) => [...new Set(cands.filter((c) => mine.some((m) => Math.abs(c - m) < 0.01)).map((c) => Math.round(c * 100) / 100))];
    this.guides = { x: hit([at.minX, at.midX, at.maxX], xs), y: hit([at.minY, at.midY, at.maxY], ys) };
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
    // Changing the size clears the canvas; draw at once, in the same frame, or the picture blinks while the divider is dragged.
    this.canvas.renderAll();
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

  /** Set the zoom to an exact value (screen px per mm), around the middle of the view. */
  setZoom(z: number) {
    this.zoomBy(z / this.canvas.getZoom());
  }

  /** Hand tool: dragging moves the view, and objects cannot be picked or moved until it is switched off. */
  setPanMode(on: boolean) {
    this.panMode = on;
    this.canvas.skipTargetFind = on || this.bgEdit;
    this.canvas.selection = !on && !this.bgEdit;
    this.setCursors(on ? "grab" : null);
    if (on) this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  /** A point of the canvas element (px, from its top-left corner) on the flat sheet (mm). */
  sceneAt(x: number, y: number): { x: number; y: number } {
    const p = new Point(x, y).transform(util.invertTransform(this.canvas.viewportTransform));
    return { x: p.x, y: p.y };
  }

  pan(dx: number, dy: number) {
    this.canvas.relativePan(new Point(dx, dy));
    this.emitViewport();
  }

  /**
   * The mouse wheel zooms around the pointer (no key needed). Shift + wheel moves the view sideways.
   * Pinch on a trackpad arrives as ctrl + wheel with small steps, so it gets a finer factor.
   */
  private onWheel(e: WheelEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
      this.pan(-(e.deltaX || e.deltaY), 0);
      return;
    }
    const rect = this.canvas.upperCanvasEl.getBoundingClientRect();
    const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (e.ctrlKey || e.metaKey) {
      this.zoomBy(Math.exp(-e.deltaY * 0.01), at);
      return;
    }
    // One notch of a mouse wheel is about 100 px (3 lines in Firefox): about 15% zoom.
    const dy = Math.max(-120, Math.min(120, e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY));
    this.zoomBy(Math.exp(-dy * 0.0015), at);
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
      await this.applyBackgrounds(backgroundsOf(artwork));
      this.canvas.discardActiveObject();
      this.canvas.remove(...this.canvas.getObjects());
      if (objs.length) this.canvas.add(...objs);
      this.canvas.requestRenderAll();
    } finally {
      this.busy = false;
    }
  }

  /** Use `list` as the background pictures; one that fails to load keeps its data (so saving does not lose it) but is not drawn. */
  private async applyBackgrounds(list: BoxBackground[]) {
    const imgs = await Promise.all(list.map((b) => loadBackgroundImage(b.assetId).catch(() => null)));
    if (imgs.some((i) => !i)) this.cb.onError("A box background image could not be loaded.");
    this.bgs = list;
    this.bgImgs = imgs;
    this.bgSel = list.length ? Math.min(Math.max(this.bgSel, 0), list.length - 1) : -1;
    if (!this.bgImg) this.setBackgroundEdit(false);
    this.cb.onBackgroundSelect?.(this.bgSel);
  }

  getBackgrounds(): readonly BoxBackground[] {
    return this.bgs;
  }

  /** Choose which background picture the edit mode and the panel work on. */
  selectBackground(i: number) {
    if (i < 0 || i >= this.bgs.length || i === this.bgSel) return;
    this.bgSel = i;
    this.bgDrag = null;
    if (this.bgEdit && !this.bgImg) this.setBackgroundEdit(false);
    this.canvas.requestRenderAll();
    this.cb.onBackgroundSelect?.(i);
  }

  /** Put another picture on top of the stack and choose it. One undo step. */
  async addBackground(bg: BoxBackground) {
    if (this.bgs.length >= MAX_BACKGROUNDS) {
      this.cb.onError(`A box can have at most ${MAX_BACKGROUNDS} background pictures. Remove one first.`);
      return;
    }
    const parsed = boxBackground.safeParse(bg);
    if (!parsed.success) {
      this.cb.onError(parsed.error.issues[0]?.message ?? "Invalid value.");
      return;
    }
    await this.applyBackgrounds([...this.bgs, parsed.data]);
    this.bgSel = this.bgs.length - 1;
    this.cb.onBackgroundSelect?.(this.bgSel);
    this.canvas.requestRenderAll();
    this.commit();
  }

  /** Change one background picture (partial patch). One undo step. */
  async patchBackground(i: number, patch: Partial<BoxBackground>) {
    const cur = this.bgs[i];
    if (!cur) return;
    const parsed = boxBackground.safeParse({ ...cur, ...patch });
    if (!parsed.success) {
      this.cb.onError(parsed.error.issues[0]?.message ?? "Invalid value.");
      return;
    }
    if (parsed.data.assetId !== cur.assetId || !this.bgImgs[i]) {
      await this.applyBackgrounds(this.bgs.map((b, k) => (k === i ? parsed.data : b)));
    } else {
      this.bgs[i] = parsed.data;
    }
    this.canvas.requestRenderAll();
    this.commit();
  }

  /** Take one background picture away. One undo step. */
  async removeBackground(i: number) {
    if (!this.bgs[i]) return;
    const sel = this.bgSel > i || this.bgSel === this.bgs.length - 1 ? this.bgSel - 1 : this.bgSel;
    this.bgSel = sel;
    await this.applyBackgrounds(this.bgs.filter((_, k) => k !== i));
    this.canvas.requestRenderAll();
    this.commit();
  }

  /** Move a background picture up (+1) or down (-1) the stack; it stays the chosen one. One undo step. */
  moveBackground(i: number, delta: -1 | 1) {
    const k = i + delta;
    if (!this.bgs[i] || k < 0 || k >= this.bgs.length) return;
    [this.bgs[i], this.bgs[k]] = [this.bgs[k]!, this.bgs[i]!];
    [this.bgImgs[i], this.bgImgs[k]] = [this.bgImgs[k]!, this.bgImgs[i]!];
    if (this.bgSel === i) this.bgSel = k;
    else if (this.bgSel === k) this.bgSel = i;
    this.cb.onBackgroundSelect?.(this.bgSel);
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
    return this.bgs.length ? { objects, backgrounds: [...this.bgs] } : { objects };
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

  /**
   * Place an uploaded image, fitted to 60% of the default panel. Without `at` it goes in the middle of
   * that panel; with `at` (a point of the canvas element, px: where it was dropped) its centre is there
   * and it belongs to the panel under that point.
   */
  async addImage(assetId: string, fileName: string, at?: { x: number; y: number }) {
    const probe = await FabricImage.fromURL(assetUrl(assetId));
    const { t, base } = this.baseFor(fileName.replace(/\.[a-z]+$/i, "").slice(0, 60) || "Image");
    const k = Math.min((t.w * 0.6) / probe.width, (t.h * 0.6) / probe.height);
    const place = at ? anchorFor(this.idx, this.sceneAt(at.x, at.y)) : {};
    await this.insert({ ...base, ...place, type: "image", assetId, width: probe.width * k, height: probe.height * k, flipX: false, flipY: false });
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

  /** Rename a layer (kept as typed, up to 80 characters; an empty name is ignored). */
  rename(id: string, name: string) {
    const o = this.find(id);
    const m = o && metaOf(o);
    const next = name.trim().slice(0, 80);
    if (!m || !next || next === m.name) return;
    m.name = next;
    this.commit();
  }

  /** Put a layer at a place in the stack: 0 = bottom (what the layer list shows last). */
  moveTo(id: string, index: number) {
    const o = this.find(id);
    if (!o) return;
    const objs = this.canvas.getObjects();
    const to = Math.max(0, Math.min(objs.length - 1, index));
    if (objs.indexOf(o) === to) return;
    this.canvas.moveObjectTo(o, to);
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
    const groups = new Map<string, string>(); // a copied group becomes a new group of its own
    for (const d of data) {
      const gid = d.groupId ? (groups.get(d.groupId) ?? groups.set(d.groupId, newId()).get(d.groupId)) : undefined;
      const copy = { ...d, id: newId(), name: `${d.name} copy`.slice(0, 80), dx: d.dx + 5, dy: d.dy + 5, locked: false, ...(gid ? { groupId: gid } : {}) };
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
    if (this.bgEdit && this.bg) {
      this.bg = { ...this.bg, dx: this.bg.dx + dx, dy: this.bg.dy + dy };
      this.canvas.requestRenderAll();
      this.commit();
      return;
    }
    const a = this.canvas.getActiveObject();
    if (!a || (a instanceof Textbox && a.isEditing)) return;
    if (metaOf(a)?.locked) return;
    a.set({ left: a.left + dx, top: a.top + dy });
    a.setCoords();
    this.canvas.requestRenderAll();
    this.commit();
  }

  /**
   * Align the selected objects. `to` "panel": each to the edges/centre of the panel it sits on.
   * `to` "selection": to the edges/centre of the whole selection (needs two or more objects).
   */
  align(mode: AlignMode, to: "panel" | "selection" = "panel") {
    const objs = this.canvas.getActiveObjects();
    if (!objs.length) return;
    this.canvas.discardActiveObject(); // so coordinates are absolute
    const boundsOf = (o: FabricObject) => {
      const c = o.getCoords();
      return { minX: Math.min(...c.map((p) => p.x)), maxX: Math.max(...c.map((p) => p.x)), minY: Math.min(...c.map((p) => p.y)), maxY: Math.max(...c.map((p) => p.y)) };
    };
    const all = objs.map(boundsOf);
    const union = { minX: Math.min(...all.map((b) => b.minX)), maxX: Math.max(...all.map((b) => b.maxX)), minY: Math.min(...all.map((b) => b.minY)), maxY: Math.max(...all.map((b) => b.maxY)) };
    for (const o of objs) {
      const data = fromFabric(o, this.idx);
      if (!data || data.locked) continue;
      const panel = data.panelId ? this.idx.panels.get(data.panelId) : undefined;
      const poly = panel?.polygon;
      const pb = to === "selection" && objs.length > 1 ? union : poly
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

  // ---------------------------------------------------------------- groups, stacking, transforms

  /** Select these objects (one, or several as a selection). */
  private selectObjects(objs: FabricObject[]) {
    this.canvas.discardActiveObject();
    if (objs.length === 1) this.canvas.setActiveObject(objs[0]!);
    else if (objs.length > 1) this.canvas.setActiveObject(new ActiveSelection(objs, { canvas: this.canvas }));
    this.canvas.requestRenderAll();
  }

  /** Choosing one member of a group chooses the whole group. Returns true when it changed the selection. */
  private expandToGroups(): boolean {
    const active = this.canvas.getActiveObjects();
    const ids = new Set(active.map((o) => metaOf(o)?.groupId).filter((g): g is string => Boolean(g)));
    if (ids.size === 0) return false;
    const all = this.canvas.getObjects().filter((o) => o.visible && (active.includes(o) || ids.has(metaOf(o)?.groupId ?? "")));
    if (all.length === active.length) return false;
    this.expanding = true;
    try {
      this.selectObjects(all);
    } finally {
      this.expanding = false;
    }
    return true;
  }

  /** Put the stack in exactly this order (bottom first). */
  private applyOrder(order: FabricObject[]) {
    order.forEach((o, i) => this.canvas.moveObjectTo(o, i));
  }

  /** Where the selection sits in the stack: all on top, all at the bottom, or neither (for greying out the arrange commands). */
  stackState(): { atTop: boolean; atBottom: boolean } {
    const chosen = new Set(this.canvas.getActiveObjects());
    const all = this.canvas.getObjects();
    const k = chosen.size;
    return { atTop: k > 0 && all.slice(all.length - k).every((o) => chosen.has(o)), atBottom: k > 0 && all.slice(0, k).every((o) => chosen.has(o)) };
  }

  /**
   * Change the stacking of the selected objects (their order among themselves stays):
   * "front" / "back" to the very top / bottom, "forward" / "backward" one step.
   */
  arrange(mode: "front" | "forward" | "backward" | "back") {
    const chosen = new Set(this.canvas.getActiveObjects());
    if (chosen.size === 0) return;
    const before = this.canvas.getObjects().slice();
    const picked = before.filter((o) => chosen.has(o)); // bottom first
    const rest = before.filter((o) => !chosen.has(o));
    let order: FabricObject[];
    if (mode === "front") order = [...rest, ...picked];
    else if (mode === "back") order = [...picked, ...rest];
    else {
      // One step: each chosen object swaps with its neighbour, unless that neighbour is chosen too.
      order = before.slice();
      const walk = mode === "forward" ? [...picked].reverse() : picked;
      for (const o of walk) {
        const i = order.indexOf(o);
        const j = mode === "forward" ? i + 1 : i - 1;
        if (j < 0 || j >= order.length || chosen.has(order[j]!)) continue;
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
    }
    if (order.every((o, i) => o === before[i])) return;
    this.canvas.discardActiveObject(); // objects of a selection are moved one by one
    this.applyOrder(order);
    this.selectObjects(picked);
    this.commit();
  }

  /** Join the selected objects into a group. They also become neighbours in the stack, at the place of the top one. */
  group() {
    const chosen = new Set(this.canvas.getActiveObjects());
    if (chosen.size < 2) return;
    const all = this.canvas.getObjects().slice();
    const picked = all.filter((o) => chosen.has(o));
    const rest = all.filter((o) => !chosen.has(o));
    const topIndex = all.lastIndexOf(picked.at(-1)!);
    const below = all.slice(0, topIndex).filter((o) => !chosen.has(o)).length;
    const gid = newId();
    this.canvas.discardActiveObject();
    this.applyOrder([...rest.slice(0, below), ...picked, ...rest.slice(below)]);
    for (const o of picked) {
      const m = metaOf(o);
      if (m) m.groupId = gid;
    }
    this.selectObjects(picked);
    this.commit();
  }

  /** Dissolve the groups the selection belongs to; the objects stay selected. */
  ungroup() {
    const active = this.canvas.getActiveObjects();
    const ids = new Set(active.map((o) => metaOf(o)?.groupId).filter((g): g is string => Boolean(g)));
    if (ids.size === 0) return;
    for (const o of this.canvas.getObjects()) {
      const m = metaOf(o);
      if (m?.groupId && ids.has(m.groupId)) delete m.groupId;
    }
    this.commit();
  }

  /** Spread three or more selected objects so the gaps between them are equal (the outer two stay). */
  distribute(axis: "h" | "v") {
    const objs = this.canvas.getActiveObjects();
    if (objs.length < 3) return;
    this.canvas.discardActiveObject();
    const lo = axis === "h" ? "minX" : "minY";
    const hi = axis === "h" ? "maxX" : "maxY";
    const items = objs
      .map((o) => {
        const c = o.getCoords();
        const xs = c.map((p) => p.x);
        const ys = c.map((p) => p.y);
        return { o, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
      })
      .sort((a, b) => a[lo] - b[lo]);
    const span = Math.max(...items.map((i) => i[hi])) - items[0]![lo];
    const used = items.reduce((n, i) => n + (i[hi] - i[lo]), 0);
    const gap = (span - used) / (items.length - 1);
    let at = items[0]![lo];
    for (const i of items) {
      const d = at - i[lo];
      if (!metaOf(i.o)?.locked) {
        i.o.set(axis === "h" ? { left: i.o.left + d } : { top: i.o.top + d });
        i.o.setCoords();
      }
      at += i[hi] - i[lo] + gap;
    }
    this.selectObjects(objs);
    this.commit();
  }

  /** Make the whole selection bigger or smaller by `factor` (around its middle). Refused if an object would leave the allowed size range. */
  scaleSelection(factor: number) {
    const a = this.canvas.getActiveObject();
    if (!a || !Number.isFinite(factor) || factor <= 0) return;
    const sx = a.scaleX;
    const sy = a.scaleY;
    a.set({ scaleX: sx * factor, scaleY: sy * factor });
    a.setCoords();
    // An object scaled out of range would fail the artwork check and silently vanish from the saved file: undo instead.
    if (this.toArtwork().objects.length !== this.canvas.getObjects().length) {
      a.set({ scaleX: sx, scaleY: sy });
      a.setCoords();
      this.canvas.requestRenderAll();
      this.cb.onError("That size is outside the allowed range for one of the objects.");
      return;
    }
    this.canvas.requestRenderAll();
    this.canvas.fire("object:modified", { target: a } as never);
  }

  /** Turn the whole selection clockwise by `deg` degrees around its middle. */
  rotateSelection(deg: number) {
    const a = this.canvas.getActiveObject();
    if (!a || !Number.isFinite(deg)) return;
    a.rotate(a.angle + deg);
    a.setCoords();
    this.canvas.requestRenderAll();
    this.canvas.fire("object:modified", { target: a } as never);
  }

  dispose() {
    if (this.textTimer) clearTimeout(this.textTimer);
    this.offRightPan();
    void this.canvas.dispose();
  }
}
