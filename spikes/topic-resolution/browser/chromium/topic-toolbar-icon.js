import { EN } from "../locales/en.js";
import { TOOLBAR_STATES } from "../core/topic-toolbar-controller.js";
import { traceMurmingle } from "./murmingle-geometry.js";

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
    context.scale(size / 32, size / 32);
    context.clearRect(0, 0, 32, 32);
    context.fillStyle = TOOLBAR_COLORS[state];
    traceMurmingle(context);
    context.fill("evenodd");
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
