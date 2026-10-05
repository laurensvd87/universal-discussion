import { lstat, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPageContent } from '../../../../spikes/topic-resolution/browser/chromium/page-content-reader.js';
import { launchChromiumPipe } from '../../../../spikes/topic-resolution/harness/chromium-pipe.js';
import { pilotUrl } from './capture.js';
import { launchPilotPipe } from './pilot-pipe.js';

const BROWSER_ROOT = fileURLToPath(new URL('../../../../spikes/topic-resolution/browser/', import.meta.url));
const FILTER = ['page', 'iframe', 'other', 'worker', 'service_worker', 'shared_worker']
  .map(type => ({ type, exclude: false })).concat({ exclude: true });
const CHILD_FILTER = FILTER.filter(item => item.type !== 'service_worker');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// fixtureHtml is test-only, fulfilled locally under Chrome's DNS-blocked pipe.
// The public path performs exactly one document navigation; all subresources,
// redirects, extension-origin egress and additional document loads are denied.
export async function runChromeCapture({ executable, url, fixtureHtml, fixtureRedirectUrl,
  usePilotPipeForFixture = false } = {}) {
  const fixture = fixtureHtml !== undefined;
  if (fixture) {
    if (typeof fixtureHtml !== 'string' || fixtureHtml.length > 16384 ||
        url !== 'http://127.0.0.1:4173/background-fixture/r5-pilot.html') throw new TypeError('Invalid local fixture');
  } else pilotUrl(url);
  if (typeof executable !== 'string' || !path.isAbsolute(executable) || !(await lstat(executable)).isFile())
    throw new TypeError('Absolute installed Chrome executable required');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'udl-r5-pilot-'));
  let browser;
  try {
    browser = fixture && !usePilotPipeForFixture
      ? launchChromiumPipe({ executable, profileDirectory: path.join(directory, 'profile') })
      : launchPilotPipe({ executable, profileDirectory: path.join(directory, 'profile') });
  } catch (error) {
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) ||
        !path.basename(directory).startsWith('udl-r5-pilot-')) throw new Error('Temporary profile cleanup target invalid');
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  const targets = new Map(), tasks = new Set(), errors = [];
  let extensionId, documentRequests = 0, blockedRequests = 0, documentResponse, closing = false;
  let resolveIdentity;
  const identityReady = new Promise(resolve => { resolveIdentity = resolve; });
  const timeout = setTimeout(() => { errors.push('Capture deadline exceeded'); void browser.close(); }, 150000);
  function schedule(operation) {
    const task = Promise.resolve().then(operation).catch(() => { if (!closing) errors.push('Browser setup or request failed'); });
    tasks.add(task); task.finally(() => tasks.delete(task));
  }
  async function wait(check, label, duration = 20000) {
    const started = performance.now();
    while (performance.now() - started < duration) {
      if (errors.length) throw new Error(errors[0]);
      try { const result = await check(); if (result) return result; } catch { /* navigation context can be replaced */ }
      await sleep(50);
    }
    throw new Error(`Browser timeout: ${label}`);
  }
  async function evaluate(expression, sessionId, contextId, deadline = 10000) {
    const value = await browser.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, ...(contextId ? { contextId } : {}),
    }, sessionId, deadline);
    if (value.exceptionDetails || !Object.hasOwn(value.result ?? {}, 'value')) throw new Error('Browser evaluation failed');
    return value.result.value;
  }
  try {
    browser.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
      const target = { ...targetInfo, sessionId, ready: false };
      targets.set(targetInfo.targetId, target);
      schedule(async () => {
        await browser.send('Runtime.enable', {}, sessionId);
        await browser.send('Network.enable', {}, sessionId);
        await browser.send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
        if (targetInfo.type !== 'page') await browser.send('Network.setBlockedURLs',
          { urls: ['http://*', 'https://*', 'ws://*', 'wss://*', 'ftp://*', 'file://*'] }, sessionId);
        try { await browser.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId); }
        catch (error) {
          if (!['worker', 'shared_worker'].includes(targetInfo.type) || !error.message.includes('Fetch.enable (code -32601)')) throw error;
        }
        await browser.send('Target.setAutoAttach', {
          autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: CHILD_FILTER,
        }, sessionId);
        await browser.send('Runtime.runIfWaitingForDebugger', {}, sessionId);
        target.ready = true;
      });
    });
    browser.on('Target.targetInfoChanged', ({ targetInfo }) => {
      const target = targets.get(targetInfo.targetId);
      if (target) Object.assign(target, targetInfo);
    });
    browser.on('Target.detachedFromTarget', ({ sessionId }) => {
      for (const [id, target] of targets) if (target.sessionId === sessionId) targets.delete(id);
    });
    browser.on('Network.responseReceived', ({ type, response }, sessionId) => {
      const target = [...targets.values()].find(item => item.sessionId === sessionId);
      if (target?.initialPilotPage && type === 'Document' && response?.url === url) {
        documentResponse = { status: response.status, mimeType: response.mimeType };
      }
    });
    browser.on('Fetch.requestPaused', ({ requestId, request, resourceType }, sessionId) => schedule(async () => {
      await identityReady;
      const target = [...targets.values()].find(item => item.sessionId === sessionId);
      const extensionRoot = `chrome-extension://${extensionId}/`;
      const ownAsset = typeof request.url === 'string' && request.url.startsWith(extensionRoot) &&
        (target?.url?.startsWith(extensionRoot) ||
          request.url === `${extensionRoot}embedding/smoke.html`);
      if (ownAsset) return browser.send('Fetch.continueRequest', { requestId }, sessionId);
      const oneDocument = target?.type === 'page' && target.initialPilotPage === true &&
        resourceType === 'Document' && request.url === url && documentRequests++ === 0;
      if (oneDocument && fixture) return browser.send('Fetch.fulfillRequest', {
        requestId, responseCode: fixtureRedirectUrl ? 302 : 200,
        responseHeaders: fixtureRedirectUrl
          ? [{ name: 'Location', value: fixtureRedirectUrl }]
          : [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
        ...(fixtureRedirectUrl ? {} : { body: Buffer.from(fixtureHtml).toString('base64') }),
      }, sessionId);
      if (oneDocument) return browser.send('Fetch.continueRequest', { requestId }, sessionId);
      blockedRequests++;
      if (target?.initialPilotPage && resourceType === 'Document') errors.push('Redirect blocked');
      return browser.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, sessionId);
    }));
    await browser.send('Browser.getVersion');
    await browser.send('Target.setDiscoverTargets', { discover: true });
    await browser.send('Target.setAutoAttach', { autoAttach: true,
      waitForDebuggerOnStart: true, flatten: true, filter: FILTER });
    extensionId = (await browser.send('Extensions.loadUnpacked', { path: BROWSER_ROOT })).id;
    resolveIdentity();
    if (!/^[a-p]{32}$/u.test(extensionId)) throw new Error('Packaged extension unavailable');
    const page = await wait(() => [...targets.values()].find(item => item.ready && item.type === 'page' && item.url === 'about:blank'), 'blank page');
    page.initialPilotPage = true;
    await browser.send('Page.enable', {}, page.sessionId);
    await browser.send('Page.navigate', { url }, page.sessionId);
    await wait(async () => await evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`, page.sessionId), 'single document', 30000);
    const finalUrl = await evaluate('location.href', page.sessionId);
    if (finalUrl !== url || documentRequests !== 1 || documentResponse?.status !== 200 ||
        documentResponse.mimeType !== 'text/html') throw new Error('Navigation did not retain an eligible document');
    const tree = await browser.send('Page.getFrameTree', {}, page.sessionId);
    const frameId = tree.frameTree?.frame?.id;
    if (typeof frameId !== 'string') throw new Error('Top frame unavailable');
    const world = await browser.send('Page.createIsolatedWorld', { frameId, worldName: 'r5-pilot-read', grantUniveralAccess: false }, page.sessionId);
    const captured = await evaluate(`(${collectPageContent.toString()})(${JSON.stringify(url)})`, page.sessionId, world.executionContextId);
    if (captured?.status !== 'collected') throw new Error('Production reader abstained');
    const { targetId } = await browser.send('Target.createTarget', { url: `chrome-extension://${extensionId}/embedding/smoke.html` });
    const embedPage = await wait(() => targets.get(targetId)?.ready && targets.get(targetId), 'packaged embedding page');
    const expression = `(async () => { const { embedText } = await import('./e5-browser.js'); return embedText(${JSON.stringify(captured.text)}); })()`;
    const embedding = await evaluate(expression, embedPage.sessionId, undefined, 110000);
    return { finalUrl, captured, embedding, documentRequests, blockedRequests };
  } finally {
    closing = true; clearTimeout(timeout); resolveIdentity();
    try { await browser.close(); }
    finally {
      await Promise.allSettled([...tasks]);
      if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) ||
          !path.basename(directory).startsWith('udl-r5-pilot-')) throw new Error('Temporary profile cleanup target invalid');
      await rm(directory, { recursive: true, force: true });
    }
  }
}
