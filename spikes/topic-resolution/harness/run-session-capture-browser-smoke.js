import assert from 'node:assert/strict';
import { lstat, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromiumPipe } from './chromium-pipe.js';
import { prepareSessionPermission } from './prepare-session-permission.js';
import { EN } from '../browser/locales/en.js';

const BROWSER_ROOT = fileURLToPath(new URL('../browser/', import.meta.url));
const DEFAULT_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTICLES = ['https://example.com/owned-article', 'https://example.org/owned-article', 'https://example.org/owned-new-tab-article'];
const HTML = '<!doctype html><html><head><meta charset="utf-8"><title>Owned session article</title><link rel="icon" href="data:,"></head><body><main><p>Project-created public article for the isolated session lifecycle check.</p></main></body></html>';
const FILTER = ['page', 'iframe', 'other', 'worker', 'service_worker', 'shared_worker']
  .map(type => ({ type, exclude: false })).concat({ exclude: true });
const CHILD_FILTER = FILTER.filter(item => item.type !== 'service_worker');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Explicit actual-browser command only. No service, pairing, model or real-page
// acquisition: reaching the unpaired gate demonstrates eligible session routing.
export async function runSessionCaptureBrowserSmoke(executable = DEFAULT_CHROME) {
  if (!path.isAbsolute(executable) || !(await lstat(executable)).isFile()) throw new Error('Installed absolute Chrome executable required');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'udl-session-smoke-'));
  const targets = new Map(), tasks = new Set(), errors = [], checks = [], gaps = [];
  let browser, extensionId, pageSession, popupSession, popupTarget, deadline, closing = false;
  let documents = 0, blockedRequests = 0, runtimeExceptions = 0, embeddingRequests = 0;
  const inferenceTargets = new Set();
  const workerVersions = new Map();
  let stage = 'startup';
  let identityResolve;
  const identity = new Promise(resolve => { identityResolve = resolve; });
  const began = performance.now();
  const stop = () => { void browser?.close(); };
  const own = value => typeof value === 'string' && value.startsWith(`chrome-extension://${extensionId}/`);
  let permissionPreparationTarget = null;
  function schedule(work) {
    const task = Promise.resolve().then(work).catch(() => { if (!closing) errors.push('Browser target/interception setup failed'); });
    tasks.add(task); void task.finally(() => tasks.delete(task));
  }
  async function wait(check, label, timeout = 12000) {
    const started = performance.now();
    while (performance.now() - started < timeout) {
      if (errors.length) throw new Error(errors[0]);
      const value = await check(); if (value) return value;
      await sleep(50);
    }
    throw new Error(`Session smoke timeout: ${label}`);
  }
  async function evaluate(expression, sessionId = popupSession, userGesture = false) {
    const result = await browser.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture }, sessionId);
    if (result.exceptionDetails) throw new Error('Session browser evaluation failed');
    return result.result.value;
  }
  async function worker() {
    return wait(() => [...targets.values()].find(item => item.ready && item.type === 'service_worker' &&
      item.url === `chrome-extension://${extensionId}/chromium/background.js`), 'packaged background worker');
  }
  async function configureCompatibilityPopup({ waitForProduction = false } = {}) {
    const context = await worker();
    if (waitForProduction) await wait(async () => (await evaluate('chrome.sidePanel.getPanelBehavior()', context.sessionId)
      .catch(() => null))?.openPanelOnActionClick === true, 'production toolbar behavior before test override');
    await evaluate('chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:false})', context.sessionId);
    const popupPath = await evaluate("(async () => { await chrome.action.setPopup({popup:'chromium/popup.html'}); return chrome.action.getPopup({}); })()", context.sessionId);
    assert.equal(popupPath, `chrome-extension://${extensionId}/chromium/popup.html`);
  }
  async function status() {
    return evaluate("chrome.runtime.sendMessage({target:'page-matching',type:'status'})");
  }
  async function closePopup() {
    if (!popupTarget) return;
    const targetId = popupTarget; popupTarget = null; popupSession = null;
    await browser.send('Target.closeTarget', { targetId }); targets.delete(targetId);
  }
  async function openPopup() {
    await closePopup();
    await browser.send('Page.bringToFront', {}, pageSession);
    const url = await evaluate('location.href', pageSession);
    const available = await browser.send('Target.getTargets', { filter: [{ type: 'tab', exclude: false }, { exclude: true }] });
    const matchingTabs = available.targetInfos.filter(item => item.type === 'tab' && item.url === url);
    assert.equal(matchingTabs.length, 1, 'Unique actual tab target required');
    const tab = matchingTabs[0];
    await browser.send('Extensions.triggerAction', { id: extensionId, targetId: tab.targetId });
    const popup = await wait(() => [...targets.values()].find(item => item.ready &&
      item.url === `chrome-extension://${extensionId}/chromium/popup.html`), 'actual action popup');
    popupTarget = popup.targetId; popupSession = popup.sessionId;
    await wait(() => evaluate("document.getElementById('matching-enable')?.disabled !== undefined"), 'actual session UI');
  }
  async function eligible(origin) {
    return wait(async () => { const value = await status(); return value.currentOrigin === origin && value.contextReason === null ? value : false; }, 'owned foreground eligibility');
  }
  async function uiClick(id) {
    await wait(() => evaluate(`document.getElementById(${JSON.stringify(id)})?.disabled === false`), 'enabled disclosed control');
    await evaluate(`document.getElementById(${JSON.stringify(id)}).click()`, popupSession, true);
  }
  async function start() {
    const firstAction = await evaluate("document.getElementById('matching-enable').textContent");
    assert.ok([EN.matchingGrantAccess, EN.matchingEnable].includes(firstAction));
    if (firstAction === EN.matchingGrantAccess) {
      await uiClick('matching-enable');
      await wait(async () => {
        const value = await status();
        return value.hostAccess && !value.enabled && await evaluate(`document.getElementById('matching-enable').textContent === ${JSON.stringify(EN.matchingEnable)} && !document.getElementById('matching-enable').disabled`);
      }, 'Grant only refreshes browser access before Start');
    }
    await uiClick('matching-enable');
    return wait(async () => { const value = await status(); return value.enabled && value.phase === 'unpaired' ? value : false; },
      'Start reaches real unpaired authorization gate');
  }
  async function nativeAccess() {
    return evaluate("chrome.permissions.contains({origins:['https://*/*']})", (await worker()).sessionId);
  }
  async function activeTab(windowId) {
    const tabs = await evaluate(`chrome.tabs.query({active:true,windowId:${JSON.stringify(windowId)}})`, (await worker()).sessionId);
    assert.equal(tabs.length, 1, 'Exactly one active tab in the owned window');
    return tabs[0];
  }
  function sameLease(value, expected) {
    assert.equal(value.enabled, true);
    assert.equal(value.hostAccess, true);
    assert.equal(value.sessionWindowId, expected.sessionWindowId);
    assert.equal(value.sessionRevision, expected.sessionRevision);
  }
  async function activeSessionUi() {
    await evaluate("document.getElementById('ui-mode-developer').click()");
    await wait(() => evaluate("document.body.dataset.uiMode==='developer' && document.getElementById('capture-settings').open && document.getElementById('matching-how').open"),
      'Developer details open for active-session evidence');
    await wait(() => evaluate(`(() => {
      const consent=document.getElementById('matching-consent');
      const label=document.querySelector('label[for="matching-consent"]');
      const start=document.getElementById('matching-enable');
      const summary=document.getElementById('matching-session-status');
      return consent?.hidden===true && consent.disabled===true && consent.checked===false && label?.hidden===true &&
        start?.hidden===true && start.disabled===true && summary?.hidden===false && summary.textContent.trim().length>0 &&
        summary.getClientRects().length>0 && document.getElementById('matching-pause')?.disabled===false;
    })()`), 'active-session summary and Stop without renewed consent controls');
  }
  async function navigate(url) {
    await closePopup();
    await browser.send('Page.navigate', { url }, pageSession);
    await wait(() => evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`, pageSession), 'owned intercepted article');
    await openPopup(); return eligible(new URL(url).origin);
  }
  function check(name) { checks.push(name); }
  try {
    browser = launchChromiumPipe({ executable, profileDirectory: path.join(directory, 'profile') });
    deadline = setTimeout(stop, 60000);
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    function installBrowserEvents() {
      browser.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
        for (const value of versions) if (own(value.scriptURL)) workerVersions.set(value.versionId, value);
      });
      browser.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
        const target = { ...targetInfo, sessionId, ready: false }; targets.set(targetInfo.targetId, target);
        if (targetInfo.type === 'worker') inferenceTargets.add(targetInfo.targetId);
        const preparedTarget = stage === 'test-only native access preparation' ? permissionPreparationTarget : null;
        schedule(async () => {
          // createTarget can report an empty URL before chrome:// navigation. The
          // exact management target ID is supplied by the test-only helper.
          if (preparedTarget && targetInfo.targetId === await preparedTarget) {
            await browser.send('Runtime.runIfWaitingForDebugger', {}, sessionId); target.ready = true; return;
          }
          await browser.send('Runtime.enable', {}, sessionId);
          await browser.send('Network.enable', {}, sessionId);
          if (['worker', 'shared_worker'].includes(targetInfo.type)) await browser.send('Network.setBlockedURLs',
            { urls: ['http://*', 'https://*', 'ws://*', 'wss://*', 'ftp://*', 'file://*'] }, sessionId);
          try { await browser.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId); }
          catch (error) {
            if (!['worker', 'shared_worker'].includes(targetInfo.type) || !error.message.includes('Fetch.enable (code -32601)')) throw error;
          }
          await browser.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: CHILD_FILTER }, sessionId);
          await browser.send('Runtime.runIfWaitingForDebugger', {}, sessionId); target.ready = true;
        });
      });
      browser.on('Target.targetInfoChanged', ({ targetInfo }) => {
        const target = targets.get(targetInfo.targetId); if (target) Object.assign(target, targetInfo);
        if (targetInfo.url === `chrome-extension://${extensionId}/embedding/offscreen.html`) inferenceTargets.add(targetInfo.targetId);
      });
      browser.on('Target.detachedFromTarget', ({ sessionId }) => {
        for (const [id, target] of targets) if (target.sessionId === sessionId) targets.delete(id);
      });
      browser.on('Runtime.exceptionThrown', (_, sessionId) => {
        if (own([...targets.values()].find(item => item.sessionId === sessionId)?.url)) runtimeExceptions++;
      });
      browser.on('Network.requestWillBeSent', ({ request }) => {
        if (own(request.url) && new URL(request.url).pathname.startsWith('/embedding/.assets/')) embeddingRequests++;
      });
      browser.on('Fetch.requestPaused', ({ requestId, request, resourceType }, sessionId) => schedule(async () => {
        await identity;
        if (own(request.url)) await browser.send('Fetch.continueRequest', { requestId }, sessionId);
        else if (resourceType === 'Document' && ARTICLES.includes(request.url)) {
          documents++;
          await browser.send('Fetch.fulfillRequest', { requestId, responseCode: 200,
            responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: Buffer.from(HTML).toString('base64') }, sessionId);
        } else if (ARTICLES.some(url => request.url === `${new URL(url).origin}/favicon.ico`)) {
          await browser.send('Fetch.fulfillRequest', { requestId, responseCode: 204 }, sessionId);
        } else {
          blockedRequests++;
          await browser.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, sessionId);
        }
      }));
    }
    installBrowserEvents();
    const version = await browser.send('Browser.getVersion');
    await browser.send('Target.setDiscoverTargets', { discover: true });
    await browser.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: FILTER });
    extensionId = (await browser.send('Extensions.loadUnpacked', { path: BROWSER_ROOT })).id;
    identityResolve(); assert.match(extensionId, /^[a-p]{32}$/u);
    const page = await wait(() => [...targets.values()].find(item => item.ready && item.type === 'page' && item.url === 'about:blank'), 'initial disposable page');
    pageSession = page.sessionId;
    await configureCompatibilityPopup({ waitForProduction: true });
    stage = 'initial default-off state';
    await navigate(ARTICLES[0]);
    const before = await status();
    assert.equal(before.enabled, false); assert.equal(before.sessionWindowId, null); assert.equal(await nativeAccess(), false);
    check('default-off-without-native-access');
    await closePopup();
    stage = 'test-only native access preparation';
    let preparedTargetResolve;
    permissionPreparationTarget = new Promise(resolve => { preparedTargetResolve = resolve; });
    try { await prepareSessionPermission(browser, extensionId, { onTargetCreated: preparedTargetResolve }); }
    finally { preparedTargetResolve(null); permissionPreparationTarget = null; }
    // Permission preparation may reload the disposable extension. Restore the
    // legacy POPUP action solely in this profile for the existing witness checks.
    await configureCompatibilityPopup();
    stage = 'native access alone';
    await openPopup(); await eligible('https://example.com');
    const exactPopupUrl = await evaluate('location.href');
    await uiClick('capture-controls-link');
    assert.equal(await evaluate('location.href'), exactPopupUrl, 'Capture shortcut must preserve the authenticated popup URL');
    assert.equal(await evaluate("document.activeElement.id"), 'page-matching');
    await eligible('https://example.com');
    check('capture-shortcut-preserves-popup-identity-and-eligibility');
    assert.equal((await status()).enabled, false);
    check('native-permission-preparation-does-not-start-capture');
    stage = 'real session UI Start';
    const active = await start(); const boundWindow = active.sessionWindowId;
    assert.equal(boundWindow, active.currentWindowId); assert.equal(active.hostAccess, true);
    assert.equal(await evaluate("document.getElementById('matching-consent').checked"), false);
    check('real-ui-start-native-request-bound-to-current-window');
    stage = 'popup closure retains lease';
    await closePopup(); await openPopup(); await eligible('https://example.com');
    const reopened = await status(); assert.equal(reopened.enabled, true); assert.equal(reopened.sessionRevision, active.sessionRevision);
    assert.equal(await evaluate("document.getElementById('matching-consent').checked"), false);
    check('popup-close-reopen-retains-lease-without-saved-checkbox');
    stage = 'new blank tab retains window session';
    const originalPageSession = pageSession;
    const originalTab = await activeTab(boundWindow);
    await closePopup();
    const newTab = await evaluate(`chrome.tabs.create({windowId:${boundWindow},url:'about:blank',active:true})`, (await worker()).sessionId);
    assert.equal(newTab.windowId, boundWindow);
    assert.notEqual(newTab.id, originalTab.id);
    const blankPage = await wait(() => {
      const candidates = [...targets.values()].filter(item => item.ready && item.type === 'page' && item.url === 'about:blank');
      return candidates.length === 1 ? candidates[0] : false;
    }, 'unique newly created blank page target');
    pageSession = blankPage.sessionId;
    await browser.send('Page.bringToFront', {}, pageSession);
    assert.equal((await activeTab(boundWindow)).id, newTab.id, 'Fresh CDP page must correlate with the created Chrome tab');
    await openPopup();
    const blankState = await wait(async () => {
      const value = await status();
      return ['unsupported-url', 'url-unavailable'].includes(value.contextReason) ? value : false;
    }, 'unsupported blank foreground without ending its window lease');
    sameLease(blankState, active);
    await activeSessionUi();
    check('same-window-new-blank-tab-retains-lease-and-active-session-ui');
    stage = 'new tab navigates to eligible HTTPS without Start';
    await navigate(ARTICLES[2]);
    const newArticle = await wait(async () => { const value = await status(); return value.phase === 'unpaired' ? value : false; }, 'new tab automatic session routing');
    sameLease(newArticle, active);
    assert.equal(newArticle.currentTabId, newTab.id);
    assert.equal(newArticle.currentWindowId, boundWindow);
    await activeSessionUi();
    check('same-window-new-tab-HTTPS-routes-without-consent-or-Start');
    stage = 'switch between same-window tabs without Start';
    await closePopup();
    await evaluate(`chrome.tabs.update(${originalTab.id},{active:true})`, (await worker()).sessionId);
    pageSession = originalPageSession;
    await openPopup(); await eligible('https://example.com');
    const switchedBack = await wait(async () => { const value = await status(); return value.phase === 'unpaired' ? value : false; }, 'original tab restored');
    sameLease(switchedBack, active); assert.equal(switchedBack.currentTabId, originalTab.id);
    await activeSessionUi();
    await closePopup();
    await evaluate(`chrome.tabs.update(${newTab.id},{active:true})`, (await worker()).sessionId);
    pageSession = blankPage.sessionId;
    await openPopup(); await eligible('https://example.org');
    const switchedForward = await wait(async () => { const value = await status(); return value.phase === 'unpaired' ? value : false; }, 'new article tab restored');
    sameLease(switchedForward, active); assert.equal(switchedForward.currentTabId, newTab.id);
    await activeSessionUi();
    check('same-window-tab-switches-retain-lease-and-active-session-ui');
    stage = 'closing active non-last tab retains window session';
    await closePopup();
    await evaluate(`chrome.tabs.remove(${newTab.id})`, (await worker()).sessionId);
    pageSession = originalPageSession;
    assert.equal((await activeTab(boundWindow)).id, originalTab.id);
    await openPopup(); await eligible('https://example.com');
    const afterTabClose = await wait(async () => { const value = await status(); return value.phase === 'unpaired' ? value : false; }, 'remaining active tab after non-last close');
    sameLease(afterTabClose, active); assert.equal(afterTabClose.currentTabId, originalTab.id);
    assert.equal(await nativeAccess(), true); await activeSessionUi();
    check('active-non-last-tab-close-retains-lease-without-new-Start');
    stage = 'automatic second origin';
    await navigate(ARTICLES[1]);
    const second = await wait(async () => { const value = await status(); return value.phase === 'unpaired' ? value : false; }, 'second site session routing');
    assert.equal(second.enabled, true); assert.equal(second.sessionWindowId, boundWindow); assert.equal(second.sessionRevision, active.sessionRevision);
    assert.equal(second.currentOrigin, 'https://example.org');
    check('second-origin-authorized-with-no-additional-Start');
    stage = 'block overrides actual native grant';
    await uiClick('matching-block');
    const blocked = await wait(async () => { const value = await status(); return value.blockedOrigins.includes('https://example.org') && value.phase === 'not-enabled' ? value : false; }, 'blocked-origin override');
    assert.equal(blocked.enabled, true); assert.equal(await nativeAccess(), true);
    check('blocked-site-overrides-native-grant');
    stage = 'explicit unblock';
    await wait(() => evaluate("document.querySelector('[data-unblock-origin=\"https://example.org\"]')?.disabled === false"), 'Allow site again');
    await evaluate("document.querySelector('[data-unblock-origin=\"https://example.org\"]').click()", popupSession, true);
    await wait(async () => { const value = await status(); return value.phase === 'unpaired' && !value.blockedOrigins.includes('https://example.org'); }, 'explicit unblock returns to pairing gate');
    check('explicit-unblock-restores-session-site-routing');
    stage = 'other window cannot retarget lease';
    const boundPageSession = pageSession;
    const other = await evaluate(`chrome.windows.create({url:${JSON.stringify(ARTICLES[0])},focused:true})`, (await worker()).sessionId);
    const otherPage = await wait(() => [...targets.values()].find(item => item.ready && item.type === 'page' && item.url === ARTICLES[0]), 'second normal window');
    pageSession = otherPage.sessionId;
    await wait(() => evaluate(`location.href === ${JSON.stringify(ARTICLES[0])} && document.readyState === 'complete'`, pageSession), 'new owned window article loaded');
    await openPopup(); await eligible('https://example.com');
    const outside = await wait(async () => { const value = await status(); return value.phase === 'not-enabled' ? value : false; }, 'other-window exclusion');
    assert.equal(outside.enabled, true); assert.equal(outside.sessionWindowId, boundWindow); assert.equal(outside.currentWindowId, other.id);
    assert.notEqual(outside.currentWindowId, outside.sessionWindowId);
    await wait(() => evaluate(`document.getElementById('matching-context').textContent === ${JSON.stringify(EN.matchingOtherWindow)}`), 'other-window UI guidance');
    assert.equal(await evaluate("document.getElementById('matching-retry').disabled"), true);
    check('other-window-excluded-with-lease-binding-unchanged');
    stage = 'bound-window closure stops capture';
    await evaluate(`chrome.windows.remove(${boundWindow})`, (await worker()).sessionId);
    const closed = await wait(async () => { const value = await status(); return !value.enabled && value.sessionWindowId === null ? value : false; }, 'bound-window close invalidation');
    assert.equal(closed.hostAccess, true); assert.equal(await nativeAccess(), true);
    await wait(() => evaluate(`document.getElementById('matching-status').textContent === ${JSON.stringify(EN.matchingOff)}`), 'popup confirms stopped lease before fresh Start');
    check('bound-window-closure-stops-with-native-access-retained');
    stage = 'fresh explicit Start in remaining window';
    const next = await start(); assert.equal(next.sessionWindowId, other.id);
    check('fresh-start-required-to-bind-another-window');
    stage = 'forced service-worker reconstruction';
    await browser.send('ServiceWorker.enable', {}, pageSession);
    const workerVersion = await wait(() => [...workerVersions.values()].find(value =>
      value.scriptURL === `chrome-extension://${extensionId}/chromium/background.js` && value.runningStatus === 'running'), 'running packaged service-worker version');
    const previousWorker = await worker();
    await closePopup();
    // A DevTools attachment keeps a service worker alive. Detach our observer,
    // then stop the actual registered worker from the owned page's CDP session.
    await browser.send('Target.detachFromTarget', { sessionId: previousWorker.sessionId });
    await browser.send('ServiceWorker.stopWorker', { versionId: workerVersion.versionId }, pageSession);
    await wait(async () => {
      const current = await browser.send('Target.getTargets');
      return !current.targetInfos.some(value => value.targetId === previousWorker.targetId);
    }, 'actual worker stopped');
    await openPopup();
    // A new worker target must actually appear; mocks cannot satisfy this check.
    const reconstructed = await wait(() => [...targets.values()].find(item => item.ready && item.type === 'service_worker' &&
      item.url === `chrome-extension://${extensionId}/chromium/background.js` && item.targetId !== previousWorker.targetId), 'new worker target');
    assert.notEqual(reconstructed.targetId, previousWorker.targetId);
    const reconstructedState = await wait(async () => { const value = await status(); return value.enabled && value.phase === 'unpaired' ? value : false; }, 'reconstructed owner restores live lease');
    assert.equal(reconstructedState.sessionWindowId, next.sessionWindowId);
    assert.equal(reconstructedState.sessionRevision, next.sessionRevision);
    assert.equal(await nativeAccess(), true);
    check('actual-worker-reconstruction-preserves-session-lease');
    gaps.push('Actual runtime.reload was attempted in disposable Chrome154 but reopening its action ended the Chrome pipe/process; extension-reload lease behavior remains unverified here.');
    gaps.push('Same-profile browser restart was attempted, but the CDP-loaded unpacked background/action registration did not restore; restart lease behavior needs a manual installed-extension check.');
    stage = 'real UI Stop preserves native access';
    await uiClick('matching-pause');
    const stopped = await wait(async () => { const value = await status(); return !value.enabled && value.phase === 'off' ? value : false; }, 'real Stop');
    assert.equal(stopped.sessionWindowId, null); assert.equal(stopped.hostAccess, true); assert.equal(await nativeAccess(), true);
    check('Stop-preserves-native-access-while-capture-off');
    stage = 'real UI broad-access removal';
    await uiClick('matching-remove-access');
    await wait(async () => { const value = await status(); return !value.enabled && !value.hostAccess; }, 'native removal visible');
    assert.equal(await nativeAccess(), false);
    check('explicit-remove-access-revokes-real-Chrome-grant');
    gaps.push('Forced CDP worker stop/reconstruction does not establish natural idle suspension or crashed-process cleanup.');
    stage = 'isolated browser absence of egress and inference';
    assert.equal(blockedRequests, 0); assert.equal(runtimeExceptions, 0); assert.equal(embeddingRequests, 0); assert.equal(inferenceTargets.size, 0);
    assert.ok(documents >= 3);
    check('no-backend-network-model-or-inference');
    // Keep this owned session reference explicit; no owner browser/profile used.
    assert.notEqual(boundPageSession, pageSession);
    return { result: 'PASS', browser: version.product, checks, checkCount: checks.length, gaps,
      interceptedDocuments: documents, blockedRequests, runtimeExceptions, embeddingRequests, inferenceTargets: inferenceTargets.size,
      nativePermissionPreparation: 'Test-only chrome://extensions addHostPermission; real product permissions.request runs under the Start click. Native confirmation dialog is not automated.',
      focusEvidence: 'Actual action popup and existing product popup witness in headless Chrome; no focus or authorization API mocks.',
      scope: 'Disposable profile, a new blank tab and three intercepted project-created HTTPS routes; no pairing, service, page capture, inference or external acquisition. Session routing reaches the real unpaired gate.',
      elapsedMs: performance.now() - began };
  } catch (error) {
    const protocol = /^Chromium protocol (?:rejected|timeout:?) ([A-Za-z.]+)(?: \(code (-?\d+)\))?$/u.exec(error.message);
    const detail = protocol ? ` (${protocol[1]}${protocol[2] ? ` code ${protocol[2]}` : ''})`
      : /^Chromium (?:protocol|pipe) [A-Za-z .():0-9-]{1,100}$/u.test(error.message) ? ` (${error.message})`
      : error.code === 'ERR_ASSERTION' ? ` (assertion ${error.operator}; actual type ${typeof error.actual}; expected type ${typeof error.expected})`
      : error.message.startsWith('Session smoke timeout: ') ? ` (${error.message})`
      : ['Disposable profile extension management API required', 'Native test site-access preparation must succeed', 'Browser target/interception setup failed', 'Session browser evaluation failed'].includes(error.message)
        ? ` (${error.message})` : '';
    const line = /run-session-capture-browser-smoke\.js:(\d+):/u.exec(error.stack)?.[1];
    const kind = /^[A-Za-z]{1,40}$/u.test(error.name) ? error.name : 'Error';
    throw new Error(`Session browser smoke failed during ${stage}${detail} (${kind}${line ? `, harness line ${line}` : ''})`);
  } finally {
    closing = true; identityResolve(); clearTimeout(deadline);
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    try { await browser?.close(); } finally {
      await Promise.allSettled([...tasks]);
      assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(directory).startsWith('udl-session-smoke-'));
      await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSessionCaptureBrowserSmoke(process.argv[2]).then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
