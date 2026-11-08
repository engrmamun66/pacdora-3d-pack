"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { DielineGeometry } from "@packaging/dieline-engine";
import { buildCartonModel, disposeCartonModel, type CartonModel, type TextureRect } from "@packaging/model3d";

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
}

export interface CartonViewHandle {
  /** The carton object currently shown (for GLB export). */
  getModelObject(): THREE.Object3D | null;
  resetView(): void;
  /** PNG snapshot of the current view. */
  snapshot(): string | null;
}

/** Interactive 3D carton built from the engine's fold tree (three.js, no React renderer). */
export const CartonView = forwardRef<CartonViewHandle, CartonViewProps>(function CartonView(
  { geo, texture, textureRect, progress, outsideColor, insideColor, className },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
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

  const frame = () => {
    const t = three.current;
    if (!t?.model) return;
    const r = Math.max(t.model.size.x, t.model.size.y, t.model.size.z);
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
  };

  useImperativeHandle(ref, () => ({
    getModelObject: () => three.current?.model?.object ?? null,
    resetView: frame,
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
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.NeutralToneMapping; // keeps print colours close to the artwork
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f4f2);
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc9c2b4, 2.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005; // scene units are mm
    sun.shadow.normalBias = 0.6;
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), new THREE.ShadowMaterial({ opacity: 0.18 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
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
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
    return () => {
      ro.disconnect();
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
  }, []);

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
    if (t.model) {
      t.scene.remove(t.model.object);
      disposeCartonModel(t.model);
    }
    const useTex = Boolean(t.tex && textureRect);
    t.model = buildCartonModel(geo, {
      progress,
      outsideTexture: useTex ? t.tex : null,
      ...(useTex && textureRect ? { textureRect } : {}),
      outsideColor: useTex ? 0xffffff : outsideColor, // the texture already contains the board colour
      insideColor,
    });
    t.model.object.position.y = t.model.size.y / 2 + 0.5;
    t.scene.add(t.model.object);
    if (lastGeo.current !== geo) {
      lastGeo.current = geo;
      frame();
    }
  }, [geo, texture, textureRect, progress, outsideColor, insideColor]);

  return <div ref={host} className={className} data-testid="carton-3d" />;
});
