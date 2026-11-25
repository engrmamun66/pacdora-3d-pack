import { DEFAULTS, vectorize } from "./vectorize.js";

const $ = (id) => document.getElementById(id);
const canvas = $("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const msg = (text, err = false) => {
  $("msg").textContent = text;
  $("msg").className = err ? "err" : "";
};

let pixels = null; // ImageData of the picture
let ratio = 1; // device pixels per page pixel when it was taken
let scalePoints = []; // up to two clicks, in picture pixels
let mmPerPx = 25.4 / 96; // until the person measures: one page pixel = 1/96 inch
let svgText = null;
let traced = null; // the lines in picture pixels, drawn over the picture
let captureB64 = null;
let mode = null; // "scale" | "erase" | "cut" | "crease" | "bleed" | null
let ignored = []; // rectangles to leave out, in picture pixels: {x, y, w, h}
let dragging = null; // the rectangle being drawn

const colors = { ...DEFAULTS.colors };
for (const role of Object.keys(colors)) {
  const input = $(`c-${role}`);
  input.value = colors[role];
  input.addEventListener("input", () => {
    colors[role] = input.value;
    run();
  });
}
$("tol").addEventListener("input", () => run());

const toHex = (r, g, b) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

function setMode(next) {
  mode = mode === next ? null : next;
  $("mode-scale").setAttribute("aria-pressed", String(mode === "scale"));
  $("mode-erase").setAttribute("aria-pressed", String(mode === "erase"));
  for (const b of document.querySelectorAll("[data-pick]")) b.setAttribute("aria-pressed", String(mode === b.dataset.pick));
  if (mode === "scale") scalePoints = [];
  redraw();
}
$("mode-scale").addEventListener("click", () => setMode("scale"));
$("mode-erase").addEventListener("click", () => setMode("erase"));
$("erase-clear").addEventListener("click", () => {
  ignored = [];
  $("erase-clear").disabled = true;
  redraw();
  run();
});
for (const b of document.querySelectorAll("[data-pick]")) b.addEventListener("click", () => setMode(b.dataset.pick));

function redraw() {
  if (!pixels) return;
  ctx.putImageData(pixels, 0, 0);
  if (traced && $("overlay").checked) {
    ctx.save();
    ctx.lineWidth = Math.max(1, canvas.width / 1000);
    ctx.lineJoin = "round";
    const look = { cut: "#ff00ff", crease: "#ff8800", bleed: "#00aaff" };
    for (const role of ["bleed", "crease", "cut"]) {
      ctx.strokeStyle = look[role];
      for (const c of traced[role]) {
        ctx.beginPath();
        c.forEach(([x, y], i) => (i ? ctx.lineTo(x + 0.5, y + 0.5) : ctx.moveTo(x + 0.5, y + 0.5)));
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.save();
  ctx.fillStyle = "rgba(220,38,38,.28)";
  ctx.strokeStyle = "#dc2626";
  ctx.lineWidth = Math.max(1, canvas.width / 900);
  for (const r of dragging ? [...ignored, dragging] : ignored) {
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }
  ctx.restore();
  if (scalePoints.length) {
    ctx.save();
    ctx.strokeStyle = "#f59e0b";
    ctx.fillStyle = "#f59e0b";
    ctx.lineWidth = Math.max(2, canvas.width / 600);
    for (const [x, y] of scalePoints) {
      ctx.beginPath();
      ctx.arc(x, y, ctx.lineWidth * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (scalePoints.length === 2) {
      ctx.beginPath();
      ctx.moveTo(...scalePoints[0]);
      ctx.lineTo(...scalePoints[1]);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function pointOf(e) {
  const r = canvas.getBoundingClientRect();
  return [
    Math.min(canvas.width - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * canvas.width))),
    Math.min(canvas.height - 1, Math.max(0, Math.round(((e.clientY - r.top) / r.height) * canvas.height))),
  ];
}

// Ignore area: drag a rectangle.
let eraseFrom = null;
canvas.addEventListener("pointerdown", (e) => {
  if (mode !== "erase" || !pixels) return;
  eraseFrom = pointOf(e);
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!eraseFrom) return;
  const [x, y] = pointOf(e);
  dragging = { x: Math.min(eraseFrom[0], x), y: Math.min(eraseFrom[1], y), w: Math.abs(x - eraseFrom[0]), h: Math.abs(y - eraseFrom[1]) };
  redraw();
});
canvas.addEventListener("pointerup", () => {
  if (!eraseFrom) return;
  eraseFrom = null;
  const r = dragging;
  dragging = null;
  if (r && r.w > 3 && r.h > 3) {
    ignored.push(r);
    $("erase-clear").disabled = false;
    run();
  }
  redraw();
});

canvas.addEventListener("click", (e) => {
  if (!pixels || !mode || mode === "erase") return;
  const [x, y] = pointOf(e);
  if (mode === "scale") {
    scalePoints = scalePoints.length >= 2 ? [[x, y]] : [...scalePoints, [x, y]];
    redraw();
    if (scalePoints.length === 2) applyScale();
    else $("scale-info").textContent = "Click the other end.";
    return;
  }
  // Pick a colour: the strongest (most different from white) pixel within 2 px, because lines are thin and soft at the edges.
  let best = null;
  let bestD = -1;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const X = x + dx, Y = y + dy;
    if (X < 0 || Y < 0 || X >= canvas.width || Y >= canvas.height) continue;
    const i = (Y * canvas.width + X) * 4;
    const d = (255 - pixels.data[i]) ** 2 + (255 - pixels.data[i + 1]) ** 2 + (255 - pixels.data[i + 2]) ** 2;
    if (d > bestD) { bestD = d; best = [pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]]; }
  }
  if (!best) return;
  colors[mode] = toHex(...best);
  $(`c-${mode}`).value = colors[mode];
  setMode(mode); // done: leave the pick mode
  run();
});

function applyScale() {
  const [a, b] = scalePoints;
  const px = Math.hypot(a[0] - b[0], a[1] - b[1]);
  const mm = Number($("mm").value);
  if (px < 5 || !(mm > 0)) {
    $("scale-info").textContent = "Pick two points far apart and type their distance in mm.";
    return;
  }
  mmPerPx = mm / px;
  $("scale-info").textContent = `1 px = ${mmPerPx.toFixed(4)} mm`;
  run();
}
$("mm").addEventListener("input", () => scalePoints.length === 2 && applyScale());

let timer = 0;
function run() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!pixels) return;
    try {
      const t0 = performance.now();
      // The ignored rectangles are painted white in a copy, so nothing in them is traced.
      const data = ignored.length ? new Uint8ClampedArray(pixels.data) : pixels.data;
      for (const r of ignored) for (let y = r.y; y < Math.min(pixels.height, r.y + r.h); y++) data.fill(255, (y * pixels.width + r.x) * 4, (y * pixels.width + Math.min(pixels.width, r.x + r.w)) * 4);
      const out = vectorize({ width: pixels.width, height: pixels.height, data }, { colors, tolerance: Number($("tol").value), mmPerPx });
      if (!out.svg) {
        svgText = null;
        $("out").innerHTML = "";
        $("size").textContent = "";
        msg("No lines found. Try Pick on a line of each kind, or raise the tolerance.", true);
      } else {
        svgText = out.svg;
        traced = out.lines;
        redraw();
        // The preview draws the lines a little heavier on a big sheet so they can be seen; the file keeps 0.25 mm.
        const heavy = Math.max(0.25, Math.max(out.widthMm, out.heightMm) / 650);
        $("out").innerHTML = out.svg.replaceAll('stroke-width="0.25"', `stroke-width="${heavy.toFixed(2)}"`); // made by vectorize.js from numbers only
        $("size").textContent = `${out.widthMm.toFixed(1)} × ${out.heightMm.toFixed(1)} mm`;
        const guessed = scalePoints.length < 2 ? " The scale is a guess: use Measure on a line whose length you know." : "";
        const small = Math.max(pixels.width, pixels.height) < 900 ? " The picture is small: zoom the page in, then select again for finer lines." : "";
        msg(`${out.counts.cut} cut, ${out.counts.crease} crease, ${out.counts.bleed} bleed lines (${Math.round(performance.now() - t0)} ms).${guessed}${small}`);
      }
      $("save").disabled = $("copy").disabled = !svgText;
    } catch (e) {
      msg(String(e?.message ?? e), true);
    }
  }, 200);
}

$("overlay").addEventListener("change", redraw);
$("save-pic").addEventListener("click", () => {
  if (!captureB64) return;
  const a = document.createElement("a");
  a.href = "data:image/png;base64," + captureB64;
  a.download = "dieline-capture.png";
  a.click();
});

$("save").addEventListener("click", () => {
  if (!svgText) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
  a.download = "dieline.svg";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});
$("copy").addEventListener("click", async () => {
  if (!svgText) return;
  await navigator.clipboard.writeText(svgText);
  msg("SVG copied to the clipboard.");
});

// Load the picture the worker kept.
(async () => {
  const { capture } = await chrome.storage.session.get("capture");
  if (!capture) return msg("No picture yet. Click the extension icon on a page and select the dieline.", true);
  ratio = capture.ratio;
  captureB64 = capture.png;
  mmPerPx = 25.4 / 96 / ratio;
  const bytes = Uint8Array.from(atob(capture.png), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  ctx.drawImage(bitmap, 0, 0);
  pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  $("scale-info").textContent = "Scale not set.";
  run();
})();
