import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, cpSync, readFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AccountRepository } from "../src/accounts/account-repository.js";
import { AccountService } from "../src/accounts/account-service.js";
import { createAccountLifecycle } from "../src/accounts/account-lifecycle.js";
import { createMemoryDemoService } from "../src/application/create-demo-service.js";
import { createRequestHandler } from "../src/http/request-handler.js";
import { validateStartupConfig } from "../src/http/startup-config.js";
import { launchChromiumPipe } from "../../../spikes/topic-resolution/harness/chromium-pipe.js";

// Real production native side panel, anonymous CDP pipes, fresh profile, in-memory stores.
// All network is intercepted; no listener, mail, OAuth, model or owner data.
const extensionRoot = fileURLToPath(new URL("../../../spikes/topic-resolution/browser/", import.meta.url));
const profileRoot = mkdtempSync(path.join(os.tmpdir(), "murmingle-account-panel-"));
const qaExtensionRoot = path.join(profileRoot, "extension"); cpSync(extensionRoot, qaExtensionRoot, { recursive: true });
const qaManifestPath = path.join(qaExtensionRoot, "manifest.json");
const qaManifest = JSON.parse(readFileSync(qaManifestPath, "utf8"));
// Snapshot the production extension for reproducible isolated loading.
writeFileSync(qaManifestPath, JSON.stringify(qaManifest));
const artifacts = path.join(os.tmpdir(), "murmingle-account-panel-review"); mkdirSync(artifacts, { recursive: true });
const repository = new AccountRepository();
const accounts = new AccountService({ repository, hmacKey: randomBytes(32), mailSink: null, fixtureOnly: false,
  chatgptIdentity: () => ({ issuer: "https://auth.openai.com", clientId: "synthetic-panel-client", subject: "synthetic-panel-subject" }) });
const service = createMemoryDemoService({ nextId: prefix => `${prefix}-${randomUUID()}`, now: () => new Date().toISOString(),
  resolveAccountActor: id => accounts.principalForAccountId(id), readAccountActors: () => accounts.publicActors() });
service.command(service.catalog().version, { type: "create-root", topicId: "harbor-s2", body: "Synthetic legacy root remains unclaimed", originSourceId: null }, "demo-alex");
const legacyId = service.discussion("harbor-s2").roots[0].id;
const ai = { status: () => ({ connected: true, planEnabled: true, pending: false, account: { clientId: "synthetic-panel-client", label: "Synthetic QA" } }),
  models: async () => ({ models: [{ slug: "synthetic-model", displayName: "Synthetic model" }] }), diagnostics: () => ({ events: [] }), resumable: () => ({ job: null }),
  cancelAccount() {}, connect() { throw new Error("Unexpected OAuth launch"); }, create() { throw new Error("Unexpected provider inference"); } };
const capability = "synthetic-panel-pairing-capability-only";
const browser = launchChromiumPipe({ executable: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", profileDirectory: path.join(profileRoot, "profile") });
let sessionId, handle, origin, popupSession = null; const failures = [], errors = [], screenshots = [], calls = [], targets = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function evaluate(expression) {
  const result = await browser.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (result.exceptionDetails) throw new Error("Production panel expression failed"); return result.result.value;
}
async function waitFor(expression) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (await evaluate(expression)) return; await pause(60); }
  throw new Error(`Production panel state timed out: ${expression}`);
}
async function capture(name) {
  await pause(220); const value = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  const filename = path.join(artifacts, `${name}.png`); writeFileSync(filename, Buffer.from(value.data, "base64")); screenshots.push(filename);
}
async function layout() { return evaluate(`(() => { const r=document.querySelector('.account-sheet').getBoundingClientRect();return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,sheetOverflow:r.width>innerWidth,sheetVisible:r.top>=0&&r.bottom<=innerHeight,focus:document.activeElement.id||document.activeElement.className};})()`); }
browser.on("Runtime.exceptionThrown", () => errors.push("exception"));
browser.on("Fetch.requestPaused", ({ requestId, request }, incoming) => {
  void (async () => {
    const url = new URL(request.url);
    if (url.origin !== "http://127.0.0.1:4174" || !url.pathname.startsWith("/v1/")) {
      failures.push("unexpected-network"); await browser.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, incoming); return;
    }
    calls.push({ method: request.method, path: url.pathname });
    const headers = Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key.toLowerCase(), value]));
    const response = await handle({ method: request.method, url: url.pathname, headers: { ...headers, host: "127.0.0.1:4174" }, body: request.postData ?? null });
    if (response.status >= 400) failures.push(`${request.method}:${url.pathname}:${response.status}`);
    await browser.send("Fetch.fulfillRequest", { requestId, responseCode: response.status,
      responseHeaders: Object.entries(response.headers).map(([name, value]) => ({ name, value })), body: Buffer.from(response.body ?? "").toString("base64") }, incoming);
  })().catch(() => failures.push("interception-failed"));
});
try {
  const loaded = await browser.send("Extensions.loadUnpacked", { path: qaExtensionRoot }); origin = `chrome-extension://${loaded.id}`;
  const config = validateStartupConfig({ host: "127.0.0.1", port: 4174, origin, capability });
  handle = createRequestHandler({ service, config, accounts, accountWrites: true, ai,
    accountLifecycle: createAccountLifecycle({ accounts, service, ai }) });
  const target = await browser.send("Target.createTarget", { url: "about:blank" });
  sessionId = (await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true })).sessionId;
  await browser.send("Page.enable", {}, sessionId); await browser.send("Runtime.enable", {}, sessionId);
  await browser.send("Fetch.enable", { patterns: [{ urlPattern: "http://*", requestStage: "Request" }, { urlPattern: "https://*", requestStage: "Request" }] }, sessionId);
  await browser.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 740, deviceScaleFactor: 1, mobile: false }, sessionId);
  await browser.send("Page.navigate", { url: `${origin}/fixtures/accounts-preview.html` }, sessionId);
  await waitFor("Boolean(window.accountPreview)");
  await evaluate(`chrome.storage.local.set({localServicePairingV1:{version:1,token:${JSON.stringify(capability)}},discussionUiModeV1:'user'})`);
  browser.on("Target.attachedToTarget", ({ sessionId: attached, targetInfo, waitingForDebugger }) => {
    const entry = { id: targetInfo.targetId, session: attached, type: targetInfo.type, path: targetInfo.url.startsWith(origin) ? targetInfo.url.slice(origin.length) : "other", ready: false };
    targets.push(entry);
    void (async () => {
      if (["page", "iframe", "other"].includes(targetInfo.type)) {
        await browser.send("Fetch.enable", { patterns: [{ urlPattern: "http://*", requestStage: "Request" }, { urlPattern: "https://*", requestStage: "Request" }] }, attached);
      }
      if (waitingForDebugger) await browser.send("Runtime.runIfWaitingForDebugger", {}, attached);
      await browser.send("Runtime.enable", {}, attached); entry.ready = true;
    })().catch(() => failures.push("popup-attach-failed"));
  });
  browser.on("Target.targetInfoChanged", ({ targetInfo }) => {
    const entry = targets.find(item => item.id === targetInfo.targetId);
    if (entry) entry.path = targetInfo.url.startsWith(origin) ? targetInfo.url.slice(origin.length) : "other";
  });
  await browser.send("Target.setDiscoverTargets", { discover: true });
  await browser.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
    filter: [{ type: "page", exclude: false }, { type: "iframe", exclude: false }, { type: "other", exclude: false }, { type: "service_worker", exclude: false }, { exclude: true }] });
  await waitFor("chrome.sidePanel.getPanelBehavior().then(value=>value.openPanelOnActionClick)");
  const tabTargets = await browser.send("Target.getTargets", { filter: [{ type: "tab", exclude: false }, { exclude: true }] });
  const toolbarTab = tabTargets.targetInfos.find(item => item.url === `${origin}/fixtures/accounts-preview.html`);
  assert.ok(toolbarTab); await browser.send("Extensions.triggerAction", { id: loaded.id, targetId: toolbarTab.targetId });
  const popupDeadline = Date.now() + 10000;
  while (!popupSession && Date.now() < popupDeadline) {
    popupSession = targets.find(item => item.ready && item.path.startsWith("/chromium/sidepanel.html?") && item.path.includes("instance="))?.session;
    await pause(50);
  }
  if (!popupSession) throw new Error("Production native side panel target unavailable");
  sessionId = popupSession;
  await browser.send("Page.enable", {}, sessionId);
  await browser.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 740, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor("Boolean(document.querySelector('.account-profile-button'))&&document.querySelector('#discussion-topic').options.length>0");
  const initialVersion = service.catalog().version;
  await evaluate("document.querySelector('.account-profile-button').focus();document.querySelector('.account-profile-button').click()");
  await waitFor("!document.querySelector('.account-sheet').closest('.account-overlay').hidden&&!document.querySelector('.account-sheet>.account-secondary').hidden");
  assert.equal(await evaluate("document.querySelector('.account-form').hidden"), true);
  await capture("normal-signin-390");
  await evaluate("document.querySelector('.account-sheet>.account-secondary').click()");
  await waitFor("document.querySelector('#account-username')&&!document.querySelector('.account-submit').disabled");
  await capture("normal-username-390");
  await evaluate("document.querySelector('#account-username').value='qa_reader';document.querySelector('.account-form').requestSubmit()");
  await waitFor("document.querySelector('.account-profile-button').textContent==='@qa_reader'&&!document.querySelector('.account-profile').hidden");
  assert.equal(await evaluate("document.querySelector('#account-reply-email').disabled"), true);
  assert.deepEqual(service.catalog().version, initialVersion); // sign-in never posts
  await capture("normal-profile-390");
  await browser.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 600, deviceScaleFactor: 1, mobile: false }, sessionId);
  const compact = await layout(); assert.equal(compact.overflow, false); assert.equal(compact.sheetOverflow, false); assert.equal(compact.sheetVisible, true);
  await capture("normal-profile-320");
  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.account-sheet')).animationName"), "none");
  await evaluate("document.querySelector('.account-close').click()");
  assert.equal(await evaluate("document.activeElement.className"), "account-profile-button");
  await evaluate("document.querySelector('#ui-mode-developer').click();document.querySelector('#discussion-topic').value='harbor-s2';document.querySelector('#discussion-topic').dispatchEvent(new Event('change',{bubbles:true}))");
  await waitFor("!document.querySelector('#discussion-body').disabled");
  await evaluate("document.querySelector('#ui-mode-user').click()");
  await evaluate("document.querySelector('#discussion-body').value='Synthetic account panel QA contribution';document.querySelector('#discussion-body').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#discussion-composer').requestSubmit()");
  await waitFor("document.querySelector('.discussion-thread').textContent.includes('Synthetic account panel QA contribution')");
  const principal = accounts.publicActors()[0]; assert.equal(service.accountContributions(principal.id).length, 1);
  assert.equal(await evaluate(`(async()=>{const {createLocalAiClient}=await import(chrome.runtime.getURL('core/local-ai-client.js'));const client=createLocalAiClient({fetchImpl:fetch.bind(globalThis),getToken:async()=> (await chrome.storage.local.get('localServicePairingV1')).localServicePairingV1.token,getAccountToken:async()=> (await chrome.storage.session.get('discussionAccountSessionV1')).discussionAccountSessionV1.session.accessToken});return (await client.resumable(${JSON.stringify(principal.id)}))===null;})()`), true);
  await evaluate(`document.querySelector('[data-action="reply"][data-contribution-id="${legacyId}"]').click()`);
  await waitFor("document.querySelector('#discussion-composer').getAttribute('data-composer-mode')==='reply'");
  await evaluate("document.querySelector('#discussion-body').value='Synthetic authenticated reply to legacy root';document.querySelector('#discussion-body').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#discussion-composer').requestSubmit()");
  await waitFor("document.querySelector('.discussion-thread').textContent.includes('Synthetic authenticated reply to legacy root')");
  assert.equal(service.accountContributions(principal.id).length, 2);
  assert.equal(service.discussion("harbor-s2").roots.find(root=>root.id===legacyId).authorId,"demo-alex");
  await capture("normal-owned-post-320");
  await browser.send("Page.reload", {}, sessionId);
  await waitFor("document.querySelector('.account-profile-button')?.textContent==='@qa_reader'");
  assert.equal(service.accountContributions(principal.id).length, 2); // panel reopen does not post
  await evaluate("document.querySelector('.account-profile-button').click()");
  await waitFor("!document.querySelector('.account-profile').hidden&&!document.querySelector('.account-profile>.account-secondary').disabled");
  const downloads = path.join(profileRoot, "downloads"); mkdirSync(downloads);
  await browser.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
  await evaluate("document.querySelector('.account-rights .account-link:not(.account-danger)').click()");
  const exportFilename = path.join(downloads, "discussion-account-data.json"), exportDeadline = Date.now() + 5000;
  while (!existsSync(exportFilename) && Date.now() < exportDeadline) await pause(50);
  assert.equal(existsSync(exportFilename), true);
  const exported = JSON.parse(readFileSync(exportFilename, "utf8"));
  assert.equal(exported.account.username, "qa_reader"); assert.equal(exported.posts.length, 2);
  assert.equal(Object.hasOwn(exported, "session"), false); assert.equal(Object.hasOwn(exported, "accessToken"), false);
  await waitFor("document.querySelector('.account-sheet').getAttribute('aria-busy')==='false'");
  await evaluate("document.querySelector('.account-rights .account-danger').click()");
  assert.equal(await evaluate("document.activeElement.textContent"), "Keep my account");
  assert.equal(calls.some(call=>call.path==='/v1/account/delete'),false);
  await capture("normal-delete-confirmation-320");
  await evaluate("document.querySelector('.account-deletion .account-secondary:not(.account-danger)').click()");
  assert.equal(await evaluate("document.querySelector('.account-profile').hidden"),false);
  await evaluate("document.querySelector('.account-profile>.account-secondary').click()");
  await waitFor("document.querySelector('.account-profile-button').textContent==='Sign in'");
  const revokeDeadline = Date.now() + 5000;
  while (repository.database.prepare("SELECT COUNT(*) AS n FROM sessions WHERE revoked=0").get().n && Date.now() < revokeDeadline) await pause(50);
  assert.equal(repository.database.prepare("SELECT COUNT(*) AS n FROM sessions WHERE revoked=0").get().n, 0);
  assert.equal(service.accountContributions(principal.id).length, 2);
  await evaluate("document.querySelector('.account-sheet>.account-secondary').click()");
  await waitFor("document.querySelector('.account-profile-button').textContent==='@qa_reader'&&!document.querySelector('.account-profile').hidden&&!document.querySelector('.account-rights .account-danger').disabled");
  await evaluate("document.querySelector('.account-rights .account-danger').click();document.querySelector('.account-deletion .account-danger').click()");
  const deleteDeadline=Date.now()+5000;
  while(repository.database.prepare("SELECT state FROM accounts").get().state!=='deleted'&&Date.now()<deleteDeadline)await pause(50);
  assert.equal(repository.database.prepare("SELECT state FROM accounts").get().state,'deleted');
  assert.equal(repository.database.prepare("SELECT COUNT(*) AS n FROM external_identities").get().n,0);
  assert.equal(repository.database.prepare("SELECT COUNT(*) AS n FROM sessions WHERE revoked=0").get().n,0);
  assert.equal(JSON.stringify(service.accountContributions(principal.id)).includes('Synthetic account panel QA contribution'),false);
  assert.equal(service.discussion('harbor-s2').roots.find(root=>root.id===legacyId).body,'Synthetic legacy root remains unclaimed');
  assert.equal(calls.filter(call => call.path === "/v1/commands").length, 2);
  assert.equal(calls.some(call => /\/email\/|\/ai\/(?:connect|insights)$|\/sources\/ingest/.test(call.path)), false);
  assert.deepEqual(failures, []); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "pass", calls: calls.length, runtimeErrors: errors.length, compact, screenshots,
    checks: ["production-native-sidepanel-real-handler", "server-only-synthetic-chatgpt-identity", "no-email-or-provider", "username", "no-auto-post", "own-canonical-human-post", "legacy-root-reply-without-ownership-transfer", "account-owned-resumable-POST", "own-data-local-download", "delete-cancel-no-request", "explicit-delete-withdraw-and-revoke", "session-RAM-panel-reopen", "logout-revocation", "focus-restored", "320px-no-overflow", "reduced-motion"] }));
} catch (error) {
  await capture("normal-failure").catch(() => {});
  console.log(JSON.stringify({ failures, errors, calls, targets, surface: await evaluate("({error:document.querySelector('.account-error')?.textContent,busy:document.querySelector('.account-sheet')?.getAttribute('aria-busy'),profileButton:document.querySelector('.account-profile-button')?.textContent})").catch(() => null) }));
  throw error;
} finally {
  await browser.close(); repository.close();
  const resolved = path.resolve(profileRoot); assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.equal(path.basename(resolved).startsWith("murmingle-account-panel-"), true); rmSync(resolved, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
}
