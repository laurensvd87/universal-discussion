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
    // Generated, ignored, pinned assets have dedicated integrity/package tests.
    if (entry.name === ".assets") continue;
    if (entry.isDirectory()) files.push(...(await listFiles(entryPath)));
    if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function relativeBrowserPath(file) {
  return path.relative(browserDirectory, file).replaceAll("\\", "/");
}

test("unpacked extension inventory and approved loopback-only manifest are exact", async () => {
  const files = (await listFiles(browserDirectory))
    .map(relativeBrowserPath)
    .sort();
  assert.deepEqual(files, [
    "README.md",
    "chromium/active-tab-reader.js",
    "chromium/background.js",
    "chromium/discussion-panel.js",
    "chromium/icons/conversation.svg",
    "chromium/icons/lock.svg",
    "chromium/icons/pages.svg",
    "chromium/icons/person.svg",
    "chromium/icons/robot.svg",
    "chromium/icons/settings.svg",
    "chromium/icons/spark.svg",
    "chromium/inference-host.js",
    "chromium/insight-page-reader.js",
    "chromium/insight-panel.js",
    "chromium/page-content-reader.js",
    "chromium/page-matching-panel.js",
    "chromium/page-metadata-reader.js",
    "chromium/popup-focus.js",
    "chromium/popup-shell.js",
    "chromium/popup.css",
    "chromium/popup.html",
    "chromium/popup.js",
    "chromium/related-pages-panel.js",
    "chromium/topic-toolbar-icon.js",
    "chromium/ui-mode.js",
    "core/active-tab-controller.js",
    "core/active-tab-policy.js",
    "core/background-matcher.js",
    "core/capture-session.js",
    "core/indicator-contract.js",
    "core/indicator-controller.js",
    "core/insight-citations.js",
    "core/insight-context.js",
    "core/insight-controller.js",
    "core/local-ai-client.js",
    "core/local-discussion-controller.js",
    "core/local-service-client.js",
    "core/local-service-contract.js",
    "core/local-service-session.js",
    "core/page-content-policy.js",
    "core/page-metadata-controller.js",
    "core/page-resolution-contract.js",
    "core/page-signal-contract.js",
    "core/page-signal-policy.js",
    "core/read-only-service-retry.js",
    "core/related-page-excerpts.js",
    "core/related-sources.js",
    "core/topic-toolbar-controller.js",
    "embedding/.gitignore",
    "embedding/THIRD_PARTY.md",
    "embedding/e5-browser.js",
    "embedding/embedding-contract.js",
    "embedding/inference-worker.js",
    "embedding/offscreen.html",
    "embedding/offscreen.js",
    "embedding/smoke.html",
    "embedding/smoke.js",
    "fixtures/indicator-fixtures.js",
    "fixtures/local-service-fixture-bridge.js",
    "fixtures/related-source-fixtures.js",
    "locales/en.js",
    "locales/insight-en.js",
    "manifest.json",
  ]);

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(manifest, {
    manifest_version: 3,
    name: "Universal Discussion - Local PoC",
    version: "0.13.6",
    description: "Opt-in on-device page matching and shared local Topic discussions.",
    minimum_chrome_version: "116",
    incognito: "not_allowed",
    permissions: ["activeTab", "scripting", "storage", "offscreen"],
    host_permissions: ["http://127.0.0.1/*"],
    optional_host_permissions: ["https://*/*"],
    background: { service_worker: "chromium/background.js", type: "module" },
    action: {
      default_popup: "chromium/popup.html",
      default_title: "Check local discussion state",
    },
    content_security_policy: {
      extension_pages: "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; connect-src 'self' http://127.0.0.1:4174 https:; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';",
    },
  });
  for (const forbiddenKey of [
    "optional_permissions",
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
  const runtimeFiles = (await listFiles(browserDirectory)).filter(file => file.endsWith(".js"));
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
  const documentReferences = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(documentReferences.filter(value => value.startsWith("#")), []);
  const documentResources = documentReferences.filter(value => !value.startsWith("#"));
  assert.deepEqual(documentResources.sort(), ["popup.css", "popup.js"]);
  for (const resource of documentResources) {
    const resolved = path.resolve(path.dirname(popupHtmlPath), resource);
    assert.ok(resolved.startsWith(rootPrefix), `${resource} escapes the extension root`);
    assert.ok(packagedFiles.has(resolved), `${resource} is absent from the package`);
  }
});

test("browser runtime has only audited tab, scripting, session and loopback adapter bindings", async () => {
  const runtimeFiles = (await listFiles(browserDirectory))
    .filter((file) => file.endsWith(".js"));
  const capabilityPattern = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|caches|cookieStore)\b/u;
  const extensionApiPattern = /\b(?:chrome|browser)\s*\./u;
  const unsafeCodePattern = /\b(?:eval|Function|require)\s*\(|\bimport\s*\(/u;
  const unsafeHtmlPattern = /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/u;

  for (const runtimeFile of runtimeFiles) {
    const source = await readFile(runtimeFile, "utf8");
    const label = relativeBrowserPath(runtimeFile);
    const approvedBindings = label === "chromium/background.js" ? ["globalThis.chrome", "globalThis.fetch"] :
      label === "embedding/offscreen.js" ? ["globalThis.chrome.runtime"] :
      label === "chromium/popup.js" ? ["globalThis.chrome.tabs", "globalThis.chrome.scripting",
        "globalThis.fetch", "globalThis.chrome.runtime", "globalThis.chrome.permissions", "globalThis.chrome.windows", "globalThis.chrome.storage.local"] : [];
    for (const approvedBinding of approvedBindings) {
      const bindingCount = source.split(approvedBinding).length - 1;
      assert.equal(
        bindingCount,
        1,
        `${label} ${approvedBinding} binding`,
      );
    }
    const sourceWithoutApprovedBinding = approvedBindings.reduce(
      (value, binding) => value.replace(binding, "approvedExtensionApi"),
      source,
    );
    // Comments can describe the injected capability; only the exact binding
    // above is permitted in executable code. Readers/controllers stay no-I/O.
    const executableSource = sourceWithoutApprovedBinding.replace(/^\s*\/\/.*$/gmu, "");
    if (label !== "embedding/e5-browser.js") assert.doesNotMatch(executableSource, capabilityPattern, label);
    else {
      assert.match(source, /assetBase\.protocol !== 'chrome-extension:'/u);
      assert.match(source, /redirect: 'error', credentials: 'omit'/u);
      assert.doesNotMatch(source, /https?:\/\//u);
    }
    assert.doesNotMatch(executableSource.replaceAll('"./e5-browser.js"', '"packaged-module"').replaceAll("'./e5-browser.js'", "'packaged-module'"), extensionApiPattern, label);
    if (label !== "embedding/e5-browser.js") assert.doesNotMatch(source, unsafeCodePattern, label);
    else {
      assert.doesNotMatch(source, /\b(?:eval|Function|require)\s*\(/u);
      assert.deepEqual([...source.matchAll(/\bimport\('([^']+)'\)/gu)].map(match => match[1]),
        ["./.assets/tokenizers.mjs", "./.assets/ort.wasm.min.mjs"]);
    }
    assert.doesNotMatch(source, unsafeHtmlPattern, label);
    assert.doesNotMatch(source, /\bconsole\s*\./u, label);
    assert.doesNotMatch(source, /\bprocess\s*\.|node:/u, label);
    assert.doesNotMatch(source, /\btabs(?:Api)?\.get\s*\(/u, label);
  }

  const readerSource = await readFile(
    path.join(browserDirectory, "chromium", "active-tab-reader.js"),
    "utf8",
  );
  assert.doesNotMatch(
    readerSource,
    /\btab\.(?:active|incognito|pendingUrl|title|windowId)\b|\.\.\.tab\b/u,
  );
  assert.match(readerSource, /tabsApi\.query\(ACTIVE_CURRENT_TAB_QUERY\)/u);

  const metadataReaderSource = await readFile(
    path.join(browserDirectory, "chromium", "page-metadata-reader.js"),
    "utf8",
  );
  assert.match(metadataReaderSource, /target: \{ frameIds: \[0\], tabId \}/u);
  assert.match(metadataReaderSource, /target: \{ documentIds: \[documentId\], tabId \}/u);
  assert.match(metadataReaderSource, /world: "ISOLATED"/u);
  assert.doesNotMatch(metadataReaderSource, /allFrames|world:\s*"MAIN"|\bfiles:/u);
  assert.doesNotMatch(
    metadataReaderSource,
    /document\.(?:body|cookie|forms|images|referrer|scripts)|querySelector|localStorage|sessionStorage/u,
  );

  for (const metadataModule of [
    path.join(browserDirectory, "chromium", "page-metadata-reader.js"),
    path.join(browserDirectory, "core", "page-metadata-controller.js"),
    path.join(browserDirectory, "core", "page-signal-contract.js"),
    path.join(browserDirectory, "core", "page-signal-policy.js"),
  ]) {
    const source = await readFile(metadataModule, "utf8");
    assert.doesNotMatch(
      source,
      /(?:\.\.\/)+(?:(?:src|evaluation|extraction|review)\/)|\b(?:createTopicResolver|RESOLUTION_METHOD|contentFingerprint)\b/u,
      relativeBrowserPath(metadataModule),
    );
  }

  const popupScript = await readFile(popupScriptPath, "utf8");
  assert.match(popupScript, /createLocalServiceSessionProxy\(\{ sendMessage: \(message\) => runtime\.sendMessage\(message\) \}\)/u);
  assert.match(popupScript, /const localTransport = globalThis\.fetch\.bind\(globalThis\);/u);
  assert.match(popupScript, /createLocalServiceClient\(\{ fetchImpl: localTransport, getToken: localSession\.getToken,/u);
  assert.match(popupScript, /createLocalAiClient\(\{ fetchImpl: localTransport, getToken: localSession\.getToken,/u);
  assert.match(popupScript, /void localDiscussion\.open\(\);/u);
  for (const boundary of ["active-tab-reader.js", "page-metadata-reader.js"]) {
    assert.doesNotMatch(await readFile(path.join(browserDirectory, "chromium", boundary), "utf8"), /local-service|storageSession|fetchImpl/u);
  }
  assert.match(popupScript, /elements\.sourceTitle\.textContent = state\.source\.title;/u);
  assert.match(popupScript, /elements\.sourceUrl\.textContent = state\.source\.url;/u);
  assert.match(popupScript, /elements\.metadataTitle\.textContent = envelope\.title;/u);
  assert.match(
    popupScript,
    /elements\.metadataDescription\.textContent =\s*\n\s*envelope\.description/u,
  );
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
  const withoutApprovedUrls = html
    .replaceAll("https://example.com/", "")
    .replaceAll("https://example.org/", "")
    .replaceAll("http://127.0.0.1:4173/p1-5c.html", "");
  assert.doesNotMatch(withoutApprovedUrls, /\b(?:https?:)?\/\//iu);
  const cssWithoutPackagedIconMasks = css.replaceAll(
    /url\("icons\/(?:conversation|pages|spark|settings|person|robot|lock)\.svg"\)/gu, "");
  assert.doesNotMatch(cssWithoutPackagedIconMasks, /@import\b|url\s*\(/iu);
  for (const name of ["conversation", "pages", "spark", "settings", "person", "robot", "lock"]) {
    const svg = await readFile(path.join(browserDirectory, "chromium", "icons", `${name}.svg`), "utf8");
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24" fill="none">\s*(?:(?:<path|<circle) [^>]+\/>\s*)+<\/svg>\s*$/u);
    assert.doesNotMatch(svg, /<script|<foreignObject|<image|href\s*=|url\s*\(|@import|https?:\/\/(?!www\.w3\.org\/2000\/svg)/iu);
  }

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
  assert.match(html, /id="current-tab-button"/u);
  assert.match(html, /id="metadata-button"/u);
  assert.match(html, /id="related-pages-demo"/u);
  assert.match(script, /mountRelatedPagesDemo\(/u);
  assert.match(script, /relatedPagesDemo\.dispose\(\);/u);
  assert.match(html, /Do not invoke this proof of concept on a signed-in or sensitive page\./u);
  assert.match(html, /this prototype does not inspect\s*\n\s*login or paywall state\./u);
  assert.match(
    html,
    /<dd>\s*<span id="metadata-published-at"><\/span>\s*<span class="field-note">/u,
  );

  const clearIndex = script.indexOf(
    "for (const element of resolvedTextElements) element.textContent = \"\";",
  );
  const earlyReturnIndex = script.indexOf(
    'if (state.outcome !== "resolved") return;',
  );
  assert.ok(clearIndex >= 0 && clearIndex < earlyReturnIndex);
  const metadataClearIndex = script.indexOf(
    "for (const element of metadataTextElements) element.textContent = \"\";",
  );
  const metadataEarlyReturnIndex = script.indexOf(
    'if (state.outcome !== "resolved") return;',
    earlyReturnIndex + 1,
  );
  assert.ok(
    metadataClearIndex >= 0 && metadataClearIndex < metadataEarlyReturnIndex,
  );
  assert.match(
    script,
    /activeTabController\.reset\(\);\s*\n\s*pageMetadataController\.reset\(\);\s*\n\s*await fixtureController\.activate/u,
  );
  assert.match(
    script,
    /fixtureController\.reset\(\);\s*\n\s*pageMetadataController\.reset\(\);\s*\n\s*elements\.currentTabButton\.disabled/u,
  );
  assert.match(
    script,
    /activeTabController\.reset\(\);\s*\n\s*fixtureController\.reset\(\);\s*\n\s*elements\.metadataButton\.disabled/u,
  );
  assert.match(script, /pageMetadataController\.reset\(\);/u);
  assert.match(script, /observeTabLifecycle: tabLifecycleObserver\.observe/u);
  assert.match(
    script,
    /globalThis\.addEventListener\("pagehide", \(\) => \{\s*serviceRetry\.dispose\(\);\s*insightController\.dispose\(\);\s*insightPanel\.dispose\(\);\s*matchingPanel\.dispose\(\);\s*localDiscussion\.dispose\(\);\s*discussionPanel\.dispose\(\);\s*popupShell\.dispose\(\);\s*pageMetadataController\.dispose\(\);/u,
  );
});
