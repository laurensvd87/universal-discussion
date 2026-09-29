import { EN } from "../locales/en.js";

// Code-native bitmap art: no remote assets, DOM/offscreen document or permission.
export function drawTopicToolbarIcon(shared, Canvas = globalThis.OffscreenCanvas) {
  const imageData = {};
  for (const size of [16, 32]) {
    const canvas = new Canvas(size, size);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Toolbar icon unavailable");
    context.scale(size / 16, size / 16);
    context.clearRect(0, 0, 16, 16);
    context.fillStyle = shared ? "#1479e8" : "#64748b";
    context.beginPath();
    context.moveTo(4, 2); context.lineTo(12, 2);
    context.quadraticCurveTo(14, 2, 14, 4); context.lineTo(14, 10);
    context.quadraticCurveTo(14, 12, 12, 12); context.lineTo(7, 12);
    context.lineTo(3, 15); context.lineTo(3, 12);
    context.quadraticCurveTo(2, 12, 2, 10); context.lineTo(2, 4);
    context.quadraticCurveTo(2, 2, 4, 2); context.closePath(); context.fill();
    context.fillStyle = "#ffffff";
    for (const x of [5, 8, 11]) { context.beginPath(); context.arc(x, 7, 0.8, 0, 2 * Math.PI); context.fill(); }
    imageData[size] = context.getImageData(0, 0, size, size);
  }
  return imageData;
}

export function createTopicToolbarPainter(action, Canvas = globalThis.OffscreenCanvas) {
  let neutral;
  let shared;
  return async (tabId, isShared, isCurrent = () => true) => {
    if (isShared && !isCurrent()) return;
    neutral ??= drawTopicToolbarIcon(false, Canvas);
    if (isShared) shared ??= drawTopicToolbarIcon(true, Canvas);
    const target = tabId === null ? {} : { tabId };
    await action.setTitle({ ...target, title: isShared ? EN.toolbarTopicShared : EN.toolbarTopicNeutral });
    if (isShared && !isCurrent()) return;
    await action.setIcon({ ...target, imageData: isShared ? shared : neutral });
  };
}
