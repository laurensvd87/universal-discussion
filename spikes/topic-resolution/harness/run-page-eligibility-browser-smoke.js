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
const COLLECTOR_TITLE = 'Owned collector fixture';
const COLLECTOR_TEXT = 'Owned synthetic article for bounded collector regression.';
const EXCLUDED_TEXT = 'Owned excluded content must not be collected.';
const COLLECTOR_CASES = [
  { name: 'robots-negative', head: '<meta name="robots" content="noai, noindex, nosnippet, nofollow, max-snippet:0">' },
  { name: 'robots-positive', head: '<meta name="robots" content="all, index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">' },
  { name: 'googlebot-negative', head: '<meta name="googlebot" content="none, nosnippet, noarchive">' },
  { name: 'googlebot-positive', head: '<meta name="googlebot" content="index, follow, max-snippet:-1">' },
  { name: 'tdm-zero', head: '<meta name="tdm-reservation" content="0">' },
  { name: 'tdm-one', head: '<meta name="tdm-reservation" content="1">' },
  { name: 'excluded-subtrees', body: `<main><p>${COLLECTOR_TEXT}</p><form><input value="${EXCLUDED_TEXT}"><textarea>${EXCLUDED_TEXT}</textarea></form><div hidden>${EXCLUDED_TEXT}</div><section class="paywall">${EXCLUDED_TEXT}</section></main>` },
  { name: 'forms-only', unsupported: true, body: `<main><form><input value="${EXCLUDED_TEXT}"><textarea>${EXCLUDED_TEXT}</textarea></form></main>` },
  { name: 'hidden-region', unsupported: true, body: `<main hidden><p>${EXCLUDED_TEXT}</p></main>` },
  { name: 'paywall-region', unsupported: true, body: `<article class="paywall"><p>${EXCLUDED_TEXT}</p></article>` },
  { name: 'missing-region', unsupported: true, body: `<div><p>${EXCLUDED_TEXT}</p></div>` },
];
const FILTER = ['page', 'iframe', 'other', 'worker', 'service_worker', 'shared_worker']
  .map(type => ({ type, exclude: false })).concat({ exclude: true });
const CHILD_FILTER = FILTER.filter(item => item.type !== 'service_worker');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Run only on an explicit browser-smoke command. The page is fulfilled locally;
// every other non-extension request is failed before the browser can fetch it.
export async function runPageEligibilityBrowserSmoke(executable = DEFAULT_CHROME, { popupFocusDiagnostics = false } = {}) {
  if (!path.isAbsolute(executable) || !(await lstat(executable)).isFile()) throw new Error('Installed absolute Chrome executable required');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'udl-eligibility-smoke-'));
  const targets = new Map(), tasks = new Set(), errors = [], inferenceTargets = new Set();
  let browser, extensionId, pageSession, popupTarget, popupSession, deadline, workerSession;
  let interceptedDocuments = 0, ownedFaviconRequests = 0, blockedRequests = 0, runtimeExceptions = 0, embeddingRequests = 0;
  const blockedClasses = { extensionInitiated: 0, ownedPageFavicon: 0, other: 0 };
  const blockedOtherKinds = [];
  let stage = 'startup';
  let focusDiagnostics;
  let focusFailureDiagnostics;
  let evaluationFailureKind;
  const collectorChecks = [];
  let syntheticContentCaptures = 0;
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
    if (result.exceptionDetails) {
      const kind = result.exceptionDetails.exception?.className;
      evaluationFailureKind ??= typeof kind === 'string' && /^[A-Za-z]{1,40}$/u.test(kind) ? kind : 'RuntimeException';
      throw new Error('Eligibility browser evaluation failed');
    }
    return result.result.value;
  }
  async function status() {
    return evaluate(`(async () => {
      const result = await chrome.runtime.sendMessage({ target: 'page-matching', type: 'status' });
      return { phase: result?.phase, reason: result?.reason, enabled: result?.enabled, origins: result?.origins,
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
        status: document.getElementById('matching-status')?.textContent,
        detail: document.getElementById('matching-detail')?.textContent,
        enableCursor: getComputedStyle(document.getElementById('matching-enable')).cursor,
        consent: document.getElementById('matching-consent')?.checked };
    })()`);
  }
  async function capturePopupFocusDiagnostics(workerSession) {
    const popup = await evaluate(`(async () => {
      const window = await chrome.windows.getCurrent();
      return { hasFocus: document.hasFocus(), visibilityState: document.visibilityState,
        currentWindow: { id: window.id, type: window.type, focused: window.focused } };
    })()`);
    const worker = await evaluate(`(async () => {
      const popupUrl = chrome.runtime.getURL('chromium/popup.html');
      const contexts = await chrome.runtime.getContexts({ contextTypes: ['POPUP'], documentUrls: [popupUrl] });
      const clients = await globalThis.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const window = await chrome.windows.getLastFocused();
      return { popupContexts: contexts.filter(context => context.contextType === 'POPUP' && context.documentUrl === popupUrl)
        .map(context => ({ contextType: context.contextType, windowId: context.windowId,
          tabId: context.tabId, contextId: context.contextId, documentId: context.documentId,
          documentIdPresent: typeof context.documentId === 'string' && context.documentId.length > 0 })),
        popupClients: clients.filter(client => client.url === popupUrl)
          .map(client => ({ id: client.id, focused: client.focused, visibilityState: client.visibilityState, type: client.type })),
        lastFocusedWindow: { id: window.id, type: window.type, focused: window.focused } };
    })()`, workerSession);
    return { popup, worker };
  }
  async function installFocusPortObserver() {
    await evaluate(`(() => {
      const records = [];
      globalThis.__eligibilityFocusPortRecords = records;
      chrome.runtime.onConnect.addListener(port => {
        if (records.length >= 4) return;
        const sender = port.sender;
        const popupUrl = chrome.runtime.getURL('chromium/popup.html');
        const record = { expectedName: port.name === 'page-matching-popup-focus/1',
          ownId: sender?.id === chrome.runtime.id, exactPopupUrl: sender?.url === popupUrl,
          hasTab: Boolean(sender?.tab), documentIdPresent: typeof sender?.documentId === 'string' && sender.documentId.length > 0,
          documentIdMatchesLivePopupContext: false, contextQueryFailed: false,
          challenges: 0, responses: 0, focused: null, windowIdMatch: null, disconnected: false };
        records.push(record);
        void chrome.runtime.getContexts({ contextTypes: ['POPUP'], documentUrls: [popupUrl] }).then(contexts => {
          record.documentIdMatchesLivePopupContext = record.documentIdPresent && contexts.some(context =>
            context.contextType === 'POPUP' && context.documentUrl === popupUrl && context.documentId === sender.documentId);
        }).catch(() => { record.contextQueryFailed = true; });
        if (!record.expectedName) return;
        const originalPostMessage = port.postMessage;
        // Observe the outgoing fixed challenge type; preserve the message and
        // original method invocation. Production response listeners are untouched.
        port.postMessage = function(message) {
          if (message?.type === 'focus-challenge') record.challenges++;
          return originalPostMessage.call(port, message);
        };
        port.onDisconnect.addListener(() => { record.disconnected = true; port.postMessage = originalPostMessage; });
        port.onMessage.addListener(message => {
          if (message?.type !== 'focus-response') return;
          record.responses++; record.focused = message.focused === true;
          void chrome.windows.getLastFocused({ populate: false }).then(window => {
            record.windowIdMatch = Number.isSafeInteger(message.windowId) && message.windowId === window?.id;
          }).catch(() => { record.windowIdMatch = false; });
        });
      });
    })()`, workerSession);
  }
  async function captureFocusFailure() {
    const popup = await evaluate(`(async () => {
      const window = await chrome.windows.getCurrent({ populate: false });
      const result = await chrome.runtime.sendMessage({ target: 'page-matching', type: 'status' });
      return { hasFocus: document.hasFocus(), visibilityState: document.visibilityState,
        currentWindowIncognito: window.incognito === true,
        contextReason: typeof result?.contextReason === 'string' ? result.contextReason : null };
    })()`).catch(() => ({ unavailable: true }));
    const ports = await evaluate('globalThis.__eligibilityFocusPortRecords ?? []', workerSession).catch(() => []);
    return { popup, ports };
  }
  async function checkSimulatedParentFocus(workerSession) {
    // Deliberately inject only the parent-window API flag. This is an actual
    // action popup in headless Chrome, not a reproduction of headful OS focus.
    await evaluate(`(() => {
      globalThis.__eligibilityOriginalLastFocused = chrome.windows.getLastFocused;
      chrome.windows.getLastFocused = async (...args) => {
        const window = await globalThis.__eligibilityOriginalLastFocused.apply(chrome.windows, args);
        return { ...window, focused: false };
      };
    })()`, workerSession);
    try {
      stage = 'actual popup focus under simulated parent flag';
      assert.equal(await evaluate('document.hasFocus() && document.visibilityState === "visible"'), true);
      await wait(async () => {
        const value = await status(); return value.currentOrigin === ORIGIN && value.contextReason === null;
      }, 'focused action popup remains eligible');
      await wait(async () => {
        const value = await controls(); return value.origin === ORIGIN && value['matching-enable'] === false;
      }, 'focused popup keeps consented Enable usable');

      // Faults are confined to the worker's tab API. The action popup retains
      // real document focus, exercising the fallback's normal tab checks.
      for (const fault of [
        { mode: 'loading-status', reason: 'page-loading', message: EN.matchingContextLoading },
        { mode: 'pending-url', reason: 'page-loading', message: EN.matchingContextLoading },
        { mode: 'url-unavailable', reason: 'url-unavailable', message: EN.matchingContextUrlUnavailable },
        { mode: 'query-rejected', reason: 'tab-query-failed', message: EN.matchingContextTabQueryFailed }
      ]) {
        stage = `injected tabs query ${fault.mode} rejection`;
        assert.equal(await evaluate('document.hasFocus() && document.visibilityState === "visible"'), true);
        await evaluate(`(() => {
          globalThis.__eligibilityOriginalTabsQuery = chrome.tabs.query;
          chrome.tabs.query = async (...args) => {
            const mode = ${JSON.stringify(fault.mode)};
            if (mode === 'query-rejected') throw new Error('Injected tab query rejection');
            const tabs = await globalThis.__eligibilityOriginalTabsQuery.apply(chrome.tabs, args);
            return tabs.map(tab => {
              if (mode === 'loading-status') return { ...tab, status: 'loading' };
              if (mode === 'pending-url') return { ...tab, pendingUrl: tab.url };
              if (mode === 'url-unavailable') return { ...tab, url: undefined };
              throw new Error('Unknown tab query injection');
            });
          };
        })()`, workerSession);
        try {
          const rejected = await wait(async () => {
            const value = await status(); return value.contextReason === fault.reason ? value : false;
          }, `${fault.mode} returns its exact bounded reason`);
          assert.equal(rejected.currentOrigin, null);
          assert.equal(rejected.currentUrl, null);
          const rejectedControls = await wait(async () => {
            const value = await controls(); return value.context === fault.message ? value : false;
          }, `${fault.mode} displays its exact guidance`);
          assert.equal(rejectedControls['matching-enable'], true);
          assert.equal(rejectedControls.origin, '');
          assert.equal(rejectedControls.consent, true);
        } finally {
          await evaluate(`(() => {
            chrome.tabs.query = globalThis.__eligibilityOriginalTabsQuery;
            delete globalThis.__eligibilityOriginalTabsQuery;
          })()`, workerSession);
        }
        stage = `restored tabs query after ${fault.mode}`;
        assert.equal(await evaluate('document.hasFocus() && document.visibilityState === "visible"'), true);
        const recovered = await wait(async () => {
          const value = await status();
          return value.currentOrigin === ORIGIN && value.contextReason === null ? value : false;
        }, `${fault.mode} API restoration recovers eligibility`);
        assert.equal(recovered.currentUrl, ARTICLE);
        await wait(async () => {
          const value = await controls();
          return value.origin === ORIGIN && value['matching-enable'] === false && value.context === '';
        }, `${fault.mode} recovery restores consented Enable`);
      }

      stage = 'injected unfocused popup rejection';
      await evaluate(`(() => {
        globalThis.__eligibilityHasFocusDescriptor = Object.getOwnPropertyDescriptor(document, 'hasFocus');
        Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false });
        window.dispatchEvent(new Event('blur'));
      })()`);
      await wait(async () => {
        const value = await status(); return value.currentOrigin === null && value.contextReason === 'window-unfocused';
      }, 'injected unfocused document rejects fallback');
      await wait(async () => {
        const value = await controls(); return value['matching-enable'] === true && value.context === EN.matchingContextUnfocused;
      }, 'unfocused popup disables Enable');

      stage = 'actual popup focus restored';
      await evaluate(`(() => {
        const descriptor = globalThis.__eligibilityHasFocusDescriptor;
        if (descriptor) Object.defineProperty(document, 'hasFocus', descriptor); else delete document.hasFocus;
        delete globalThis.__eligibilityHasFocusDescriptor;
        window.dispatchEvent(new Event('focus'));
      })()`);
      assert.equal(await evaluate('document.hasFocus()'), true);
      await wait(async () => {
        const value = await status(); return value.currentOrigin === ORIGIN && value.contextReason === null;
      }, 'restored actual document focus is freshly accepted');

      stage = 'injected popup window mismatch rejection';
      await evaluate(`(() => {
        globalThis.__eligibilityOriginalCurrentWindow = chrome.windows.getCurrent;
        chrome.windows.getCurrent = async (...args) => {
          const window = await globalThis.__eligibilityOriginalCurrentWindow.apply(chrome.windows, args);
          return { ...window, id: window.id + 1000000 };
        };
      })()`);
      await wait(async () => {
        const value = await status(); return value.currentOrigin === null && value.contextReason === 'window-unfocused';
      }, 'popup associated with another window cannot authorize fallback');
      await wait(async () => (await controls())['matching-enable'] === true, 'mismatched popup disables Enable');
    } catch (error) {
      if (popupFocusDiagnostics) focusFailureDiagnostics = await captureFocusFailure();
      throw error;
    } finally {
      await evaluate(`(() => {
        if ('__eligibilityHasFocusDescriptor' in globalThis) {
          const descriptor = globalThis.__eligibilityHasFocusDescriptor;
          if (descriptor) Object.defineProperty(document, 'hasFocus', descriptor); else delete document.hasFocus;
          delete globalThis.__eligibilityHasFocusDescriptor;
        }
        if (globalThis.__eligibilityOriginalCurrentWindow) {
          chrome.windows.getCurrent = globalThis.__eligibilityOriginalCurrentWindow;
          delete globalThis.__eligibilityOriginalCurrentWindow;
        }
        window.dispatchEvent(new Event('focus'));
      })()`);
      await evaluate(`(() => {
        if (globalThis.__eligibilityOriginalTabsQuery) {
          chrome.tabs.query = globalThis.__eligibilityOriginalTabsQuery;
          delete globalThis.__eligibilityOriginalTabsQuery;
        }
        chrome.windows.getLastFocused = globalThis.__eligibilityOriginalLastFocused;
        delete globalThis.__eligibilityOriginalLastFocused;
      })()`, workerSession);
    }
    stage = 'original foreground APIs restored';
    await wait(async () => (await status()).currentOrigin === ORIGIN, 'original foreground API eligibility restored');
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
  async function checkForegroundRecovery() {
    // Only this disposable profile gets synthetic enabled preferences. Keep the
    // real optional host grant absent: recovery must stop before any page read.
    stage = 'injected failed foreground with synthetic preferences';
    await evaluate(`(() => {
      globalThis.__eligibilityRecoveryTabsQuery = chrome.tabs.query;
      chrome.tabs.query = async () => { throw new Error('Injected foreground failure'); };
    })()`, workerSession);
    try {
      await evaluate(`chrome.storage.local.set({ pageMatchingPreferences: {
        enabled: true, origins: [${JSON.stringify(ORIGIN)}] } })`, workerSession);
      await wait(async () => {
        const value = await status();
        return value.phase === 'unsupported' && value.reason === 'no-focused-page' && value.currentOrigin === null;
      }, 'foreground failure is distinguished from content rejection');
      await wait(async () => (await controls()).detail === '[no-focused-page]', 'bounded foreground diagnostic is visible');
      stage = 'status-driven recovery without a new browser event';
      await evaluate(`(() => {
        chrome.tabs.query = globalThis.__eligibilityRecoveryTabsQuery;
        delete globalThis.__eligibilityRecoveryTabsQuery;
      })()`, workerSession);
      const recovered = await wait(async () => {
        const value = await status();
        return value.phase === 'not-enabled' && value.currentOrigin === ORIGIN ? value : false;
      }, 'restored foreground resumes only as far as the real host-permission gate');
      assert.equal(recovered.reason, null);
      assert.equal(recovered.currentUrl, ARTICLE);
      const ui = await wait(async () => {
        const value = await controls(); return value.status === EN.matchingNotEnabled ? value : false;
      }, 'recovery clears old unsupported guidance');
      assert.equal(ui.detail, '');
      assert.equal(await evaluate(`chrome.permissions.contains({ origins: [${JSON.stringify(`${ORIGIN}/*`)}] })`, workerSession), false);
    } finally {
      await evaluate(`(() => {
        if (globalThis.__eligibilityRecoveryTabsQuery) {
          chrome.tabs.query = globalThis.__eligibilityRecoveryTabsQuery;
          delete globalThis.__eligibilityRecoveryTabsQuery;
        }
        return chrome.storage.local.remove('pageMatchingPreferences');
      })()`, workerSession);
    }
    stage = 'synthetic recovery preferences removed';
    await wait(async () => (await status()).phase === 'off', 'default-off state restored');
    assert.equal(await evaluate("chrome.storage.local.get('pageMatchingPreferences').then(v => v.pageMatchingPreferences ?? null)", workerSession), null);
  }
  async function checkPackagedCollector() {
    // The action popup supplies temporary activeTab access to this owned page.
    // Matching remains off and the optional host grant absent. Only the packaged
    // collector is serialized into Chrome's actual isolated execution world.
    assert.equal((await status()).enabled, false);
    assert.equal(await evaluate(`chrome.permissions.contains({ origins: [${JSON.stringify(`${ORIGIN}/*`)}] })`, workerSession), false);
    try {
      for (const fixture of COLLECTOR_CASES) {
        stage = `packaged collector ${fixture.name}`;
        const head = `<meta charset="utf-8"><title>${COLLECTOR_TITLE}</title>${fixture.head ?? ''}`;
        const body = fixture.body ?? `<main><p>${COLLECTOR_TEXT}</p></main>`;
        await evaluate(`(() => {
          document.head.innerHTML = ${JSON.stringify(head)};
          document.body.innerHTML = ${JSON.stringify(body)};
        })()`, pageSession);
        const injections = await evaluate(`(async () => {
          const { collectPageContent } = await import('./page-content-reader.js');
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tabs.length !== 1 || tabs[0].url !== ${JSON.stringify(ARTICLE)}) throw new Error('Owned active tab required');
          return chrome.scripting.executeScript({ target: { tabId: tabs[0].id, frameIds: [0] },
            world: 'ISOLATED', func: collectPageContent, args: [${JSON.stringify(ARTICLE)}] });
        })()`);
        assert.equal(injections.length, 1);
        assert.equal(injections[0].frameId, 0);
        assert.match(injections[0].documentId, /^[A-Za-z0-9._:-]{1,128}$/u);
        const expected = fixture.unsupported
          ? { contractVersion: 'page-content/1', status: 'unsupported', reason: 'missing-region' }
          : { contractVersion: 'page-content/1', status: 'collected', url: ARTICLE, title: COLLECTOR_TITLE,
            text: COLLECTOR_TEXT, extractorVersion: 'main-text-prefix/v1' };
        assert.deepEqual(injections[0].result, expected);
        if (!fixture.unsupported) syntheticContentCaptures++;
        collectorChecks.push(`${fixture.name}-${fixture.unsupported ? 'excluded' : 'collected-exact-shape'}`);
      }
    } finally {
      await evaluate(`(() => {
        document.head.innerHTML = '<meta charset="utf-8"><title>Owned eligibility article</title>';
        document.body.innerHTML = '<main><p>Owned synthetic article for the permission gate.</p></main>';
      })()`, pageSession);
    }
    stage = 'collector leaves matching off and permissions unchanged';
    assert.equal((await status()).enabled, false);
    assert.equal(await evaluate(`chrome.permissions.contains({ origins: [${JSON.stringify(`${ORIGIN}/*`)}] })`, workerSession), false);
    assert.equal(await evaluate("chrome.storage.local.get('pageMatchingPreferences').then(v => v.pageMatchingPreferences ?? null)", workerSession), null);
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
    if (popupFocusDiagnostics) {
      const worker = await wait(() => [...targets.values()].find(item => item.ready && item.type === 'service_worker' &&
        item.url === `chrome-extension://${extensionId}/chromium/background.js`), 'diagnostic background worker');
      workerSession = worker.sessionId;
      stage = 'focus port diagnostic API readiness';
      await wait(() => evaluate("typeof globalThis.chrome?.runtime?.onConnect?.addListener === 'function' && typeof globalThis.chrome?.runtime?.getContexts === 'function'", workerSession),
        'worker diagnostic APIs ready');
      stage = 'install focus port diagnostic';
      await installFocusPortObserver();
    }
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
    workerSession = worker.sessionId;
    if (popupFocusDiagnostics) {
      stage = 'sanitized popup focus diagnostic';
      focusDiagnostics = await capturePopupFocusDiagnostics(worker.sessionId);
    }
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
    await checkSimulatedParentFocus(worker.sessionId);
    stage = 'permission remains absent';
    assert.equal(await evaluate(`chrome.permissions.contains({ origins: [${JSON.stringify(`${ORIGIN}/*`)}] })`, worker.sessionId), false);
    stage = 'preferences remain absent';
    assert.equal(await evaluate("chrome.storage.local.get('pageMatchingPreferences').then(v => v.pageMatchingPreferences ?? null)", worker.sessionId), null);
    await checkForegroundRecovery();
    await checkPackagedCollector();
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
    if (popupFocusDiagnostics) focusDiagnostics.ports = await evaluate('globalThis.__eligibilityFocusPortRecords ?? []', workerSession);
    return { result: 'PASS', browser: version.product, checks: ['blank-page-ineligible', 'owned-https-origin-eligible',
      'optional-host-permission-ungranted', 'default-off-and-no-consent-disabled', 'consent-enables-action-only',
      'pause-resume-retry-disabled', 'no-persisted-pre-grant-preferences-or-network', 'focused-popup-with-simulated-parent-unfocused',
      'injected-unfocused-popup-rejected', 'restored-popup-focus-accepted', 'injected-popup-window-mismatch-rejected',
      'injected-tabs-loading-status-rejected', 'restored-tabs-after-loading-status-accepted',
      'injected-tabs-pending-url-rejected', 'restored-tabs-after-pending-url-accepted',
      'injected-tabs-url-unavailable-rejected', 'restored-tabs-after-url-unavailable-accepted',
      'injected-tabs-query-rejected', 'restored-tabs-after-query-rejection-accepted',
      'stale-foreground-status-recovers-without-browser-event', 'recovery-retains-real-host-permission-gate',
      ...collectorChecks], interceptedDocuments,
      ownedFaviconRequests, blockedRequests, runtimeExceptions, inferenceTargets: inferenceTargets.size, embeddingRequests,
      simulatedParentFocusFlag: true, injectedNegativeFocusChecks: ['document-hasFocus-false-and-blur', 'current-window-id-mismatch'],
      injectedTabQueryChecks: ['loading-status', 'pending-url', 'url-unavailable', 'query-rejected'],
      syntheticPreferenceRecoveryCheck: true,
      packagedCollectorWorld: 'ISOLATED', syntheticContentCaptures,
      ...(popupFocusDiagnostics ? { popupFocusDiagnostics: focusDiagnostics } : {}),
      elapsedMs: performance.now() - started,
      scope: 'Fresh temporary profile, owned intercepted HTTPS article, synthetic preferences removed after recovery test; bounded synthetic content captured with the packaged isolated-world collector under action activeTab; no optional host grant, inference, model asset load, backend access, or real webpage fetch' };
  } catch {
    // Do not print CDP expressions, page URLs, protocol payloads or popup data.
    const detail = stage === 'external request attempts' ? ` (${JSON.stringify({ blockedClasses, blockedOtherKinds })})` : '';
    const focusDetail = popupFocusDiagnostics ? ` (${JSON.stringify({
      ...(focusFailureDiagnostics ?? await captureFocusFailure()),
      ...(evaluationFailureKind ? { evaluationFailureKind } : {}) })})` : '';
    throw new Error(`Eligibility browser smoke failed during ${stage}${detail}${focusDetail}`);
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
