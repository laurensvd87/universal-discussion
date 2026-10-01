import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromiumPipe } from "./chromium-pipe.js";

const executable = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const extensionRoot = fileURLToPath(new URL("../browser/", import.meta.url));
const profileRoot = mkdtempSync(path.join(os.tmpdir(), "udl-popup-layout-"));
let browser;

async function evaluate(expression, sessionId) {
  const result = await browser.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (result.exceptionDetails) throw Error("Popup layout evaluation failed");
  return result.result.value;
}

try {
  assert.ok(existsSync(executable));
  browser = launchChromiumPipe({ executable, profileDirectory: path.join(profileRoot, "profile") });
  await browser.send("Browser.getVersion");
  const loaded = await browser.send("Extensions.loadUnpacked", { path: extensionRoot });
  assert.match(loaded.id, /^[a-p]{32}$/u);
  const target = await browser.send("Target.createTarget", { url: "about:blank" });
  const attached = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await browser.send("Runtime.enable", {}, sessionId);
  await browser.send("Page.enable", {}, sessionId);
  await browser.send("Emulation.setDeviceMetricsOverride", { width: 410, height: 600, deviceScaleFactor: 1, mobile: false }, sessionId);
  await browser.send("Page.navigate", { url: `chrome-extension://${loaded.id}/chromium/popup.html` }, sessionId);
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    ready = await evaluate("!!document.querySelector('#insight-quick-actions')", sessionId).catch(() => false);
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(ready, "Popup should mount its quick actions");
  const metrics = await evaluate(`(() => {
    const bar = document.querySelector('#insight-quick-actions');
    const button = document.querySelector('#insight-createInsights');
    const model = document.querySelector('#insight-model');
    const longText = Object.assign(document.createElement('p'), {textContent:'x'.repeat(500)});
    document.querySelector('#local-discussion').append(longText);
    const first = bar.getBoundingClientRect();
    scrollTo(0, document.documentElement.scrollHeight);
    const last = bar.getBoundingClientRect();
    const failure = document.querySelector('#insight-quick-status');
    failure.hidden = false;
    failure.textContent = 'Research did not complete. No partial answer was imported or automatically retried. Check your connection and try again when ready.';
    const failureBar = bar.getBoundingClientRect();
    return {width: innerWidth, documentWidth: document.documentElement.scrollWidth,
      barTop: first.top, barBottom: first.bottom, afterScrollBottom: last.bottom,
      failureBarTop: failureBar.top, failureBarBottom: failureBar.bottom,
      longTextWidth: longText.scrollWidth, longTextAvailable: longText.clientWidth,
      buttonVisible: button.getBoundingClientRect().width > 0,
      modelVisible: model.getBoundingClientRect().width > 0};
  })()`, sessionId);
  assert.equal(metrics.width, 410);
  assert.ok(metrics.documentWidth <= metrics.width, "No horizontal popup overflow");
  assert.ok(metrics.longTextWidth <= metrics.longTextAvailable, "Long text wraps inside the discussion card");
  assert.ok(metrics.barTop >= 0 && metrics.barBottom <= 600, "Quick actions fit popup viewport");
  assert.ok(metrics.afterScrollBottom <= 600 && metrics.afterScrollBottom >= 590, "Quick actions stay visible while scrolling");
  assert.ok(metrics.failureBarTop >= 0 && metrics.failureBarBottom <= 600, "Research failure fits below popup content");
  assert.ok(metrics.buttonVisible && metrics.modelVisible);
  process.stdout.write(`Popup layout smoke passed: ${JSON.stringify(metrics)}\n`);
} finally {
  await browser?.close();
  const target = path.resolve(profileRoot);
  assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
  assert.ok(path.basename(target).startsWith("udl-popup-layout-"));
  rmSync(target, { recursive: true, force: true });
}
