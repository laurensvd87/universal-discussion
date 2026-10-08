import { EN } from "../locales/en.js";
import { TOOLBAR_STATES } from "../core/topic-toolbar-controller.js";

export const TOOLBAR_COLORS = Object.freeze({ disconnected: "#dc2626", connected: "#64748b", off: "#64748b", topic: "#16a34a", shared: "#38bdf8", posts: "#1d4ed8" });
const TITLES = { disconnected: "toolbarDisconnected", connected: "toolbarConnected", off: "toolbarMatchingOff", topic: "toolbarTopic", shared: "toolbarShared", posts: "toolbarPosts" };

// Code-native bitmap art: no remote assets, DOM/offscreen document or permission.
export function drawTopicToolbarIcon(state, Canvas = globalThis.OffscreenCanvas) {
  if (!TOOLBAR_STATES.includes(state)) throw new Error("Invalid toolbar state");
  const imageData = {};
  for (const size of [16, 32]) {
    const canvas = new Canvas(size, size);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Toolbar icon unavailable");
    context.scale(size / 16, size / 16);
    context.clearRect(0, 0, 16, 16);
    context.fillStyle = TOOLBAR_COLORS[state];
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
  const images = new Map();
  return async (tabId, state, isCurrent = () => true) => {
    if (!TOOLBAR_STATES.includes(state)) throw new Error("Invalid toolbar state");
    if (!isCurrent()) return;
    if (!images.has(state)) images.set(state, drawTopicToolbarIcon(state, Canvas));
    const target = tabId === null ? {} : { tabId };
    await action.setTitle({ ...target, title: EN[TITLES[state]] });
    if (!isCurrent()) return;
    await action.setIcon({ ...target, imageData: images.get(state) });
  };
}
