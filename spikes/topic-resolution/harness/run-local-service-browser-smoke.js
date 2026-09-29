import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startLocalApplication, createProcessDependencies } from "../../../apps/local-service/src/startup.js";
import { EN } from "../browser/locales/en.js";
import { TOOLBAR_TAB_KEY } from "../browser/core/topic-toolbar-controller.js";
import { launchChromiumPipe } from "./chromium-pipe.js";

const BROWSER_ROOT = fileURLToPath(new URL("../browser/", import.meta.url));
const DEFAULT_CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TOKEN = "browser-smoke-injected-synthetic-token";
const SECOND_TOKEN = "browser-smoke-restart-synthetic-token";
const STATUS = "document.querySelector('#local-discussion [role=status]')?.textContent";
const THREAD = "document.querySelector('#local-discussion .discussion-thread')";
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function removeOwnedTemp(directory) {
  const target = path.resolve(directory);
  assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
  assert.ok(path.basename(target).startsWith("udl-browser-smoke-"));
  rmSync(target, { recursive: true, force: true });
}

// Runs only against a new temporary profile and synthetic data. Page interception
// plus resolver/background flags constrain this smoke; they are not a global
// browser firewall guarantee. No download or normal browser profile is used.
export async function runLocalServiceBrowserSmoke(executable = DEFAULT_CHROME, { backgroundMatching = false } = {}) {
  if (backgroundMatching) return (await import('./run-background-matching-browser-smoke.js')).runBackgroundMatchingBrowserSmoke(executable);
  if (!path.isAbsolute(executable) || !existsSync(executable) || !statSync(executable).isFile()) {
    throw new Error("Supply an absolute path to an installed Chrome executable");
  }
  const directory = mkdtempSync(path.join(os.tmpdir(), "udl-browser-smoke-"));
  const databasePath = path.join(directory, "demo.sqlite");
  const profileDirectory = path.join(directory, "chrome-profile");
  let browser;
  let application;
  let extensionId;
  let popupTarget;
  let popupSession;
  let pageSession;
  let runtimeExceptions = 0;
  let externalExtensionRequests = 0;
  let extensionRequests = 0;
  let interceptedFixtureDocuments = 0;
  const targets = new Map();
  const errors = [];
  const tasks = new Set();
  let deadline;
  const stop = () => { void browser?.close(); };
  function schedule(operation) {
    const task = Promise.resolve().then(operation).catch(() => errors.push("CDP target/interception setup failed"));
    tasks.add(task); task.finally(() => tasks.delete(task));
  }
  async function evaluate(expression, sessionId = popupSession) {
    const result = await browser.send("Runtime.evaluate", {
      expression, awaitPromise: true, returnByValue: true, userGesture: true,
    }, sessionId);
    if (result.exceptionDetails) throw new Error("Browser evaluation raised an exception (details suppressed)");
    return result.result.value;
  }
  async function waitFor(check, label, timeoutMs = 10_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (errors.length) throw new Error(errors[0]);
      if (await check()) return;
      await delay(50);
    }
    throw new Error(`Browser smoke timeout: ${label}`);
  }
  const waitExpression = (expression, label) => waitFor(() => evaluate(expression), label);
  const waitStatus = (message) => waitExpression(`${STATUS} === ${JSON.stringify(message)}`, "expected discussion status");
  async function click(selector) {
    const available = await evaluate(`(() => { const item=document.querySelector(${JSON.stringify(selector)}); if(!item || item.disabled) return false; item.click(); return true; })()`);
    assert.ok(available, "Expected UI control must be enabled");
  }
  async function input(selector, value) {
    await evaluate(`(() => {const item=document.querySelector(${JSON.stringify(selector)});const parents=[];
      for(let p=item.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')parents.unshift(p);
      for(const parent of parents)if(!parent.open)parent.querySelector(':scope > summary').click();})()`);
    await evaluate(`(() => { const item=document.querySelector(${JSON.stringify(selector)}); item.focus(); item.value=''; item.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await browser.send("Input.insertText", { text: value }, popupSession);
  }
  async function select(selector, value) {
    await evaluate(`(() => { const item=document.querySelector(${JSON.stringify(selector)}); item.value=${JSON.stringify(value)}; item.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await waitStatus(EN.discussionReady);
  }
  async function key(keyName, code, windowsVirtualKeyCode) {
    for (const type of ["keyDown", "keyUp"]) {
      await browser.send("Input.dispatchKeyEvent", { type, key: keyName, code, windowsVirtualKeyCode,
        ...(type === "keyDown" && keyName === "Enter" ? { text: "\r" } : {}) }, popupSession);
    }
  }
  async function pair(token) {
    await input("#discussion-token", token);
    await evaluate("document.querySelector('#discussion-pair').focus()");
    await key("Enter", "Enter", 13);
    await waitFor(async () => [EN.discussionReady, EN.discussionChooseStatus].includes(await evaluate(STATUS)), "manual pairing");
    assert.ok(await evaluate("document.querySelector('#discussion-token').value === ''"));
  }
  async function storage(paired) {
    const shape = await evaluate(`(async () => {
      const [local,sync,session]=await Promise.all([chrome.storage.local.get(null),chrome.storage.sync.get(null),chrome.storage.session.get(null)]);
      const lease=session.pageMatchingCaptureSession;
      const inactiveLease=lease && lease.schema==='capture-session/1' && lease.windowId===null &&
        typeof lease.revision==='string' && /^[a-zA-Z0-9-]{16,80}$/.test(lease.revision) && Object.keys(lease).length===3;
      // Red/gray per-tab overrides also require the approved cleanup marker,
      // even when capture is off or pairing has been removed.
      const toolbarKey=${JSON.stringify(TOOLBAR_TAB_KEY)};
      const validToolbarMarker=!Object.hasOwn(session,toolbarKey) ||
        (Number.isSafeInteger(session[toolbarKey]) && session[toolbarKey]>=0);
      const keys=Object.keys(session).filter(key=>key!=='pageMatchingCaptureSession' && key!==toolbarKey);
      const token=session.localServicePairingToken;
      const validPairing=typeof token==='string' && token.length>=32 && token.length<=512 && /^[A-Za-z0-9._~+/-]+={0,2}$/.test(token);
      return {localUiOnly:Object.keys(local).length===1 && local.discussionUiModeV1==='developer',syncEmpty:Object.keys(sync).length===0,
        sessionUnpaired:inactiveLease && validToolbarMarker && keys.length===0,
        sessionPaired:inactiveLease && validToolbarMarker && keys.length===1 && keys[0]==='localServicePairingToken' && validPairing};
    })()`);
    assert.ok(shape.localUiOnly && shape.syncEmpty);
    assert.ok(paired ? shape.sessionPaired : shape.sessionUnpaired);
  }
  async function bringPageForward() {
    await browser.send("Page.bringToFront", {}, pageSession);
  }
  async function openPopup() {
    await bringPageForward();
    const pageUrl = await evaluate("location.href", pageSession);
    const result = await browser.send("Target.getTargets", { filter: [{ type: "tab", exclude: false }, { exclude: true }] });
    const tab = result.targetInfos.find((target) => target.type === "tab" && target.url === pageUrl);
    assert.ok(tab, "Extension action requires an actual browser tab target");
    await browser.send("Extensions.triggerAction", { id: extensionId, targetId: tab.targetId });
    await waitFor(() => {
      const popup = [...targets.values()].find((target) => target.ready && target.url === `chrome-extension://${extensionId}/chromium/popup.html`);
      if (!popup) return false;
      popupTarget = popup.targetId; popupSession = popup.sessionId; return true;
    }, "actual extension action popup");
    await waitExpression("!!document.querySelector('#discussion-pair')", "discussion panel mount");
    await evaluate("document.querySelector('#ui-mode-developer').click()");
    await waitExpression("document.body.dataset.uiMode==='developer'", "explicit legacy Developer view");
  }
  async function closePopup() {
    if (!popupTarget) return;
    await browser.send("Target.closeTarget", { targetId: popupTarget });
    targets.delete(popupTarget); popupTarget = null; popupSession = null;
  }
  async function startService(token) {
    const dependencies = createProcessDependencies();
    application = await startLocalApplication({ databasePath, nextId: dependencies.nextId, now: dependencies.now,
      config: { host: "127.0.0.1", port: 4174, origin: `chrome-extension://${extensionId}`, capability: token } });
  }
  async function post(body) {
    await input("#discussion-body", body);
    await evaluate("document.querySelector('#discussion-submit').focus()");
    await key("Enter", "Enter", 13);
    await waitExpression(`${THREAD}?.textContent.includes(${JSON.stringify(body)}) && document.querySelector('#discussion-body').value === ''`, "UI contribution commit");
    await waitStatus(EN.discussionReady);
  }
  try {
    browser = launchChromiumPipe({ executable, profileDirectory });
    deadline = setTimeout(stop, 120_000);
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
    browser.on("Runtime.exceptionThrown", () => { runtimeExceptions += 1; });
    browser.on("Target.detachedFromTarget", ({ targetId, sessionId }) => {
      if (targetId) targets.delete(targetId);
      else for (const [id, target] of targets) if (target.sessionId === sessionId) targets.delete(id);
    });
    browser.on("Target.targetInfoChanged", ({ targetInfo }) => {
      const target = targets.get(targetInfo.targetId);
      if (target) target.url = targetInfo.url;
    });
    browser.on("Target.attachedToTarget", ({ sessionId, targetInfo }) => {
      const target = { targetId: targetInfo.targetId, sessionId, url: targetInfo.url, ready: false };
      targets.set(target.targetId, target);
      schedule(async () => {
        await browser.send("Runtime.enable", {}, sessionId);
        if (["page", "iframe", "other"].includes(targetInfo.type)) {
          await browser.send("Network.enable", {}, sessionId);
          await browser.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, sessionId);
        }
        await browser.send("Runtime.runIfWaitingForDebugger", {}, sessionId);
        target.ready = true;
      });
    });
    browser.on("Network.requestWillBeSent", ({ request }, sessionId) => {
      const target = [...targets.values()].find((item) => item.sessionId === sessionId);
      if (!target?.url.startsWith(`chrome-extension://${extensionId}/`)) return;
      extensionRequests += 1;
      const url = new URL(request.url);
      if (!(url.protocol === "chrome-extension:" && url.host === extensionId) &&
          !(url.origin === "http://127.0.0.1:4174" && url.pathname.startsWith("/v1/") && !url.search)) {
        externalExtensionRequests += 1;
      }
    });
    browser.on("Fetch.requestPaused", ({ requestId, request, resourceType }, sessionId) => schedule(async () => {
      const url = new URL(request.url);
      const target = [...targets.values()].find((item) => item.sessionId === sessionId);
      if ((url.protocol === "chrome-extension:" && url.host === extensionId) ||
          (target?.url.startsWith(`chrome-extension://${extensionId}/`) && url.origin === "http://127.0.0.1:4174" && url.pathname.startsWith("/v1/") && !url.search)) {
        await browser.send("Fetch.continueRequest", { requestId }, sessionId);
      } else if (resourceType === "Document" && ["https://example.com/", "https://example.org/"].includes(request.url)) {
        interceptedFixtureDocuments += 1;
        const html = "<!doctype html><meta charset=utf-8><title>Project-created reserved-domain browser smoke fixture</title><p>Synthetic fixture only.</p>";
        await browser.send("Fetch.fulfillRequest", { requestId, responseCode: 200,
          responseHeaders: [{ name: "Content-Type", value: "text/html; charset=utf-8" }], body: Buffer.from(html).toString("base64") }, sessionId);
      } else {
        await browser.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, sessionId);
      }
    }));
    const version = await browser.send("Browser.getVersion");
    await browser.send("Target.setDiscoverTargets", { discover: true });
    await browser.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
      filter: [{ type: "page", exclude: false }, { type: "iframe", exclude: false }, { type: "other", exclude: false }, { exclude: true }] });
    const loaded = await browser.send("Extensions.loadUnpacked", { path: BROWSER_ROOT });
    extensionId = loaded.id;
    assert.ok(/^[a-p]{32}$/u.test(extensionId));
    await startService(TOKEN);
    await waitFor(() => {
      const page = [...targets.values()].find((target) => target.ready && target.url === "about:blank");
      if (!page) return false;
      pageSession = page.sessionId; return true;
    }, "blank browser page");
    await openPopup();
    await waitStatus(EN.discussionDisconnected);
    assert.ok(await evaluate("document.querySelector('#discussion-token').type === 'password' && document.querySelector('#discussion-submit').disabled"));
    await pair(TOKEN);
    await waitStatus(EN.discussionChooseStatus);
    await storage(true);
    await select("#discussion-source", "harbor-overview");
    const ranking = await evaluate(`(() => {
      const root=document.querySelector('#local-discussion');
      const items=Array.from(root.querySelector('ul').children);
      return {count:items.length,
        sameTopic:items.filter(item=>item.textContent.includes(${JSON.stringify(EN.discussionSameTopic)})).length,
        related:items.filter(item=>item.textContent.includes(${JSON.stringify(EN.discussionRelatedReading)})).length,
        fixtureLabel:root.textContent.includes(${JSON.stringify(EN.discussionModelFixture)})};
    })()`);
    assert.deepEqual(ranking, { count: 4, sameTopic: 2, related: 2, fixtureLabel: true });
    await post("Synthetic Harbor source-selection root");
    await select("#discussion-source", "garden-guide");
    assert.ok(await evaluate(`(() => {
      const root=document.querySelector('#local-discussion');
      return document.querySelector('#discussion-topic').value==='seedlings'
        && root.querySelector('ul').children.length===1
        && root.querySelector('ul').textContent===${JSON.stringify(EN.discussionRelatedEmpty)}
        && ${THREAD}.textContent.includes(${JSON.stringify(EN.discussionEmpty)})
        && !root.textContent.includes('Synthetic Harbor source-selection root')
        && !root.querySelector('ul').textContent.includes('Harbor');
    })()`));
    await input("#discussion-new-title", "Synthetic browser smoke topic");
    await evaluate("document.querySelector('#discussion-create').focus()");
    await key("Enter", "Enter", 13);
    await waitExpression("document.querySelector('#discussion-topic').value.startsWith('topic-') && document.querySelector('#discussion-new-title').value === '' && !document.querySelector('#discussion-create').disabled", "UI topic creation");
    await waitStatus(EN.discussionReady);
    const topicId = await evaluate("document.querySelector('#discussion-topic').value");
    assert.ok(topicId.startsWith("topic-"));
    const hostile = '<img src="https://example.invalid/never-fetch" onerror="globalThis.smokeMarkupExecuted=true"><script>globalThis.smokeMarkupExecuted=true</script> synthetic literal';
    await post(hostile);
    assert.ok(await evaluate(`${THREAD}.querySelectorAll('img,script').length===0 && globalThis.smokeMarkupExecuted===undefined`));
    const rootId = await evaluate(`${THREAD}.querySelector('[data-action=reply]').dataset.contributionId`);
    await select("#discussion-actor", "demo-blair");
    await click(`[data-action=reply][data-contribution-id="${rootId}"]`);
    assert.ok(await evaluate("document.activeElement.id === 'discussion-body'"));
    await post("Synthetic browser reply survives withdrawal");
    await select("#discussion-actor", "demo-alex");
    await click(`[data-action=edit][data-contribution-id="${rootId}"]`);
    assert.ok(await evaluate("document.activeElement.id === 'discussion-body'"));
    await input("#discussion-body", "Synthetic edited browser root");
    await click("#discussion-submit");
    await waitExpression(`${THREAD}.textContent.includes('Synthetic edited browser root') && ${THREAD}.textContent.includes('Edited')`, "UI edit");
    await waitStatus(EN.discussionReady);
    assert.ok(await evaluate("document.querySelector('#local-discussion').textContent.includes('Human contributions: 2') && document.querySelector('#local-discussion').textContent.includes('Agent contributions: 0')"));
    await closePopup();
    await openPopup();
    await waitStatus(EN.discussionChooseStatus);
    await storage(true);
    await select("#discussion-topic", topicId);
    assert.ok(await evaluate(`${THREAD}.textContent.includes('Synthetic edited browser root')`));
    await click("#discussion-disconnect");
    await waitStatus(EN.discussionDisconnected);
    await storage(false);
    assert.ok(await evaluate(`${THREAD}.querySelectorAll('.discussion-body').length === 0`));
    await pair(TOKEN);
    await select("#discussion-topic", topicId);
    await application.close(); application = null;
    await click("#discussion-reload");
    await waitStatus(EN.discussionUnavailable);
    assert.ok(await evaluate("document.querySelector('#discussion-submit').disabled"));
    await startService(SECOND_TOKEN);
    await click("#discussion-reload");
    await waitStatus(EN.discussionUnauthorized);
    await waitFor(async () => evaluate("chrome.storage.session.get(null).then(value => value.localServicePairingToken === undefined && value.pageMatchingCaptureSession?.windowId === null)"), "rejected pairing session removal with inactive capture lease retained");
    await storage(false);
    assert.ok(await evaluate(`${THREAD}.querySelectorAll('.discussion-body').length === 0`));
    await pair(SECOND_TOKEN);
    await select("#discussion-topic", topicId);
    assert.ok(await evaluate(`${THREAD}.textContent.includes('Synthetic edited browser root')`));
    await click(`[data-action=withdraw][data-contribution-id="${rootId}"]`);
    await waitExpression(`${THREAD}.textContent.includes('Deleted') && ${THREAD}.textContent.includes('Synthetic browser reply survives withdrawal') && !${THREAD}.textContent.includes('Synthetic edited browser root')`, "UI withdrawal keeps replies");
    await waitStatus(EN.discussionReady);
    await input("#discussion-reset-confirmation", "RESET DEMO STATE");
    await click("#discussion-reset");
    await waitStatus(EN.discussionChooseStatus);
    assert.ok(await evaluate(`!Array.from(document.querySelector('#discussion-topic').options).some(item => item.value === ${JSON.stringify(topicId)})`));
    // The URL never reaches a real site: Fetch fulfills project-created HTML.
    for (const [url, sourceId] of [["https://example.com/", "reserved-example-com"], ["https://example.org/", "reserved-example-org"]]) {
      await closePopup(); await bringPageForward();
      await browser.send("Page.navigate", { url }, pageSession);
      await waitFor(async () => evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`, pageSession), "intercepted reserved-domain document");
      await openPopup();
      await waitExpression(`document.querySelector('#discussion-source').value === ${JSON.stringify(sourceId)} && document.querySelector('#discussion-topic').value === 'reserved-domain-demo'`, "automatic fixture-only current-tab selection");
      await waitStatus(EN.discussionReady);
      if (sourceId === "reserved-example-com") await post("Synthetic shared reserved-domain browser root");
      else assert.ok(await evaluate(`${THREAD}.textContent.includes('Synthetic shared reserved-domain browser root')`));
    }
    await storage(true);
    await evaluate("document.querySelector('#discussion-token').focus()");
    await key("Tab", "Tab", 9);
    assert.ok(await evaluate("document.activeElement.id === 'discussion-pair'"));
    assert.equal(runtimeExceptions, 0, "No browser JavaScript exception is expected; intentional network failures are separate");
    assert.equal(externalExtensionRequests, 0);
    assert.ok(extensionRequests > 0 && interceptedFixtureDocuments === 2);
    return { browser: version.product, result: "PASS", actualActionPopup: true,
      covered: ["pairing", "keyboard", "service-source-ranking", "source-selection-invalidation", "topic-create", "root", "reply", "edit", "popup-reopen", "disconnect", "unavailable", "service-restart-token", "withdraw", "reset", "fixture-auto-load", "shared-topic", "inert-markup", "session-only-storage", "bounded-extension-network"],
      runtimeExceptions, externalExtensionRequests, interceptedFixtureDocuments,
      scope: "Fresh profile; actual extension action popup; synthetic intercepted pages; no global browser firewall claim" };
  } finally {
    clearTimeout(deadline); process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
    try { await browser?.close(); } finally {
      try { await application?.close(); } finally {
        await Promise.allSettled([...tasks]);
        removeOwnedTemp(directory);
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const backgroundMatching = args[0] === '--matching';
  const remaining = backgroundMatching ? args.slice(1) : args;
  if (remaining.length > 1) {
    process.stderr.write("Usage: node harness/run-local-service-browser-smoke.js [--matching] [absolute-installed-chrome-path]\n");
    process.exitCode = 1;
  } else {
    runLocalServiceBrowserSmoke(remaining[0], { backgroundMatching }).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
      // Harness-generated messages deliberately exclude browser/HTTP payloads.
      process.stderr.write(`Local service browser smoke failed: ${error.message}\n`);
      process.exitCode = 1;
    });
  }
}
