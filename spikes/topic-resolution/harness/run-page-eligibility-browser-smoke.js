import assert from 'node:assert/strict';
import { lstat, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EN } from '../browser/locales/en.js';
import { launchChromiumPipe } from './chromium-pipe.js';

const BROWSER_ROOT = fileURLToPath(new URL('../browser/', import.meta.url));
const DEFAULT_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ORIGIN = 'https://example.com';
const ARTICLE = `${ORIGIN}/owned-article`;
const HTML = '<!doctype html><html><head><meta charset="utf-8"><title>Owned eligibility article</title></head><body><main><p>Owned synthetic article for the permission gate.</p></main></body></html>';
const FILTER = ['page', 'iframe', 'other', 'worker', 'service_worker', 'shared_worker']
  .map(type => ({ type, exclude: false })).concat({ exclude: true });
const CHILD_FILTER = FILTER.filter(item => item.type !== 'service_worker');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Run only on an explicit browser-smoke command. The page is fulfilled locally;
// every other non-extension request is failed before the browser can fetch it.
export async function runPageEligibilityBrowserSmoke(executable = DEFAULT_CHROME) {
  if (!path.isAbsolute(executable) || !(await lstat(executable)).isFile()) throw new Error('Installed absolute Chrome executable required');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'udl-eligibility-smoke-'));
  const targets = new Map(), tasks = new Set(), errors = [], inferenceTargets = new Set();
  let browser, extensionId, pageSession, popupTarget, popupSession, deadline;
  let interceptedDocuments = 0, ownedFaviconRequests = 0, blockedRequests = 0, runtimeExceptions = 0, embeddingRequests = 0;
  const blockedClasses = { extensionInitiated: 0, ownedPageFavicon: 0, other: 0 };
  const blockedOtherKinds = [];
  let stage = 'startup';
  let closing = false;
  let resolveIdentity;
  const identityReady = new Promise(resolve => { resolveIdentity = resolve; });
  const started = performance.now();
  const stop = () => { void browser?.close(); };
  function selfUrl(value) {
    try { const url = new URL(value); return url.protocol === 'chrome-extension:' && url.host === extensionId; }
    catch { return false; }
  }
  function schedule(work) {
    const task = Promise.resolve().then(work).catch(() => { if (!closing) errors.push('Target or interception setup failed'); });
    tasks.add(task); task.finally(() => tasks.delete(task));
  }
  async function wait(check, label, timeout = 15000) {
    const began = performance.now();
    while (performance.now() - began < timeout) {
      if (errors.length) throw new Error(errors[0]);
      const result = await check(); if (result) return result;
      await sleep(50);
    }
    throw new Error(`Eligibility smoke timeout: ${label}`);
  }
  async function evaluate(expression, sessionId = popupSession) {
    const result = await browser.send('Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error('Eligibility browser evaluation failed');
    return result.result.value;
  }
  async function status() {
    return evaluate(`(async () => {
      const result = await chrome.runtime.sendMessage({ target: 'page-matching', type: 'status' });
      return { enabled: result?.enabled, origins: result?.origins,
        currentOrigin: result?.currentOrigin, currentUrl: result?.currentUrl,
        contextReason: result?.contextReason };
    })()`);
  }
  async function controls() {
    return evaluate(`(() => {
      const ids = ['matching-enable', 'matching-pause', 'matching-resume', 'matching-retry'];
      const buttons = Object.fromEntries(ids.map(id => [id, document.getElementById(id)?.disabled]));
      return { ...buttons, origin: document.getElementById('matching-origin')?.textContent,
        context: document.getElementById('matching-context')?.textContent,
        enableCursor: getComputedStyle(document.getElementById('matching-enable')).cursor,
        consent: document.getElementById('matching-consent')?.checked };
    })()`);
  }
  async function openPopup() {
    await browser.send('Page.bringToFront', {}, pageSession);
    const url = await evaluate('location.href', pageSession);
    const available = await browser.send('Target.getTargets', { filter: [{ type: 'tab', exclude: false }, { exclude: true }] });
    const tab = available.targetInfos.find(item => item.type === 'tab' && item.url === url);
    assert.ok(tab, 'Actual tab target required');
    await browser.send('Extensions.triggerAction', { id: extensionId, targetId: tab.targetId });
    const popup = await wait(() => [...targets.values()].find(item => item.ready &&
      item.url === `chrome-extension://${extensionId}/chromium/popup.html`), 'actual action popup');
    popupTarget = popup.targetId; popupSession = popup.sessionId;
    await wait(() => evaluate("document.getElementById('matching-enable')?.disabled !== undefined"), 'matching controls');
  }
  async function closePopup() {
    if (!popupTarget) return;
    const targetId = popupTarget; popupTarget = null; popupSession = null;
    await browser.send('Target.closeTarget', { targetId }); targets.delete(targetId);
  }
  try {
    browser = launchChromiumPipe({ executable, profileDirectory: path.join(directory, 'profile') });
    deadline = setTimeout(stop, 60000);
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    function recordInferenceTarget(targetInfo) {
      if (targetInfo.type === 'worker' || targetInfo.url === `chrome-extension://${extensionId}/embedding/offscreen.html`)
        inferenceTargets.add(targetInfo.targetId);
    }
    browser.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
      const target = { ...targetInfo, sessionId, ready: false }; targets.set(targetInfo.targetId, target);
      recordInferenceTarget(targetInfo);
      schedule(async () => {
        await browser.send('Runtime.enable', {}, sessionId);
        await browser.send('Network.enable', {}, sessionId);
        if (['worker', 'shared_worker'].includes(targetInfo.type)) {
          await browser.send('Network.setBlockedURLs',
            { urls: ['http://*', 'https://*', 'ws://*', 'wss://*', 'ftp://*', 'file://*'] }, sessionId);
        }
        try { await browser.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId); }
        catch (error) {
          if (!['worker', 'shared_worker'].includes(targetInfo.type) || !error.message.includes('Fetch.enable (code -32601)')) throw error;
        }
        await browser.send('Target.setAutoAttach',
          { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: CHILD_FILTER }, sessionId);
        await browser.send('Runtime.runIfWaitingForDebugger', {}, sessionId); target.ready = true;
      });
    });
    browser.on('Target.targetInfoChanged', ({ targetInfo }) => {
      const target = targets.get(targetInfo.targetId); if (target) Object.assign(target, targetInfo);
      recordInferenceTarget(targetInfo);
    });
    browser.on('Target.detachedFromTarget', ({ sessionId }) => {
      for (const [id, target] of targets) if (target.sessionId === sessionId) targets.delete(id);
    });
    browser.on('Runtime.exceptionThrown', (_, sessionId) => {
      const target = [...targets.values()].find(item => item.sessionId === sessionId);
      if (selfUrl(target?.url)) runtimeExceptions++;
    });
    browser.on('Network.requestWillBeSent', ({ request }) => {
      if (selfUrl(request.url) && new URL(request.url).pathname.startsWith('/embedding/.assets/')) embeddingRequests++;
    });
    browser.on('Fetch.requestPaused', ({ requestId, request, resourceType }, sessionId) => schedule(async () => {
      await identityReady;
      if (selfUrl(request.url)) await browser.send('Fetch.continueRequest', { requestId }, sessionId);
      else if (resourceType === 'Document' && request.url === ARTICLE) {
        interceptedDocuments++;
        await browser.send('Fetch.fulfillRequest', { requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
          body: Buffer.from(HTML).toString('base64') }, sessionId);
      } else {
        const source = [...targets.values()].find(item => item.sessionId === sessionId);
        if (source?.url === ARTICLE && request.url === `${ORIGIN}/favicon.ico`) {
          ownedFaviconRequests++;
          await browser.send('Fetch.fulfillRequest', { requestId, responseCode: 204 }, sessionId);
          return;
        }
        blockedRequests++;
        if (selfUrl(source?.url)) blockedClasses.extensionInitiated++;
        else if (request.url === `${ORIGIN}/favicon.ico`) blockedClasses.ownedPageFavicon++;
        else {
          blockedClasses.other++;
          if (blockedOtherKinds.length < 3) {
            let protocol = 'invalid', ownedOrigin = false;
            try { const parsed = new URL(request.url); protocol = parsed.protocol; ownedOrigin = parsed.origin === ORIGIN; } catch { /* bounded category only */ }
            blockedOtherKinds.push({ type: resourceType, protocol, ownedOrigin });
          }
        }
        await browser.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, sessionId);
      }
    }));
    stage = 'extension load';
    const version = await browser.send('Browser.getVersion');
    await browser.send('Target.setDiscoverTargets', { discover: true });
    await browser.send('Target.setAutoAttach',
      { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: FILTER });
    extensionId = (await browser.send('Extensions.loadUnpacked', { path: BROWSER_ROOT })).id;
    resolveIdentity(); assert.match(extensionId, /^[a-p]{32}$/u);
    const page = await wait(() => [...targets.values()].find(item => item.ready &&
      item.type === 'page' && item.url === 'about:blank'), 'initial blank page');
    pageSession = page.sessionId;
    stage = 'blank page eligibility';
    await openPopup();
    const blank = await wait(async () => {
      const value = await status(); return ['unsupported-url', 'url-unavailable'].includes(value.contextReason) ? value : false;
    }, 'blank page rejection');
    assert.equal((await status()).currentOrigin, null);
    const expectedContext = blank.contextReason === 'unsupported-url' ? EN.matchingContextUnsupportedUrl : EN.matchingContextUrlUnavailable;
    stage = 'blank page diagnostic and disabled affordance';
    const blankControls = await wait(async () => {
      const value = await controls(); return value.context === expectedContext ? value : false;
    }, 'visible blank page diagnostic');
    assert.equal(blankControls['matching-enable'], true);
    assert.equal(blankControls.enableCursor, 'not-allowed');
    await closePopup();
    stage = 'owned HTTPS navigation';
    await browser.send('Page.navigate', { url: ARTICLE }, pageSession);
    await wait(() => evaluate(`location.href === ${JSON.stringify(ARTICLE)} && document.readyState === 'complete'`, pageSession),
      'owned HTTPS document');
    stage = 'HTTPS popup eligibility';
    await openPopup();
    await wait(async () => (await status()).currentOrigin === ORIGIN, 'HTTPS origin eligibility');
    const before = await status();
    assert.equal(before.currentUrl, ARTICLE);
    assert.equal(before.enabled, false);
    assert.deepEqual(before.origins, []);
    const worker = await wait(() => [...targets.values()].find(item => item.ready && item.type === 'service_worker' &&
      item.url === `chrome-extension://${extensionId}/chromium/background.js`), 'real background worker');
    assert.equal(await evaluate(`chrome.permissions.contains({ origins: [${JSON.stringify(`${ORIGIN}/*`)}] })`, worker.sessionId), false);
    const initial = await wait(async () => {
      const value = await controls();
      return value.origin === ORIGIN && value['matching-enable'] === true ? value : false;
    }, 'popup disclosed origin and disabled Enable');
    assert.equal(initial.consent, false);
    assert.equal(initial.enableCursor, 'not-allowed');
    assert.equal(initial['matching-pause'], true);
    assert.equal(initial['matching-resume'], true);
    assert.equal(initial['matching-retry'], true);
    stage = 'consent control state';
    await evaluate(`(() => { const input = document.getElementById('matching-consent');
      input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    const consented = await wait(async () => {
      const value = await controls(); return value['matching-enable'] === false ? value : false;
    }, 'consent enables eligible action');
    stage = 'consented origin and controls';
    assert.equal(consented.origin, ORIGIN);
    assert.equal(consented['matching-pause'], true);
    assert.equal(consented['matching-resume'], true);
    assert.equal(consented['matching-retry'], true);
    stage = 'permission remains absent';
    assert.equal(await evaluate(`chrome.permissions.contains({ origins: [${JSON.stringify(`${ORIGIN}/*`)}] })`, worker.sessionId), false);
    stage = 'preferences remain absent';
    assert.equal(await evaluate("chrome.storage.local.get('pageMatchingPreferences').then(v => v.pageMatchingPreferences ?? null)", worker.sessionId), null);
    stage = 'runtime exceptions';
    assert.equal(runtimeExceptions, 0);
    stage = 'offscreen and inference worker targets';
    assert.equal(inferenceTargets.size, 0, 'Pre-grant context must not start packaged inference');
    stage = 'model asset requests';
    assert.equal(embeddingRequests, 0, 'Pre-grant context must not request packaged model assets');
    stage = 'owned document count';
    assert.equal(interceptedDocuments, 1);
    stage = 'external request attempts';
    assert.equal(blockedRequests, 0, 'No network request outside packaged extension and owned fixture');
    return { result: 'PASS', browser: version.product, checks: ['blank-page-ineligible', 'owned-https-origin-eligible',
      'optional-host-permission-ungranted', 'default-off-and-no-consent-disabled', 'consent-enables-action-only',
      'pause-resume-retry-disabled', 'no-pre-grant-storage-or-network'], interceptedDocuments,
      ownedFaviconRequests, blockedRequests, runtimeExceptions, inferenceTargets: inferenceTargets.size, embeddingRequests,
      elapsedMs: performance.now() - started,
      scope: 'Fresh temporary profile, owned intercepted HTTPS article; no grant, capture, inference, backend, or real webpage fetch' };
  } catch {
    // Do not print CDP expressions, page URLs, protocol payloads or popup data.
    const detail = stage === 'external request attempts' ? ` (${JSON.stringify({ blockedClasses, blockedOtherKinds })})` : '';
    throw new Error(`Eligibility browser smoke failed during ${stage}${detail}`);
  } finally {
    closing = true; resolveIdentity(); clearTimeout(deadline);
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    try { await browser?.close(); } finally {
      await Promise.allSettled([...tasks]);
      assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(directory).startsWith('udl-eligibility-smoke-'));
      await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPageEligibilityBrowserSmoke(process.argv[2]).then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
