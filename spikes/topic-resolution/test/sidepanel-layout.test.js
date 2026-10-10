import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const base = new URL("../browser/chromium/", import.meta.url);
const popup = readFileSync(new URL("popup.html", base), "utf8");
const panel = readFileSync(new URL("sidepanel.html", base), "utf8");
const css = readFileSync(new URL("popup.css", base), "utf8");

function ids(markup) {
  return [...markup.matchAll(/\bid="([^"]+)"/gu)].map((match) => match[1]);
}

test("popup and panel expose the same unique controller nodes", () => {
  const popupIds = ids(popup);
  const panelIds = ids(panel);
  assert.equal(new Set(popupIds).size, popupIds.length);
  assert.equal(new Set(panelIds).size, panelIds.length);
  assert.deepEqual(panelIds, popupIds);
  assert.match(popup, /data-extension-surface="popup"/u);
  assert.match(panel, /data-extension-surface="sidepanel"/u);
  for (const html of [popup, panel]) {
    assert.match(html, /id="app-source-context"[^>]*hidden/u);
    assert.match(html, /id="app-source-title"/u);
    assert.match(html, /id="app-source-domain"/u);
    assert.match(html, /<script type="module" src="popup\.js"><\/script>/u);
    assert.match(html, /<link rel="stylesheet" href="popup\.css">/u);
  }
});

test("panel width follows its host and keeps keyboard and reduced-motion affordances", () => {
  assert.match(css, /body\[data-ui-surface="sidepanel"\]\s*\{\s*width:\s*100%/u);
  assert.match(css, /#discussion-model-host/u);
  assert.match(css, /\.app-source-title/u);
  assert.match(css, /outline:\s*3px solid #aeb5ff/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
});
