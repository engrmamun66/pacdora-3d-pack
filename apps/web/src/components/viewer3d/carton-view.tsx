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

export interface CartonViewHandle {
  /** The carton object currently shown (for GLB export). */
  getModelObject(): THREE.Object3D | null;
  resetView(): void;
  /** The camera as a template view (rotation, zoom, pan) plus the current fold amount; null before the model exists. */
  getView(): ViewSettings | null;
  /** Move the camera to a view. */
  setView(v: ViewSettings): void;
  /** PNG snapshot of the current view. */
  snapshot(): string | null;
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

  const applyView = (v: ViewSettings) => {
    const t = three.current;
    const fb = frameBase();
    if (!t || !fb) return;
    const { position, target } = viewToCamera(v, fb.base, fb.r);
    t.camera.position.set(...position);
    t.controls.target.set(...target);
    t.controls.update();
  };

  const getView = (): ViewSettings | null => {
    const t = three.current;
    const fb = frameBase();
    if (!t || !fb) return null;
    const p = t.camera.position;
    const c = t.controls.target;
    return cameraToView([p.x, p.y, p.z], [c.x, c.y, c.z], fb.base, fb.r, progressRef.current);
  };

  const frame = () => {
    const t = three.current;
    if (!t?.model) return;
    const r = frameMm ?? Math.max(t.model.size.x, t.model.size.y, t.model.size.z);
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
  };

  useImperativeHandle(ref, () => ({
    setProgress: (p, hingeProgress) => rebuild.current(p, hingeProgress),
    getModelObject: () => three.current?.model?.object ?? null,
    resetView: frame,
    getView,
    setView: applyView,
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
    snapshot: () => {
      const t = three.current;
      if (!t) return null;
      t.renderer.render(t.scene, t.camera);
      return t.renderer.domElement.toDataURL("image/png");
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
      if (!onViewChangeRef.current || notifyQueued) return;
      notifyQueued = true;
      requestAnimationFrame(() => {
        notifyQueued = false;
        const v = getView();
        if (v) onViewChangeRef.current?.(v);
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
