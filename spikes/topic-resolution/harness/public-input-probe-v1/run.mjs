// Inert unless explicitly supervised. Public DEV input diagnosis, never native
// attestation, ingestion, matching, provider use or quality-test evidence.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFile, stat, lstat, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

export const URLS = Object.freeze([
  'https://www.youtube.com/watch?v=1y58ztVt5QU',
  'https://www.youtube.com/watch?v=rd5EWR83AGs',
  'https://www.youtube.com/watch?v=A0fECnj5sas',
  'https://www.leukerecepten.nl/recepten/kapsalon-maken/',
]);
const HERE = dirname(fileURLToPath(import.meta.url)), OUTPUT = resolve(HERE, 'output');
const READER = resolve(HERE, '../..', 'browser/chromium/page-content-reader.js');
const READER_SHA = 'c7946a7e19adb3fd9c14b2304101dbd3bf8b7c92fd1ab7c3ba679104b55e428f';
const HANDSHAKE = 'PUBLIC_INPUT_PROBE_JOB_ASSIGNED_V1\n';
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = () => { throw Error('Public input probe validation failed'); };
const HOSTS = new Set(['www.youtube.com', 'youtube.com', 'www.leukerecepten.nl']);
const SCRIPT_HOSTS = new Set(['www.gstatic.com', 'i.ytimg.com', 's.ytimg.com']);
const RESOURCE_TYPES = new Set(['Document', 'Script', 'Stylesheet', 'XHR', 'Fetch', 'Other']);
function record(value, fields) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).length !== fields.length) fail();
  const out = {};
  for (const field of fields) {
    const d = Object.getOwnPropertyDescriptor(value, field);
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); out[field] = d.value;
  }
  return out;
}
function bounded(value, maximum) {
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail();
  return value;
}
export function requestDecision(input) {
  const a = record(input, ['url', 'method', 'resourceType']);
  if (typeof a.url !== 'string' || a.url.length > 4096 || !['GET', 'HEAD'].includes(a.method) || !RESOURCE_TYPES.has(a.resourceType)) return 'blocked-method-or-type';
  let u; try { u = new URL(a.url); } catch { return 'blocked-url'; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return 'blocked-url';
  if (u.hostname === 'consent.youtube.com') return 'blocked-consent';
  let path;
  try { path = decodeURIComponent(u.pathname).normalize('NFKC'); } catch { return 'blocked-encoded-path'; }
  if (/[%\\?#\p{Cc}\p{Cf}\p{White_Space}]/u.test(path)) return 'blocked-encoded-path';
  if (/\/(?:signin|login|logout|accounts?|oauth|authorize)(?:\/|$)/iu.test(path)) return 'blocked-account';
  if (/^\/(?:api\/stats|gen_204|generate_204)(?:\/|$)/iu.test(path)) return 'blocked-telemetry';
  if (a.resourceType === 'Document' && !URLS.includes(u.href)) return 'blocked-document';
  if (HOSTS.has(u.hostname)) return 'allowed';
  if (SCRIPT_HOSTS.has(u.hostname) && ['Script', 'Stylesheet'].includes(a.resourceType)) return 'allowed';
  return 'blocked-host';
}
function urlSignal(value) {
  bounded(value, 2048);
  if (!value) return { origin: null, pathname: null, videoId: null };
  let u; try { u = new URL(value); } catch { fail(); }
  if (u.protocol !== 'https:' || u.username || u.password) return { origin: null, pathname: null, videoId: null };
  const videoId = u.searchParams.get('v');
  return { origin: u.origin, pathname: u.pathname.slice(0, 256), videoId: /^[A-Za-z0-9_-]{11}$/u.test(videoId ?? '') ? videoId : null };
}
export function serializeSnapshot(input) {
  const a = record(input, ['expectedUrl', 'phase', 'elapsedMs', 'capture', 'signals']);
  if (!URLS.includes(a.expectedUrl) || !['dom-content-loaded', 'plus-2s', 'plus-8s'].includes(a.phase) ||
      !Number.isFinite(a.elapsedMs) || a.elapsedMs < 0 || a.elapsedMs > 180000) fail();
  const c = a.capture;
  if (!c || typeof c !== 'object' || types.isProxy(c)) fail();
  const status = Object.getOwnPropertyDescriptor(c, 'status');
  if (!status?.enumerable || !Object.hasOwn(status, 'value')) fail();
  let capture;
  if (status.value === 'collected') {
    const r = record(c, ['contractVersion', 'status', 'url', 'title', 'text', 'extractorVersion']);
    if (r.contractVersion !== 'page-content/1' || r.url !== a.expectedUrl ||
        !['main-text-prefix/v1', 'article-container-prefix/v1'].includes(r.extractorVersion)) fail();
    bounded(r.title, 200); bounded(r.text, 4096);
    capture = { status: 'collected', extractorVersion: r.extractorVersion, title: r.title,
      titleSha256: sha(r.title), bodyLength: r.text.length, bodySha256: sha(r.text), bodyPrefix: r.text.slice(0, 160) };
  } else {
    const r = record(c, ['contractVersion', 'status', 'reason']);
    if (r.contractVersion !== 'page-content/1' || r.status !== 'unsupported') fail();
    capture = { status: 'unsupported', reason: bounded(r.reason, 80) };
  }
  const s = record(a.signals, ['currentUrl', 'canonicalUrl', 'watchVideoId', 'metaVideoId', 'watchHeading']);
  for (const key of ['watchVideoId', 'metaVideoId']) if (s[key] !== '' && (typeof s[key] !== 'string' || !/^[A-Za-z0-9_-]{11}$/u.test(s[key]))) fail();
  bounded(s.watchHeading, 160);
  const current = urlSignal(s.currentUrl), canonical = urlSignal(s.canonicalUrl), expected = new URL(a.expectedUrl).searchParams.get('v');
  const ids = [current.videoId, canonical.videoId, s.watchVideoId || null, s.metaVideoId || null].filter(Boolean);
  return Object.freeze({ expectedUrl: a.expectedUrl, phase: a.phase, elapsedMs: Math.round(a.elapsedMs), capture: Object.freeze(capture),
    current: Object.freeze(current), canonical: Object.freeze(canonical), watchVideoId: s.watchVideoId || null,
    metaVideoId: s.metaVideoId || null, watchHeading: s.watchHeading,
    videoIdMismatch: expected ? ids.some(id => id !== expected) : false,
    videoIdentityObserved: expected ? ids.length > 0 : false, nativeAttestation: false });
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
        if (message.error) p.reject(Error('CDP command rejected')); else p.resolve(message.result);
      } else if (message.method) for (const fn of listeners.get(message.method) ?? []) fn(message.params, message.sessionId);
    }
  });
  return {
    send(method, params = {}, sessionId) {
      if (ended || pending.size >= 128) return Promise.reject(Error('CDP capacity/unavailable'));
      return new Promise((resolve, reject) => {
        const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP deadline')); }, 10000);
        pending.set(id, { resolve, reject, timer });
        input.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0', error => { if (error) broken(); });
      });
    },
    on(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); return () => listeners.get(name)?.delete(fn); },
    async close() {
      await this.send('Browser.close').catch(() => {}); child.kill(); broken(); input.destroy(); output.destroy(); listeners.clear();
    },
  };
}
async function handshake() {
  if (process.platform !== 'win32' || process.env.MURMINGLE_PUBLIC_INPUT_PROBE_V1_SUPERVISED !== '1') fail();
  await new Promise((accept, reject) => {
    let value = '';
    const finish = error => { clearTimeout(timer); process.stdin.off('data', data); process.stdin.off('end', end); process.stdin.pause(); error ? reject(error) : accept(); };
    const data = chunk => { value += chunk.toString('utf8'); if (value.length > HANDSHAKE.length) finish(Error('Invalid job handshake')); else if (value === HANDSHAKE) finish(); };
    const end = () => finish(Error('Missing job handshake'));
    const timer = setTimeout(() => finish(Error('Job handshake deadline')), 5000);
    process.stdin.on('data', data); process.stdin.on('end', end); process.stdin.resume();
  });
}
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
async function deadline(promise, ms, fallback) {
  let timer;
  try { return await Promise.race([promise, new Promise(yes => { timer = setTimeout(() => yes(fallback), ms); })]); }
  finally { clearTimeout(timer); }
}
async function absent(path) { try { await lstat(path); fail(); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
async function sourceHash(path, maximum) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum) fail();
  const bytes = await readFile(path); if (bytes.length > maximum) fail(); return sha(bytes);
}
async function executable() {
  for (const path of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) {
    try { if ((await lstat(path)).isFile() && !(await lstat(path)).isSymbolicLink()) return path; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  throw Error('Installed Chrome unavailable');
}
async function run() {
  // No browser, directory creation or capture may precede job assignment.
  await handshake();
  if (!/^D:/iu.test(HERE) || (await lstat(OUTPUT)).isSymbolicLink() || !(await stat(OUTPUT)).isDirectory()) fail();
  const profile = resolve(OUTPUT, 'profile'), marker = resolve(OUTPUT, 'node.started.json'), resultPath = resolve(OUTPUT, 'result.json');
  for (const path of [profile, marker, resultPath]) await absent(path);
  const readerBytes = await readFile(READER);
  if (readerBytes.length > 65536 || sha(readerBytes) !== READER_SHA) throw Error('Page reader source changed; review required');
  const sourcePaths = { 'run.mjs': fileURLToPath(import.meta.url), 'supervise.py': resolve(HERE, 'supervise.py'), 'page-content-reader.js': READER };
  const sourceHashes = {};
  for (const [name, path] of Object.entries(sourcePaths)) sourceHashes[name] = await sourceHash(path, 256 * 1024);
  if (sourceHashes['page-content-reader.js'] !== READER_SHA) throw Error('Reader source drift before import');
  const { collectPageContent } = await import(pathToFileURL(READER).href);
  const chromePath = await executable();
  await writeFile(marker, JSON.stringify({ schema: 'public-input-probe-started/v1', sourceHashes, readerSha256: READER_SHA, noAutomaticRepeat: true }), { flag: 'wx' });
  await mkdir(profile);
  const browser = pipe(chromePath, profile), began = performance.now(), snapshots = [], navigations = [];
  let mainSession, setupResolve, setupReject, fatal = null, requests = 0, finishing = false, result;
  const operations = new Set();
  const setup = new Promise((yes, no) => { setupResolve = yes; setupReject = no; });
  const counts = { allowed: 0, blocked: 0, consentBlocked: 0, failed: 0, response2xx: 0, response3xx: 0, response4xx5xx: 0 };
  const abort = () => { fatal ??= Error('Interception/target resource boundary failed'); setupReject(fatal); };
  const track = promise => {
    const operation = promise.catch(abort).finally(() => operations.delete(operation));
    operations.add(operation);
  };
  const drain = async () => {
    const until = performance.now() + 2500;
    while (operations.size && performance.now() < until) await sleep(10);
    if (operations.size) throw Error('Pending protocol callbacks did not drain');
  };
  browser.on('Target.attachedToTarget', (p) => {
    track((async () => {
      if (p.targetInfo.type !== 'page' || mainSession || p.targetInfo.url !== 'about:blank') {
        const closed = await browser.send('Target.closeTarget', { targetId: p.targetInfo.targetId });
        if (!closed.success) throw Error('Cannot close paused target'); return;
      }
      mainSession = p.sessionId;
      await browser.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, mainSession);
      await browser.send('Network.enable', {}, mainSession);
      await browser.send('Network.setBypassServiceWorker', { bypass: true }, mainSession);
      await browser.send('Network.setCacheDisabled', { cacheDisabled: true }, mainSession);
      await browser.send('Network.setBlockedURLs', { urls: ['ws://*', 'wss://*'] }, mainSession);
      await browser.send('ServiceWorker.stopAllWorkers', {}, mainSession);
      await browser.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, mainSession);
      await browser.send('Page.enable', {}, mainSession);
      await browser.send('Page.setLifecycleEventsEnabled', { enabled: true }, mainSession);
      await browser.send('Runtime.runIfWaitingForDebugger', {}, mainSession); setupResolve();
    })());
  });
  browser.on('Fetch.requestPaused', (p, session) => {
    track((async () => {
      if (session !== mainSession || ++requests > 4096) throw Error('Request capacity');
      const verdict = finishing ? 'blocked-finishing' : requestDecision({ url: p.request.url, method: p.request.method, resourceType: p.resourceType });
      if (verdict === 'allowed') {
        counts.allowed++;
        const headers = Object.entries(p.request.headers).filter(([name]) => !/^(?:cookie|authorization|proxy-authorization)$/iu.test(name)).map(([name, value]) => ({ name, value: String(value) }));
        await browser.send('Fetch.continueRequest', { requestId: p.requestId, headers }, session);
      } else {
        counts.blocked++; if (verdict === 'blocked-consent') counts.consentBlocked++;
        await browser.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }, session);
      }
    })());
  });
  browser.on('Page.javascriptDialogOpening', (_, session) => { track(browser.send('Page.handleJavaScriptDialog', { accept: false }, session)); });
  browser.on('Network.loadingFailed', () => { counts.failed++; });
  browser.on('Network.responseReceived', p => {
    const n = p.response.status; if (n >= 200 && n < 300) counts.response2xx++; else if (n >= 300 && n < 400) counts.response3xx++; else if (n >= 400) counts.response4xx5xx++;
  });
  try {
    await browser.send('Browser.setDownloadBehavior', { behavior: 'deny' });
    await browser.send('Browser.resetPermissions');
    for (const host of HOSTS) await browser.send('Browser.grantPermissions', { origin: `https://${host}`, permissions: [] });
    await browser.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    await browser.send('Target.createTarget', { url: 'about:blank' });
    if (await deadline(setup.then(() => true), 10000, false) !== true) throw Error('Target setup deadline');
    for (const expectedUrl of URLS) {
      if (fatal || performance.now() - began > 150000) throw Error('Diagnostic boundary/deadline');
      const navigationStart = performance.now();
      let loadedResolve, navigationLoader, navigationFrame;
      const observedDcl = [];
      const loaded = new Promise(yes => { loadedResolve = yes; });
      const remove = browser.on('Page.lifecycleEvent', (event, session) => {
        if (session !== mainSession || event.name !== 'DOMContentLoaded') return;
        if (observedDcl.length >= 32) { abort(); return; }
        observedDcl.push({ loaderId: event.loaderId, frameId: event.frameId });
        if (event.loaderId === navigationLoader && event.frameId === navigationFrame) loadedResolve(true);
      });
      const nav = await browser.send('Page.navigate', { url: expectedUrl }, mainSession);
      navigationLoader = nav.loaderId; navigationFrame = nav.frameId;
      if (navigationLoader && observedDcl.some(e => e.loaderId === navigationLoader && e.frameId === navigationFrame)) loadedResolve(true);
      const dcl = !nav.errorText && navigationLoader && await deadline(loaded, 20000, false);
      remove();
      navigations.push({ expectedUrl, domContentLoaded: Boolean(dcl), navigationError: Boolean(nav.errorText), elapsedMs: Math.round(performance.now() - navigationStart) });
      if (!dcl) { await browser.send('Page.stopLoading', {}, mainSession); continue; }
      const loadedAt = performance.now();
      for (const [phase, delay] of [['dom-content-loaded', 0], ['plus-2s', 2000], ['plus-8s', 8000]]) {
        await sleep(Math.max(0, loadedAt + delay - performance.now())); if (fatal) throw fatal;
        const tree = await browser.send('Page.getFrameTree', {}, mainSession);
        const world = await browser.send('Page.createIsolatedWorld', { frameId: tree.frameTree.frame.id, worldName: 'murmingle-public-input-probe-v1', grantUniveralAccess: false }, mainSession);
        const expression = `(() => { const capture=(${collectPageContent.toString()})(${JSON.stringify(expectedUrl)}); const head=document.head;
          let canonicalUrl=''; let n=0; for(let e=head?.firstElementChild;e&&n++<128;e=e.nextElementSibling){if(e.tagName==='LINK'&&e.getAttribute('rel')==='canonical'){canonicalUrl=(e.getAttribute('href')||'').slice(0,2048);break;}}
          const watch=document.querySelector('ytd-watch-flexy'), meta=document.querySelector('meta[itemprop="videoId"]');
          const heading=document.querySelector('ytd-watch-metadata h1');let watchHeading='';let k=0;
          for(let c=heading?.firstChild;c&&k++<16;c=c.nextSibling){if(c.nodeType===3)watchHeading+=c.substringData(0,160-watchHeading.length);if(watchHeading.length>=160)break;}
          return {capture,signals:{currentUrl:location.href.slice(0,2048),canonicalUrl:canonicalUrl?new URL(canonicalUrl,location.href).href.slice(0,2048):'',watchVideoId:(watch?.getAttribute('video-id')||'').slice(0,64),metaVideoId:(meta?.getAttribute('content')||'').slice(0,64),watchHeading}};})()`;
        const response = await browser.send('Runtime.evaluate', { expression, contextId: world.executionContextId, returnByValue: true, timeout: 1000 }, mainSession);
        if (response.exceptionDetails || !response.result?.value) throw Error('Isolated snapshot unavailable');
        snapshots.push(serializeSnapshot({ expectedUrl, phase, elapsedMs: performance.now() - began, ...response.result.value }));
      }
      await browser.send('Page.stopLoading', {}, mainSession);
    }
    if (fatal) throw fatal;
    result = { schema: 'public-input-probe/v1', sourceHashes, readerSha256: READER_SHA, navigations, snapshots, requestCounts: counts,
      elapsedMs: Math.round(performance.now() - began), isolatedFreshProfile: true, consentNotBypassed: true,
      noNativeAttestation: true, noCanonicalWrites: true, noModelCalls: true, productionValidated: false,
      purpose: 'fixed-public-DEV-input-diagnosis-not-quality-test',
      networkScopeLimit: 'Tab interception does not attest complete Chrome/OS background egress isolation.' };
  } finally {
    finishing = true;
    try { await drain(); } finally { await browser.close(); }
    await drain();
  }
  if (fatal || operations.size || !result) throw Error('Unsettled diagnostic callbacks');
  for (const [name, path] of Object.entries(sourcePaths)) {
    if (await sourceHash(path, 256 * 1024) !== sourceHashes[name]) throw Error('Diagnostic source drift');
  }
  if (sourceHashes['page-content-reader.js'] !== READER_SHA) throw Error('Reader drift');
  result.protocolCallbacksDrained = true; result.sourceHashesRechecked = true;
  const bytes = JSON.stringify(result); if (Buffer.byteLength(bytes) > 192 * 1024) throw Error('Result capacity');
  await writeFile(resultPath, bytes, { flag: 'wx' }); console.log(JSON.stringify({ status: 'diagnostic-complete', snapshots: snapshots.length, resultSha256: sha(bytes) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length === 2) console.log('No action. Explicit supervised --run-public-input-probe required.');
  else if (process.argv.length === 3 && process.argv[2] === '--run-public-input-probe') {
    await run().catch(() => { console.error('Public input probe refused or failed; no automatic retry.'); process.exitCode = 1; });
  } else { console.error('Unsupported public input probe mode'); process.exitCode = 1; }
}
