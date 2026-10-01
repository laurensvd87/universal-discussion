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
  let popupSession;
  const sessions = new Map();
  browser.on("Target.attachedToTarget", ({ sessionId, targetInfo }) => {
    sessions.set(targetInfo.targetId, sessionId);
    if (targetInfo.url === `chrome-extension://${loaded.id}/chromium/popup.html`) popupSession = sessionId;
  });
  browser.on("Target.targetInfoChanged", ({ targetInfo }) => {
    if (targetInfo.url === `chrome-extension://${loaded.id}/chromium/popup.html`) {
      popupSession = sessions.get(targetInfo.targetId);
    }
  });
  await browser.send("Target.setDiscoverTargets", { discover: true });
  await browser.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true,
    filter: [{ type: "page", exclude: false }, { type: "other", exclude: false }, { exclude: true }] });
  await browser.send("Target.createTarget", { url: "about:blank" });
  const tabs = await browser.send("Target.getTargets", { filter: [{ type: "tab", exclude: false }, { exclude: true }] });
  const tab = tabs.targetInfos.find((item) => item.type === "tab" && item.url === "about:blank");
  assert.ok(tab, "Expected a real browser tab for the extension action");
  await browser.send("Extensions.triggerAction", { id: loaded.id, targetId: tab.targetId });
  for (let attempt = 0; attempt < 100 && !popupSession; attempt++) {
    const targets = await browser.send("Target.getTargets");
    const popup = targets.targetInfos.find((item) => item.url === `chrome-extension://${loaded.id}/chromium/popup.html`);
    popupSession = popup && sessions.get(popup.targetId);
    if (!popupSession) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(popupSession, "Expected an actual extension action popup");
  const sessionId = popupSession;
  await browser.send("Runtime.enable", {}, sessionId);
  await browser.send("Page.enable", {}, sessionId);
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
    return {width: innerWidth, height: innerHeight, bodyWidth: document.body.getBoundingClientRect().width,
      clientWidth: document.documentElement.clientWidth, documentWidth: document.documentElement.scrollWidth,
      barTop: first.top, barBottom: first.bottom, afterScrollBottom: last.bottom,
      failureBarTop: failureBar.top, failureBarBottom: failureBar.bottom,
      longTextWidth: longText.scrollWidth, longTextAvailable: longText.clientWidth,
      buttonVisible: button.getBoundingClientRect().width > 0,
      modelVisible: model.getBoundingClientRect().width > 0};
  })()`, sessionId);
  assert.equal(metrics.bodyWidth, 410, "Actual Chrome action popup body should be 410 px wide");
  assert.ok(metrics.width >= 410 && metrics.width <= 425, "Actual Chrome action popup should fit its 410 px body and scrollbar");
  assert.ok(metrics.documentWidth <= metrics.width, "No horizontal popup overflow");
  assert.ok(metrics.longTextWidth <= metrics.longTextAvailable, "Long text wraps inside the discussion card");
  assert.ok(metrics.barTop >= 0 && metrics.barBottom <= metrics.height, "Quick actions fit popup viewport");
  assert.ok(metrics.afterScrollBottom <= metrics.height && metrics.afterScrollBottom >= metrics.height - 10, "Quick actions stay visible while scrolling");
  assert.ok(metrics.failureBarTop >= 0 && metrics.failureBarBottom <= metrics.height, "Research failure fits below popup content");
  assert.ok(metrics.buttonVisible && metrics.modelVisible);
  const developer = await evaluate(`(() => {
    document.querySelector('#ui-mode-developer').click();
    return { mode: document.body.dataset.uiMode, width: document.body.getBoundingClientRect().width,
      clientWidth: document.documentElement.clientWidth, documentWidth: document.documentElement.scrollWidth };
  })()`, sessionId);
  assert.equal(developer.mode, "developer");
  assert.equal(developer.width, 380, "Developer popup body should be 380 px wide");
  assert.ok(developer.documentWidth <= developer.clientWidth, "Developer popup should not overflow horizontally");
  process.stdout.write(`Popup layout smoke passed: ${JSON.stringify({ user: metrics, developer })}\n`);
} finally {
  await browser?.close();
  const target = path.resolve(profileRoot);
  assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
  assert.ok(path.basename(target).startsWith("udl-popup-layout-"));
  rmSync(target, { recursive: true, force: true });
}
