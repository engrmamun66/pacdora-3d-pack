"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import type { DielineGeometry } from "@packaging/dieline-engine";
import { buildCartonModel, disposeCartonModel, type CartonModel, type TextureRect } from "@packaging/model3d";
import { cameraToView, viewToCamera, type ViewSettings } from "@/lib/view-settings";

export interface CartonViewProps {
  geo: DielineGeometry;
  /** Outside artwork in flat-sheet space (already includes the board colour). */
  texture: HTMLCanvasElement | null;
  textureRect: TextureRect | null;
  /** 0 = flat, 1 = closed. */
  progress: number;
  outsideColor: string;
  insideColor: string;
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
  /** Binary glTF of the carton as shown (metres, y up). */
  exportGlb(): Promise<Blob>;
}

/** Interactive 3D carton built from the engine's fold tree (three.js, no React renderer). */
export const CartonView = forwardRef<CartonViewHandle, CartonViewProps>(function CartonView(
  { geo, texture, textureRect, progress, outsideColor, insideColor, className, autoRotate = false, transparent = false, shadows = true, frameMm, rotateOnly = false, initialView = null, onViewChange },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const transparentAtStart = useRef(transparent);
  const shadowsAtStart = useRef(shadows);
  const rotateOnlyAtStart = useRef(rotateOnly);
  const initialViewRef = useRef(initialView);
  const onViewChangeRef = useRef(onViewChange);
  const progressRef = useRef(progress);
  useEffect(() => {
    initialViewRef.current = initialView;
    onViewChangeRef.current = onViewChange;
    progressRef.current = progress;
  });
  const gridObj = useRef<THREE.GridHelper | null>(null);
  const gridOn = useRef(false);
  /** Cell size (mm) of the floor grid; set when the camera is framed. */
  const gridStep = useRef(10);
  const rotationListeners = useRef(new Set<(r: Rotation) => void>());
  const rebuild = useRef<(p: number, hingeProgress?: Readonly<Record<string, number>>) => void>(() => {});
  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    sun: THREE.DirectionalLight;
    model: CartonModel | null;
    tex: THREE.CanvasTexture | null;
    texSource: HTMLCanvasElement | null;
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

  useImperativeHandle(ref, () => ({
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
    exportGlb: async () => {
      const model = three.current?.model;
      if (!model) throw new Error("No 3D model to export.");
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
    },
    snapshot: (size) => {
      const t = three.current;
      if (!t) return null;
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
    },
  }));

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
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc9c2b4, 2.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
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

    three.current = { renderer, scene, camera, controls, sun, model: null, tex: null, texSource: null };
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
    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
    return () => {
      ro.disconnect();
      controls.removeEventListener("change", onChange);
      renderer.setAnimationLoop(null);
      const t = three.current;
      if (gridObj.current) {
        gridObj.current.geometry.dispose();
        (gridObj.current.material as THREE.Material).dispose();
        gridObj.current = null;
      }
      if (t?.model) disposeCartonModel(t.model);
      t?.tex?.dispose();
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
    const useTex = Boolean(t.tex && textureRect);
    const build = (p: number, hingeProgress?: Readonly<Record<string, number>>) => {
      if (t.model) {
        t.scene.remove(t.model.object);
        disposeCartonModel(t.model);
      }
      t.model = buildCartonModel(geo, {
        progress: p,
        ...(hingeProgress ? { hingeProgress } : {}),
        outsideTexture: useTex ? t.tex : null,
        ...(useTex && textureRect ? { textureRect } : {}),
        outsideColor: useTex ? 0xffffff : outsideColor, // the texture already contains the board colour
        insideColor,
      });
      t.model.object.position.y = t.model.size.y / 2 + 0.5;
      t.scene.add(t.model.object);
    };
    build(progress);
    rebuild.current = build;
    if (lastGeo.current !== geo) {
      lastGeo.current = geo;
      frame();
    }
  // `frame` only reads frameMm, which stays constant for the life of a view.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, texture, textureRect, progress, outsideColor, insideColor]);

  return <div ref={host} className={className} data-testid="carton-3d" />;
});
