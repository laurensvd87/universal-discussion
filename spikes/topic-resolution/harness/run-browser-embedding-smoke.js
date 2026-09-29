import assert from 'node:assert/strict';
import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromiumPipe } from './chromium-pipe.js';

const BROWSER_ROOT = fileURLToPath(new URL('../browser/', import.meta.url));
const DEFAULT_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FILTER = ['page', 'iframe', 'other', 'worker', 'service_worker', 'shared_worker']
  .map(type => ({ type, exclude: false })).concat({ exclude: true });
const CHILD_FILTER = FILTER.filter(item => item.type !== 'service_worker');
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

// Explicit approved browser execution only. Fresh owned profile, anonymous CDP
// pipes, recursive worker attachment and self-only interception; no backend or
// third-party site is contacted. Results contain aggregate checks, never vectors.
export async function runBrowserEmbeddingSmoke(executable = DEFAULT_CHROME) {
  if (!path.isAbsolute(executable) || !(await lstat(executable)).isFile()) throw new Error('Installed absolute Chrome executable required');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'udl-embedding-smoke-'));
  const targets = new Map();
  const tasks = new Set();
  const errors = [];
  const requests = [];
  const workerTargets = [];
  let resolveIdentity;
  const identityReady = new Promise(resolve => { resolveIdentity = resolve; });
  let browser, extensionId, timer, progress;
  let stage = 'initializing';
  let externalRequests = 0;
  let selfRequests = 0;
  let attachedWorkers = 0;
  let exceptions = 0;
  let closing = false;
  const started = performance.now();
  const stop = () => { void browser?.close(); };
  function schedule(operation) {
    const task = Promise.resolve().then(operation).catch(error => {
      if (!closing) errors.push(error.message);
    });
    tasks.add(task); task.finally(() => tasks.delete(task));
  }
  function selfUrl(url) {
    try { const parsed = new URL(url); return parsed.protocol === 'chrome-extension:' && parsed.host === extensionId; }
    catch { return false; }
  }
  async function wait(check, label, timeout = 15000) {
    const began = performance.now();
    while (performance.now() - began < timeout) {
      if (errors.length) throw new Error(errors[0]);
      const result = await check();
      if (result) return result;
      await sleep(50);
    }
    throw new Error(`Browser embedding smoke timeout: ${label}`);
  }
  async function evaluate(expression, sessionId, timeout = 90000) {
    let pending = true;
    const operation = browser.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId, timeout);
    const setupFailures = (async () => {
      while (pending) {
        if (errors.length) throw new Error(errors[0]);
        await sleep(50);
      }
    })();
    let result;
    try { result = await Promise.race([operation, setupFailures]); }
    finally { pending = false; }
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      const description = details.exception?.description?.slice(0, 1200) ?? details.text;
      throw new Error(`Controlled browser inference failure: ${description}`);
    }
    if (errors.length) throw new Error(errors[0]);
    return result.result.value;
  }
  async function smokePage() {
    const { targetId } = await browser.send('Target.createTarget', { url: `chrome-extension://${extensionId}/embedding/smoke.html` });
    const target = await wait(() => targets.get(targetId)?.ready && targets.get(targetId), 'packaged smoke target');
    await wait(() => evaluate("typeof runEmbeddingSmoke === 'function'", target.sessionId, 10000), 'packaged adapter import');
    return target;
  }
  try {
    browser = launchChromiumPipe({ executable, profileDirectory: path.join(directory, 'profile') });
    timer = setTimeout(stop, 180000);
    progress = setInterval(() => process.stdout.write(`${JSON.stringify({ stage,
      attachedTargets: targets.size, observedWorkerTargets: workerTargets.length,
      observedRequests: requests.length, setupErrors: errors.length })}\n`), 15000);
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    browser.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
      const target = { ...targetInfo, sessionId, ready: false };
      targets.set(targetInfo.targetId, target);
      if (['worker', 'service_worker', 'shared_worker'].includes(targetInfo.type)) workerTargets.push(target);
      schedule(async () => {
        await browser.send('Runtime.enable', {}, sessionId);
        await browser.send('Network.enable', {}, sessionId);
        await browser.send('Network.setBlockedURLs', { urls: ['http://*', 'https://*', 'ws://*', 'wss://*', 'ftp://*', 'file://*'] }, sessionId);
        try { await browser.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId); }
        catch (error) {
          // Dedicated-worker CDP has Network but no Fetch domain. Protocol-level
          // URL blocks above still deny every HTTP/WebSocket endpoint, including
          // loopback, while packaged chrome-extension resources remain usable.
          if (!['worker', 'shared_worker'].includes(targetInfo.type) || !error.message.includes('Fetch.enable (code -32601)')) throw error;
        }
        // Auto-attachment is per parent. Recursing observes the offscreen-owned
        // inference worker before it can issue a packaged or external request.
        await browser.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: CHILD_FILTER }, sessionId);
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
    browser.on('Runtime.exceptionThrown', ({ exceptionDetails }, sessionId) => {
      const target = [...targets.values()].find(item => item.sessionId === sessionId);
      if (selfUrl(target?.url)) {
        exceptions++;
        errors.push(`Packaged runtime exception: ${exceptionDetails.exception?.description?.slice(0, 1000) ?? exceptionDetails.text}`);
      }
    });
    browser.on('Network.requestWillBeSent', ({ request }, sessionId) => {
      const target = [...targets.values()].find(item => item.sessionId === sessionId);
      requests.push({ context: target?.url, url: request.url });
    });
    browser.on('Fetch.requestPaused', ({ requestId, request }, sessionId) => schedule(async () => {
      await identityReady;
      if (selfUrl(request.url)) await browser.send('Fetch.continueRequest', { requestId }, sessionId);
      else await browser.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, sessionId);
    }));
    const version = await browser.send('Browser.getVersion');
    await browser.send('Target.setDiscoverTargets', { discover: true });
    await browser.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: FILTER });
    const loaded = await browser.send('Extensions.loadUnpacked', { path: BROWSER_ROOT });
    extensionId = loaded.id;
    resolveIdentity();
    assert.match(extensionId, /^[a-p]{32}$/u);
    const page = await smokePage();
    stage = 'direct-packaged-inference';
    const directStarted = performance.now();
    const direct = await evaluate('runEmbeddingSmoke()', page.sessionId);
    assert.equal(direct.modelId, 'e5-small-q8-browser-main-prefix-v1');
    assert.equal(direct.dimensions, 384); assert.equal(direct.finite, true);
    assert.ok(Math.abs(direct.norm - 1) < 1e-6);
    const directMs = performance.now() - directStarted;
    const background = await wait(() => [...targets.values()].find(target => target.ready &&
      target.type === 'service_worker' && target.url === `chrome-extension://${extensionId}/chromium/background.js`), 'trusted background coordinator');
    const workerStarted = performance.now();
    stage = 'offscreen-worker-inference';
    // Chrome forbids import() in its service-worker execution scope. Exercise
    // the exact local host function through CDP in that trusted scope instead;
    // this is test instrumentation, never bundled eval or a runtime substitute.
    const hostFilename = path.join(BROWSER_ROOT, 'chromium/inference-host.js');
    const hostInfo = await lstat(hostFilename);
    assert.ok(hostInfo.isFile() && !hostInfo.isSymbolicLink() && hostInfo.size <= 16384);
    const hostSource = await readFile(hostFilename, 'utf8');
    assert.ok(hostSource.includes('export function createInferenceHost'));
    const worker = await evaluate(`(async () => {
      ${hostSource.replace('export function createInferenceHost', 'function createInferenceHost')}
      const host=createInferenceHost({runtime:chrome.runtime,offscreen:chrome.offscreen});
      const texts=[
        'Cedar Slate 2 launches in September 2026. The tablet has an ink screen and a removable battery.',
        'September 2026 brings Cedar Slate 2, a tablet with an electronic paper display and replaceable battery.',
        'Riverbank gardeners start tomato seedlings indoors and transplant them into community garden beds in spring.'
      ];
      try {
        const vectors=[];
        for(const text of texts) vectors.push(await host.embed(text));
        const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
        return {modelIds:vectors.map(v=>v.modelId),dimensions:vectors.map(v=>v.values.length),
          finite:vectors.every(v=>v.values.every(Number.isFinite)),norms:vectors.map(v=>Math.hypot(...v.values)),
          paraphraseSimilarity:dot(vectors[0].values,vectors[1].values),
          unrelatedSimilarity:dot(vectors[0].values,vectors[2].values)};
      } finally {await host.close();}
    })()`, background.sessionId, 110000);
    assert.deepEqual(worker.modelIds, Array(3).fill('e5-small-q8-browser-main-prefix-v1'));
    assert.deepEqual(worker.dimensions, [384, 384, 384]);
    assert.equal(worker.finite, true);
    assert.ok(worker.norms.every(norm => Math.abs(norm - 1) < 1e-6));
    assert.ok(worker.paraphraseSimilarity > worker.unrelatedSimilarity, 'mechanical owned sample only; no matching cutoff is inferred');
    attachedWorkers = workerTargets.filter(target => selfUrl(target.url)).length;
    for (const request of requests) {
      if (!selfUrl(request.context) && !selfUrl(request.url)) continue;
      if (selfUrl(request.url)) selfRequests++;
      else externalRequests++;
    }
    assert.ok(attachedWorkers >= 2, 'background and dedicated inference workers observed');
    assert.equal(externalRequests, 0); assert.equal(exceptions, 0);
    assert.ok(selfRequests > 0);
    return { browser: version.product, direct: { dimensions: direct.dimensions, normalized: true, elapsedMs: directMs },
      offscreenWorker: { vectorsChecked: 3, dimensions: 384, normalized: true,
        paraphraseSimilarity: worker.paraphraseSimilarity, unrelatedSimilarity: worker.unrelatedSimilarity,
        mechanicalSampleOnly: true, elapsedMs: performance.now() - workerStarted },
      attachedWorkers, packagedRequests: selfRequests, externalExtensionRequests: externalRequests,
      runtimeExceptions: exceptions, elapsedMs: performance.now() - started };
  } finally {
    closing = true; clearTimeout(timer); clearInterval(progress);
    resolveIdentity();
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    await browser?.close();
    await Promise.allSettled([...tasks]);
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('udl-embedding-smoke-'));
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBrowserEmbeddingSmoke(process.argv[2]).then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
