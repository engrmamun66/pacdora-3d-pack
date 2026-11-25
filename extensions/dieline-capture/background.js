// Click the icon: put the selection overlay on the page. When an area is chosen: take a picture of the tab, cut out the area,
// keep it, and open the result page.

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  } catch {
    // Chrome's own pages (chrome://, the web store) cannot be scripted.
    await chrome.action.setBadgeText({ text: "!", tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: tab.id }), 2500);
  }
});

const toBase64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "selection" || !sender.tab) return false;
  (async () => {
    // The page has had two frames to take the overlay away.
    const shot = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" });
    const bitmap = await createImageBitmap(await (await fetch(shot)).blob());
    const ratio = bitmap.width / msg.viewport.width; // device pixels per page pixel
    const sx = Math.max(0, Math.round(msg.rect.x * ratio));
    const sy = Math.max(0, Math.round(msg.rect.y * ratio));
    const sw = Math.min(bitmap.width - sx, Math.round(msg.rect.w * ratio));
    const sh = Math.min(bitmap.height - sy, Math.round(msg.rect.h * ratio));
    if (sw < 20 || sh < 20) return sendResponse({ ok: false, error: "The selected area is too small." });
    const canvas = new OffscreenCanvas(sw, sh);
    canvas.getContext("2d").drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    const png = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
    await chrome.storage.session.set({ capture: { png: toBase64(png), ratio, at: Date.now() } });
    await chrome.tabs.create({ url: chrome.runtime.getURL("result.html") });
    sendResponse({ ok: true });
  })().catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
  return true;
});
