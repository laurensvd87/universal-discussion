// Default inert. ADR143 consumed TRAIN controls only; no model or final cohort.
import { types } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFile, stat, lstat, realpath, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { isGlobalPublicAddress } from '../../../../apps/local-service/src/crawler/public-fetch.js';
import { CONTROLS, URLS, ORIGINS, sha, freeze, record, ControlUnavailable, ControlFatal, failureProjection,
  remaining, articleObservationDue, requestDecision, safeRequestHeaders, browserHeaderPolicy,
  validateMainResponse, validateBrowserSnapshot, collectOriginPolicies, collectStaticControls } from './policy.js';
export { CONTROLS, URLS, requestDecision } from './policy.js';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, '../../../..');
const READER = resolve(REPO, 'spikes/topic-resolution/browser/chromium/page-content-reader.js');
const READER_SHA = 'c7946a7e19adb3fd9c14b2304101dbd3bf8b7c92fd1ab7c3ba679104b55e428f';
const invalid = () => { throw new ControlFatal('invalid-contract'); };
export const SOURCE_FILES = freeze({
  'run.mjs': resolve(HERE, 'run.mjs'), 'policy.js': resolve(HERE, 'policy.js'),
  'supervise.py': resolve(HERE, 'supervise.py'), 'run.test.mjs': resolve(HERE, 'run.test.mjs'),
  'policy.test.mjs': resolve(HERE, 'policy.test.mjs'), 'protocol.json': resolve(HERE, 'protocol.json'), 'README.md': resolve(HERE, 'README.md'),
  'page-content-reader.js': READER,
  'page-content-policy.js': resolve(REPO, 'spikes/topic-resolution/browser/core/page-content-policy.js'),
  'public-fetch.js': resolve(REPO, 'apps/local-service/src/crawler/public-fetch.js'),
  'robots.js': resolve(REPO, 'apps/local-service/src/crawler/robots.js'),
  'static-capture.js': resolve(REPO, 'apps/local-service/src/crawler/static-capture.js'),
  'robots-deny-space-repair.js': resolve(REPO, 'apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js'),
});
const DEPENDENCY_PINS = freeze({
  'page-content-reader.js': READER_SHA,
  'page-content-policy.js': 'c0ac60a80f0661d99aadc3b76aeb7b4fe1f28b8032e8271ef9ef8124baad073e',
  'public-fetch.js': '37c4619d61f015cbf3be00a0e5b748f313bafc3103e33bb0a825e79546d8bf71',
  'robots.js': '6e29a2b0e2e55d9bafcf6eb6f9ca401fd8b067e9675c3208867cd99d159dc0e2',
  'static-capture.js': '592a0c739de05ffa3fdd139b62dbe23b95fad4b4735faeca6c5bd278c3654b96',
  'robots-deny-space-repair.js': '8b44edb35842f79899dff32505f4668e1f61978d4a2a5728257f834bd2ec85c2',
});
export const MAIN_SETUP_PLAN = freeze([
  { stage: 'auto-attach-page', method: 'Target.setAutoAttach', params: { autoAttach: true, waitForDebuggerOnStart: true, flatten: true } },
  { stage: 'network-enable', method: 'Network.enable', params: {} },
  { stage: 'service-worker-bypass', method: 'Network.setBypassServiceWorker', params: { bypass: true } },
  { stage: 'cache-disable', method: 'Network.setCacheDisabled', params: { cacheDisabled: true } },
  { stage: 'block-websockets', method: 'Network.setBlockedURLs', params: { urls: ['ws://*', 'wss://*'] } },
  { stage: 'enable-service-workers', method: 'ServiceWorker.enable', params: {} },
  { stage: 'stop-service-workers', method: 'ServiceWorker.stopAllWorkers', params: {} },
  { stage: 'fetch-enable', method: 'Fetch.enable', params: { patterns: [{ urlPattern: '*', requestStage: 'Request' }, { urlPattern: '*', resourceType: 'Document', requestStage: 'Response' }] } },
  { stage: 'page-enable', method: 'Page.enable', params: {} },
  { stage: 'lifecycle-enable', method: 'Page.setLifecycleEventsEnabled', params: { enabled: true } },
  { stage: 'resume-page', method: 'Runtime.runIfWaitingForDebugger', params: {} },
]);
const STAGES = freeze({ ...Object.fromEntries(MAIN_SETUP_PLAN.map(p => [p.stage, p.method])),
  'deny-downloads': 'Browser.setDownloadBehavior', 'reset-permissions': 'Browser.resetPermissions',
  'empty-permissions': 'Browser.grantPermissions', 'auto-attach-browser': 'Target.setAutoAttach',
  'create-blank-target': 'Target.createTarget', 'close-extra-target': 'Target.closeTarget',
  'continue-request': 'Fetch.continueRequest', 'continue-response': 'Fetch.continueResponse', 'block-request': 'Fetch.failRequest',
  'dismiss-dialog': 'Page.handleJavaScriptDialog', 'navigate': 'Page.navigate', 'stop-loading': 'Page.stopLoading',
  'frame-tree': 'Page.getFrameTree', 'isolated-world': 'Page.createIsolatedWorld', 'snapshot': 'Runtime.evaluate', 'close-browser': 'Browser.close' });
const METHODS = new Set(Object.values(STAGES));
let firstFailure = null, closeDiagnostic = null;
export class ControlProtocolError extends Error {
  constructor(method, code) { if (!METHODS.has(method) || !Number.isInteger(code) || code < -2147483648 || code > 2147483647) invalid();
    super('Reviewed CDP command rejected'); this.method = method; this.code = code; }
}
export function projectProtocolFailure(value) {
  const a = record(value, ['stage', 'method', 'code']);
  if (!Object.hasOwn(STAGES, a.stage) || STAGES[a.stage] !== a.method || a.code !== null && (!Number.isInteger(a.code) || a.code < -2147483648 || a.code > 2147483647)) invalid();
  return freeze({ stage: a.stage, method: a.method, code: a.code, reason: a.code === null ? 'transport-or-validation-failure' : 'cdp-command-rejected' });
}
export function publicNavigationCommand(setupCompleted, url) {
  if (setupCompleted !== true || !URLS.includes(url)) invalid(); return freeze({ method: 'Page.navigate', params: { url } });
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
        if (message.error) p.reject(Number.isInteger(message.error.code) && message.error.code >= -2147483648 && message.error.code <= 2147483647
          ? new ControlProtocolError(p.method, message.error.code) : Error('Invalid CDP code')); else p.resolve(message.result);
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
      await this.send('Browser.close').catch(error => {
        closeDiagnostic = projectProtocolFailure({ stage: 'close-browser', method: 'Browser.close', code: error instanceof ControlProtocolError ? error.code : null });
      }); child.kill(); broken(); input.destroy(); output.destroy(); listeners.clear();
    },
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function absent(path) { try { await lstat(path); invalid(); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
async function bytes(path, max = 1024 * 1024) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > max || resolve(await realpath(path)).toLowerCase() !== resolve(path).toLowerCase()) throw new ControlFatal('source-integrity');
  const b = await readFile(path); if (b.length > max) throw new ControlFatal('source-integrity'); return b;
}
async function sourceBuffers() {
  const buffers = {}, hashes = {};
  for (const [name, path] of Object.entries(SOURCE_FILES)) { buffers[name] = await bytes(path); hashes[name] = sha(buffers[name]); }
  for (const [name, expected] of Object.entries(DEPENDENCY_PINS)) if (hashes[name] !== expected) throw new ControlFatal('source-integrity');
  const protocol = JSON.parse(buffers['protocol.json']);
  if (protocol.schema !== 'current-producer-controls-protocol/v1' || JSON.stringify(protocol.controls) !== JSON.stringify(CONTROLS)) throw new ControlFatal('source-integrity');
  const frozenBytes = await bytes(resolve(HERE, 'freeze.json'), 65536), frozen = JSON.parse(frozenBytes);
  record(frozen, ['schema', 'sourceHashes', 'protocolSha256', 'controlsHash', 'freezeHash']);
  const { freezeHash, ...material } = frozen;
  if (frozen.schema !== 'current-producer-controls-freeze/v1' || sha(JSON.stringify(material)) !== freezeHash || frozen.protocolSha256 !== hashes['protocol.json'] || frozen.controlsHash !== sha(JSON.stringify(CONTROLS)) || JSON.stringify(frozen.sourceHashes) !== JSON.stringify(hashes)) throw new ControlFatal('source-integrity');
  return { buffers, hashes, freezeHash, freezeSha256: sha(frozenBytes) };
}
async function recheckSources(initial) {
  for (const [name, path] of Object.entries(SOURCE_FILES)) if (sha(await bytes(path)) !== initial.hashes[name]) throw new ControlFatal('source-integrity');
  if (sha(await bytes(resolve(HERE, 'freeze.json'), 65536)) !== initial.freezeSha256) throw new ControlFatal('source-integrity');
}
async function handshake(phase) {
  if (process.platform !== 'win32' || process.env.MURMINGLE_CURRENT_PRODUCER_CONTROLS_V1_SUPERVISED !== phase) invalid();
  const wanted = `CURRENT_PRODUCER_CONTROLS_JOB_ASSIGNED_V1:${phase}\n`;
  await new Promise((accept, reject) => {
    let value = '', done = false;
    const finish = e => { if (done) return; done = true; clearTimeout(timer); process.stdin.off('data', data); process.stdin.off('end', end); process.stdin.pause(); e ? reject(e) : accept(); };
    const data = chunk => { value += chunk.toString('utf8'); if (value.length > wanted.length) finish(new ControlFatal('source-integrity')); else if (value === wanted) finish(); };
    const end = () => finish(new ControlFatal('source-integrity'));
    const timer = setTimeout(() => finish(new ControlFatal('setup-deadline')), 5000);
    process.stdin.on('data', data); process.stdin.on('end', end); process.stdin.resume();
  });
}
async function executable() {
  for (const path of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) {
    try { if ((await lstat(path)).isFile() && !(await lstat(path)).isSymbolicLink()) return path; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  } throw new ControlFatal('source-integrity');
}
export function validateEligibilityResult(input, hashes, freezeHash) {
  if (!input || types.isProxy(input) || input.schema !== 'current-producer-controls-result/v1' || input.phase !== 'static-controls' || input.status !== 'complete' ||
      input.sourceHashesRechecked !== true || input.freezeHash !== freezeHash || JSON.stringify(input.sourceHashes) !== JSON.stringify(hashes) || input.denominator !== 4 || !Array.isArray(input.cases) || input.cases.length !== 4) invalid();
  let eligible = 0;
  for (let i = 0; i < 4; i++) { const row = input.cases[i], c = CONTROLS[i];
    if (!row || row.id !== c.id || row.url !== c.url || typeof row.rightsTransportEligible !== 'boolean' || !['collected', 'unavailable'].includes(row.status)) invalid();
    if (row.rightsTransportEligible) {
      if (!row.originPolicy || row.originPolicyHash !== sha(JSON.stringify(row.originPolicy)) || row.pagePolicy?.domDirectivesChecked !== true || !/^[a-f0-9]{64}$/u.test(row.htmlSha256 ?? '')) invalid(); eligible++;
    } else if (row.status === 'collected' || row.capture !== undefined) invalid();
  }
  if (eligible < 2 || eligible !== input.eligibleCases || input.compatibilityPrerequisitePassed !== true) invalid();
  return input.cases.map(c => c.rightsTransportEligible);
}
async function priorEligibility(initial) {
  const output = resolve(HERE, 'output-static'), rb = await bytes(resolve(output, 'result.json'), 192 * 1024), result = JSON.parse(rb);
  const sb = await bytes(resolve(output, 'supervisor.json'), 65536), supervisor = JSON.parse(sb);
  if (supervisor.schema !== 'current-producer-controls-supervisor/v1' || supervisor.phase !== 'static-controls' || supervisor.reason !== null || supervisor.exitCode !== 0 || supervisor.ownTreeCleanupConfirmed !== true || supervisor.sourceHashesRechecked !== true || supervisor.resultSha256 !== sha(rb) || supervisor.freezeSha256 !== initial.freezeSha256 || JSON.stringify(supervisor.sourceHashes) !== JSON.stringify(initial.hashes)) throw new ControlFatal('source-integrity');
  return { eligible: validateEligibilityResult(result, initial.hashes, initial.freezeHash), resultSha256: sha(rb), supervisorSha256: sha(sb), paths: [resolve(output, 'result.json'), resolve(output, 'supervisor.json')] };
}
async function withArticleLease(promise, until) {
  let timer; try { return await Promise.race([promise, new Promise((_, no) => { timer = setTimeout(() => no(new ControlUnavailable('article-timeout')), Math.max(0, until - performance.now())); })]); }
  finally { clearTimeout(timer); }
}

async function browserControls({ initial, eligible, guard, started, output }) {
  // Fresh policy work belongs to THIS batch; static eligibility is no freshness grant.
  const policyStarted = performance.now();
  const policies = await collectOriginPolicies({ browser: true, guard });
  const policyElapsedMs = performance.now() - policyStarted;
  if (policyElapsedMs > 60000) throw new ControlFatal('absolute-job-deadline');
  guard();
  const profile = resolve(output, 'profile'); await absent(profile); await mkdir(profile);
  const readerBytes = initial.buffers['page-content-reader.js']; if (sha(readerBytes) !== READER_SHA) throw new ControlFatal('source-integrity');
  const { collectPageContent } = await import(pathToFileURL(READER).href);
  if (sha(await bytes(READER)) !== READER_SHA) throw new ControlFatal('source-integrity');
  const browser = pipe(await executable(), profile), cases = [], operations = new Set();
  let mainSession, setupResolve, setupReject, setupCompleted = false, fatal = null, finishing = false, requests = 0, current = null, navigationMs = 0;
  const setup = new Promise((yes, no) => { setupResolve = yes; setupReject = no; }); setup.catch(() => {});
  const counts = { allowed: 0, blocked: 0, documentResponses: 0, failedResources: 0 };
  const step = async (stage, params = {}, session) => {
    guard(); try { return await browser.send(STAGES[stage], params, session); }
    catch (e) { firstFailure ??= projectProtocolFailure({ stage, method: STAGES[stage], code: e instanceof ControlProtocolError ? e.code : null }); throw new ControlFatal('protocol-failed'); }
  };
  const abort = error => { fatal ??= error instanceof ControlFatal ? error : new ControlFatal('callback-failed'); setupReject(fatal); };
  const track = p => { const op = p.catch(abort).finally(() => operations.delete(op)); operations.add(op); };
  const drain = async () => { const until = performance.now() + 2000; while (operations.size && performance.now() < until) await sleep(10); if (operations.size) throw new ControlFatal('unsettled-callbacks'); };
  browser.on('Target.attachedToTarget', p => track((async () => {
    if (p.targetInfo.type !== 'page' || mainSession || p.targetInfo.url !== 'about:blank') {
      const r = await step('close-extra-target', { targetId: p.targetInfo.targetId }); if (!r.success) throw new ControlFatal('response-integrity'); return;
    }
    mainSession = p.sessionId; for (const command of MAIN_SETUP_PLAN) await step(command.stage, command.params, mainSession);
    setupCompleted = true; setupResolve();
  })()));
  browser.on('Fetch.requestPaused', (p, session) => track((async () => {
    if (session !== mainSession || ++requests > 4096) throw new ControlFatal('request-capacity');
    if (p.responseStatusCode !== undefined || p.responseErrorReason !== undefined) {
      counts.documentResponses++;
      if (!current || finishing || p.resourceType !== 'Document' || p.frameId !== current.frameId && current.frameId) {
        await step('block-request', { requestId: p.requestId, errorReason: 'BlockedByClient' }, session); return;
      }
      try {
        if (p.responseErrorReason !== undefined || p.request.url !== current.url || !Number.isInteger(p.responseStatusCode) || p.responseStatusCode < 200 || p.responseStatusCode >= 300 || !p.networkId) throw new ControlUnavailable('document-response-refused');
        browserHeaderPolicy(p.responseHeaders ?? []);
        if (current.paused) throw new ControlFatal('response-integrity');
        current.paused = { url: p.request.url, status: p.responseStatusCode, headers: p.responseHeaders ?? [], networkId: p.networkId, frameId: p.frameId };
        await step('continue-response', { requestId: p.requestId }, session);
      } catch (e) {
        if (!(e instanceof ControlUnavailable)) throw e;
        current.refusal ??= e.code; await step('block-request', { requestId: p.requestId, errorReason: 'BlockedByClient' }, session);
      } return;
    }
    let verdict = finishing ? 'blocked-finishing' : requestDecision({ url: p.request.url, method: p.request.method, resourceType: p.resourceType });
    if (p.resourceType === 'Document' && (!current || p.request.url !== current.url)) verdict = 'blocked-document';
    if (verdict === 'allowed') { counts.allowed++; await step('continue-request', { requestId: p.requestId, headers: safeRequestHeaders(p.request.headers) }, session); }
    else { counts.blocked++; await step('block-request', { requestId: p.requestId, errorReason: 'BlockedByClient' }, session); }
  })()));
  browser.on('Page.javascriptDialogOpening', (_, session) => track(step('dismiss-dialog', { accept: false }, session)));
  browser.on('Network.loadingFailed', (p, session) => {
    counts.failedResources++; if (session === mainSession && current?.requestIds.has(p.requestId) && !current.refusal && !current.stopping && !finishing) abort(new ControlFatal('unhandled-transport'));
  });
  browser.on('Network.requestWillBeSent', (p, session) => {
    if (session !== mainSession || !current || p.type !== 'Document' || p.request.url !== current.url) return;
    if (current.requestIds.size >= 8) { abort(new ControlFatal('request-capacity')); return; }
    current.requestIds.add(p.requestId);
  });
  browser.on('Network.responseReceived', (p, session) => {
    if (typeof p.response.remoteIPAddress === 'string' && p.response.remoteIPAddress && !isGlobalPublicAddress(p.response.remoteIPAddress)) { abort(new ControlFatal('response-integrity')); return; }
    if (session !== mainSession || !current || p.type !== 'Document') return;
    if (p.frameId !== current.frameId && current.frameId) return;
    current.network = { url: p.response.url, status: p.response.status, requestId: p.requestId, frameId: p.frameId, loaderId: p.loaderId,
      remoteAddress: p.response.remoteIPAddress, securityState: p.response.securityState, mimeType: p.response.mimeType };
  });
  browser.on('Page.frameNavigated', (p, session) => {
    if (session !== mainSession || !current || p.frame.parentId) return;
    if (current.committed) current.changed = true;
    current.committed = { frameId: p.frame.id, loaderId: p.frame.loaderId, url: p.frame.url };
  });
  browser.on('Page.lifecycleEvent', (p, session) => {
    if (session !== mainSession || !current || p.name !== 'DOMContentLoaded') return;
    if (current.dcls.length >= 32) { abort(new ControlFatal('response-integrity')); return; }
    current.dcls.push({ frameId: p.frameId, loaderId: p.loaderId, at: performance.now() });
  });
  let result;
  try {
    await step('deny-downloads', { behavior: 'deny' }); await step('reset-permissions');
    for (const origin of ORIGINS) await step('empty-permissions', { origin, permissions: [] });
    await step('auto-attach-browser', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    await step('create-blank-target', { url: 'about:blank' });
    try { await withArticleLease(setup, performance.now() + 10000); }
    catch (e) { if (e instanceof ControlUnavailable) throw new ControlFatal('setup-deadline'); throw e; }
    if (!setupCompleted) throw new ControlFatal('setup-deadline');
    for (let i = 0; i < 4; i++) {
      guard(); if (fatal) throw fatal;
      const c = CONTROLS[i], policy = policies.entries.get(new URL(c.url).origin);
      if (!eligible[i] || policy.status !== 'eligible') { cases.push({ ...c, status: 'unavailable', reason: !eligible[i] ? 'static-rights-ineligible' : 'fresh-origin-ineligible', freshPolicyReason: policy.reason ?? null }); continue; }
      const pause = Math.max(0, policy.lastRequestAt + Math.max(2000, policy.receipt.crawlDelayMs) - performance.now());
      if (pause) { if (policyElapsedMs + pause > 60000) { cases.push({ ...c, status: 'unavailable', reason: 'origin-policy-budget' }); continue; } await sleep(pause); }
      guard(); const articleStarted = performance.now(), until = articleStarted + 20000;
      current = { url: c.url, frameId: null, loaderId: null, paused: null, network: null, dcls: [], committed: null, changed: false, refusal: null, requestIds: new Set(), stopping: false };
      let outcome;
      try {
        const nav = await withArticleLease(step('navigate', publicNavigationCommand(setupCompleted, c.url).params, mainSession), until);
        if (nav.errorText) { if (current.refusal) throw new ControlUnavailable(current.refusal); throw new ControlFatal('navigation-transport-failure'); }
        if (!nav.frameId || !nav.loaderId) throw new ControlUnavailable('document-identity-unavailable');
        current.frameId = nav.frameId; current.loaderId = nav.loaderId;
        let dcl;
        while (!dcl) {
          guard(); if (fatal) throw fatal; if (current.refusal) throw new ControlUnavailable(current.refusal);
          if (performance.now() >= until - 2000) throw new ControlUnavailable('article-timeout');
          dcl = current.dcls.find(d => d.frameId === nav.frameId && d.loaderId === nav.loaderId);
          if (!dcl) await sleep(10);
        }
        articleObservationDue({ started: articleStarted, dclAt: dcl.at, now: performance.now() });
        if (!current.paused || !current.network) throw new ControlFatal('response-integrity');
        const responseWitness = validateMainResponse({ expectedUrl: c.url, frameId: nav.frameId, loaderId: nav.loaderId, paused: current.paused, network: current.network });
        const tree = await withArticleLease(step('frame-tree', {}, mainSession), until), f = tree.frameTree?.frame;
        if (!f || f.id !== nav.frameId || f.loaderId !== nav.loaderId || f.url !== c.url || current.changed || current.committed?.loaderId !== nav.loaderId || current.committed?.url !== c.url) throw new ControlUnavailable('document-identity-unavailable');
        const world = await withArticleLease(step('isolated-world', { frameId: nav.frameId, worldName: 'current-producer-controls-v1', grantUniveralAccess: false }, mainSession), until);
        const due = articleObservationDue({ started: articleStarted, dclAt: dcl.at, now: performance.now() });
        if (due) await sleep(due); guard(); if (fatal) throw fatal;
        articleObservationDue({ started: articleStarted, dclAt: dcl.at, now: performance.now() });
        const expression = `(() => { const robots=[],tdm=[];let canonicalUrl='',n=0,e=document.head?.firstElementChild;for(;e&&n<128;e=e.nextElementSibling,n++){if(e.tagName==='META'){const k=(e.getAttribute('name')||e.getAttribute('http-equiv')||'').toLowerCase();const v=e.getAttribute('content')||'';if(v.length>4096)return {capture:null,document:{url:location.href,canonicalUrl:'',robots:[],tdm:[],complete:false}};if(['robots','x-robots-tag','murmingletopiccrawler'].includes(k))robots.push(v);if(k==='tdm-reservation')tdm.push(v);}if(e.tagName==='LINK'&&(e.getAttribute('rel')||'').toLowerCase()==='canonical'){const h=e.getAttribute('href')||'';if(h.length<=2048)canonicalUrl=h;}}const capture=(${collectPageContent.toString()})(${JSON.stringify(c.url)});return {capture,document:{url:location.href,canonicalUrl,robots,tdm,complete:!e}};})()`;
        const observed = await withArticleLease(step('snapshot', { expression, contextId: world.executionContextId, returnByValue: true, timeout: 1000 }, mainSession), until);
        guard(); if (performance.now() >= until) throw new ControlUnavailable('article-timeout');
        if (observed.exceptionDetails || !observed.result?.value) throw new ControlUnavailable('reader-unsupported');
        // A second exact frame read fences navigation during world creation/evaluation.
        const after = await withArticleLease(step('frame-tree', {}, mainSession), until), af = after.frameTree?.frame;
        if (!af || af.id !== nav.frameId || af.loaderId !== nav.loaderId || af.url !== c.url || current.changed) throw new ControlUnavailable('document-identity-unavailable');
        const navigationId = `controls-v1-${i + 1}`;
        outcome = validateBrowserSnapshot({ expectedUrl: c.url, ...observed.result.value, responseWitness, frameId: nav.frameId, loaderId: nav.loaderId, navigationId });
        if (outcome.documentWitness) outcome = { ...outcome, documentWitness: { ...outcome.documentWitness, documentId: sha(JSON.stringify({ frameId: nav.frameId, loaderId: nav.loaderId, navigationId })), documentIdScope: 'harness-incarnation-not-native-extension-document-id' } };
      } catch (e) {
        guard(); if (fatal) throw fatal; const p = failureProjection(e); if (p.kind !== 'unavailable') throw e;
        outcome = { status: 'unavailable', reason: p.reason };
      } finally {
        navigationMs += performance.now() - articleStarted;
        current.stopping = true;
        await step('stop-loading', {}, mainSession); current = null;
      }
      cases.push({ ...c, ...outcome, originPolicyHash: policy.receiptSha256, observedAtOffsetMs: Math.round(performance.now() - started) });
    }
    if (navigationMs > 80000) throw new ControlFatal('absolute-job-deadline');
    result = { cases, denominator: 4, collectedCases: cases.filter(c => c.status === 'collected').length, policyRequests: policies.requests,
      policyElapsedMs, navigationElapsedMs: navigationMs, requestCounts: counts };
  } finally { finishing = true; try { await drain(); } finally { await browser.close(); } await drain(); }
  if (fatal || firstFailure || operations.size || !result) throw fatal ?? new ControlFatal('unsettled-callbacks');
  if (performance.now() - started - policyElapsedMs - navigationMs > 35000) throw new ControlFatal('absolute-job-deadline');
  return { ...result, protocolCallbacksDrained: true, closeDiagnostic };
}

async function run(phase) {
  await handshake(phase); const started = performance.now(), deadline = started + (phase === 'browser-controls' ? 165000 : 345000);
  const guard = () => remaining(deadline, performance.now());
  if (!/^D:/iu.test(HERE)) invalid();
  const output = resolve(HERE, phase === 'static-controls' ? 'output-static' : 'output-browser');
  if ((await lstat(output)).isSymbolicLink() || !(await stat(output)).isDirectory() || resolve(await realpath(output)).toLowerCase() !== output.toLowerCase()) invalid();
  for (const name of ['node.started.json', 'result.json', 'profile']) await absent(resolve(output, name));
  const initial = await sourceBuffers(); let prior = null;
  if (phase === 'browser-controls') prior = await priorEligibility(initial);
  await writeFile(resolve(output, 'node.started.json'), JSON.stringify({ schema: 'current-producer-controls-started/v1', phase,
    sourceHashes: initial.hashes, freezeHash: initial.freezeHash, freezeSha256: initial.freezeSha256, priorEligibilitySha256: prior?.resultSha256 ?? null, noAutomaticRetry: true }), { flag: 'wx' });
  let data;
  try { data = phase === 'static-controls' ? await collectStaticControls({ guard }) : await browserControls({ initial, eligible: prior.eligible, guard, started, output }); }
  catch (e) { data = { status: 'fatal', failure: failureProjection(e), protocolFailure: firstFailure, denominator: 4 }; }
  guard(); await recheckSources(initial);
  if (prior && (sha(await bytes(prior.paths[0], 192 * 1024)) !== prior.resultSha256 || sha(await bytes(prior.paths[1], 65536)) !== prior.supervisorSha256)) throw new ControlFatal('source-integrity');
  const result = { schema: 'current-producer-controls-result/v1', phase, status: 'complete', ...data,
    compatibilityPrerequisitePassed: data.status !== 'fatal' && (phase === 'static-controls' ? data.eligibleCases >= 2 : data.collectedCases >= 2),
    sourceHashes: initial.hashes, freezeHash: initial.freezeHash, freezeSha256: initial.freezeSha256, protocolSha256: initial.hashes['protocol.json'],
    priorEligibilitySha256: prior?.resultSha256 ?? null, priorEligibilitySupervisorSha256: prior?.supervisorSha256 ?? null,
    elapsedMs: Math.round(performance.now() - started), sourceHashesRechecked: true, noAutomaticRetry: true,
    noNativeAttestation: true, noCanonicalWrites: true, noModelCalls: true, productionValidated: false, assignmentAuthority: false,
    purpose: 'already-consumed-TRAIN-controls-compatibility-not-independent-quality',
    networkScopeLimit: 'Public fetch DNS pins and observed Chrome response IPs do not attest Chrome DNS pinning or complete Chrome/OS egress isolation.' };
  const b = JSON.stringify(result); if (Buffer.byteLength(b) > 192 * 1024) invalid(); guard();
  await writeFile(resolve(output, 'result.json'), b, { flag: 'wx' });
  console.log(JSON.stringify({ status: result.status, phase, compatibilityPrerequisitePassed: result.compatibilityPrerequisitePassed, resultSha256: sha(b) }));
  if (result.status === 'fatal') process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length === 2) console.log('No action. Reviewed, frozen, explicitly supervised controls mode required.');
  else if (process.argv.length === 3 && ['--static-controls', '--browser-controls'].includes(process.argv[2])) {
    const unhandled = () => { console.error(JSON.stringify({ status: 'controls-failed', failure: { kind: 'fatal', reason: 'callback-failed' } })); process.exit(1); };
    process.once('uncaughtException', unhandled); process.once('unhandledRejection', unhandled);
    await run(process.argv[2].slice(2)).catch(e => { console.error(JSON.stringify({ status: 'controls-failed', failure: failureProjection(e), protocolFailure: firstFailure })); process.exitCode = 1; });
  } else { console.error('Unsupported controls mode'); process.exitCode = 1; }
}

