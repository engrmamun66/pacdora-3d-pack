"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { DielineGeometry, WatermarkSpec } from "@packaging/dieline-engine";
import { buildCartonModel, disposeCartonModel, type CartonModel, type TextureRect } from "@packaging/model3d";
import { cameraToView, viewToCamera, type ViewSettings } from "@/lib/view-settings";
import { drawWatermark } from "@/lib/watermark-canvas";

/** Fine, repeatable speckle and fibres, so a plain board colour reads as board and not as paint. */
function paintGrain(c: CanvasRenderingContext2D, w: number, h: number, strength: number): void {
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const dots = Math.min(220000, Math.round((w * h) / 28));
  for (let i = 0; i < dots; i++) {
    c.fillStyle = rnd() < 0.5 ? `rgba(70,45,15,${(0.07 * strength).toFixed(3)})` : `rgba(255,240,210,${(0.07 * strength).toFixed(3)})`;
    c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  c.lineWidth = 1;
  const fibres = Math.min(9000, Math.round((w * h) / 700));
  for (let i = 0; i < fibres; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    c.strokeStyle = rnd() < 0.5 ? `rgba(60,38,10,${(0.06 * strength).toFixed(3)})` : `rgba(255,238,205,${(0.08 * strength).toFixed(3)})`;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + (rnd() - 0.5) * 14, y + (rnd() - 0.5) * 3);
    c.stroke();
  }
}

/**
 * The outside and inside of the carton as pictures: artwork (outside) or the board colour, with the board grain
 * and the watermark on them. `rect` is the part of the flat sheet (mm) both cover. The inside has the watermark
 * mirrored, so it reads the right way from inside the box.
 */
function boardPictures(geo: DielineGeometry, spec: WatermarkSpec | null, art: HTMLCanvasElement | null, artRect: TextureRect | null, outsideColor: string, insideColor: string, grain: number): { outside: HTMLCanvasElement; inside: HTMLCanvasElement; rect: TextureRect } {
  let rect: TextureRect;
  let w: number;
  let h: number;
  if (art && artRect) {
    rect = artRect;
    w = art.width;
    h = art.height;
  } else {
    const { min, max } = geo.cutBounds;
    rect = { minX: min.x - 2, minY: min.y - 2, width: max.x - min.x + 4, height: max.y - min.y + 4 };
    const px = Math.min(8, 4096 / Math.max(rect.width, rect.height));
    w = Math.ceil(rect.width * px);
    h = Math.ceil(rect.height * px);
  }
  const pxPerMm = w / rect.width;
  const make = (color: string, source: HTMLCanvasElement | null, mirror: boolean) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext("2d")!;
    if (source) c.drawImage(source, 0, 0);
    else {
      c.fillStyle = color;
      c.fillRect(0, 0, w, h);
      if (grain > 0) paintGrain(c, w, h, grain);
    }
    if (spec) drawWatermark(c, geo, spec, rect, pxPerMm, mirror);
    return canvas;
  };
  return { outside: make(outsideColor, art && artRect ? art : null, false), inside: make(insideColor, null, true), rect };
}

/** The cut edge of corrugated board: two liners with a wavy core between them (the picture's height is the thickness). */
const fluteCache = new Map<string, THREE.CanvasTexture>();
function fluteTexture(color: string): THREE.CanvasTexture {
  const cached = fluteCache.get(color);
  if (cached) return cached;
  const w = 128;
  const h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d")!;
  c.fillStyle = color;
  c.fillRect(0, 0, w, h);
  c.strokeStyle = "rgba(70,45,15,0.55)";
  c.lineWidth = 3;
  c.beginPath();
  for (let x = 0; x <= w; x++) {
    const y = h / 2 + Math.sin((x / w) * Math.PI * 2 * 2) * (h * 0.28);
    if (x === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();
  c.fillStyle = "rgba(70,45,15,0.45)";
  c.fillRect(0, 0, w, 6); // the two liners
  c.fillRect(0, h - 6, w, 6);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  fluteCache.set(color, tex);
  return tex;
}

export interface CartonViewProps {
  geo: DielineGeometry;
  /** Outside artwork in flat-sheet space (already includes the board colour). */
  texture: HTMLCanvasElement | null;
  textureRect: TextureRect | null;
  /** 0 = flat, 1 = closed. */
  progress: number;
  outsideColor: string;
  insideColor: string;
  /** Board thickness in mm, drawn as the real thickness of the panels. Default 0 (paper-thin). */
  thickness?: number;
  /** Printed faintly on the outside of the box (over the artwork, if any). null/absent = none. */
  watermark?: WatermarkSpec | null;
  /** Fine board grain on the plain board colour (no artwork): 0 = none (default), 1 = kraft-like fibre. `true` = 1. */
  boardGrain?: number | boolean;
  /** The cut edge of the board (with a thickness): its colour, and whether it shows corrugation. Default: a darker board colour. */
  boardEdge?: { color: string; flute?: boolean };
  className?: string;
  /** Slowly orbit the camera (the user can still drag). Default off. */
  autoRotate?: boolean;
  /** Transparent canvas instead of the grey studio background. Read once, when the view is created. */
  transparent?: boolean;
  /**
   * Rotate only: no wheel zoom, no panning, and vertical touch drags still scroll the page.
   * For decorative views that sit inside a scrolling page. Read once, when the view is created.
   */
  rotateOnly?: boolean;
  /** Cast shadows. Read once, when the view is created. Default on. */
  shadows?: boolean;
  /** Size (mm) the camera is framed for, instead of the folded carton's size. Use it when the fold animation opens the sheet wide. */
  frameMm?: number;
  /** Camera the view starts with (and "reset view" returns to), e.g. set by an admin per template. Null = standard framing. */
  initialView?: ViewSettings | null;
  /** Called (at most once per frame) while the camera moves, with the current view. */
  onViewChange?: (v: ViewSettings) => void;
  /** Called once, on the frame after the box is first built and drawn (so a loading placeholder can go away). */
  onReady?: () => void;
}

/** Camera angles in degrees. */
export interface Rotation {
  x: number;
  y: number;
  z: number;
}

export interface CartonViewHandle {
  /** The carton object currently shown (for GLB export). */
  getModelObject(): THREE.Object3D | null;
  resetView(): void;
  /** The camera as a template view (rotation, zoom, pan) plus the current fold amount; null before the model exists. */
  getView(): ViewSettings | null;
  /** Move the camera to a view. */
  setView(v: ViewSettings): void;
  /** Where the camera is turned, in degrees: x = tilt up/down, y = turn left/right, z = roll (the view turned like a tilted head); null before the model exists. */
  getRotation(): Rotation | null;
  /** Turn the camera to this tilt (x), turn (y) and/or roll (z), in degrees. Zoom and position are kept. */
  setRotation(r: Partial<Rotation>): void;
  /** Show or hide a floor grid (10 mm-style cells) behind the carton. */
  setGridVisible(on: boolean): void;
  isGridVisible(): boolean;
  /** Blink one panel softly (by its panel id) so it can be found on the box; null stops it. Kept when the box is rebuilt. */
  highlightPanel(id: string | null): void;
  /**
   * Keep the camera (turn, tilt, roll, zoom, pan) when the model is rebuilt for new geometry, instead of framing
   * the new box from the standard position. Only the 3D object changes. The view is kept relative to the box size.
   */
  setKeepView(on: boolean): void;
  isKeepView(): boolean;
  /** Be told when the camera moves (dragging, buttons, reset). Returns the way to stop. */
  onRotation(cb: (r: Rotation) => void): () => void;
  /**
   * PNG (data URL) of the current view. With `size` it is drawn at exactly that many pixels
   * (same camera, the picture is just cut to that shape), and the view on screen is left as it was.
   */
  snapshot(size?: { width: number; height: number }): string | null;
  /**
   * Rebuild the model at this fold amount right now, without a React render (for smooth animation).
   * `hingeProgress` (hinge id -> 0..1) overrides single hinges, for staged folds.
   */
  setProgress(p: number, hingeProgress?: Readonly<Record<string, number>>): void;
  /**
   * Binary glTF of the carton as shown (metres, y up). With a watermark, it is printed on the outside
   * of the panels (over the artwork, if there is any), like on the flat sheet.
   */
  exportGlb(watermark?: WatermarkSpec | null): Promise<Blob>;
}

/** Interactive 3D carton built from the engine's fold tree (three.js, no React renderer). */
export const CartonView = forwardRef<CartonViewHandle, CartonViewProps>(function CartonView(
  { geo, texture, textureRect, progress, outsideColor, insideColor, thickness = 0, watermark = null, boardGrain = 0, boardEdge, className, autoRotate = false, transparent = false, shadows = true, frameMm, rotateOnly = false, initialView = null, onViewChange, onReady },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const grainAmount = boardGrain === true ? 1 : boardGrain === false ? 0 : boardGrain;
  const transparentAtStart = useRef(transparent);
  const shadowsAtStart = useRef(shadows);
  const rotateOnlyAtStart = useRef(rotateOnly);
  const initialViewRef = useRef(initialView);
  const onViewChangeRef = useRef(onViewChange);
  const onReadyRef = useRef(onReady);
  const readyFired = useRef(false);
  const progressRef = useRef(progress);
  useEffect(() => {
    initialViewRef.current = initialView;
    onViewChangeRef.current = onViewChange;
    onReadyRef.current = onReady;
    progressRef.current = progress;
  });
  /** The panel that blinks (id), the blink overlays now on the model, and their shared materials. */
  const blinkId = useRef<string | null>(null);
  const blinkMeshes = useRef<THREE.Mesh[]>([]);
  const blinkMats = useRef<{ front: THREE.MeshBasicMaterial; through: THREE.MeshBasicMaterial } | null>(null);
  const gridObj = useRef<THREE.GridHelper | null>(null);
  const gridOn = useRef(false);
  const keepView = useRef(false);
  /** Cell size (mm) of the floor grid; set when the camera is framed. */
  const gridStep = useRef(10);
  const rotationListeners = useRef(new Set<(r: Rotation) => void>());
  const rebuild = useRef<(p: number, hingeProgress?: Readonly<Record<string, number>>) => void>(() => {});
  /** The fold amount the model was last built at (an export rebuilds the model with the same fold). */
  const lastBuild = useRef<{ p: number; hp?: Readonly<Record<string, number>> }>({ p: progress });
  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    sun: THREE.DirectionalLight;
    model: CartonModel | null;
    tex: THREE.CanvasTexture | null;
    texSource: HTMLCanvasElement | null;
    /** The outside picture with the watermark on it, kept until something it is made from changes. */
    wm: { outside: THREE.CanvasTexture; inside: THREE.CanvasTexture; rect: TextureRect; geo: DielineGeometry; art: HTMLCanvasElement | null; artRect: TextureRect | null; spec: WatermarkSpec | null; color: string; inColor: string; grain: number } | null;
  } | null>(null);
  /** Geometry the camera was last framed for (reset when the renderer is recreated). */
  const lastGeo = useRef<DielineGeometry | null>(null);

  /** Reference size and centre the views are measured against. */
  const frameBase = () => {
    const t = three.current;
    if (!t?.model) return null;
    const r = frameMm ?? Math.max(t.model.size.x, t.model.size.y, t.model.size.z);
    return { r, base: [0, t.model.size.y / 2, 0] as [number, number, number] };
  };

  /**
   * Make `up` the camera's up direction, and the axis the mouse orbits around. OrbitControls works
   * out its "up" once, when it is created, so its private copy is updated here as well. That keeps
   * dragging natural after the view has been rolled: left/right still turns around the screen's vertical.
   */
  const setCameraUp = (up: THREE.Vector3) => {
    const t = three.current;
    if (!t) return;
    t.camera.up.copy(up);
    const c = t.controls as unknown as { _quat: THREE.Quaternion; _quatInverse: THREE.Quaternion };
    c._quat.setFromUnitVectors(up, new THREE.Vector3(0, 1, 0));
    c._quatInverse.copy(c._quat).invert();
    t.camera.lookAt(t.controls.target);
  };

  /** The camera's line of sight, and the world "up" cut down to the part that is square to it (what an unrolled camera would use). */
  const sight = () => {
    const t = three.current;
    if (!t) return null;
    const d = t.controls.target.clone().sub(t.camera.position).normalize();
    let base = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y);
    if (base.lengthSq() < 1e-8) base = new THREE.Vector3(0, 0, -1).addScaledVector(d, -d.z); // looking straight up or down
    return { d, base: base.normalize() };
  };

  /** Roll of the view in degrees (0 = upright). Positive turns the picture clockwise. */
  const getRoll = (): number => {
    const t = three.current;
    const s = sight();
    if (!t || !s) return 0;
    const up = t.camera.up.clone().addScaledVector(s.d, -t.camera.up.dot(s.d)).normalize();
    const angle = Math.atan2(s.d.dot(new THREE.Vector3().crossVectors(s.base, up)), s.base.dot(up));
    const deg = (-angle * 180) / Math.PI;
    return Math.abs(deg) < 0.05 ? 0 : Math.round(deg * 10) / 10;
  };

  const applyRoll = (rollDeg: number) => {
    const s = sight();
    if (!s) return;
    setCameraUp(s.base.clone().applyAxisAngle(s.d, (-rollDeg * Math.PI) / 180));
  };

  /** Move the camera to a view (position, zoom, pan and roll). */
  const applyView = (v: ViewSettings) => {
    const t = three.current;
    const fb = frameBase();
    if (!t || !fb) return;
    const { position, target } = viewToCamera(v, fb.base, fb.r);
    t.camera.position.set(...position);
    t.controls.target.set(...target);
    applyRoll(v.rollDeg);
    t.controls.update();
  };

  const getView = (): ViewSettings | null => {
    const t = three.current;
    const fb = frameBase();
    if (!t || !fb) return null;
    const p = t.camera.position;
    const c = t.controls.target;
    return cameraToView([p.x, p.y, p.z], [c.x, c.y, c.z], fb.base, fb.r, progressRef.current, getRoll());
  };

  const getRotation = (): Rotation | null => {
    const v = getView();
    return v ? { x: v.elevationDeg, y: v.azimuthDeg, z: v.rollDeg } : null;
  };

  /** (Re)build the floor grid, or remove it. Cells are round millimetre sizes, so they read as a scale. */
  const rebuildGrid = () => {
    const t = three.current;
    if (!t) return;
    if (gridObj.current) {
      t.scene.remove(gridObj.current);
      gridObj.current.geometry.dispose();
      (gridObj.current.material as THREE.Material).dispose();
      gridObj.current = null;
    }
    if (!gridOn.current) return;
    const cells = 40;
    const g = new THREE.GridHelper(gridStep.current * cells, cells, 0x8f8f8a, 0xc4c4bf);
    const m = g.material as THREE.LineBasicMaterial;
    m.transparent = true;
    m.opacity = 0.8;
    m.depthWrite = false;
    g.position.y = 0.3; // just under the carton's bottom, above the shadow plane
    t.scene.add(g);
    gridObj.current = g;
  };

  const notifyRotation = () => {
    if (!rotationListeners.current.size) return;
    const r = getRotation();
    if (r) rotationListeners.current.forEach((cb) => cb(r));
  };

  const frame = () => {
    const t = three.current;
    if (!t?.model) return;
    setCameraUp(new THREE.Vector3(0, 1, 0)); // back to upright
    const r = frameMm ?? Math.max(t.model.size.x, t.model.size.y, t.model.size.z);
    gridStep.current = Math.max(5, Math.round(r / 4 / 10) * 10);
    rebuildGrid();
    t.camera.position.set(r * 1.6, r * 1.3, r * 2.2);
    t.camera.near = r / 100;
    t.camera.far = r * 50;
    t.camera.updateProjectionMatrix();
    t.controls.target.set(0, t.model.size.y / 2, 0);
    t.sun.position.set(r * 2, r * 4, r * 2.5);
    const sc = t.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = sc.bottom = -r * 2;
    sc.right = sc.top = r * 2;
    sc.far = r * 10;
    sc.updateProjectionMatrix();
    t.controls.update();
    if (initialViewRef.current) applyView(initialViewRef.current);
    notifyRotation();
  };

  /** Put the blink overlays on the panel named in `blinkId` (after the model changed, or the choice did). */
  const applyBlink = () => {
    for (const m of blinkMeshes.current) m.parent?.remove(m);
    blinkMeshes.current = [];
    const t = three.current;
    const id = blinkId.current;
    if (!t?.model || !id) return;
    const group = t.model.object.getObjectByName(id);
    const face = group?.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh);
    if (!group || !face) return;
    if (!blinkMats.current) {
      const base = { color: 0x2f6bff, transparent: true, side: THREE.DoubleSide, depthWrite: false } as const;
      blinkMats.current = {
        // On the faces of the panel (polygon offset keeps it from flickering against the face).
        front: new THREE.MeshBasicMaterial({ ...base, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
        // A faint pass that ignores depth: a panel hidden inside the closed box still shows where it is.
        through: new THREE.MeshBasicMaterial({ ...base, depthTest: false }),
      };
    }
    const { front, through } = blinkMats.current;
    const board = thickness > 0 ? thickness : 0;
    // The printed face lies one board thickness outside the dieline face (z = 0 .. -board); sit just off both.
    const lift = 0.06;
    const add = (z: number, mat: THREE.MeshBasicMaterial, order: number) => {
      const m = new THREE.Mesh(face.geometry, mat);
      m.position.z = z;
      m.renderOrder = order;
      m.raycast = () => {};
      group.add(m);
      blinkMeshes.current.push(m);
    };
    add(lift, front, 5);
    add(-board - lift, front, 5);
    add(-board / 2, through, 6);
  };

  useImperativeHandle(ref, () => ({
    highlightPanel: (id) => {
      blinkId.current = id;
      applyBlink();
    },
    setProgress: (p, hingeProgress) => rebuild.current(p, hingeProgress),
    getModelObject: () => three.current?.model?.object ?? null,
    resetView: frame,
    getView,
    setView: (v) => applyView(v),
    setGridVisible: (on) => {
      gridOn.current = on;
      rebuildGrid();
    },
    isGridVisible: () => gridOn.current,
    setKeepView: (on) => {
      keepView.current = on;
    },
    isKeepView: () => keepView.current,
    getRotation,
    setRotation: (r) => {
      const v = getView();
      if (!v) return;
      applyView({
        ...v,
        ...(r.y === undefined ? {} : { azimuthDeg: Math.max(-180, Math.min(180, r.y)) }),
        ...(r.x === undefined ? {} : { elevationDeg: Math.max(-89, Math.min(89, r.x)) }),
        ...(r.z === undefined ? {} : { rollDeg: Math.max(-180, Math.min(180, r.z)) }),
      });
    },
    onRotation: (cb) => {
      rotationListeners.current.add(cb);
      return () => {
        rotationListeners.current.delete(cb);
      };
    },
    exportGlb: async (watermark) => {
      const t = three.current;
      const shown = t?.model;
      if (!t || !shown) throw new Error("No 3D model to export.");
      let model = shown;
      let temp: { model: CartonModel; tex: THREE.CanvasTexture[] } | null = null;
      if (watermark) {
        // A copy of the model whose outside carries the watermark (and the artwork under it).
        const pics = boardPictures(geo, watermark, t.texSource, textureRect, outsideColor, insideColor, grainAmount);
        const rect = pics.rect;
        const tex = new THREE.CanvasTexture(pics.outside);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = t.renderer.capabilities.getMaxAnisotropy();
        const inTex = new THREE.CanvasTexture(pics.inside);
        inTex.colorSpace = THREE.SRGBColorSpace;
        const { p, hp } = lastBuild.current;
        model = buildCartonModel(geo, { progress: p, ...(hp ? { hingeProgress: hp } : {}), outsideTexture: tex, textureRect: rect, outsideColor: 0xffffff, insideTexture: inTex, insideColor, thickness, ...(boardEdge ? { boardEdgeColor: boardEdge.color, ...(boardEdge.flute ? { boardEdgeTexture: fluteTexture(boardEdge.color) } : {}) } : {}) });
        temp = { model, tex: [tex, inTex] };
      }
      try {
        // glTF uses metres; the scene is in millimetres. Export a scaled copy, standing on y = 0.
        const root = new THREE.Group();
        root.name = "carton";
        root.scale.setScalar(0.001);
        const copy = model.object.clone(true);
        copy.position.set(0, model.size.y / 2, 0);
        root.add(copy);
        root.updateMatrixWorld(true);
        const result = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true });
        if (!(result instanceof ArrayBuffer)) throw new Error("GLB export failed.");
        return new Blob([result], { type: "model/gltf-binary" });
      } finally {
        if (temp) {
          disposeCartonModel(temp.model);
          temp.tex.forEach((x) => x.dispose());
        }
      }
    },
    snapshot: (size) => {
      const t = three.current;
      if (!t) return null;
      // Pictures never show the helper grid.
      const grid = gridObj.current;
      const gridWas = grid?.visible ?? false;
      if (grid) grid.visible = false;
      try {
        return takeSnapshot(t, size);
      } finally {
        if (grid) grid.visible = gridWas;
        if (gridWas) t.renderer.render(t.scene, t.camera);
      }
    },
  }));

  const takeSnapshot = (t: NonNullable<typeof three.current>, size?: { width: number; height: number }): string => {
    if (!size) {
      t.renderer.render(t.scene, t.camera);
      return t.renderer.domElement.toDataURL("image/png");
    }
    const shown = t.renderer.getSize(new THREE.Vector2());
    const ratio = t.renderer.getPixelRatio();
    const aspect = t.camera.aspect;
    t.renderer.setPixelRatio(1);
    t.renderer.setSize(size.width, size.height, false);
    t.camera.aspect = size.width / size.height;
    t.camera.updateProjectionMatrix();
    t.renderer.render(t.scene, t.camera);
    const url = t.renderer.domElement.toDataURL("image/png");
    t.renderer.setPixelRatio(ratio);
    t.renderer.setSize(shown.x, shown.y, false);
    t.camera.aspect = aspect;
    t.camera.updateProjectionMatrix();
    t.renderer.render(t.scene, t.camera);
    return url;
  };

  // Renderer, scene, lights: once.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: transparentAtStart.current });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = shadowsAtStart.current;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.NeutralToneMapping; // keeps print colours close to the artwork
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    if (!transparentAtStart.current) scene.background = new THREE.Color(0xf4f4f2);
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    if (rotateOnlyAtStart.current) {
      controls.enableZoom = false; // the mouse wheel must keep scrolling the page
      controls.enablePan = false;
      renderer.domElement.style.touchAction = "pan-y"; // vertical swipes scroll the page, horizontal ones turn the box
    }
    // Soft studio light from all sides (so no face goes flat and dark), plus one sun for the shadow.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const studio = pmrem.fromScene(new RoomEnvironment(), 0.04);
    pmrem.dispose();
    scene.environment = studio.texture;
    scene.environmentIntensity = 0.42;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc9c2b4, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 1.25);
    sun.castShadow = shadowsAtStart.current;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005; // scene units are mm
    sun.shadow.normalBias = 0.6;
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), new THREE.ShadowMaterial({ opacity: 0.18 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.visible = shadowsAtStart.current;
    scene.add(ground);

    three.current = { renderer, scene, camera, controls, sun, model: null, tex: null, texSource: null, wm: null };
    const resize = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    let notifyQueued = false;
    const onChange = () => {
      if ((!onViewChangeRef.current && !rotationListeners.current.size) || notifyQueued) return;
      notifyQueued = true;
      requestAnimationFrame(() => {
        notifyQueued = false;
        const v = getView();
        if (!v) return;
        onViewChangeRef.current?.(v);
        rotationListeners.current.forEach((cb) => cb({ x: v.elevationDeg, y: v.azimuthDeg, z: v.rollDeg }));
      });
    };
    controls.addEventListener("change", onChange);
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    renderer.setAnimationLoop((now: number) => {
      controls.update();
      const mats = blinkMats.current;
      if (mats && blinkMeshes.current.length > 0) {
        // Soft blink: a slow breathing glow, not a flash.
        const k = 0.5 + 0.5 * Math.sin(now / 240);
        mats.front.opacity = 0.14 + 0.4 * k;
        mats.through.opacity = 0.05 + 0.13 * k;
      }
      renderer.render(scene, camera);
    });
    return () => {
      ro.disconnect();
      controls.removeEventListener("change", onChange);
      renderer.setAnimationLoop(null);
      blinkMats.current?.front.dispose();
      blinkMats.current?.through.dispose();
      blinkMats.current = null;
      blinkMeshes.current = [];
      const t = three.current;
      if (gridObj.current) {
        gridObj.current.geometry.dispose();
        (gridObj.current.material as THREE.Material).dispose();
        gridObj.current = null;
      }
      if (t?.model) disposeCartonModel(t.model);
      scene.environment = null;
      studio.dispose();
      t?.tex?.dispose();
      t?.wm?.outside.dispose();
      t?.wm?.inside.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      three.current = null;
      lastGeo.current = null;
    };
    // getView only reads refs and three.current, so the first render's copy stays correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const c = three.current?.controls;
    if (!c) return;
    c.autoRotate = autoRotate;
    c.autoRotateSpeed = 1.2;
  }, [autoRotate]);

  // Model: rebuilt when geometry, artwork, fold or colours change.
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    if (texture !== t.texSource) {
      t.tex?.dispose();
      t.tex = null;
      if (texture) {
        t.tex = new THREE.CanvasTexture(texture);
        t.tex.colorSpace = THREE.SRGBColorSpace;
        t.tex.anisotropy = t.renderer.capabilities.getMaxAnisotropy();
      }
      t.texSource = texture;
    }
    // With a watermark or board grain the faces are pictures (artwork or board colour, with the grain and watermark on them).
    let outsideTex = t.tex;
    let outsideRect = textureRect;
    let insideTex: THREE.CanvasTexture | null = null;
    if (watermark || grainAmount > 0) {
      let wm = t.wm;
      if (!wm || wm.geo !== geo || wm.art !== texture || wm.artRect !== textureRect || wm.spec !== watermark || wm.color !== outsideColor || wm.inColor !== insideColor || wm.grain !== grainAmount) {
        wm?.outside.dispose();
        wm?.inside.dispose();
        const made = boardPictures(geo, watermark, texture, textureRect, outsideColor, insideColor, grainAmount);
        const outside = new THREE.CanvasTexture(made.outside);
        outside.colorSpace = THREE.SRGBColorSpace;
        outside.anisotropy = t.renderer.capabilities.getMaxAnisotropy();
        const inside = new THREE.CanvasTexture(made.inside);
        inside.colorSpace = THREE.SRGBColorSpace;
        inside.anisotropy = outside.anisotropy;
        wm = { outside, inside, rect: made.rect, geo, art: texture, artRect: textureRect, spec: watermark, color: outsideColor, inColor: insideColor, grain: grainAmount };
        t.wm = wm;
      }
      outsideTex = wm.outside;
      outsideRect = wm.rect;
      insideTex = wm.inside;
    } else if (t.wm) {
      t.wm.outside.dispose();
      t.wm.inside.dispose();
      t.wm = null;
    }
    const useTex = Boolean(outsideTex && outsideRect);
    // With the view kept, note where the camera is (measured against the box that is still shown) before the box is replaced.
    const kept = keepView.current && lastGeo.current !== geo ? getView() : null;
    const build = (p: number, hingeProgress?: Readonly<Record<string, number>>) => {
      lastBuild.current = { p, ...(hingeProgress ? { hp: hingeProgress } : {}) };
      if (t.model) {
        for (const m of blinkMeshes.current) m.parent?.remove(m); // shared geometry and materials stay alive
        blinkMeshes.current = [];
        t.scene.remove(t.model.object);
        disposeCartonModel(t.model);
      }
      t.model = buildCartonModel(geo, {
        progress: p,
        ...(hingeProgress ? { hingeProgress } : {}),
        outsideTexture: useTex ? outsideTex : null,
        ...(useTex && outsideRect ? { textureRect: outsideRect } : {}),
        outsideColor: useTex ? 0xffffff : outsideColor, // the texture already contains the board colour
        ...(useTex && insideTex ? { insideTexture: insideTex } : {}),
        insideColor,
        thickness,
        ...(boardEdge ? { boardEdgeColor: boardEdge.color, ...(boardEdge.flute ? { boardEdgeTexture: fluteTexture(boardEdge.color) } : {}) } : {}),
      });
      t.model.object.position.y = t.model.size.y / 2 + 0.5;
      t.scene.add(t.model.object);
      applyBlink();
    };
    build(progress);
    rebuild.current = build;
    if (!readyFired.current) {
      readyFired.current = true;
      requestAnimationFrame(() => requestAnimationFrame(() => onReadyRef.current?.())); // after the first frame is drawn
    }
    if (lastGeo.current !== geo) {
      lastGeo.current = geo;
      frame();
      if (kept) {
        applyView(kept);
        notifyRotation();
      }
    }
  // `frame` only reads frameMm, which stays constant for the life of a view.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, texture, textureRect, progress, outsideColor, insideColor, thickness, watermark, grainAmount, boardEdge?.color, boardEdge?.flute]);

  return <div ref={host} className={className} data-testid="carton-3d" />;
});
