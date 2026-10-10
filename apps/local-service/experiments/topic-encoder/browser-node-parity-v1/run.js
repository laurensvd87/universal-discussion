// Offline comparison of the existing packaged Chrome and Node E5 paths.
// All inputs below are project-created fiction; only aggregate differences print.
import assert from 'node:assert/strict';
import { lstat, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromiumPipe } from '../../../../../spikes/topic-resolution/harness/chromium-pipe.js';
import { embedDocuments } from '../e5-infer.js';
import { MAX_CHARACTERS, MODEL_ID, MODEL_SHA256, TOKENIZER_SHA256 } from '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

const extensionRoot = fileURLToPath(new URL('../../../../../spikes/topic-resolution/browser/', import.meta.url));
const chromeExecutable = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const base = 'In der erfundenen Stadt Liora eröffnet ein solarbetriebenes Archiv. 東京の架空の港では、青い時計が毎日正午に鳴ります. Una cooperativa imaginaria cultiva árboles de papel. ';
const samples = [
  { id: 'short-en', text: 'The fictional Liora library opened a paper lantern workshop beside the old bridge.' },
  { id: 'short-multilingual', text: 'Liora eröffnet ein erfundenes Archiv. 東京の架空の港に青い時計があります. Una biblioteca imaginaria abre al amanecer.' },
  { id: 'long-4096', text: base.repeat(Math.ceil(MAX_CHARACTERS / base.length)).slice(0, MAX_CHARACTERS) },
];
assert.equal(samples.at(-1).text.length, 4096);
for (const sample of samples) assert.equal(sample.text.normalize('NFKC').replace(/\s+/gu, ' ').trim(), sample.text);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function metrics(browser, node) {
  assert.equal(browser.length, 384);
  assert.equal(node.length, 384);
  assert.ok(browser.every(Number.isFinite) && node.every(Number.isFinite));
  const dot = browser.reduce((sum, value, index) => sum + value * node[index], 0);
  const cosine = dot / (Math.hypot(...browser) * Math.hypot(...node));
  return { cosine, maxCoordinateDifference: Math.max(...browser.map((value, index) => Math.abs(value - node[index]))) };
}

export async function runParity(executable = chromeExecutable) {
  assert.ok(path.isAbsolute(executable) && (await lstat(executable)).isFile(), 'Installed Chrome executable required');
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'udl-e5-parity-'));
  const targets = new Map(), tasks = new Set(), errors = [];
  let browser, timer, extensionId, closing = false;
  let externalRequests = 0, packagedRequests = 0, blockedExternalRequests = 0;
  let resolveIdentity;
  const identityReady = new Promise(resolve => { resolveIdentity = resolve; });
  const schedule = operation => {
    const task = Promise.resolve().then(operation).catch(error => { if (!closing) errors.push(error.message); });
    tasks.add(task); task.finally(() => tasks.delete(task));
  };
  const ownUrl = url => {
    try { const parsed = new URL(url); return parsed.protocol === 'chrome-extension:' && parsed.host === extensionId; }
    catch { return false; }
  };
  async function wait(check, label, limit = 15_000) {
    const start = performance.now();
    while (performance.now() - start < limit) {
      if (errors.length) throw new Error(errors[0]);
      const result = await check();
      if (result) return result;
      await sleep(50);
    }
    throw new Error(`Chrome timeout: ${label}`);
  }
  try {
    browser = launchChromiumPipe({ executable, profileDirectory: path.join(temporary, 'profile') });
    timer = setTimeout(() => { void browser.close(); }, 180_000);
    browser.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
      const target = { ...targetInfo, sessionId, ready: false };
      targets.set(targetInfo.targetId, target);
      schedule(async () => {
        await browser.send('Runtime.enable', {}, sessionId);
        await browser.send('Network.enable', {}, sessionId);
        await browser.send('Network.setBlockedURLs', { urls: ['http://*', 'https://*', 'ws://*', 'wss://*', 'ftp://*', 'file://*'] }, sessionId);
        try { await browser.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId); }
        catch (error) {
          if (!['worker', 'shared_worker'].includes(targetInfo.type) || !error.message.includes('Fetch.enable (code -32601)')) throw error;
        }
        await browser.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
          filter: ['page', 'iframe', 'worker', 'shared_worker'].map(type => ({ type, exclude: false })).concat({ exclude: true }) }, sessionId);
        await browser.send('Runtime.runIfWaitingForDebugger', {}, sessionId);
        target.ready = true;
      });
    });
    browser.on('Target.detachedFromTarget', ({ sessionId }) => {
      for (const [id, target] of targets) if (target.sessionId === sessionId) targets.delete(id);
    });
    browser.on('Runtime.exceptionThrown', ({ exceptionDetails }, sessionId) => {
      if ([...targets.values()].some(target => target.sessionId === sessionId && ownUrl(target.url)))
        errors.push(`Extension exception: ${exceptionDetails.text}`);
    });
    browser.on('Network.requestWillBeSent', ({ request }) => {
      if (ownUrl(request.url)) packagedRequests++;
      else if (/^(?:https?|wss?|ftp|file):/u.test(request.url)) externalRequests++;
    });
    browser.on('Fetch.requestPaused', ({ requestId, request }, sessionId) => schedule(async () => {
      await identityReady;
      if (ownUrl(request.url)) await browser.send('Fetch.continueRequest', { requestId }, sessionId);
      else {
        blockedExternalRequests++;
        await browser.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, sessionId);
      }
    }));
    const version = await browser.send('Browser.getVersion');
    await browser.send('Target.setDiscoverTargets', { discover: true });
    await browser.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
      filter: ['page', 'iframe', 'worker', 'service_worker', 'shared_worker', 'other'].map(type => ({ type, exclude: false })).concat({ exclude: true }) });
    extensionId = (await browser.send('Extensions.loadUnpacked', { path: extensionRoot })).id;
    resolveIdentity();
    assert.match(extensionId, /^[a-p]{32}$/u);
    const { targetId } = await browser.send('Target.createTarget', { url: `chrome-extension://${extensionId}/embedding/smoke.html` });
    const page = await wait(() => targets.get(targetId)?.ready && targets.get(targetId), 'extension page');
    const expression = `(async () => {
      const { embedText } = await import('./e5-browser.js');
      const rows = ${JSON.stringify(samples.map(({ id, text }) => ({ id, text })))};
      const result = [];
      for (const row of rows) {
        const start = performance.now();
        const vector = await embedText(row.text);
        result.push({ id: row.id, modelId: vector.modelId, values: vector.values, elapsedMs: performance.now() - start });
      }
      return result;
    })()`;
    const browserStart = performance.now();
    const evaluated = await browser.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, page.sessionId, 150_000);
    if (evaluated.exceptionDetails) throw new Error(`Browser inference failed: ${evaluated.exceptionDetails.text}`);
    const browserRows = evaluated.result.value;
    assert.equal(browserRows?.length, samples.length);
    const browserMs = performance.now() - browserStart;
    const nodeStart = performance.now();
    const node = await embedDocuments(samples.map(({ id, text }) => ({ id, title: id, body: text })), 'body');
    const nodeMs = performance.now() - nodeStart;
    assert.equal(node.assets.modelSha256, MODEL_SHA256);
    assert.equal(node.assets.tokenizerSha256, TOKENIZER_SHA256);
    const comparisons = browserRows.map(row => {
      assert.equal(row.modelId, MODEL_ID);
      return { id: row.id, characters: samples.find(sample => sample.id === row.id).text.length,
        browserInferenceMs: Math.round(row.elapsedMs), ...metrics(row.values, node.vectors.get(row.id)) };
    });
    assert.equal(errors.length, 0, errors.join('; '));
    assert.equal(externalRequests, 0, 'External request observed');
    assert.equal(blockedExternalRequests, 0, 'External request attempted');
    assert.ok(packagedRequests > 0, 'Packaged asset requests not observed');
    return { browser: version.product, modelSha256: MODEL_SHA256, tokenizerSha256: TOKENIZER_SHA256,
      comparisons, browserTotalMs: Math.round(browserMs), nodeTotalMs: Math.round(nodeMs),
      packagedRequests, externalRequests, blockedExternalRequests };
  } finally {
    closing = true;
    clearTimeout(timer);
    resolveIdentity();
    await browser?.close();
    await Promise.allSettled([...tasks]);
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temporary).startsWith('udl-e5-parity-'));
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runParity(process.argv[2]).then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
