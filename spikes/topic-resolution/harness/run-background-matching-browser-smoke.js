import assert from 'node:assert/strict';
import { lstat, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProcessDependencies, startLocalApplication } from '../../../apps/local-service/src/startup.js';
import { makeBodyTopicMetric } from '../../../apps/local-service/src/domain/body-topic-metric.js';
import { makeRidgeTopicAdapter } from '../../../apps/local-service/src/domain/ridge-topic-adapter.js';
import { changePairing } from '../../../apps/local-service/src/http/pairing-store.js';
import { EN } from '../browser/locales/en.js';
import { launchChromiumPipe } from './chromium-pipe.js';
import { prepareSessionPermission } from './prepare-session-permission.js';
import { createTargetSetupLifetime, isTargetSetupCanceled } from './target-setup-lifetime.js';

const BROWSER_ROOT = fileURLToPath(new URL('../browser/', import.meta.url));
const DEFAULT_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ORIGIN = 'https://example.com';
const API = 'http://127.0.0.1:4174/v1';
function syntheticRidgeAdapter() {
  // Entirely fabricated identity: never load an installed/private Ridge artifact.
  const weights = Array(384 ** 2).fill(0);
  for (let row = 0; row < 384; row++) weights[row * 384 + row] = 1;
  return makeRidgeTopicAdapter({ weights, meanX: Array(384).fill(0), meanY: Array(384).fill(0) });
}
function syntheticBodyMetric() {
  // Entirely fabricated identity: never load an installed/private metric artifact.
  const lower = new Float64Array(384 ** 2);
  for (let row = 0; row < 384; row++) lower[row * 384 + row] = 1;
  return makeBodyTopicMetric({ mean: Array(384).fill(0), lower });
}
const COMMENT = 'Owned browser test: the replaceable Cedar battery is useful.';
const DEMO_COMMENT = 'Owned browser test: retained demo discussion contribution.';
const CROSS_PAGE_REPLY = 'Owned browser reply from A follows the root created on B.';
const SWITCH_DRAFT = 'Owned private draft survives the experimental Topic view switch.';
const STATUS = "document.querySelector('#discussion-status')?.textContent";
const THREAD = "document.querySelector('#local-discussion .discussion-thread')";
const TEXTS = {
  a: 'Cedar Slate 2 launches in September 2026. The tablet has an ink screen and a removable battery.',
  b: 'September 2026 brings Cedar Slate 2, a tablet with an electronic paper display and replaceable battery.',
  c: 'Riverbank gardeners start tomato seedlings indoors and transplant them into community garden beds in spring.',
  metadata: 'Cedar Slate 2 launches in September 2026 with an ink screen and removable battery. Owned metadata-bearing article content.',
};
const PRIVATE_SENTINEL = 'owned-form-field-must-never-leave';
const FALLBACK_PARAGRAPH = 'An invented observatory on the Moon studies distant stars with a new infrared telescope. Its researchers compare measurements over several seasons to distinguish planets from stellar noise.';
const FALLBACK_COMMENT = 'Owned fallback test: both layouts retain this observatory discussion.';
const METADATA_TAGS = '<meta name="robots" content="noai, noindex, max-snippet:0"><meta name="googlebot" content="nosnippet"><meta name="tdm-reservation" content="1">';
const FIXTURES = new Map(Object.entries({
  a: `<title>Owned Cedar launch A</title><article><p>${TEXTS.a}</p></article>`,
  b: `<title>Owned Cedar launch B</title><main><p>${TEXTS.b}</p></main>`,
  c: `<title>Owned Riverbank gardening C</title><article><p>${TEXTS.c}</p></article>`,
  d: `<title>Owned paused Cedar D</title><main><p>${TEXTS.a}</p></main>`,
  metadata: `<title>Owned metadata-bearing article</title><article><p>${TEXTS.metadata}</p></article>`,
  forms: `<title>Owned excluded form</title><main><form><input value="${PRIVATE_SENTINEL}"><textarea>${PRIVATE_SENTINEL}</textarea></form></main>`,
  semantic: `<title>Owned semantic observatory</title><article><p>${FALLBACK_PARAGRAPH}</p><p>${FALLBACK_PARAGRAPH}</p></article>`,
  generic: `<title>Owned generic observatory</title><div class="article-content"><p>${FALLBACK_PARAGRAPH}</p><p>${FALLBACK_PARAGRAPH}</p><form><p>${PRIVATE_SENTINEL}</p></form></div>`,
}).map(([key, html]) => {
  const split = html.indexOf('</title>') + 8;
  const body = html.slice(split);
  return [fixtureUrl(key), `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,">${html.slice(0, split)}${key === 'metadata' ? METADATA_TAGS : ''}</head><body>${body}</body></html>`];
}));
const ROOT_FILTER = ['page', 'iframe', 'other', 'worker', 'service_worker', 'shared_worker']
  .map(type => ({ type, exclude: false })).concat({ exclude: true });
const CHILD_FILTER = ROOT_FILTER.filter(item => item.type !== 'service_worker');
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
function fixtureUrl(name) { return `${name === 'b' ? 'https://example.org' : ORIGIN}/background-fixture/${name}`; }

export async function runBackgroundMatchingBrowserSmoke(executable = DEFAULT_CHROME, { alternateOnly = false, ridgeOnly = false, bodyMetricOnly = false } = {}) {
  const targetedOnly = alternateOnly || ridgeOnly || bodyMetricOnly;
  if (!path.isAbsolute(executable) || !(await lstat(executable)).isFile()) throw new Error('Installed absolute Chrome executable required');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'udl-background-smoke-'));
  const databasePath = path.join(directory, 'demo.sqlite');
  const pairingPath = path.join(directory, 'pairing.json');
  const targets = new Map(), sessionTargets = new Map(), tasks = new Set(), workers = [], requests = [], errors = [], ingestions = [];
  const checks = [];
  let browser, application, extensionId, pageSession, popupSession, popupTarget, deadline, progress, toolbarSession;
  let capability = null;
  let stage = 'initializing';
  let permissionPreparationTarget;
  let closing = false, runtimeExceptions = 0, interceptedDocuments = 0;
  let delayedAlternate = null;
  let resolveIdentity;
  const identityReady = new Promise(resolve => { resolveIdentity = resolve; });
  const began = performance.now();
  const stop = () => { void browser?.close(); };
  function selfUrl(value) { try { const url = new URL(value); return url.protocol === 'chrome-extension:' && url.host === extensionId; } catch { return false; } }
  function apiUrl(value) { try { const url = new URL(value); return url.origin === 'http://127.0.0.1:4174' && url.pathname.startsWith('/v1/') && !url.search && !url.hash; } catch { return false; } }
  function setupDiagnostic(error) {
    // Only fixed categories, protocol method/code and this harness's line number.
    // Assertion messages/values and generic error text can contain request data.
    const protocol = /^Chromium (protocol rejected|protocol timeout:|pipe ended during|pipe unavailable for) ([A-Za-z]+\.[A-Za-z]+)(?: \(code (-?\d+)\))?$/u.exec(error?.message ?? '');
    if (protocol) return `${protocol[1]} ${protocol[2]}${protocol[3] ? ` code ${protocol[3]}` : ''}`;
    const line = /run-background-matching-browser-smoke\.js:(\d+):\d+/u.exec(error?.stack ?? '')?.[1];
    const category = error?.code === 'ERR_ASSERTION' ? 'assertion' : error instanceof SyntaxError ? 'json-syntax' : 'setup-error';
    return `${category}${line ? ` harness-line ${line}` : ''}`;
  }
  function targetKind(target) {
    if (selfUrl(target?.url)) {
      const pathname = new URL(target.url).pathname;
      if (pathname === '/embedding/offscreen.html') return 'own-offscreen';
      if (pathname === '/chromium/popup.html') return 'own-popup';
      return 'own-extension-other';
    }
    return 'other';
  }
  function schedule(work, label, target) {
    const scheduledStage = stage;
    const safeType = ['page', 'iframe', 'other', 'worker', 'service_worker', 'shared_worker'].includes(target?.type) ? target.type : 'unknown';
    const operation = Promise.resolve().then(work).catch(error => {
      if (label === 'target-attach' && target?.detached === true && isTargetSetupCanceled(error)) return;
      if (!closing) errors.push(`Target/request setup failed during ${stage} (scheduled ${scheduledStage}; ${label}; target ${safeType}; kind ${targetKind(target)}; detached ${target?.detached === true}; ready ${target?.ready === true}; ${setupDiagnostic(error)})`);
    });
    tasks.add(operation); operation.finally(() => tasks.delete(operation));
  }
  async function wait(check, label, timeout = 15000) {
    const started = performance.now();
    while (performance.now() - started < timeout) {
      if (errors.length) throw new Error(errors[0]);
      const result = await check(); if (result) return result;
      await sleep(50);
    }
    throw new Error(`Background smoke timeout: ${label} (${stage})`);
  }
  async function evaluate(expression, sessionId = popupSession) {
    const result = await browser.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId, 15000);
    if (result.exceptionDetails) {
      const controls = [...new Set([...expression.matchAll(/#[a-z-]+/gu)].map(match => match[0]))];
      const category = ['Error', 'TypeError', 'ReferenceError', 'SyntaxError'].includes(result.exceptionDetails.exception?.className)
        ? result.exceptionDetails.exception.className : 'evaluation-error';
      throw new Error(`Browser evaluation failed during ${stage} (${category}; controls ${controls.join(',') || 'none'})`);
    }
    return result.result.value;
  }
  const waitExpression = (expression, label, timeout = 15000) => wait(() => evaluate(expression), label, timeout);
  const waitStatus = message => waitExpression(`${STATUS} === ${JSON.stringify(message)}`, 'discussion UI status');
  async function reveal(selector) {
    assert.ok(await evaluate(`(() => {
      const item=document.querySelector(${JSON.stringify(selector)}); if(!item)return false;
      const parents=[]; for(let p=item.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')parents.unshift(p);
      for(const parent of parents)if(!parent.open)parent.querySelector(':scope > summary').click();
      item.scrollIntoView({block:'nearest'});
      return item.getClientRects().length>0 && getComputedStyle(item).visibility!=='hidden';
    })()`), `Visible User-mode control required: ${selector}`);
  }
  async function click(selector) {
    await reveal(selector);
    assert.ok(await evaluate(`(() => { const item=document.querySelector(${JSON.stringify(selector)}); if(!item || item.disabled)return false; item.click();return true; })()`), `Enabled control required: ${selector}`);
  }
  async function input(selector, value) {
    await reveal(selector);
    await evaluate(`(() => {const item=document.querySelector(${JSON.stringify(selector)});item.focus();item.value='';item.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    // Rendering the empty draft may move focus to the shell's current action.
    // Restore the actual field focus before CDP emits the user's text input.
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    await browser.send('Input.insertText', { text: value }, popupSession);
  }
  async function select(selector, value) {
    await reveal(selector);
    await evaluate(`(() => {const item=document.querySelector(${JSON.stringify(selector)});item.value=${JSON.stringify(value)};item.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  }
  async function closePopup() {
    if (!popupTarget) return;
    const targetId = popupTarget; popupTarget = null; popupSession = null;
    await browser.send('Target.closeTarget', { targetId }); targets.delete(targetId);
  }
  async function openPopup() {
    await browser.send('Page.bringToFront', {}, pageSession);
    const url = await evaluate('location.href', pageSession);
    const available = await browser.send('Target.getTargets', { filter: [{ type: 'tab', exclude: false }, { exclude: true }] });
    const tab = available.targetInfos.find(item => item.type === 'tab' && item.url === url);
    assert.ok(tab, 'Actual foreground tab required');
    await browser.send('Extensions.triggerAction', { id: extensionId, targetId: tab.targetId });
    await wait(() => {
      const popup = [...targets.values()].find(item => item.ready && item.url === `chrome-extension://${extensionId}/chromium/popup.html`);
      if (!popup) return false; popupTarget = popup.targetId; popupSession = popup.sessionId; return true;
    }, 'actual extension action popup');
    await waitExpression("!!document.querySelector('#ui-mode-toggle')", 'user presentation mounted');
  }
  async function screenshot(name) {
    // Optional generated evidence of owned synthetic UI only, never an owner profile.
    const destination = process.env.UDL_UI_SCREENSHOT_DIR;
    if (!destination) return;
    assert.ok(path.isAbsolute(destination) && (await lstat(destination)).isDirectory());
    await evaluate('window.scrollTo(0,0)');
    const result = await browser.send('Page.captureScreenshot', { format: 'png' }, popupSession);
    await writeFile(path.join(destination, `${name}.png`), Buffer.from(result.data, 'base64'), { flag: 'wx' });
  }
  async function toolbar(state) {
    const expected = { disconnected: EN.toolbarDisconnected, connected: EN.toolbarConnected, off: EN.toolbarMatchingOff,
      topic: EN.toolbarTopic, shared: EN.toolbarShared, posts: EN.toolbarPosts }[state];
    assert.ok(expected, 'Known toolbar test state');
    await waitExpression(`(async () => {
      const state=await chrome.runtime.sendMessage({target:'page-matching',type:'status'});
      return Number.isSafeInteger(state.currentTabId) &&
        await chrome.action.getTitle({tabId:state.currentTabId})===${JSON.stringify(expected)};
    })()`, `${state} toolbar indication`);
    const currentTab = await evaluate("chrome.runtime.sendMessage({target:'page-matching',type:'status'}).then(state=>state.currentTabId)");
    await wait(() => evaluate(`(() => {
      const evidence=globalThis.__toolbarNativeEvidence??[];
      const effective=evidence.findLast(item=>item.tabId===${JSON.stringify(currentTab)})??evidence.findLast(item=>item.tabId===null);
      return effective?.state===${JSON.stringify(state === 'off' ? 'connected' : state)};
    })()`, toolbarSession), `successful native ${state} icon bitmap`);
  }
  async function observeNativeIcons() {
    const worker = await wait(() => [...targets.values()].find(item => item.ready && item.type === 'service_worker' &&
      item.url === `chrome-extension://${extensionId}/chromium/background.js`), 'toolbar background worker');
    toolbarSession = worker.sessionId;
    await evaluate(`(() => {
      const nativeSetIcon=chrome.action.setIcon;
      globalThis.__toolbarNativeEvidence=[];
      chrome.action.setIcon=async function(details) {
        const records=[16,32].map(size=>details.imageData?.[size]);
        if(records.some((item,index)=>!item || item.width!==[16,32][index] || item.height!==[16,32][index] || item.data.length!==item.width*item.height*4))throw Error('Invalid test bitmap');
        const palette={disconnected:[220,38,38],connected:[100,116,139],topic:[22,163,74],shared:[56,189,248],posts:[29,78,216]};
        const matches=Object.entries(palette).filter(([,rgb])=>records.every(item=>Array.from(item.data).some((value,index)=>index%4===0 && value===rgb[0] && item.data[index+1]===rgb[1] && item.data[index+2]===rgb[2] && item.data[index+3]===255)));
        if(matches.length!==1)throw Error('Unexpected test palette');
        const result=await nativeSetIcon.call(chrome.action,details);
        globalThis.__toolbarNativeEvidence.push({tabId:details.tabId??null,state:matches[0][0]});
        return result;
      };
    })()`, toolbarSession);
  }
  async function navigate(name) {
    await closePopup(); await browser.send('Page.bringToFront', {}, pageSession);
    const url = fixtureUrl(name);
    await browser.send('Page.navigate', { url }, pageSession);
    await wait(() => evaluate(`location.href===${JSON.stringify(url)} && document.readyState==='complete'`, pageSession), 'owned document navigation');
  }
  async function startService(action = 'init') {
    const dependencies = createProcessDependencies();
    capability = changePairing({ filePath: pairingPath, origin: `chrome-extension://${extensionId}`, action });
    application = await startLocalApplication({ databasePath, nextId: dependencies.nextId, now: dependencies.now,
      config: { host: '127.0.0.1', port: 4174, origin: `chrome-extension://${extensionId}`, capability: dependencies.capability },
      pairingPath, alternateRidgeAdapter: bodyMetricOnly ? null : syntheticRidgeAdapter(),
      alternateBodyMetric: bodyMetricOnly ? syntheticBodyMetric() : null });
  }
  async function backend(route) {
    const response = await fetch(API + route, { headers: { Authorization: `Bearer ${capability}`, Origin: `chrome-extension://${extensionId}` },
      redirect: 'error', signal: AbortSignal.timeout(3000) });
    assert.equal(response.status, 200, 'Owned loopback test read must succeed');
    return response.json();
  }
  const catalog = () => backend('/catalog');
  async function source(name, timeout = 90000) {
    return wait(async () => (await catalog()).sources.find(item => item.url === fixtureUrl(name)), `persisted Source ${name}`, timeout);
  }
  async function automatic(name) {
    const persisted = await source(name);
    await openPopup();
    await waitExpression(`document.querySelector('#discussion-source')?.value===${JSON.stringify(persisted.id)} && document.querySelector('#discussion-topic')?.value===${JSON.stringify(persisted.topicId)}`, `automatic Source ${name}`);
    await waitStatus(EN.discussionReady);
    return persisted;
  }
  async function pair(token) {
    await input('#discussion-token', token); await click('#discussion-pair');
    try {
      await waitExpression("document.querySelector('#connection-status')?.dataset.state==='connected' && document.querySelector('#discussion-token')?.value===''", 'UI pairing');
    } catch (error) {
      if (!error.message.startsWith('Background smoke timeout: UI pairing')) throw error;
      const safe = await evaluate(`(async () => {
        let matchingPhase = null;
        try { matchingPhase = (await chrome.runtime.sendMessage({target:'page-matching',type:'status'}))?.phase ?? null; } catch {}
        return {status:document.querySelector('#discussion-status')?.textContent?.slice(0,200) ?? null,
          connection:document.querySelector('#connection-status')?.dataset.state ?? null, matchingPhase};
      })()`);
      throw new Error(`UI pairing did not complete: ${JSON.stringify(safe)}`);
    }
  }
  async function postComment(body = COMMENT) {
    await input('#discussion-body', body); await click('#discussion-submit');
    await waitExpression(`${THREAD}.textContent.includes(${JSON.stringify(body)}) && document.querySelector('#discussion-body').value===''`, 'committed shared comment');
    await waitStatus(EN.discussionReady);
  }
  async function postOrigin(body, expectedUrl) {
    assert.ok(await evaluate(`(() => {
      const card=[...document.querySelectorAll('#local-discussion .discussion-contribution')]
        .find(item=>item.querySelector(':scope > .discussion-body')?.textContent===${JSON.stringify(body)});
      const link=card?.querySelector(':scope > .discussion-actions > a.discussion-source-link');
      return ${expectedUrl === null ? '!link' : `link?.href===${JSON.stringify(expectedUrl)} && link.target==='_blank' && link.rel==='noopener noreferrer' && link.referrerPolicy==='no-referrer'`};
    })()`), 'Post origin matches its own publication context');
  }
  const waitMatching = message => waitExpression(`document.querySelector('#matching-status')?.textContent===${JSON.stringify(message)}`, 'matching UI status');
  async function confirmStart() {
    try { await waitExpression(`(async () => {
      const state=await chrome.runtime.sendMessage({target:'page-matching',type:'status'});
      return state.enabled===true && state.hostAccess===true && state.sessionWindowId!==null &&
        state.sessionWindowId===state.currentWindowId &&
        document.querySelector('#matching-enable')?.getAttribute('data-busy')==='false' &&
        document.querySelector('#matching-consent')?.checked===false;
    })()`, 'confirmed active window session before popup closure'); }
    catch {
      const safe = await evaluate(`(async () => {
        const state=await chrome.runtime.sendMessage({target:'page-matching',type:'status'});
        return {enabled:state.enabled===true,hostAccess:state.hostAccess===true,
          sameWindow:state.sessionWindowId!==null&&state.sessionWindowId===state.currentWindowId,
          hasCurrentWindow:state.currentWindowId!==null,phase:state.phase,
          reason:state.reason,contextReason:state.contextReason,
          busy:document.querySelector('#matching-enable')?.getAttribute('data-busy'),
          connected:document.querySelector('#connection-status')?.dataset.state};
      })()`);
      throw new Error(`Automatic matching did not activate: ${JSON.stringify(safe)}`);
    }
  }
  async function chooseSource(id) {
    await select('#discussion-source', id); await waitStatus(EN.discussionReady);
    await waitExpression(`document.querySelector('#discussion-source')?.value===${JSON.stringify(id)}`, 'manual retained Source selection');
  }
  function inspectApiPayload(request) {
    if (request.method !== 'POST') return;
    assert.equal(typeof request.postData, 'string', 'Inspectable bounded JSON API body required');
    for (const forbidden of [...Object.values(TEXTS), FALLBACK_PARAGRAPH, PRIVATE_SENTINEL]) assert.ok(!request.postData.includes(forbidden), 'Captured text must never enter a backend request');
    const payload = JSON.parse(request.postData);
    const url = new URL(request.url);
    if (url.pathname === '/v1/sources/ingest') {
      assert.deepEqual(Object.keys(payload).sort(), ['embedding', 'expected', 'extractorVersion', 'operationId', 'title', 'url']);
      assert.deepEqual(Object.keys(payload.embedding).sort(), ['modelId', 'values']);
      assert.equal(payload.embedding.modelId, 'e5-small-q8-browser-main-prefix-v1');
      assert.equal(payload.embedding.values.length, 384);
      assert.ok(payload.embedding.values.every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(...payload.embedding.values) - 1) < 1e-6);
      assert.equal(payload.extractorVersion, payload.url === fixtureUrl('generic') ? 'article-container-prefix/v1' : 'main-text-prefix/v1');
      assert.ok(['a', 'b', 'c', 'd', 'metadata', 'semantic', 'generic'].some(name => fixtureUrl(name) === payload.url), 'Only eligible owned articles may ingest');
      assert.ok(typeof payload.title === 'string' && payload.title.length <= 200);
      assert.equal(payload.title, /<title>([^<]+)<\/title>/u.exec(FIXTURES.get(payload.url))[1], 'Only the exact owned fixture title may enter ingestion');
      ingestions.push({ url: payload.url, fields: Object.keys(payload).sort(), dimensions: 384, extractorVersion: payload.extractorVersion });
    }
  }
  try {
    browser = launchChromiumPipe({ executable, profileDirectory: path.join(directory, 'profile') });
    deadline = setTimeout(stop, 240000);
    progress = setInterval(() => process.stdout.write(`${JSON.stringify({ stage, ingestions: ingestions.length, interceptedDocuments })}\n`), 15000);
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    browser.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
      const target = { ...targetInfo, sessionId, ready: false, detached: false, setupLifetime: createTargetSetupLifetime() };
      targets.set(targetInfo.targetId, target); sessionTargets.set(sessionId, target);
      if (['worker', 'service_worker', 'shared_worker'].includes(targetInfo.type)) workers.push(target);
      schedule(async () => {
        const setup = (method, params) => target.setupLifetime.step(() => browser.send(method, params, sessionId));
        if (stage === 'prepare-native-session-permission' && permissionPreparationTarget &&
            targetInfo.targetId === await permissionPreparationTarget) {
          await setup('Runtime.runIfWaitingForDebugger', {});
          target.setupLifetime.complete(); target.ready = true; return;
        }
        await setup('Runtime.enable', {}); await setup('Network.enable', {});
        if (['worker', 'shared_worker'].includes(targetInfo.type)) await setup('Network.setBlockedURLs', { urls: ['http://*', 'https://*', 'ws://*', 'wss://*', 'ftp://*', 'file://*'] });
        try { await setup('Fetch.enable', { patterns: [{ urlPattern: '*' }] }); }
        catch (error) { if (!['worker', 'shared_worker'].includes(targetInfo.type) || !error.message.includes('Fetch.enable (code -32601)')) throw error; }
        await setup('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: CHILD_FILTER });
        await setup('Runtime.runIfWaitingForDebugger', {});
        target.setupLifetime.complete(); target.ready = true;
      }, 'target-attach', target);
    });
    browser.on('Target.targetInfoChanged', ({ targetInfo }) => { const target = targets.get(targetInfo.targetId); if (target) Object.assign(target, targetInfo); });
    browser.on('Target.detachedFromTarget', ({ sessionId }) => {
      const detached = sessionTargets.get(sessionId);
      if (detached) { detached.detached = true; detached.setupLifetime.detach(); }
      // Keep the session reference for setup diagnostics even if this target ID
      // was replaced or explicitly removed from the live lookup by popup close.
      for (const [id, target] of targets) if (target.sessionId === sessionId) targets.delete(id);
    });
    browser.on('Runtime.exceptionThrown', (_, sessionId) => { const target = [...targets.values()].find(item => item.sessionId === sessionId); if (selfUrl(target?.url)) runtimeExceptions++; });
    browser.on('Network.requestWillBeSent', ({ request }, sessionId) => {
      const target = [...targets.values()].find(item => item.sessionId === sessionId);
      const relatedSourceId = apiUrl(request.url) && request.url.endsWith('/related') && request.method === 'POST'
        ? JSON.parse(request.postData).sourceId : null;
      requests.push({ context: target?.url, url: request.url, method: request.method, relatedSourceId });
    });
    browser.on('Network.loadingFinished', ({ requestId }, sessionId) => {
      if (delayedAlternate?.networkId === requestId && delayedAlternate.sessionId === sessionId) delayedAlternate.finished = true;
    });
    browser.on('Fetch.requestPaused', ({ requestId, request, resourceType, networkId }, sessionId) => schedule(async () => {
      await identityReady;
      const target = [...targets.values()].find(item => item.sessionId === sessionId);
      if (selfUrl(request.url)) await browser.send('Fetch.continueRequest', { requestId }, sessionId);
      else if (selfUrl(target?.url) && apiUrl(request.url)) {
        inspectApiPayload(request);
        if (delayedAlternate?.url === request.url && targetKind(target) === 'own-popup' && !delayedAlternate.ready) {
          const delayed = delayedAlternate;
          delayed.networkId = networkId; delayed.sessionId = sessionId;
          delayed.ready = true;
          await delayed.released;
          await browser.send('Fetch.fulfillRequest', { requestId, responseCode: 200,
            responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
            body: Buffer.from(JSON.stringify(delayed.response)).toString('base64') }, sessionId);
        } else await browser.send('Fetch.continueRequest', { requestId }, sessionId);
      } else if (resourceType === 'Document' && FIXTURES.has(request.url)) {
        interceptedDocuments++;
        await browser.send('Fetch.fulfillRequest', { requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: Buffer.from(FIXTURES.get(request.url)).toString('base64') }, sessionId);
      } else await browser.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, sessionId);
    }, 'request-interception', sessionTargets.get(sessionId)));
    const version = await browser.send('Browser.getVersion');
    await browser.send('Target.setDiscoverTargets', { discover: true });
    await browser.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: ROOT_FILTER });
    extensionId = (await browser.send('Extensions.loadUnpacked', { path: BROWSER_ROOT })).id;
    resolveIdentity(); assert.match(extensionId, /^[a-p]{32}$/u);
    await startService();
    const page = await wait(() => [...targets.values()].find(item => item.ready && item.url === 'about:blank'), 'owned foreground page');
    pageSession = page.sessionId;
    await observeNativeIcons();
    stage = 'prepare-native-session-permission';
    let resolvePreparation;
    permissionPreparationTarget = new Promise(resolve => { resolvePreparation = resolve; });
    try { await prepareSessionPermission(browser, extensionId, { onTargetCreated: resolvePreparation }); }
    finally { resolvePreparation(null); permissionPreparationTarget = null; }
    stage = 'pairing-and-session-consent';
    await navigate('a'); await openPopup(); await waitStatus(EN.discussionDisconnected);
    assert.equal(await evaluate("document.body.dataset.uiMode"), 'user');
    assert.equal(await evaluate("document.querySelector('#connection-status').dataset.state"), 'disconnected');
    await toolbar('disconnected');
    await screenshot('user-disconnected');
    await pair(capability);
    await waitExpression("document.querySelector('#connection-status').dataset.state==='connected'", 'honest paired connection indicator');
    await toolbar('off');
    await waitExpression(`document.querySelector('#matching-origin').textContent===${JSON.stringify(ORIGIN)}`, 'eligible disclosed origin');
    // In the disposable profile, exercise Chrome's real optional-permission
    // grant from a user gesture. The management API above only prepares its
    // otherwise unautomated native dialog; capture then auto-starts.
    assert.equal(await evaluate("(async () => chrome.permissions.request({origins:['https://*/*']}))()"), true);
    await confirmStart(); await closePopup();
    stage = 'popup-closed-first-inference';
    const a = await automatic('a');
    assert.equal(a.provenance, 'owner-local-page-embedding/v1');
    await toolbar('topic');
    assert.equal(await evaluate("document.querySelector('#discussion-topic').selectedOptions[0].textContent"), (await catalog()).topics.find(topic => topic.id === a.topicId).title);
    if (!targetedOnly) {
      await input('#discussion-body', COMMENT);
      await click('#app-settings-button');
      await click('#ui-mode-developer'); await click('#ui-mode-user');
      await click('#app-settings-back');
      assert.equal(await evaluate("document.querySelector('#discussion-body').value"), COMMENT);
      assert.equal(await evaluate("document.querySelector('#ui-mode-user').getAttribute('aria-pressed')"), 'true');
      checks.push('default-user-connection-topic-and-draft-preserving-mode-switch');
    } else checks.push('default-user-connection-and-current-topic');
    await postComment(); checks.push('actual-pairing-session-consent', 'popup-closed-capture-inference-ingestion', 'comment-on-page-a');
    await postOrigin(COMMENT, fixtureUrl('a'));
    await toolbar('topic'); // A lone learned page remains green even with posts.
    stage = 'shared-topic-on-paraphrase';
    await navigate('b'); const b = await automatic('b');
    assert.equal(b.topicId, a.topicId);
    assert.ok(await evaluate(`${THREAD}.textContent.includes(${JSON.stringify(COMMENT)})`));
    await toolbar('posts');
    await screenshot('user-shared-topic');
    stage = 'alternate-source-view-and-reversible-switch';
    // The freshly installed profile must activate Ridge Topic matching without
    // any click. A legacy BODY service is accepted as a DTO but never shown as
    // the new standard.
    await waitExpression(`document.querySelector('#app-topic-view-status')?.dataset.state===${JSON.stringify(bodyMetricOnly ? 'unavailable' : 'active')}`,
      'fresh default Topic matching or truthful legacy fallback');
    assert.equal(await evaluate("document.querySelector('#app-topic-view-experimental').getAttribute('aria-pressed')"), 'true');
    const defaultAlternateRequests = requests.filter(request => selfUrl(request.context) && apiUrl(request.url) && request.url.endsWith('/alternate-discussion'));
    assert.ok(defaultAlternateRequests.some(request => request.url === `${API}/sources/${b.id}/alternate-discussion`),
      'Default Topic matching must read the current page Source B');
    checks.push(bodyMetricOnly ? 'legacy-body-dto-falls-back-to-canonical-with-truthful-status' : 'fresh-default-ridge-source-b-view');
    const canonicalBeforeSwitch = await backend(`/topics/${b.topicId}/discussion`);
    const catalogBeforeSwitch = await catalog();
    const writesBeforeSwitch = requests.filter(request => apiUrl(request.url) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)).length;
    const alternateRequestsBeforeSwitch = requests.filter(request => apiUrl(request.url) && request.url.endsWith('/alternate-discussion')).length;
    await input('#discussion-body', SWITCH_DRAFT);
    await click('#app-settings-button');
    await click('#app-topic-view-experimental');
    await waitExpression(`document.querySelector('#app-topic-view-status')?.dataset.state===${JSON.stringify(bodyMetricOnly ? 'unavailable' : 'active')}`,
      'source-scoped alternate view or canonical fallback');
    const alternateRequests = requests.filter(request => selfUrl(request.context) && apiUrl(request.url) && request.url.endsWith('/alternate-discussion'));
    assert.ok(alternateRequests.length > alternateRequestsBeforeSwitch, 'Switch must cause an actual extension alternate read');
    assert.equal(alternateRequests.at(-1).url, `${API}/sources/${b.id}/alternate-discussion`, 'Alternate read must bind the current page Source B');
    const alternate = await backend(`/sources/${b.id}/alternate-discussion`);
    assert.equal(alternate.sourceId, b.id);
    assert.ok(alternate.sourceIds.includes(b.id));
    assert.ok(alternate.roots.some(root => root.body === COMMENT));
    assert.deepEqual(alternate.version, catalogBeforeSwitch.version);
    assert.equal(alternate.canonical.topic.id, b.topicId);
    assert.equal(alternate.canonical.discussionId, canonicalBeforeSwitch.discussionId);
    if (bodyMetricOnly) {
      assert.equal(alternate.representation, 'owner-local-body-topic-metric/v1');
      assert.equal(alternate.policyVersion, 'alternate-indexed-body-metric/v1');
      checks.push('fabricated-identity-body-metric-exact-policy-and-source-dto');
    } else {
      assert.equal(alternate.representation, 'owner-local-linear-teacher-transfer/ridge1-v1');
      assert.equal(alternate.policyVersion, 'ridge1-qualified-complete-link/v1');
      checks.push('fabricated-identity-ridge-exact-policy-and-source-dto');
    }
    await click('#app-settings-back');
    assert.equal(await evaluate("document.querySelector('#discussion-source').value"), b.id);
    assert.equal(await evaluate("document.querySelector('#discussion-body').value"), SWITCH_DRAFT);
    assert.ok(await evaluate(`${THREAD}.textContent.includes(${JSON.stringify(COMMENT)})`));
    await postOrigin(COMMENT, fixtureUrl('a'));
    await click('#app-settings-button');
    await click('#app-topic-view-classic');
    await waitExpression("document.querySelector('#app-topic-view-status')?.dataset.state==='current'", 'canonical view restored');
    await click('#app-settings-back');
    assert.equal(await evaluate("document.querySelector('#discussion-source').value"), b.id);
    assert.equal(await evaluate("document.querySelector('#discussion-body').value"), SWITCH_DRAFT);
    assert.ok(await evaluate(`${THREAD}.textContent.includes(${JSON.stringify(COMMENT)})`));
    assert.deepEqual(await backend(`/topics/${b.topicId}/discussion`), canonicalBeforeSwitch);
    assert.deepEqual(await catalog(), catalogBeforeSwitch);
    assert.equal(requests.filter(request => apiUrl(request.url) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)).length, writesBeforeSwitch, 'View switches and private draft must not write posts or change membership');
    assert.equal((await source('b')).topicId, b.topicId);
    await postOrigin(COMMENT, fixtureUrl('a'));
    if (targetedOnly) {
      stage = 'delayed-alternate-response-after-legacy-switch';
      let release;
      const released = new Promise(resolve => { release = resolve; });
      delayedAlternate = { url: `${API}/sources/${b.id}/alternate-discussion`,
        response: alternate, ready: false, released, release };
      // Deliver the actual synthetic backend DTO after Legacy E5 was selected.
      // Mode switching does not cancel fetch; the stale result must be ignored.
      await click('#app-settings-button');
      await click('#app-topic-view-experimental');
      await wait(() => delayedAlternate.ready, 'held Source-B alternate browser request');
      await click('#app-topic-view-classic');
      await waitExpression("document.querySelector('#app-topic-view-status')?.dataset.state==='current'", 'Legacy E5 while alternate request is pending');
      const statusBeforeStale = await evaluate("document.querySelector('#app-topic-view-status').textContent");
      delayedAlternate.release();
      await wait(() => delayedAlternate.finished, 'delayed Source-B response completed in browser');
      await evaluate('new Promise(resolve=>setTimeout(()=>setTimeout(resolve,0),0))');
      assert.equal(await evaluate("document.querySelector('#app-topic-view-status').dataset.state"), 'current');
      assert.equal(await evaluate("document.querySelector('#app-topic-view-status').textContent"), statusBeforeStale);
      assert.equal(await evaluate("document.querySelector('#discussion-source').value"), b.id);
      // Exercise fresh Source-selection epochs through visible developer controls.
      const requestsBeforeSourceEpochs = requests.length;
      await click('#ui-mode-developer');
      await chooseSource(a.id);
      await chooseSource(b.id);
      await click('#ui-mode-user');
      await click('#app-settings-button');
      assert.equal(await evaluate("document.querySelector('#app-topic-view-status').dataset.state"), 'current');
      await click('#app-settings-back');
      assert.equal(await evaluate("document.querySelector('#discussion-body').value"), SWITCH_DRAFT);
      await postOrigin(COMMENT, fixtureUrl('a'));
      assert.deepEqual(await catalog(), catalogBeforeSwitch);
      assert.deepEqual(await backend(`/topics/${b.topicId}/discussion`), canonicalBeforeSwitch);
      const sourceEpochPosts = requests.slice(requestsBeforeSourceEpochs)
        .filter(request => apiUrl(request.url) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method));
      // Source selection performs exactly two source-bound /related reads,
      // whose read-only HTTP endpoint uses POST. Neither is a canonical write.
      assert.deepEqual(sourceEpochPosts.map(request => ({ url: request.url, method: request.method, sourceId: request.relatedSourceId })),
        [a.id, b.id].map(sourceId => ({ url: `${API}/related`, method: 'POST', sourceId })));
      assert.equal(requests.filter(request => apiUrl(request.url) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)).length,
        writesBeforeSwitch + sourceEpochPosts.length);
      delayedAlternate = null;
      checks.push('delayed-alternate-response-cannot-reactivate-topic-matching-after-legacy-switch');
      checks.push('legacy-view-preserved-across-fresh-source-selection-epochs');
    }
    await input('#discussion-body', '');
    await waitExpression("chrome.storage.session.get('topicViewModeV2').then(value=>value.topicViewModeV2==='classic')",
      'Legacy E5 browser-session override committed');
    await closePopup(); await openPopup();
    await waitExpression(`document.querySelector('#app-topic-view-status')?.dataset.state==='current' &&
      document.querySelector('#app-topic-view-classic')?.getAttribute('aria-pressed')==='true' &&
      document.querySelector('#discussion-source')?.value===${JSON.stringify(b.id)} &&
      ${STATUS}===${JSON.stringify(EN.discussionReady)}`,
      'Legacy E5 and Source B restored after popup close and reopen');
    assert.equal(await evaluate("document.querySelector('#discussion-source').value"), b.id);
    checks.push('legacy-e5-session-override-survives-popup-close-and-reopen');
    checks.push('actual-alternate-source-view-and-reversible-current-switch');
    checks.push('source-bound-alternate-read-preserves-private-draft-source-links-and-canonical-posts');
    if (targetedOnly) {
      // End the real window lease before checking settled request protection.
      await evaluate("chrome.runtime.sendMessage({target:'page-matching',type:'stop-session'})");
      await wait(() => tasks.size === 0, 'settled targeted alternate tasks', 5000);
      const externalExtensionRequests = requests.filter(request => selfUrl(request.context) && !selfUrl(request.url) && !apiUrl(request.url)).length;
      assert.equal(externalExtensionRequests, 0); assert.equal(runtimeExceptions, 0);
      return { browser: version.product, result: 'PASS', actualActionPopup: true, checks,
        vectorsSent: ingestions.length, vectorDimensions: 384, externalExtensionRequests,
        runtimeExceptions, interceptedDocuments, elapsedMs: performance.now() - began,
        scope: `Targeted alternate view; owned intercepted articles; disposable profile/pairing/SQLite; ${bodyMetricOnly ? 'fabricated zero-mean identity BODY metric' : 'fabricated zero-mean identity Ridge1 adapter'}; no provider calls` };
    }
    checks.push('toolbar-dark-blue-requires-distinct-learned-peer-and-visible-post');
    const capturesBeforeWithdraw = ingestions.length;
    await evaluate(`Array.from(document.querySelectorAll('#local-discussion .discussion-thread button')).find(button=>button.textContent===${JSON.stringify(EN.discussionWithdraw)}).click()`);
    await waitExpression(`!${THREAD}.textContent.includes(${JSON.stringify(COMMENT)})`, 'withdrawn post no longer visible');
    await waitStatus(EN.discussionReady);
    await toolbar('shared');
    assert.equal(ingestions.length, capturesBeforeWithdraw);
    await postComment();
    await postOrigin(COMMENT, fixtureUrl('b'));
    await toolbar('posts');
    assert.equal(ingestions.length, capturesBeforeWithdraw);
    checks.push('toolbar-light-blue-on-deleted-only-and-dark-blue-on-new-post-without-recapture');
    checks.push('second-HTTPS-origin-shares-topic-and-comment-without-new-grant');
    stage = 'unrelated-page-separation';
    await navigate('c'); const c = await automatic('c');
    assert.notEqual(c.topicId, a.topicId);
    assert.ok(await evaluate(`!${THREAD}.textContent.includes(${JSON.stringify(COMMENT)})`));
    await toolbar('topic');
    checks.push('page-c-stays-separate');
    stage = 'stop-and-new-explicit-session';
    await click('#matching-pause'); await waitMatching(EN.matchingOff);
    await toolbar('off');
    const pausedCount = ingestions.length;
    await navigate('d'); await openPopup(); await waitMatching(EN.matchingOff);
    // Longer than the production debounce, without supplying a capture/retry command.
    await sleep(800);
    assert.ok(!(await catalog()).sources.some(item => item.url === fixtureUrl('d')));
    assert.equal(ingestions.length, pausedCount);
    checks.push('stop-prevents-new-capture');
    await click('#matching-enable'); await confirmStart(); await closePopup(); const d = await automatic('d');
    assert.equal(d.topicId, a.topicId); checks.push('new-explicit-session-captures-current-page');
    stage = 'generic-fallback-shares-semantic-topic';
    await navigate('semantic'); const semantic = await automatic('semantic');
    await postComment(FALLBACK_COMMENT);
    await navigate('generic'); const generic = await automatic('generic');
    assert.equal(generic.topicId, semantic.topicId);
    assert.ok(await evaluate(`${THREAD}.textContent.includes(${JSON.stringify(FALLBACK_COMMENT)})`));
    await toolbar('posts');
    assert.ok(ingestions.some(item => item.url === fixtureUrl('generic') && item.extractorVersion === 'article-container-prefix/v1'));
    checks.push('generic-container-embeds-in-existing-space-and-shares-comment-with-semantic-region');
    stage = 'metadata-bearing-page-accepted';
    await navigate('metadata'); const metadata = await automatic('metadata');
    assert.equal(metadata.provenance, 'owner-local-page-embedding/v1');
    assert.ok(ingestions.some(item => item.url === fixtureUrl('metadata')));
    checks.push('metadata-bearing-page-captures-and-ingests-without-raw-text');
    stage = 'form-context-excluded';
    const count = ingestions.length;
    await navigate('forms'); await openPopup(); await waitMatching(EN.matchingUnsupportedRegion);
    await waitExpression("document.querySelector('#matching-detail')?.textContent==='[missing-region]'", 'specific form exclusion diagnostic');
    assert.ok(!(await catalog()).sources.some(item => item.url === fixtureUrl('forms')));
    assert.equal(ingestions.length, count);
    checks.push('form-page-has-no-ingestion-and-shows-missing-region');
    stage = 'sqlite-restart-and-new-pairing';
    await click('#matching-pause'); await waitMatching(EN.matchingOff);
    await chooseSource(b.id);
    await application.close(); application = null; await startService('rotate');
    await click('#discussion-reload'); await waitStatus(EN.discussionUnauthorized);
    assert.equal(await evaluate("document.querySelector('#connection-status').dataset.state"), 'disconnected');
    await toolbar('disconnected');
    await pair(capability); await chooseSource(b.id);
    // A manual Topic selection while capture is stopped is not current-page evidence.
    await toolbar('off');
    assert.ok(await evaluate(`${THREAD}.textContent.includes(${JSON.stringify(COMMENT)})`));
    assert.equal((await source('b')).topicId, a.topicId);
    checks.push('sqlite-comment-survives-restart-and-new-pairing');
    await postOrigin(COMMENT, fixtureUrl('b'));
    await chooseSource(a.id);
    const rootedOnB = await evaluate(`(() => {
      const card=[...document.querySelectorAll('#local-discussion .discussion-contribution')]
        .find(item=>item.querySelector(':scope > .discussion-body')?.textContent===${JSON.stringify(COMMENT)});
      return card?.querySelector('[data-action=reply]')?.dataset.contributionId;
    })()`);
    assert.ok(rootedOnB);
    await click(`[data-action=reply][data-contribution-id="${rootedOnB}"]`);
    await postComment(CROSS_PAGE_REPLY);
    await postOrigin(COMMENT, fixtureUrl('b'));
    await postOrigin(CROSS_PAGE_REPLY, fixtureUrl('a'));
    checks.push('each-post-has-own-source-link-while-reply-follows-root');
    await chooseSource(generic.id);
    assert.equal((await source('generic')).topicId, semantic.topicId);
    assert.equal((await source('semantic')).topicId, semantic.topicId);
    assert.ok(await evaluate(`${THREAD}.textContent.includes(${JSON.stringify(FALLBACK_COMMENT)})`));
    checks.push('mixed-capture-policy-topic-and-comment-survive-sqlite-restart');
    const demo = (await catalog()).sources.find(item => item.provenance !== 'owner-local-page-embedding/v1');
    assert.ok(demo, 'Demo Source remains separate from learned data');
    await chooseSource(demo.id); await postComment(DEMO_COMMENT);
    stage = 'explicit-source-correction-and-forget';
    await chooseSource(b.id); await select('#discussion-correction-topic', '');
    await click('#discussion-correction-confirm'); await click('#discussion-correct');
    const corrected = await wait(async () => {
      const item = (await catalog()).sources.find(item => item.id === b.id);
      return item && item.topicId !== a.topicId ? item : false;
    }, 'confirmed separate Topic correction');
    await waitStatus(EN.discussionReady);
    assert.ok(await evaluate(`${THREAD}.textContent.includes(${JSON.stringify(COMMENT)}) && ${THREAD}.textContent.includes(${JSON.stringify(CROSS_PAGE_REPLY)}) && ${THREAD}.textContent.includes(${JSON.stringify(EN.discussionRegrouped)})`));
    await postOrigin(COMMENT, fixtureUrl('b'));
    await postOrigin(CROSS_PAGE_REPLY, fixtureUrl('a'));
    await chooseSource(a.id);
    assert.ok(await evaluate(`!${THREAD}.textContent.includes(${JSON.stringify(COMMENT)}) && !${THREAD}.textContent.includes(${JSON.stringify(CROSS_PAGE_REPLY)})`));
    await chooseSource(b.id); await click('#discussion-forget');
    await wait(async () => !(await catalog()).sources.some(item => item.id === b.id), 'forgotten learned Source');
    assert.ok((await catalog()).topics.some(item => item.id === corrected.topicId));
    await wait(() => evaluate(`[${JSON.stringify(EN.discussionReady)},${JSON.stringify(EN.uiTopicAwaitingPage)}].includes(${STATUS})`), 'fresh catalog after Forget');
    await select('#discussion-topic', corrected.topicId); await waitStatus(EN.discussionReady);
    assert.ok(await evaluate(`${THREAD}.textContent.includes(${JSON.stringify(COMMENT)})`));
    await postOrigin(COMMENT, null);
    await postOrigin(CROSS_PAGE_REPLY, fixtureUrl('a'));
    checks.push('confirmed-correction-moves-complete-source-anchored-thread', 'forget-pins-thread-and-purges-only-forgotten-source-links');
    stage = 'confirmed-topic-delete-and-clear';
    await chooseSource(c.id);
    assert.ok(await evaluate("document.querySelector('#discussion-delete').disabled"));
    await input('#discussion-delete-confirmation', 'DELETE TOPIC AND DISCUSSION'); await click('#discussion-delete');
    await wait(async () => !(await catalog()).topics.some(item => item.id === c.topicId), 'confirmed learned Topic deletion');
    assert.ok(!(await catalog()).sources.some(item => item.id === c.id));
    await wait(() => evaluate(`[${JSON.stringify(EN.discussionReady)},${JSON.stringify(EN.uiTopicAwaitingPage)}].includes(${STATUS})`), 'fresh catalog after delete');
    await chooseSource(a.id);
    assert.ok(await evaluate("document.querySelector('#discussion-clear').disabled"));
    await input('#discussion-clear-confirmation', 'CLEAR LEARNED DATA'); await click('#discussion-clear');
    await wait(async () => !(await catalog()).sources.some(item => item.provenance === 'owner-local-page-embedding/v1'), 'confirmed learned data clear');
    await wait(() => evaluate(`[${JSON.stringify(EN.discussionReady)},${JSON.stringify(EN.uiTopicAwaitingPage)}].includes(${STATUS})`), 'fresh catalog after clear');
    await chooseSource(demo.id);
    assert.ok(await evaluate(`${THREAD}.textContent.includes(${JSON.stringify(DEMO_COMMENT)})`));
    assert.ok(!(await catalog()).topics.some(item => item.learned === true));
    assert.ok(!(await catalog()).topics.some(item => [a.topicId, c.topicId, corrected.topicId].includes(item.id)));
    checks.push('confirmed-delete-removes-learned-topic-and-sources', 'confirmed-clear-preserves-demo-comment');
    await click('#matching-block');
    await waitExpression("document.querySelectorAll('[data-unblock-origin]').length===1", 'blocked site retained');
    await click(`[data-unblock-origin="${ORIGIN}"]`);
    await waitExpression("document.querySelectorAll('[data-unblock-origin]').length===0", 'site unblocked');
    await click('#matching-remove-access');
    await waitExpression(`(async () => {
      const state=await chrome.runtime.sendMessage({target:'page-matching',type:'status'});
      return state.hostAccess===false && state.enabled===false && state.sessionWindowId===null &&
        document.querySelector('#matching-access')?.textContent===${JSON.stringify(EN.matchingAccessAbsent)} &&
        document.querySelector('#matching-remove-access')?.getAttribute('data-busy')==='false';
    })()`, 'confirmed stopped session and removed broad access');
    assert.equal(await evaluate("chrome.permissions.contains({origins:['https://*/*']})"), false);
    checks.push('block-unblock-site-and-remove-native-access');
    // Finish all work queued before PASS while setup failures still fail closed.
    // Capture is authoritatively stopped and access removed above.
    await wait(() => tasks.size === 0, 'settled target/request tasks before summary', 5000);
    await sleep(0);
    if (errors.length) throw new Error(errors[0]);
    const externalExtensionRequests = requests.filter(request => selfUrl(request.context) && !selfUrl(request.url) && !apiUrl(request.url)).length;
    assert.equal(externalExtensionRequests, 0); assert.equal(runtimeExceptions, 0);
    assert.ok(ingestions.length >= 5);
    assert.ok(workers.some(worker => selfUrl(worker.url) && worker.type === 'worker'));
    return { browser: version.product, result: 'PASS', actualActionPopup: true, checks,
      vectorsSent: ingestions.length, vectorDimensions: 384, fixtureRawTextBodyMatches: 0,
      abandonedSetup: [...sessionTargets.values()].filter(target => target.setupLifetime.abandoned).length,
      externalExtensionRequests, runtimeExceptions, interceptedDocuments, elapsedMs: performance.now() - began,
      scope: 'Owned intercepted articles only; fresh temporary profile/SQLite; no third-party browsing or global browser firewall claim' };
  } finally {
    delayedAlternate?.release();
    closing = true; resolveIdentity(); clearTimeout(deadline); clearInterval(progress);
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    try { await browser?.close(); } finally {
      try { await application?.close(); } finally {
        await Promise.allSettled([...tasks]);
        assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(directory).startsWith('udl-background-smoke-'));
        await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBackgroundMatchingBrowserSmoke(process.argv[2]?.startsWith('--') ? undefined : process.argv[2],
    { alternateOnly: process.argv.includes('--alternate-only'), ridgeOnly: process.argv.includes('--ridge-only'),
      bodyMetricOnly: process.argv.includes('--body-metric-only') }).then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
