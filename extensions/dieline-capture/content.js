// The selection overlay: drag a rectangle round the dieline. Esc cancels. Nothing is sent anywhere except to this extension's own worker.
(() => {
  if (window.__dielineCaptureOpen) return;
  window.__dielineCaptureOpen = true;

  const layer = document.createElement("div");
  layer.style.cssText = "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,.25);user-select:none;-webkit-user-select:none";
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;border:2px solid #2563eb;background:rgba(37,99,235,.12);display:none;pointer-events:none";
  const hint = document.createElement("div");
  hint.textContent = "Drag a rectangle round the dieline. Esc to cancel.";
  hint.style.cssText = "position:fixed;left:50%;top:14px;transform:translateX(-50%);padding:6px 12px;border-radius:8px;background:#111;color:#fff;font:13px system-ui,sans-serif;pointer-events:none";
  layer.append(box, hint);
  document.documentElement.append(layer);

  const close = () => {
    layer.remove();
    window.removeEventListener("keydown", onKey, true);
    window.__dielineCaptureOpen = false;
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };
  window.addEventListener("keydown", onKey, true);

  let from = null;
  const rectOf = (e) => ({ x: Math.min(from.x, e.clientX), y: Math.min(from.y, e.clientY), w: Math.abs(e.clientX - from.x), h: Math.abs(e.clientY - from.y) });
  layer.addEventListener("pointerdown", (e) => {
    from = { x: e.clientX, y: e.clientY };
    layer.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  layer.addEventListener("pointermove", (e) => {
    if (!from) return;
    const r = rectOf(e);
    Object.assign(box.style, { display: "block", left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  });
  layer.addEventListener("pointerup", (e) => {
    if (!from) return;
    const rect = rectOf(e);
    from = null;
    close();
    if (rect.w < 20 || rect.h < 20) return;
    // Two frames, so the overlay is really gone from the picture.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      chrome.runtime.sendMessage({ type: "selection", rect, viewport: { width: window.innerWidth, height: window.innerHeight } });
    }));
  });
})();
