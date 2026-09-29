import assert from "node:assert/strict";
import test from "node:test";
import { createTopicToolbarPainter, drawTopicToolbarIcon, TOOLBAR_COLORS } from "../browser/chromium/topic-toolbar-icon.js";
import { EN } from "../browser/locales/en.js";

class FakeCanvas {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() {
    const fills = [];
    return { scale() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {}, arc() {},
      fill() { fills.push(this.fillStyle); }, getImageData: () => ({ width: this.width, height: this.height, fills }) };
  }
}

test("actual icon images contain all five speech bubble colors at both toolbar scales", () => {
  for (const state of Object.keys(TOOLBAR_COLORS)) {
    const images = drawTopicToolbarIcon(state, FakeCanvas);
    assert.deepEqual(Object.keys(images), ["16", "32"]);
    for (const size of [16, 32]) {
      assert.equal(images[size].width, size); assert.equal(images[size].height, size);
      assert.deepEqual(images[size].fills, [TOOLBAR_COLORS[state], "#ffffff", "#ffffff", "#ffffff"]);
    }
  }
});

test("painter sets localized title and actual imageData only on intended tab", async () => {
  assert.equal(typeof EN.toolbarDisconnected, "string"); assert.equal(typeof EN.toolbarPosts, "string");
  const calls = [];
  const paint = createTopicToolbarPainter({ setTitle: async (value) => calls.push(["title", value]), setIcon: async (value) => calls.push(["icon", value]) }, FakeCanvas);
  await paint(null, "disconnected"); await paint(7, "posts");
  assert.deepEqual(calls[0], ["title", { title: EN.toolbarDisconnected }]);
  assert.deepEqual(calls[2], ["title", { tabId: 7, title: EN.toolbarPosts }]);
  assert.equal(calls[1][1].tabId, undefined); assert.equal(calls[3][1].tabId, 7);
  assert.equal(calls[3][1].imageData[16].fills[0], TOOLBAR_COLORS.posts);
});

test("invalidation during asynchronous title update cannot submit a stale page icon", async () => {
  let release; let live = true;
  const gate = new Promise((done) => { release = done; }); const icons = [];
  const paint = createTopicToolbarPainter({ setTitle: () => gate, setIcon: async (value) => icons.push(value) }, FakeCanvas);
  const pending = paint(7, "posts", () => live); live = false; release(); await pending;
  assert.deepEqual(icons, []);
});

test("renderer and title/API failures propagate for controller neutralization", async () => {
  assert.throws(() => drawTopicToolbarIcon("posts", class { getContext() { return null; } }));
  for (const operation of ["setTitle", "setIcon"]) {
    const action = { setTitle: async () => {}, setIcon: async () => {} };
    action[operation] = async () => { throw new Error("Synthetic Chrome failure"); };
    await assert.rejects(createTopicToolbarPainter(action, FakeCanvas)(7, "posts"));
  }
});
