import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startLocalApplication, createProcessDependencies } from "../../../apps/local-service/src/startup.js";
import { changePairing } from "../../../apps/local-service/src/http/pairing-store.js";
import { EN } from "../browser/locales/en.js";
import { formatInsightCitations } from "../browser/core/insight-citations.js";
import { TOOLBAR_TAB_KEY } from "../browser/core/topic-toolbar-controller.js";
import { launchChromiumPipe } from "./chromium-pipe.js";
import { createTargetSetupLifetime, isTargetSetupCanceled } from "./target-setup-lifetime.js";

const BROWSER_ROOT = fileURLToPath(new URL("../browser/", import.meta.url));
const DEFAULT_CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const STATUS = "document.querySelector('#discussion-status')?.textContent";
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
  const pairingPath = path.join(directory, "pairing.json");
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
  let stage = "initializing";
  let syntheticInsightRequests = 0;
  let userModeScreenshot = null;
  let userModeFooterScreenshot = null;
  const syntheticJobs = new Map();
  // Trusted test seam only. This never signs in or contacts a provider.
  const syntheticAi = {
    status: () => ({ connected: true, planEnabled: true, pending: false, account: { clientId: "synthetic-client", label: "Synthetic browser test account" } }),
    models: async () => ({ models: [{ slug: "synthetic-model", displayName: "Synthetic browser test model" }] }),
    create(value, actorId) {
      assert.equal(actorId, "demo-alex");
      assert.equal(value.context.currentSource.url, "https://example.org/");
      assert.ok(value.context.sameTopicSources.some(source => source.url === "https://example.com/"));
      assert.ok(value.articleText.includes("Public synthetic article"));
      assert.equal(value.articleText.includes("excluded-form-value"), false);
      syntheticInsightRequests++;
      const body = "Synthetic generated comparison citeturn0search0.";
      const marker = "citeturn0search0";
      syntheticJobs.set(value.operationId, { operationId: value.operationId, state: "completed",
        actorId, expected: value.expected, topicId: value.context.topic.id,
        originSourceId: value.context.currentSource.id, result: {
          body, model: "synthetic-model",
          citations: [{ url: "https://example.com/", title: "Synthetic comparison source",
            startIndex: body.indexOf(marker), endIndex: body.indexOf(marker) + marker.length }],
        } });
      return { operationId: value.operationId, state: "running" };
    },
    result: value => { const job = syntheticJobs.get(value.operationId);
      return job && { operationId: job.operationId, state: job.state, result: job.result }; },
    resumable(actorId) {
      const job = [...syntheticJobs.values()].reverse().find((item) => item.actorId === actorId);
      return { job: job ? { operationId: job.operationId, state: job.state, expected: job.expected,
        topicId: job.topicId, originSourceId: job.originSourceId,
        rootId: null, replyToId: null, discussionId: null } : null };
    },
    share(value, actorId, persist) {
      const job = syntheticJobs.get(value.command.operationId);
      assert.ok(job && job.actorId === actorId);
      assert.deepEqual(value.expected, job.expected);
      const body = formatInsightCitations(job.result.body, job.result.citations);
      assert.equal(value.command.body, body);
      assert.equal(value.command.topicId, job.topicId);
      assert.equal(value.command.originSourceId, job.originSourceId);
      const result = persist({ kind: "generated-insight", operationId: job.operationId, actorId,
        topicId: job.topicId, originSourceId: job.originSourceId, body,
        rootId: null, replyToId: null, discussionId: null });
      syntheticJobs.delete(job.operationId);
      return result;
    },
    cancel: value => { syntheticJobs.delete(value.operationId); return { cancelled: true }; },
    disconnect: async () => ({ revocationConfirmed: true }),
    reset: () => syntheticJobs.clear(), dispose: () => syntheticJobs.clear(),
  };
  const stop = () => { void browser?.close(); };
  function schedule(operation, target) {
    const task = Promise.resolve().then(operation).catch(error => {
      if (target?.detached && isTargetSetupCanceled(error)) return;
      const method = /(?:during |for |rejected |timeout: )([A-Za-z]+\.[A-Za-z]+)/u.exec(error?.message ?? "")?.[1] ?? "unknown";
      const code = /\(code (-?\d+)\)/u.exec(error?.message ?? "")?.[1] ?? "none";
      errors.push(`CDP target/interception setup failed (${stage}; method ${method}; code ${code}; target ${target?.type ?? 'request'}; detached ${target?.detached === true})`);
    });
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
    const context = stage === "source-link-activation" ? [...targets.values()].map(target => ({
      type: target.type, ready: target.ready, setup: target.setupMethod, waiting: target.waiting, kind: target.url === "https://example.com/" ? "source" :
        target.url === "https://example.org/" ? "origin-tab" : target.url === "about:blank" ? "blank" :
        target.url === "" ? "empty" : target.url.startsWith(`chrome-extension://${extensionId}/`) ? "extension" : "other",
    })) : [];
    throw new Error(`Browser smoke timeout: ${label}${context.length ? ` ${JSON.stringify(context)}` : ""}`);
  }
  const waitExpression = (expression, label) => waitFor(() => evaluate(expression), label);
  const waitStatus = (message) => waitExpression(`${STATUS} === ${JSON.stringify(message)}`,
    `expected discussion status at ${stage}`);
  async function click(selector) {
    const available = await evaluate(`(() => { const item=document.querySelector(${JSON.stringify(selector)}); if(!item || item.disabled) return false; item.click(); return true; })()`);
    assert.ok(available, `Expected enabled UI control ${selector} during ${stage}`);
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
  async function storage(paired, expectedToken = null) {
    const shape = await evaluate(`(async () => {
      const [local,sync,session]=await Promise.all([chrome.storage.local.get(null),chrome.storage.sync.get(null),chrome.storage.session.get(null)]);
      const lease=session.pageMatchingCaptureSession;
      const inactiveLease=lease && lease.schema==='capture-session/2' && lease.windowId===null &&
        typeof lease.autoStart==='boolean' &&
        typeof lease.revision==='string' && /^[a-zA-Z0-9-]{16,80}$/.test(lease.revision) && Object.keys(lease).length===4;
      // Red/gray per-tab overrides also require the approved cleanup marker,
      // even when capture is off or pairing has been removed.
      const toolbarKey=${JSON.stringify(TOOLBAR_TAB_KEY)};
      const validToolbarMarker=!Object.hasOwn(session,toolbarKey) ||
        (Number.isSafeInteger(session[toolbarKey]) && session[toolbarKey]>=0);
      const keys=Object.keys(session).filter(key=>key!=='pageMatchingCaptureSession' && key!==toolbarKey);
      const stored=local.localServicePairingV1;
      const validPairing=stored?.version===1 && typeof stored.token==='string' &&
        stored.token.length===43 && /^[A-Za-z0-9_-]{43}$/.test(stored.token) &&
        Object.keys(stored).length===2;
      return {localUiOnly:local.discussionUiModeV1==='developer' && Object.keys(local).length===(stored?2:1),
        syncEmpty:Object.keys(sync).length===0,
        sessionUnpaired:inactiveLease && validToolbarMarker && keys.length===0 && stored===undefined,
        sessionPaired:inactiveLease && validToolbarMarker && keys.length===0 && validPairing,
        tokenMatches:stored?.token===${JSON.stringify(expectedToken)}};
    })()`);
    assert.ok(shape.localUiOnly && shape.syncEmpty);
    assert.ok(paired ? shape.sessionPaired : shape.sessionUnpaired);
    if (paired) assert.ok(shape.tokenMatches);
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
  async function startService() {
    const dependencies = createProcessDependencies();
    application = await startLocalApplication({ databasePath, nextId: dependencies.nextId, now: dependencies.now, ai: syntheticAi,
      pairingPath, config: { host: "127.0.0.1", port: 4174, origin: `chrome-extension://${extensionId}`, capability: dependencies.capability } });
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
      for (const target of targets.values()) if (target.targetId === targetId || target.sessionId === sessionId) {
        target.detached = true; target.setupLifetime.detach();
      }
      if (targetId) targets.delete(targetId);
      else for (const [id, target] of targets) if (target.sessionId === sessionId) targets.delete(id);
    });
    browser.on("Target.targetInfoChanged", ({ targetInfo }) => {
      const target = targets.get(targetInfo.targetId);
      if (target) target.url = targetInfo.url;
    });
    browser.on("Target.attachedToTarget", ({ sessionId, targetInfo, waitingForDebugger }) => {
      const target = { targetId: targetInfo.targetId, sessionId, url: targetInfo.url, type: targetInfo.type, waiting: waitingForDebugger, ready: false, setupLifetime: createTargetSetupLifetime() };
      targets.set(target.targetId, target);
      schedule(async () => {
        const setup = (method, params) => { target.setupMethod = method; return target.setupLifetime.step(() => browser.send(method, params, sessionId)); };
        // Newly opened paused pages can stall renderer Network/Runtime setup.
        // Install the Fetch guard before resuming, then enable telemetry. The
        // Network counter alone does not cover the pre-enable interval.
        if (["page", "iframe", "other"].includes(targetInfo.type)) {
          await setup("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
        }
        await setup("Runtime.runIfWaitingForDebugger", {});
        if (["page", "iframe", "other"].includes(targetInfo.type)) await setup("Network.enable", {});
        await setup("Runtime.enable", {});
        target.setupLifetime.complete();
        target.ready = true;
      }, target);
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
        const html = "<!doctype html><meta charset=utf-8><title>Project-created reserved-domain browser smoke fixture</title><main><h1>Public synthetic article</h1><p>This project-created article compares two reserved-domain examples and contains no real reporting. The related page is another perspective for a synthetic insight.</p><form><input value='excluded-form-value'></form></main>";
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
    const origin = `chrome-extension://${extensionId}`;
    const firstToken = changePairing({ filePath: pairingPath, origin, action: "init" });
    await startService();
    await waitFor(() => {
      const page = [...targets.values()].find((target) => target.ready && target.url === "about:blank");
      if (!page) return false;
      pageSession = page.sessionId; return true;
    }, "blank browser page");
    await openPopup();
    await waitStatus(EN.discussionDisconnected);
    assert.ok(await evaluate("document.querySelector('#discussion-token').type === 'password' && document.querySelector('#discussion-submit').disabled"));
    await pair(firstToken);
    await waitStatus(EN.discussionChooseStatus);
    await storage(true, firstToken);
    await select("#discussion-source", "harbor-overview");
    await waitExpression("document.querySelector('#discussion-related ul')?.children.length===4", "ranked related-page fixture list");
    const ranking = await evaluate(`(() => {
      const root=document.querySelector('#local-discussion');
      const items=Array.from(root.querySelector('#discussion-related ul').children);
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
        && root.querySelector('#discussion-related ul').children.length===1
        && root.querySelector('#discussion-related ul').textContent===${JSON.stringify(EN.discussionRelatedEmpty)}
        && ${THREAD}.textContent.includes(${JSON.stringify(EN.discussionEmpty)})
        && !root.textContent.includes('Synthetic Harbor source-selection root')
        && !root.querySelector('#discussion-related ul').textContent.includes('Harbor');
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
    await storage(true, firstToken);
    await select("#discussion-topic", topicId);
    assert.ok(await evaluate(`${THREAD}.textContent.includes('Synthetic edited browser root')`));
    await click("#discussion-disconnect");
    await waitStatus(EN.discussionDisconnected);
    await storage(false);
    assert.ok(await evaluate(`${THREAD}.querySelectorAll('.discussion-body').length === 0`));
    await pair(firstToken);
    await select("#discussion-topic", topicId);
    await application.close(); application = null;
    await click("#discussion-reload");
    await waitStatus(EN.discussionUnavailable);
    assert.ok(await evaluate("document.querySelector('#discussion-submit').disabled"));
    await storage(true, firstToken);
    await startService();
    await click("#discussion-reload");
    await waitStatus(EN.discussionReady);
    await storage(true, firstToken);
    assert.ok(await evaluate(`${THREAD}.textContent.includes('Synthetic edited browser root')`));
    await application.close(); application = null;
    const secondToken = changePairing({ filePath: pairingPath, origin, action: "rotate" });
    assert.notEqual(firstToken, secondToken);
    await startService();
    await click("#discussion-reload");
    await waitStatus(EN.discussionUnauthorized);
    await waitFor(async () => evaluate("Promise.all([chrome.storage.local.get(null),chrome.storage.session.get(null)]).then(([local,session]) => local.localServicePairingV1 === undefined && session.localServicePairingToken === undefined && session.pageMatchingCaptureSession?.windowId === null)"), "rotated pairing removed from local storage with inactive capture lease retained");
    await storage(false);
    assert.ok(await evaluate(`${THREAD}.querySelectorAll('.discussion-body').length === 0`));
    await pair(secondToken);
    await storage(true, secondToken);
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
    stage = "synthetic-ai-insight";
    await select("#discussion-source", "reserved-example-org");
    await click("#ui-mode-user");
    await waitExpression("document.querySelector('#insight-model').value === 'synthetic-model'", "synthetic model listed and selected automatically");
    await waitExpression("!document.querySelector('#discussion-ai-insights').disabled", "one-click composer insight ready");
    assert.equal(await evaluate("document.querySelector('#insight-composer').hidden"), true);
    assert.equal(await evaluate(`${THREAD}.textContent.includes('Synthetic generated comparison')`), false);
    assert.equal(await evaluate("document.querySelector('#app-tab-insights') === null"), true);
    await click("#discussion-ai-insights");
    await waitExpression("!document.querySelector('#insight-composer').hidden && document.querySelector('#insight-citations').textContent.includes('Synthetic generated comparison')", "synthetic formatted private result received");
    assert.ok(await evaluate("document.querySelector('#insight-article-text').value.includes('Public synthetic article')"));
    assert.equal(await evaluate("document.querySelector('#insight-article-text').value.includes('excluded-form-value')"), false);
    assert.equal(syntheticInsightRequests, 1);
    assert.equal(await evaluate(`${THREAD}.textContent.includes('Synthetic generated comparison')`), false);
    assert.ok(await evaluate(`(() => {
      const link=document.querySelector('#insight-citations a');
      return link && link.href==='https://example.com/' && link.target==='_blank' &&
        link.rel==='noopener noreferrer' && link.referrerPolicy==='no-referrer';
    })()`));
    await closePopup(); await bringPageForward(); await openPopup();
    await waitExpression("!document.querySelector('#insight-composer').hidden && document.querySelector('#insight-citations').textContent.includes('Synthetic generated comparison')", "private insight recovered after popup closure");
    assert.equal(syntheticInsightRequests, 1, "reopen must not start a second provider request");
    await click("#insight-share");
    await waitExpression(`${THREAD}.textContent.includes('Synthetic generated comparison') && ${THREAD}.textContent.includes('Robot')`, "generated insight explicitly shared");
    await waitStatus(EN.discussionReady);
    const generatedId = await evaluate(`Array.from(${THREAD}.querySelectorAll('article')).find(item=>item.textContent.includes('Synthetic generated comparison')).querySelector('[data-action=withdraw]').dataset.contributionId`);
    await click(`[data-action=withdraw][data-contribution-id="${generatedId}"]`);
    await waitExpression(`!${THREAD}.textContent.includes('Synthetic generated comparison')`, "generated insight withdrawal purge");
    await select("#discussion-source", "reserved-example-com");
    assert.equal(syntheticInsightRequests, 1);
    await click("#ui-mode-user");
    await click("#app-tab-discussion");
    try {
      await waitExpression("document.body.dataset.uiMode==='user' && !document.querySelector('#app-view-discussion').hidden && document.querySelector('#discussion-ai-insights').getBoundingClientRect().width>0", "compact User Mode with composer insight action");
    } catch (error) {
      const state = await evaluate("({mode:document.body.dataset.uiMode,viewHidden:document.querySelector('#app-view-discussion')?.hidden,actionWidth:document.querySelector('#discussion-ai-insights')?.getBoundingClientRect().width,actionHidden:document.querySelector('#discussion-ai-insights')?.hidden,actionDisabled:document.querySelector('#discussion-ai-insights')?.disabled,source:document.querySelector('#discussion-source')?.value,topic:document.querySelector('#discussion-topic')?.value,status:document.querySelector('#discussion-status')?.textContent,previewHidden:document.querySelector('#insight-composer')?.hidden,replyContextHidden:document.querySelector('#discussion-reply-context')?.hidden})");
      throw new Error(`${error.message}; compactState=${JSON.stringify(state)}`);
    }
    assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
    assert.ok(await evaluate(`${THREAD}.textContent.includes('Synthetic shared reserved-domain browser root')`));
    await evaluate("window.scrollTo(0, 0)");
    const screenshot = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, popupSession);
    userModeScreenshot = path.join(os.tmpdir(), `udl-user-mode-${randomUUID()}.png`);
    writeFileSync(userModeScreenshot, Buffer.from(screenshot.data, "base64"), { flag: "wx" });
    await evaluate("document.querySelector('#insight-workspace').scrollIntoView({ block: 'center' })");
    const footerScreenshot = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, popupSession);
    userModeFooterScreenshot = path.join(os.tmpdir(), `udl-user-mode-footer-${randomUUID()}.png`);
    writeFileSync(userModeFooterScreenshot, Buffer.from(footerScreenshot.data, "base64"), { flag: "wx" });
    await click("#ui-mode-developer");
    await waitExpression("document.body.dataset.uiMode==='developer'", "restore Developer Mode for keyboard verification");
    await storage(true, secondToken);
    await evaluate("document.querySelector('#discussion-token').focus()");
    await key("Tab", "Tab", 9);
    assert.ok(await evaluate("document.activeElement.id === 'discussion-pair'"));
    const existingTargets = new Set(targets.keys());
    stage = "source-link-activation";
    assert.ok(await evaluate(`(() => {
      const link=${THREAD}.querySelector('a.discussion-source-link');
      if(!link)return false;
      link.focus();
      return link.href==='https://example.com/' && link.target==='_blank' &&
        link.rel==='noopener noreferrer' && link.referrerPolicy==='no-referrer' &&
        link.getAttribute('aria-label').includes('https://example.com/') && document.activeElement===link;
    })()`));
    // A deliberate keyboard activation must open the real link in a new tab;
    // that document is still intercepted synthetic HTML, never a live site.
    await key("Enter", "Enter", 13);
    let openedSource;
    await waitFor(() => {
      openedSource = [...targets.values()].find(target => !existingTargets.has(target.targetId) && target.ready && target.url === 'https://example.com/');
      return openedSource;
    }, 'source icon opens a new tab');
    await waitFor(() => evaluate("document.readyState==='complete'", openedSource.sessionId), 'source link document ready');
    assert.ok(await evaluate("window.opener===null && document.referrer===''", openedSource.sessionId));
    await waitFor(() => tasks.size === 0, 'source-link interception and target setup drained');
    if (errors.length) throw new Error(errors[0]);
    assert.equal(runtimeExceptions, 0, "No browser JavaScript exception is expected; intentional network failures are separate");
    assert.equal(externalExtensionRequests, 0);
    assert.ok(extensionRequests > 0 && interceptedFixtureDocuments === 3);
    return { browser: version.product, result: "PASS", actualActionPopup: true,
      covered: ["durable-pairing", "keyboard", "service-source-ranking", "source-selection-invalidation", "topic-create", "root", "reply", "edit", "popup-reopen", "disconnect", "outage-retains-pairing", "service-restart-same-token", "rotation-clears-old-token", "withdraw", "reset", "fixture-auto-load", "shared-topic", "inert-markup", "local-trusted-pairing-storage", "bounded-extension-network", "synthetic-AI-one-click-current-page-read-auto-model-citation-private-reopen-attested-share-withdrawal", "source-icon-keyboard-opens-new-tab-without-opener-or-referrer"],
      runtimeExceptions, externalExtensionRequests, interceptedFixtureDocuments, syntheticInsightRequests,
      userModeScreenshot, userModeFooterScreenshot,
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
