import assert from "node:assert/strict";
import test from "node:test";
import { createTopicToolbarPainter, drawTopicToolbarIcon } from "../browser/chromium/topic-toolbar-icon.js";
import { EN } from "../browser/locales/en.js";

class FakeCanvas {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() {
    const fills = [];
    return { scale() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {}, arc() {},
      fill() { fills.push(this.fillStyle); }, getImageData: () => ({ width: this.width, height: this.height, fills }) };
  }
}

test("actual icon images contain a neutral or blue speech bubble at both toolbar scales", () => {
  for (const shared of [false, true]) {
    const images = drawTopicToolbarIcon(shared, FakeCanvas);
    assert.deepEqual(Object.keys(images), ["16", "32"]);
    for (const size of [16, 32]) {
      assert.equal(images[size].width, size); assert.equal(images[size].height, size);
      assert.deepEqual(images[size].fills, [shared ? "#1479e8" : "#64748b", "#ffffff", "#ffffff", "#ffffff"]);
    }
  }
});

test("painter sets localized title and actual imageData only on intended tab", async () => {
  assert.equal(typeof EN.toolbarTopicNeutral, "string"); assert.equal(typeof EN.toolbarTopicShared, "string");
  const calls = [];
  const paint = createTopicToolbarPainter({ setTitle: async (value) => calls.push(["title", value]), setIcon: async (value) => calls.push(["icon", value]) }, FakeCanvas);
  await paint(null, false); await paint(7, true);
  assert.deepEqual(calls[0], ["title", { title: EN.toolbarTopicNeutral }]);
  assert.deepEqual(calls[2], ["title", { tabId: 7, title: EN.toolbarTopicShared }]);
  assert.equal(calls[1][1].tabId, undefined); assert.equal(calls[3][1].tabId, 7);
  assert.equal(calls[3][1].imageData[16].fills[0], "#1479e8");
});

test("invalidation during asynchronous title update cannot submit a stale blue icon", async () => {
  let release; let live = true;
  const gate = new Promise((done) => { release = done; }); const icons = [];
  const paint = createTopicToolbarPainter({ setTitle: () => gate, setIcon: async (value) => icons.push(value) }, FakeCanvas);
  const pending = paint(7, true, () => live); live = false; release(); await pending;
  assert.deepEqual(icons, []);
});

test("renderer and title/API failures propagate for controller neutralization", async () => {
  assert.throws(() => drawTopicToolbarIcon(true, class { getContext() { return null; } }));
  for (const operation of ["setTitle", "setIcon"]) {
    const action = { setTitle: async () => {}, setIcon: async () => {} };
    action[operation] = async () => { throw new Error("Synthetic Chrome failure"); };
    await assert.rejects(createTopicToolbarPainter(action, FakeCanvas)(7, true));
  }
});
