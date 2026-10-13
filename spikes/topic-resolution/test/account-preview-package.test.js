import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const browserRoot = new URL("../browser/", import.meta.url);
const read = name => readFile(new URL(name, browserRoot), "utf8");

test("synthetic account preview stays isolated from the activated normal account panel", async () => {
  const preview = await read("fixtures/accounts-preview.js");
  assert.match(preview, /window\.accountFixtureTransport \?\? mock/);
  assert.match(preview, /getPairingToken:\(\)=>"synthetic-account-pairing-capability-only"/);
  assert.match(preview, /body\.code !== "123456"/);
  assert.match(preview, /automaticPost|no message was posted/);
  const executable = preview.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(executable, /\b(?:fetch|WebSocket|XMLHttpRequest|EventSource)\s*\(/);
  assert.doesNotMatch(executable, /chrome\.|localStorage|sessionStorage|indexedDB|console\.|innerHTML|eval\(/);
  assert.doesNotMatch(preview, /auth\.openai|chatgpt\.com|\/v1\/commands|\/v1\/insights/);
  const popup = await read("chromium/popup.js");
  assert.match(popup, /import \{ mountAccountPanel \} from "\.\/account-panel\.js"/);
  assert.match(popup, /createAccountSessionStorage\(\{ storageSession/);
  assert.match(popup, /async function getAccountToken\(actorId\)/);
  assert.match(popup, /controller\.withAppSession/);
  assert.doesNotMatch(popup, /accounts-preview|synthetic-account-pairing-capability-only|123456/);
  assert.doesNotMatch(await read("chromium/background.js"), /account-(?:client|controller|sheet)|accounts-preview/);
  for (const filename of ["chromium/sidepanel.html", "chromium/popup.html"]) {
    assert.match(await read(filename), /account-sheet\.css/);
    assert.doesNotMatch(await read(filename), /accounts-preview/);
  }
  const manifest = JSON.parse(await read("manifest.json"));
  assert.equal(manifest.version, "0.13.62");
  assert.doesNotMatch(JSON.stringify(manifest), /account-(?:client|controller|sheet)|accounts-preview/);
});

test("account screen uses module binding, safe text, language pack and accessible responsive controls", async () => {
  const html = await read("fixtures/accounts-preview.html");
  assert.match(html, /type="module" src="accounts-preview\.js"/);
  assert.doesNotMatch(html, /https?:\/\/|\son(?:click|load|submit)=/);
  const sheet = await read("chromium/account-sheet.js");
  assert.match(sheet, /import \{ accountEnglish \}/);
  assert.doesNotMatch(sheet, /innerHTML|outerHTML|insertAdjacentHTML|\bfetch\s*\(/);
  assert.match(sheet, /"aria-modal", "true"/);
  assert.match(sheet, /sibling\.inert = true/);
  assert.match(sheet, /sibling\.inert = inert/);
  const css = await read("chromium/account-sheet.css");
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /max-width: 340px/);
  assert.match(css, /:focus-visible/);
});
