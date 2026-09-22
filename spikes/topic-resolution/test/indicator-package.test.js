import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserDirectory = path.join(packageDirectory, "browser");
const manifestPath = path.join(browserDirectory, "manifest.json");
const popupHtmlPath = path.join(browserDirectory, "chromium", "popup.html");
const popupScriptPath = path.join(browserDirectory, "chromium", "popup.js");
const popupStylePath = path.join(browserDirectory, "chromium", "popup.css");

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(entryPath)));
    if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function relativeBrowserPath(file) {
  return path.relative(browserDirectory, file).replaceAll("\\", "/");
}

test("unpacked extension inventory and zero-permission manifest are exact", async () => {
  const files = (await listFiles(browserDirectory))
    .map(relativeBrowserPath)
    .sort();
  assert.deepEqual(files, [
    "README.md",
    "chromium/popup.css",
    "chromium/popup.html",
    "chromium/popup.js",
    "core/indicator-contract.js",
    "core/indicator-controller.js",
    "fixtures/indicator-fixtures.js",
    "manifest.json",
  ]);

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(manifest, {
    manifest_version: 3,
    name: "Universal Discussion - Local PoC",
    version: "0.1.0",
    description: "Zero-permission bundled-fixture preview of a read-only discussion indicator.",
    incognito: "not_allowed",
    action: {
      default_popup: "chromium/popup.html",
      default_title: "Open bundled discussion fixture",
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none';",
    },
  });
  for (const forbiddenKey of [
    "permissions",
    "optional_permissions",
    "host_permissions",
    "optional_host_permissions",
    "background",
    "content_scripts",
    "web_accessible_resources",
    "externally_connectable",
  ]) {
    assert.equal(manifest[forbiddenKey], undefined, forbiddenKey);
  }

  const popupPath = path.resolve(browserDirectory, manifest.action.default_popup);
  assert.equal(popupPath, popupHtmlPath);
  assert.equal((await stat(popupPath)).isFile(), true);
});

test("every runtime import and document resource remains inside the unpacked root", async () => {
  const runtimeFiles = [
    path.join(browserDirectory, "core", "indicator-contract.js"),
    path.join(browserDirectory, "core", "indicator-controller.js"),
    path.join(browserDirectory, "fixtures", "indicator-fixtures.js"),
    popupScriptPath,
  ];
  const packagedFiles = new Set((await listFiles(browserDirectory)).map((file) => path.resolve(file)));
  const rootPrefix = `${path.resolve(browserDirectory)}${path.sep}`;

  for (const runtimeFile of runtimeFiles) {
    const source = await readFile(runtimeFile, "utf8");
    const imports = [
      ...source.matchAll(/\bfrom\s+["']([^"']+)["']/g),
      ...source.matchAll(/\bimport\s+["']([^"']+)["']/g),
    ].map((match) => match[1]);
    for (const importedModule of imports) {
      assert.match(importedModule, /^\.\.?\/.+\.js$/u, importedModule);
      const resolved = path.resolve(path.dirname(runtimeFile), importedModule);
      assert.ok(resolved.startsWith(rootPrefix), `${importedModule} escapes the extension root`);
      assert.ok(packagedFiles.has(resolved), `${importedModule} is absent from the package`);
    }
  }

  const html = await readFile(popupHtmlPath, "utf8");
  const documentResources = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(documentResources.sort(), ["popup.css", "popup.js"]);
  for (const resource of documentResources) {
    const resolved = path.resolve(path.dirname(popupHtmlPath), resource);
    assert.ok(resolved.startsWith(rootPrefix), `${resource} escapes the extension root`);
    assert.ok(packagedFiles.has(resolved), `${resource} is absent from the package`);
  }
});

test("browser runtime has no page, network, storage, logging, or dynamic-code capability", async () => {
  const runtimeFiles = (await listFiles(browserDirectory))
    .filter((file) => file.endsWith(".js"));
  const capabilityPattern = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|caches|cookieStore)\b/u;
  const extensionApiPattern = /\b(?:chrome|browser)\s*\./u;
  const unsafeCodePattern = /\b(?:eval|Function|require)\s*\(|\bimport\s*\(/u;
  const unsafeHtmlPattern = /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/u;

  for (const runtimeFile of runtimeFiles) {
    const source = await readFile(runtimeFile, "utf8");
    const label = relativeBrowserPath(runtimeFile);
    assert.doesNotMatch(source, capabilityPattern, label);
    assert.doesNotMatch(source, extensionApiPattern, label);
    assert.doesNotMatch(source, unsafeCodePattern, label);
    assert.doesNotMatch(source, unsafeHtmlPattern, label);
    assert.doesNotMatch(source, /\bconsole\s*\./u, label);
    assert.doesNotMatch(source, /\bprocess\s*\.|node:/u, label);
  }

  const popupScript = await readFile(popupScriptPath, "utf8");
  assert.match(popupScript, /elements\.sourceTitle\.textContent = state\.source\.title;/u);
  assert.match(popupScript, /elements\.sourceUrl\.textContent = state\.source\.url;/u);
});

test("popup contains only local external assets and basic accessible bindings", async () => {
  const html = await readFile(popupHtmlPath, "utf8");
  const css = await readFile(popupStylePath, "utf8");
  const script = await readFile(popupScriptPath, "utf8");

  assert.match(html, /<script type="module" src="popup\.js"><\/script>/u);
  assert.match(html, /<link rel="stylesheet" href="popup\.css">/u);
  const withoutExpectedScript = html.replace(
    '<script type="module" src="popup.js"></script>',
    "",
  );
  assert.doesNotMatch(withoutExpectedScript, /<script\b/iu);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/iu);
  assert.doesNotMatch(html, /\b(?:https?:)?\/\//iu);
  assert.doesNotMatch(css, /@import\b|url\s*\(/iu);

  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "popup IDs must be unique");
  for (const match of script.matchAll(/querySelector\("#([^"]+)"\)/g)) {
    assert.ok(ids.includes(match[1]), `missing DOM node #${match[1]}`);
  }
  for (const match of html.matchAll(/\b(?:for|aria-labelledby)="([^"]+)"/g)) {
    assert.ok(ids.includes(match[1]), `missing labelled DOM node #${match[1]}`);
  }
  assert.match(html, /aria-live="polite"/u);
  assert.match(html, /<label for="scenario">/u);
});
