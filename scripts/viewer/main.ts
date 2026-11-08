/**
 * Development viewer: flat dieline (left) and folded 3D carton (right) from
 * the same engine output. The 3D outside texture IS the rendered SVG, so panel
 * labels on the 3D faces prove the UV mapping lands on the correct panels.
 * Not the product UI; the real editor comes with the Next.js app.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ParamValidationError, generateDieline, type DielineGeometry } from "@packaging/dieline-engine";
import { dielineViewBox, renderDielineSvg } from "@packaging/render-svg";
import { buildCartonModel, disposeCartonModel, type CartonModel } from "@packaging/model3d";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $("status");
const flatEl = $("flat");
const host = $("three");
const fold = $<HTMLInputElement>("fold");

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap was removed in three r18x
renderer.toneMapping = THREE.ACESFilmicToneMapping;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f4f2);
const camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0xb0a890, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
// Scene units are mm; bias values tuned to remove self-shadow acne on thin panels.
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.6;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({ opacity: 0.18 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

let geo: DielineGeometry | null = null;
let texture: THREE.Texture | null = null;
let model: CartonModel | null = null;

async function svgTexture(svg: string, widthMm: number, heightMm: number): Promise<THREE.Texture> {
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const scale = Math.min(12, 4096 / Math.max(widthMm, heightMm)); // px per mm
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(widthMm * scale);
  canvas.height = Math.round(heightMm * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function rebuildModel() {
  if (!geo) return;
  if (model) {
    scene.remove(model.object);
    disposeCartonModel(model);
  }
  const rect = dielineViewBox(geo);
  model = buildCartonModel(geo, { progress: Number(fold.value) / 100, outsideTexture: texture, textureRect: rect });
  model.object.position.y = model.size.y / 2 + 0.5; // stand on the ground
  scene.add(model.object);
  $("foldValue").textContent = `${fold.value}%`;
}

function frameCamera() {
  if (!model) return;
  const r = Math.max(model.size.x, model.size.y, model.size.z);
  camera.position.set(r * 1.6, r * 1.3, r * 2.2);
  controls.target.set(0, model.size.y / 2, 0);
  sun.position.set(r * 2, r * 4, r * 2.5);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = sc.bottom = -r * 2;
  sc.right = sc.top = r * 2;
  sc.far = r * 10;
  sc.updateProjectionMatrix();
  controls.update();
}

async function regenerate() {
  const style = $<HTMLSelectElement>("variant").value;
  const dims = {
    width: Number($<HTMLInputElement>("width").value),
    depth: Number($<HTMLInputElement>("depth").value),
    height: Number($<HTMLInputElement>("height").value),
  };
  try {
    const next =
      style === "crash-lock"
        ? generateDieline("crash-lock-carton", dims)
        : style === "slotted-box"
          ? generateDieline("slotted-box", dims)
          : generateDieline("tuck-end-carton", { ...dims, variant: style });
    geo = next;
    flatEl.innerHTML = renderDielineSvg(next, { showPanelLabels: true });
    const vb = dielineViewBox(next);
    const textureSvg = renderDielineSvg(next, { showPanelLabels: true, showAnnotations: false, showBleed: false });
    texture?.dispose();
    texture = await svgTexture(textureSvg, vb.width, vb.height);
    rebuildModel();
    frameCamera();
    const passed = next.checks.filter((c) => c.pass).length;
    status.className = "";
    status.textContent =
      `Checks: ${passed}/${next.checks.length} pass\n` +
      `Closed size: ${model!.size.x.toFixed(2)} x ${model!.size.y.toFixed(2)} x ${model!.size.z.toFixed(2)} mm\n` +
      (next.unverifiedDefaultsUsed.length ? `Unverified defaults: ${next.unverifiedDefaultsUsed.join(", ")}` : "");
  } catch (e) {
    status.className = "error";
    status.textContent =
      e instanceof ParamValidationError ? e.issues.map((i) => `${i.path}: ${i.message}`).join("\n") : String(e);
  }
}

let animating = false;
function animate(from: number, to: number, ms = 1600) {
  const start = performance.now();
  animating = true;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    fold.value = String(Math.round(from + (to - from) * e));
    rebuildModel();
    if (t < 1) requestAnimationFrame(step);
    else animating = false;
  };
  requestAnimationFrame(step);
}

for (const id of ["variant", "width", "depth", "height"]) $(id).addEventListener("change", regenerate);
fold.addEventListener("input", rebuildModel);
$("flatBtn").addEventListener("click", () => { fold.value = "0"; rebuildModel(); });
$("closeBtn").addEventListener("click", () => { fold.value = "100"; rebuildModel(); });
$("animBtn").addEventListener("click", () => { if (!animating) animate(0, 100); });

function resize() {
  const w = host.clientWidth;
  const h = host.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

// Hooks for automated screenshots.
Object.assign(window, {
  viewer: {
    setFold: (v: number) => { fold.value = String(v); rebuildModel(); },
    setView: (x: number, y: number, z: number) => { const r = Math.max(model!.size.x, model!.size.y, model!.size.z); camera.position.set(x * r, y * r, z * r); controls.update(); },
    regenerate,
  },
});
await regenerate();
document.body.dataset.ready = "1";
