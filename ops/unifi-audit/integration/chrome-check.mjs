// Real isolated Chrome, all HTTP(S) intercepted; synthetic data only, no listener.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromiumPipe } from "../../../spikes/topic-resolution/harness/chromium-pipe.js";

const origin = "https://192.168.240.1"; // Synthetic address: never contacted.
const key = "synthetic-browser-key-not-a-credential";
const sentinel = "SYNTHETIC_RAW_DATA_MUST_NOT_ESCAPE";
const uuid = n => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const profile = mkdtempSync(path.join(os.tmpdir(), "murmingle-unifi-audit-qa-"));
const downloads = path.join(profile, "downloads"); mkdirSync(downloads);
const partialDownloads = path.join(profile, "partial-downloads"); mkdirSync(partialDownloads);
const artifactDirectory = path.join(os.tmpdir(), "murmingle-unifi-audit-review"); mkdirSync(artifactDirectory, { recursive: true });
const script = readFileSync(fileURLToPath(new URL("../export-browser.js", import.meta.url)), "utf8");
const browser = launchChromiumPipe({ executable: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", profileDirectory: profile });
const errors = [], calls = [], completed = [], startupMessages = [];
const readyMessage = "[Murmingle UniFi export] Dialog ready. Enter the temporary key in the password field, not the Console.";
let session, scenario = "success";
const page = rows => ({ data: rows, offset: 0, limit: 200, count: rows.length, totalCount: rows.length });
const duplicateId = "abcdefab-0000-4000-8000-000000000020";
const policy = id => ({ id, index: 0, enabled: true, name: sentinel, description: sentinel,
  metadata: { origin: "USER_DEFINED" }, action: { type: "BLOCK" },
  source: { zoneId: uuid(10) }, destination: { zoneId: uuid(11) },
  ipProtocolScope: { ipVersion: "IPV4_AND_IPV6" }, loggingEnabled: false });
browser.on("Runtime.exceptionThrown", () => errors.push("runtime-error"));
browser.on("Runtime.consoleAPICalled", event => {
  if (event.type === "info" && event.args?.length === 1 && event.args[0].value === readyMessage) startupMessages.push(readyMessage);
  else errors.push("unexpected-console-output");
});
browser.on("Browser.downloadProgress", event => { if (event.state === "completed") completed.push(event.guid); });
browser.on("Fetch.requestPaused", ({ requestId, request }, incoming) => {
  void (async () => {
    const url = new URL(request.url);
    if (url.origin !== origin) {
      errors.push("unexpected-origin");
      await browser.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, incoming); return;
    }
    if (!url.pathname.startsWith("/proxy/network/integration/v1/")) {
      await browser.send("Fetch.fulfillRequest", { requestId, responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "text/html" },
          { name: "Content-Security-Policy", value: "default-src 'none'; connect-src 'self'; style-src 'self'" },
          { name: "Set-Cookie", value: "fixture-session=synthetic-cookie; Secure; SameSite=Strict" }],
        body: Buffer.from("<!doctype html><html><head><title>Synthetic local controller</title></head><body><h1>Offline controller fixture</h1></body></html>").toString("base64") }, incoming); return;
    }
    const headers = Object.fromEntries(Object.entries(request.headers).map(([k, v]) => [k.toLowerCase(), v]));
    assert.equal(request.method, "GET"); assert.equal(headers["x-api-key"], key);
    assert.equal(headers.cookie, undefined, "Cookies must not accompany the API key");
    calls.push(url.pathname);
    if (scenario === "cancel") return; // Held at interception until the owner-like Close action.
    let result;
    if (url.pathname.endsWith("/info")) result = { applicationVersion: "10.6.106", password: sentinel };
    else if (url.pathname.endsWith("/sites")) result = page([{ id: uuid(1), name: sentinel }, { id: uuid(2), name: sentinel }]);
    else if (scenario === "policy-recovery" && url.pathname.endsWith("/firewall/zones")) result = page([
      { id: uuid(10), name: "Internal", metadata: { origin: "SYSTEM_DEFINED" }, networkIds: [] },
      { id: uuid(11), name: "External", metadata: { origin: "SYSTEM_DEFINED" }, networkIds: [] }]);
    else if (scenario === "policy-recovery" && url.pathname.endsWith("/firewall/policies")) result = page([
      policy(uuid(21)), policy(duplicateId), null, policy(duplicateId.toUpperCase()), policy(sentinel)]);
    else result = page([]);
    await browser.send("Fetch.fulfillRequest", { requestId, responseCode: scenario === "failure" ? 403 : 200,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify(scenario === "failure" ? { error: sentinel } : result)).toString("base64") }, incoming);
  })().catch(() => errors.push("interception-check-failed"));
});
async function evaluate(expression) {
  const result = await browser.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, session);
  if (result.exceptionDetails) throw new Error("Synthetic Chrome expression failed");
  return result.result.value;
}
async function waitFor(expression) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error("Synthetic Chrome state timed out");
}
async function openTool() {
  await evaluate(script);
  await waitFor("Boolean(document.querySelector('dialog[open] input[type=password]'))");
  assert.equal(await evaluate("document.activeElement.type"), "password");
  assert.equal(await evaluate("document.querySelector('input').autocomplete"), "off");
}
async function start() {
  await evaluate(`document.querySelector('input').value=${JSON.stringify(key)};document.querySelector('dialog button').click()`);
}
async function close() {
  await evaluate("document.querySelector('dialog button:last-of-type').click()");
  await waitFor("!document.querySelector('dialog')");
  assert.equal(await evaluate("document.querySelectorAll('input[type=password]').length"), 0);
}
try {
  await browser.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads, eventsEnabled: true });
  const target = await browser.send("Target.createTarget", { url: "about:blank" });
  session = (await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true })).sessionId;
  await browser.send("Page.enable", {}, session); await browser.send("Runtime.enable", {}, session);
  await browser.send("Fetch.enable", { patterns: [{ urlPattern: "http://*" }, { urlPattern: "https://*" }] }, session);
  await browser.send("Page.navigate", { url: `${origin}/network/default/integrations` }, session);
  await waitFor("document.title==='Synthetic local controller'");
  await evaluate("window.module={exports:{fixtureMarker:'page-owned'}};window.fixtureExports=window.module.exports");
  await openTool();
  assert.equal(await evaluate("window.module.exports===window.fixtureExports&&window.module.exports.fixtureMarker==='page-owned'"), true,
    "A page-owned module must not steal browser startup or be overwritten");
  assert.equal(calls.length, 0, "Opening the tool must not perform an API request");
  const screenshot = await browser.send("Page.captureScreenshot", { format: "png" }, session);
  writeFileSync(path.join(artifactDirectory, "export-dialog.png"), Buffer.from(screenshot.data, "base64"));
  await start();
  await waitFor("Boolean(document.querySelector('dialog select'))");
  assert.equal(await evaluate("document.querySelector('input').value"), "");
  assert.ok(!(await evaluate("document.querySelector('dialog').textContent")).includes(sentinel));
  await evaluate("document.querySelector('select').value='1';document.querySelector('dialog button:last-of-type').click()");
  await waitFor("document.querySelector('dialog p').textContent.startsWith('Export downloaded')");
  for (let n = 0; !completed.length && n < 100; n++) await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(completed.length, 1);
  const files = readdirSync(downloads); assert.equal(files.length, 1);
  assert.match(files[0], /^murmingle-unifi-audit-\d{4}-\d{2}-\d{2}\.json$/);
  const serialized = readFileSync(path.join(downloads, files[0]), "utf8"), output = JSON.parse(serialized);
  for (const value of [key, sentinel, uuid(1), uuid(2), "synthetic-cookie"]) assert.ok(!serialized.includes(value));
  assert.equal(output.collectionStatus, "COMPLETE"); assert.equal(output.auditStatus, "INCOMPLETE");
  assert.ok(calls.some(p => p.includes(`/sites/${uuid(2)}/networks`)));
  assert.equal(await evaluate("document.querySelector('input').value"), "");
  assert.equal(await evaluate("localStorage.length+sessionStorage.length"), 0);
  await close();

  await evaluate("Object.defineProperty(window,'module',{configurable:true,get(){throw new Error('SYNTHETIC_MODULE_GETTER_SECRET')}});void 0");
  await browser.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: partialDownloads, eventsEnabled: true });
  scenario = "policy-recovery"; const firstRecoveryCall = calls.length;
  await openTool(); await start();
  await waitFor("Boolean(document.querySelector('dialog select'))");
  await evaluate("document.querySelector('select').value='1';document.querySelector('dialog button:last-of-type').click()");
  await waitFor("document.querySelector('dialog p').textContent.startsWith('Partial export downloaded')");
  for (let n = 0; completed.length < 2 && n < 100; n++) await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(completed.length, 2);
  const partialFiles = readdirSync(partialDownloads); assert.equal(partialFiles.length, 1);
  const partialSerialized = readFileSync(path.join(partialDownloads, partialFiles[0]), "utf8");
  const partial = JSON.parse(partialSerialized);
  for (const value of [key, sentinel, duplicateId, duplicateId.toUpperCase(), uuid(10), uuid(11), uuid(21), "synthetic-cookie"]) {
    assert.ok(!partialSerialized.includes(value), "Raw credentials/names/identifiers must never enter a recovered download");
  }
  assert.equal(partial.collectionStatus, "PARTIAL"); assert.equal(partial.auditStatus, "INCOMPLETE");
  assert.equal(partial.coverage.policies.status, "PARTIAL");
  assert.equal(partial.coverage.policies.code, "policy-identity-invalid");
  assert.equal(partial.coverage.policies.recordCount, 4);
  assert.equal(partial.coverage.policies.diagnostics.rowsRead, 5);
  assert.equal(partial.coverage.policies.diagnostics.omittedNonObjectRows, 1);
  assert.equal(partial.coverage.policies.diagnostics.invalidIdFormatRows, 1);
  assert.equal(partial.coverage.policies.diagnostics.duplicateIdRows, 2);
  assert.ok(Object.values(partial.coverage.policies.diagnostics).every(Number.isSafeInteger));
  assert.deepEqual(partial.policies.map(p => p.auditRow), [1, 2, 4, 5]);
  assert.equal(partial.policies[0].identityStatus, "VALID_UUID");
  assert.equal(partial.policies[0].semanticStatus, "COMPLETE");
  for (const p of partial.policies.slice(1)) { assert.equal(p.id, "UNKNOWN"); assert.equal(p.semanticStatus, "INCOMPLETE"); }
  assert.equal(partial.coverage.ordering.code, "policy-inventory-unavailable");
  assert.deepEqual(partial.ordering, []);
  assert.ok(!calls.slice(firstRecoveryCall).some(p => p.endsWith("/ordering")), "Unverified policy identity must not authorize ordering reads");
  assert.equal(await evaluate("document.querySelector('input').value"), "");
  assert.equal(await evaluate("localStorage.length+sessionStorage.length"), 0); await close();
  await browser.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads, eventsEnabled: true });

  scenario = "failure"; await openTool(); await start();
  await waitFor("document.querySelector('dialog p').textContent.includes('api-access-denied')");
  assert.equal(await evaluate("document.querySelector('input').value"), "");
  assert.ok(!(await evaluate("document.querySelector('dialog').textContent")).includes(sentinel));
  assert.equal(readdirSync(downloads).length, 1); await close();

  scenario = "cancel"; await openTool(); await start();
  await waitFor("document.querySelector('input').disabled&&document.querySelector('input').value===''");
  await close(); assert.equal(readdirSync(downloads).length, 1);
  assert.equal(await evaluate("localStorage.length+sessionStorage.length"), 0);
  assert.deepEqual(errors, []);
  assert.equal(startupMessages.length, 4, "Each browser start must announce only the fixed content-free ready message");
  console.log(JSON.stringify({ result: "pass", requests: calls.length, runtimeErrors: 0,
    checks: ["partial-policy-download", "numeric-only-diagnostics", "duplicate-first-occurrence-taint", "no-unverified-ordering", "browser-module-collision", "throwing-module-getter", "content-free-startup", "no-startup-fetch", "strict-CSP", "masked-input", "multi-site", "GET-only", "no-cookies", "sanitized-download", "no-storage", "error-cleanup", "cancel-cleanup"],
    screenshot: path.join(artifactDirectory, "export-dialog.png") }));
} finally {
  await browser.close();
  const absolute = path.resolve(profile), taskParent = path.resolve(os.tmpdir()) + path.sep;
  if (!absolute.startsWith(taskParent) || !path.basename(absolute).startsWith("murmingle-unifi-audit-qa-")) throw new Error("Refuse unexpected QA cleanup target");
  rmSync(absolute, { recursive: true, force: true }); // Only this run's verified generated profile and synthetic download.
}
