// Prospective blank-only compatibility diagnostic. No public navigation,
// extraction, app/owner profile, ingestion, matching, model or provider calls.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFile, lstat, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url)), OUTPUT = resolve(HERE, 'output');
const HANDSHAKE = 'PUBLIC_INPUT_COMPAT_JOB_ASSIGNED_V1\n';
const sha = value => createHash('sha256').update(value).digest('hex');
const invalid = () => { throw Error('Invalid compatibility metadata'); };
export const SETUP_STAGES = Object.freeze({
  'browser-version': 'Browser.getVersion',
  'deny-downloads': 'Browser.setDownloadBehavior',
  'reset-permissions': 'Browser.resetPermissions',
  'empty-permissions-1': 'Browser.grantPermissions',
  'empty-permissions-2': 'Browser.grantPermissions',
  'empty-permissions-3': 'Browser.grantPermissions',
  'auto-attach-browser': 'Target.setAutoAttach',
  'create-blank-target': 'Target.createTarget',
  'auto-attach-page': 'Target.setAutoAttach',
  'network-enable': 'Network.enable',
  'service-worker-bypass': 'Network.setBypassServiceWorker',
  'cache-disable': 'Network.setCacheDisabled',
  'block-websockets': 'Network.setBlockedURLs',
  'stop-service-workers': 'ServiceWorker.stopAllWorkers',
  'fetch-enable': 'Fetch.enable',
  'page-enable': 'Page.enable',
  'lifecycle-enable': 'Page.setLifecycleEventsEnabled',
  'resume-blank': 'Runtime.runIfWaitingForDebugger',
  'close-extra-target': 'Target.closeTarget',
  'block-blank-request': 'Fetch.failRequest',
  'dismiss-dialog': 'Page.handleJavaScriptDialog',
  'close-browser': 'Browser.close',
});
const METHODS = new Set(Object.values(SETUP_STAGES));
let latestStage = 'initialization', failureStage = null;
function record(value, fields) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).length !== fields.length) invalid();
  const out = {};
  for (const field of fields) {
    const d = Object.getOwnPropertyDescriptor(value, field);
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) invalid(); out[field] = d.value;
  }
  return out;
}
export class CompatibilityProtocolError extends Error {
  constructor(method, code) {
    if (typeof method !== 'string' || !METHODS.has(method) || !Number.isInteger(code) || code < -2147483648 || code > 2147483647) invalid();
    super('Reviewed CDP command rejected');
    this.name = 'CompatibilityProtocolError';
    this.method = method;
    this.code = code;
  }
}
export function projectCompatibilityStage(input) {
  const a = record(input, ['stage', 'status', 'code']);
  if (typeof a.stage !== 'string' || !Object.hasOwn(SETUP_STAGES, a.stage) ||
      !['ok', 'rejected', 'transport-unavailable'].includes(a.status)) invalid();
  if (a.status === 'rejected') {
    if (!Number.isInteger(a.code) || a.code < -2147483648 || a.code > 2147483647) invalid();
  } else if (a.code !== null) invalid();
  return Object.freeze({ stage: a.stage, method: SETUP_STAGES[a.stage], status: a.status, code: a.code });
}
export function projectBrowserVersion(input) {
  const a = record(input, ['protocolVersion', 'product', 'revision', 'userAgent', 'jsVersion']);
  for (const field of Object.keys(a)) if (typeof a[field] !== 'string' || a[field].length > 512) invalid();
  if (!/^\d{1,3}\.\d{1,3}$/u.test(a.protocolVersion)) invalid();
  const product = /^(?:HeadlessChrome|Chrome)\/(\d{1,4})(?:\.\d{1,6}){1,3}$/u.exec(a.product);
  if (!product) invalid();
  return Object.freeze({ protocolVersion: a.protocolVersion, chromeMajor: Number(product[1]) });
}
function pipe(executable, profile) {
  const child = spawn(executable, ['--headless=new', '--remote-debugging-pipe', '--no-startup-window',
    '--no-first-run', '--no-default-browser-check', '--deny-permission-prompts', '--disable-extensions', '--disable-background-networking',
    '--disable-component-update', '--disable-domain-reliability', '--disable-sync', '--disable-quic',
    '--disable-client-side-phishing-detection', '--safebrowsing-disable-auto-update', '--disable-default-apps',
    '--disable-features=MediaRouter,OptimizationHints,AutofillServerCommunication,ServiceWorker',
    '--autoplay-policy=user-gesture-required', `--user-data-dir=${profile}`],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  let serial = 0, buffer = Buffer.alloc(0), ended = false;
  const pending = new Map(), listeners = new Map();
  const broken = () => { ended = true; for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('CDP unavailable')); } pending.clear(); };
  child.on('error', broken); child.on('exit', broken);
  const input = child.stdio[3], output = child.stdio[4];
  input.on('error', broken); output.on('error', broken); output.on('end', broken);
  output.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > 4 * 1024 * 1024) { broken(); child.kill(); return; }
    let end;
    while ((end = buffer.indexOf(0)) !== -1) {
      const bytes = buffer.subarray(0, end); buffer = buffer.subarray(end + 1);
      let message; try { message = JSON.parse(bytes.toString('utf8')); } catch { broken(); child.kill(); return; }
      if (message.id) {
        const p = pending.get(message.id); if (!p) continue;
        pending.delete(message.id); clearTimeout(p.timer);
        if (message.error) p.reject(Number.isInteger(message.error.code) && message.error.code >= -2147483648 && message.error.code <= 2147483647 ? new CompatibilityProtocolError(p.method, message.error.code) : Error('Invalid CDP code')); else p.resolve(message.result);
      } else if (message.method) for (const fn of listeners.get(message.method) ?? []) fn(message.params, message.sessionId);
    }
  });
  return {
    send(method, params = {}, sessionId) {
      if (!METHODS.has(method) || ended || pending.size >= 128) return Promise.reject(Error('CDP capacity/unavailable'));
      return new Promise((resolve, reject) => {
        const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP deadline')); }, 10000);
        pending.set(id, { resolve, reject, timer, method });
        input.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0', error => { if (error) broken(); });
      });
    },
    on(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); return () => listeners.get(name)?.delete(fn); },
    async close() {
      let error = null; try { await this.send('Browser.close'); } catch (e) { error = e; }
      child.kill(); broken(); input.destroy(); output.destroy(); listeners.clear(); return error;
    },
  };
}

async function handshake() {
  if (process.platform !== 'win32' || process.env.MURMINGLE_PUBLIC_INPUT_COMPAT_V1_SUPERVISED !== '1') invalid();
  await new Promise((accept, reject) => {
    let value = '';
    const finish = error => { clearTimeout(timer); process.stdin.off('data', data); process.stdin.off('end', end); process.stdin.pause(); error ? reject(error) : accept(); };
    const data = chunk => { value += chunk.toString('utf8'); if (value.length > HANDSHAKE.length) finish(Error('Invalid job handshake')); else if (value === HANDSHAKE) finish(); };
    const end = () => finish(Error('Missing job handshake'));
    const timer = setTimeout(() => finish(Error('Job handshake deadline')), 5000);
    process.stdin.on('data', data); process.stdin.on('end', end); process.stdin.resume();
  });
}
const sleep = ms => new Promise(yes => setTimeout(yes, ms));
async function deadline(promise, ms) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, no) => { timer = setTimeout(() => no(Error('Setup deadline')), ms); })]); }
  finally { clearTimeout(timer); }
}
async function absent(path) { try { await lstat(path); invalid(); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
async function sourceHash(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 256 * 1024) invalid();
  const bytes = await readFile(path); if (bytes.length > 256 * 1024) invalid(); return sha(bytes);
}
async function executable() {
  for (const path of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) {
    try { const info = await lstat(path); if (info.isFile() && !info.isSymbolicLink()) return path; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  throw Error('Installed Chrome unavailable');
}
async function run() {
  await handshake(); // No browser or filesystem creation before Job assignment.
  const out = await lstat(OUTPUT);
  if (!/^D:/iu.test(HERE) || out.isSymbolicLink() || !out.isDirectory()) invalid();
  const profile = resolve(OUTPUT, 'profile'), marker = resolve(OUTPUT, 'node.started.json'), resultPath = resolve(OUTPUT, 'result.json');
  for (const path of [profile, marker, resultPath]) await absent(path);
  const sourcePaths = { 'run.mjs': fileURLToPath(import.meta.url), 'supervise.py': resolve(HERE, 'supervise.py') }, sourceHashes = {};
  for (const [name, path] of Object.entries(sourcePaths)) sourceHashes[name] = await sourceHash(path);
  const chromePath = await executable();
  await writeFile(marker, JSON.stringify({ schema: 'public-input-probe-compat-started/v1', sourceHashes, noAutomaticRepeat: true }), { flag: 'wx' });
  await mkdir(profile);
  const browser = pipe(chromePath, profile), began = performance.now(), stages = [], operations = new Set();
  let mainSession, readyResolve, readyReject, fatal = null, compatible = true, browserVersion = null, finishing = false;
  const ready = new Promise((yes, no) => { readyResolve = yes; readyReject = no; });
  ready.catch(() => {}); // Avoid an unhandled rejection before the main await.
  const append = value => { if (stages.length >= 64) throw Error('Stage capacity'); stages.push(value); };
  const step = async (stage, params = {}, session) => {
    latestStage = stage;
    const method = SETUP_STAGES[stage]; if (!method) invalid();
    try { const value = await browser.send(method, params, session); append(projectCompatibilityStage({ stage, status: 'ok', code: null })); return value; }
    catch (error) {
      failureStage ??= stage;
      append(projectCompatibilityStage({ stage, status: error instanceof CompatibilityProtocolError ? 'rejected' : 'transport-unavailable',
        code: error instanceof CompatibilityProtocolError ? error.code : null }));
      throw error;
    }
  };
  const track = promise => {
    const operation = promise.catch(error => { fatal ??= error; readyReject(error); }).finally(() => operations.delete(operation));
    operations.add(operation);
  };
  const drain = async () => {
    const until = performance.now() + 2500;
    while (operations.size && performance.now() < until) await sleep(10);
    if (operations.size) throw Error('Callbacks not drained');
  };
  browser.on('Target.attachedToTarget', p => {
    track((async () => {
      if (p.targetInfo.type !== 'page' || mainSession || p.targetInfo.url !== 'about:blank' || finishing) {
        const closed = await step('close-extra-target', { targetId: p.targetInfo.targetId });
        if (!closed.success) throw Error('Paused target not closed'); return;
      }
      mainSession = p.sessionId;
      await step('auto-attach-page', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, mainSession);
      await step('network-enable', {}, mainSession);
      await step('service-worker-bypass', { bypass: true }, mainSession);
      await step('cache-disable', { cacheDisabled: true }, mainSession);
      await step('block-websockets', { urls: ['ws://*', 'wss://*'] }, mainSession);
      await step('stop-service-workers', {}, mainSession);
      await step('fetch-enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, mainSession);
      await step('page-enable', {}, mainSession);
      await step('lifecycle-enable', { enabled: true }, mainSession);
      await step('resume-blank', {}, mainSession);
      readyResolve();
    })());
  });
  browser.on('Fetch.requestPaused', (p, session) => {
    // No URL, method, headers or response text is examined or persisted; ANY
    // paused request is denied. There is no public navigation code path.
    track(step('block-blank-request', { requestId: p.requestId, errorReason: 'BlockedByClient' }, session));
  });
  browser.on('Page.javascriptDialogOpening', (_, session) => { track(step('dismiss-dialog', { accept: false }, session)); });
  let protocolFailure = null, closeError = null;
  try {
    browserVersion = projectBrowserVersion(await step('browser-version'));
    await step('deny-downloads', { behavior: 'deny' });
    await step('reset-permissions');
    for (const [index, origin] of ['https://www.youtube.com', 'https://youtube.com', 'https://www.leukerecepten.nl'].entries()) {
      await step('empty-permissions-' + (index + 1), { origin, permissions: [] });
    }
    await step('auto-attach-browser', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    await step('create-blank-target', { url: 'about:blank' });
    await deadline(ready, 10000);
    await drain();
    if (fatal) throw fatal;
  } catch (error) {
    failureStage ??= latestStage;
    if (!(error instanceof CompatibilityProtocolError)) throw error;
    compatible = false; protocolFailure = { method: error.method, code: error.code };
  } finally {
    finishing = true;
    try { await drain(); } finally {
      latestStage = 'close-browser';
      closeError = await browser.close();
      append(projectCompatibilityStage({ stage: 'close-browser', status: closeError ? closeError instanceof CompatibilityProtocolError ? 'rejected' : 'transport-unavailable' : 'ok',
        code: closeError instanceof CompatibilityProtocolError ? closeError.code : null }));
    }
    await drain();
  }
  // A known setup rejection may still be diagnosed if the browser closes its
  // pipe before acknowledging Browser.close; supervisor must independently
  // confirm the exact Job tree drained. No other transport failure is success.
  if (fatal && !(fatal instanceof CompatibilityProtocolError)) throw Error('Asynchronous boundary failure');
  if (fatal instanceof CompatibilityProtocolError && !protocolFailure) {
    compatible = false; protocolFailure = { method: fatal.method, code: fatal.code };
  }
  if (closeError instanceof CompatibilityProtocolError) {
    compatible = false; protocolFailure ??= { method: closeError.method, code: closeError.code };
  } else if (closeError && !protocolFailure) throw Error('Close acknowledgement unavailable');
  if (operations.size) throw Error('Pending operations');
  for (const [name, path] of Object.entries(sourcePaths)) if (await sourceHash(path) !== sourceHashes[name]) throw Error('Diagnostic source drift');
  const result = { schema: 'public-input-probe-compat/v1', compatible, protocolFailure, browserVersion, stages, sourceHashes,
    sourceHashesRechecked: true, protocolCallbacksDrained: true, elapsedMs: Math.round(performance.now() - began),
    publicNavigation: false, pageCapture: false, noModelCalls: true, noNativeAttestation: true, productionValidated: false,
    purpose: 'blank-browser-compatibility-no-public-navigation',
    scopeLimit: 'Own blank browser setup only, not full Chrome/OS egress attestation or public extraction validation.' };
  const bytes = JSON.stringify(result); if (Buffer.byteLength(bytes) > 192 * 1024) throw Error('Result capacity');
  await writeFile(resultPath, bytes, { flag: 'wx' });
  console.log(JSON.stringify({ status: 'compatibility-diagnostic-complete', compatible, resultSha256: sha(bytes) }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length === 2) console.log('No action. Explicit supervised --run-compatibility-probe required.');
  else if (process.argv.length === 3 && process.argv[2] === '--run-compatibility-probe') {
    await run().catch(() => { console.error(JSON.stringify({ status: 'compatibility-probe-failed', stage: failureStage ?? latestStage, reason: 'transport-or-validation-failure' })); process.exitCode = 1; });
  } else { console.error('Unsupported compatibility mode'); process.exitCode = 1; }
}

