import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AccountRepository } from "../src/accounts/account-repository.js";
import { AccountService } from "../src/accounts/account-service.js";
import { createMemoryDemoService } from "../src/application/create-demo-service.js";
import { createRequestHandler } from "../src/http/request-handler.js";
import { validateStartupConfig } from "../src/http/startup-config.js";
import { launchChromiumPipe } from "../../../spikes/topic-resolution/harness/chromium-pipe.js";

// Fresh disposable Chrome + CDP request interception + isolated in-memory SQLite.
// No server listener, real email, owner profile/data, OAuth or provider request.
const extensionRoot = fileURLToPath(new URL("../../../spikes/topic-resolution/browser/", import.meta.url));
const profileRoot = mkdtempSync(path.join(os.tmpdir(), "udl-account-preview-"));
const artifacts = path.join(os.tmpdir(), "udl-account-design-review");
mkdirSync(artifacts, { recursive: true });
const repository = new AccountRepository();
const mail = [];
const accounts = new AccountService({ repository, hmacKey: randomBytes(32), mailSink: value => mail.push(value) });
const browser = launchChromiumPipe({ executable: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", profileDirectory: path.join(profileRoot, "profile") });
let sessionId;
let handle;
let origin;
let requests = 0;
const failures = [];
const runtimeErrors = [];
const screenshots = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function evaluate(expression) {
  const result = await browser.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (result.exceptionDetails) throw new Error("Account preview expression failed");
  return result.result.value;
}
async function waitFor(expression) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await pause(40);
  }
  throw new Error("Account preview state timed out");
}
async function screenshot(name) {
  await pause(250);
  const captured = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  const filename = path.join(artifacts, `${name}.png`);
  writeFileSync(filename, Buffer.from(captured.data, "base64"));
  screenshots.push(filename);
}
async function submit(selector, value) {
  await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); input.value=${JSON.stringify(value)}; input.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('.account-form').requestSubmit(); })()`);
}
async function layout() {
  return evaluate(`(() => { const r = document.querySelector('.account-sheet').getBoundingClientRect(); return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,sheetOverflow:r.width>innerWidth,sheetVisible:r.top>=0&&r.bottom<=innerHeight,focus:document.activeElement.id,inert:document.querySelector('main').inert}; })()`);
}

browser.on("Runtime.exceptionThrown", () => runtimeErrors.push("exception"));
browser.on("Fetch.requestPaused", ({ requestId, request }, incomingSession) => {
  void (async () => {
    const url = new URL(request.url);
    if (url.origin !== "http://127.0.0.1:4174" || !url.pathname.startsWith("/v1/account/")) {
      failures.push("unexpected-network-request");
      await browser.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, incomingSession);
      return;
    }
    requests++;
    const headers = Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key.toLowerCase(), value]));
    // Browser's Origin/credential headers remain authoritative; only Host is
    // supplied here because Chromium omits it in this request-stage CDP event.
    const response = await handle({ method: request.method, url: url.pathname,
      headers: { ...headers, host: "127.0.0.1:4174" }, body: request.postData ?? null });
    await browser.send("Fetch.fulfillRequest", { requestId, responseCode: response.status,
      responseHeaders: Object.entries(response.headers).map(([name, value]) => ({ name, value })),
      body: Buffer.from(response.body ?? "").toString("base64") }, incomingSession);
  })().catch(() => failures.push("interception-failed"));
});

try {
  const loaded = await browser.send("Extensions.loadUnpacked", { path: extensionRoot });
  origin = `chrome-extension://${loaded.id}`;
  const config = validateStartupConfig({ host: "127.0.0.1", port: 4174, origin, capability: "synthetic-account-pairing-capability-only" });
  handle = createRequestHandler({ service: createMemoryDemoService({ nextId: prefix => `${prefix}-${randomUUID()}`, now: () => new Date().toISOString() }), config, accounts });
  const target = await browser.send("Target.createTarget", { url: "about:blank" });
  sessionId = (await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true })).sessionId;
  await browser.send("Page.enable", {}, sessionId);
  await browser.send("Runtime.enable", {}, sessionId);
  await browser.send("Fetch.enable", { patterns: [{ urlPattern: "http://*", requestStage: "Request" }, { urlPattern: "https://*", requestStage: "Request" }] }, sessionId);
  await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.accountFixtureTransport=(...args)=>fetch(...args);" }, sessionId);
  await browser.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 740, deviceScaleFactor: 1, mobile: false }, sessionId);
  await browser.send("Page.navigate", { url: `${origin}/fixtures/accounts-preview.html` }, sessionId);
  await waitFor("Boolean(window.accountPreview)");
  await evaluate("document.querySelector('#preview-draft').value='My unwritten opinion stays here';document.querySelector('#preview-account').focus();document.querySelector('#preview-account').click()");
  assert.equal((await layout()).focus, "account-email");
  assert.equal((await layout()).inert, true);
  assert.equal(await evaluate("document.querySelector('.account-secondary').hidden"), true);
  await screenshot("account-email-390");
  await submit("#account-email", "reader@example.test");
  await waitFor("window.accountPreview.state().stage==='code'&&!window.accountPreview.state().busy");
  assert.equal(mail.length, 1);
  assert.equal(await evaluate("document.querySelector('.account-code-actions button').disabled"), true);
  await screenshot("account-code-390");
  await submit("#account-code", mail[0].code);
  await waitFor("window.accountPreview.state().stage==='username'&&!window.accountPreview.state().busy");
  await screenshot("account-username-390");
  await submit("#account-username", "qa_reader");
  await waitFor("window.accountPreview.state().stage==='closed'");
  assert.equal(await evaluate("document.querySelector('#preview-account').textContent"), "@qa_reader");
  assert.equal(await evaluate("document.querySelector('#preview-draft').value"), "My unwritten opinion stays here");
  assert.equal(await evaluate("document.activeElement.id"), "preview-draft");
  assert.equal(repository.database.prepare("SELECT COUNT(*) AS n FROM accounts").get().n, 1);
  assert.equal(repository.database.prepare("SELECT username FROM accounts").get().username, "qa_reader");
  assert.equal(await evaluate("'session' in window.accountPreview.state() || 'accessToken' in window.accountPreview.state()"), false);
  await evaluate("document.querySelector('#preview-account').focus();document.querySelector('#preview-account').click()");
  await evaluate("document.querySelector('#account-reply-email').click()");
  await waitFor("window.accountPreview.state().account.replyEmail===true&&!window.accountPreview.state().busy");
  assert.equal(repository.database.prepare("SELECT reply_email FROM accounts").get().reply_email, 1);
  await screenshot("account-profile-390");
  await browser.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 600, deviceScaleFactor: 1, mobile: false }, sessionId);
  const compact = await layout();
  assert.equal(compact.overflow, false); assert.equal(compact.sheetOverflow, false); assert.equal(compact.sheetVisible, true);
  await screenshot("account-profile-320");
  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.account-sheet')).animationName"), "none");
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  assert.equal(await evaluate("document.activeElement.id"), "preview-account");
  assert.equal(await evaluate("document.querySelector('main').inert"), false);
  await evaluate("document.querySelector('#preview-account').click();document.querySelector('.account-profile button').focus()");
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }, sessionId);
  assert.equal(await evaluate("document.activeElement.textContent"), "Download my data");
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }, sessionId);
  assert.equal(await evaluate("document.activeElement.textContent"), "Delete account");
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }, sessionId);
  assert.equal(await evaluate("document.activeElement.className"), "account-close");
  await evaluate("document.querySelector('.account-profile button').click()");
  await waitFor("window.accountPreview.state().stage==='email'&&!window.accountPreview.state().busy");
  assert.equal(repository.database.prepare("SELECT COUNT(*) AS n FROM sessions WHERE revoked=0").get().n, 0);
  const inputIdentity = await evaluate("window.qaInput=document.querySelector('#account-email'); window.qaInput.value='typing@example.test';true");
  assert.equal(inputIdentity, true);
  await pause(1_100);
  assert.equal(await evaluate("window.qaInput===document.querySelector('#account-email')&&window.qaInput.value==='typing@example.test'&&document.activeElement===window.qaInput"), true);
  await screenshot("account-email-320");
  assert.deepEqual(failures, []); assert.deepEqual(runtimeErrors, []);
  console.log(JSON.stringify({ result: "pass", requests, runtimeErrors: runtimeErrors.length, compact, screenshots,
    checks: ["real-in-process-account-API", "email-code-username", "draft-preserved-no-auto-post", "preference", "logout-revoked", "stable-input", "focus-trap-and-restore", "inert-background", "reduced-motion", "320px-no-overflow"] }));
} finally {
  await browser.close(); repository.close();
  // Only the exact disposable directory returned by mkdtemp above.
  const resolved = path.resolve(profileRoot);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.equal(path.basename(resolved).startsWith("udl-account-preview-"), true);
  rmSync(resolved, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
}
