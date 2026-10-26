import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { URLS, requestDecision, serializeSnapshot } from './run.mjs';

const request = (url = URLS[0], method = 'GET', resourceType = 'Document') => ({ url, method, resourceType });
const sha = value => createHash('sha256').update(value).digest('hex');
function snapshot() {
  return { expectedUrl: URLS[0], phase: 'dom-content-loaded', elapsedMs: 1234.4,
    capture: { contractVersion: 'page-content/1', status: 'collected', url: URLS[0], title: 'Invented diagnostic title',
      text: 'Invented synthetic body. '.repeat(30), extractorVersion: 'main-text-prefix/v1' },
    signals: { currentUrl: URLS[0], canonicalUrl: URLS[0], watchVideoId: '1y58ztVt5QU', metaVideoId: '1y58ztVt5QU', watchHeading: 'Invented video heading' } };
}

test('fixed four DEV navigation targets only; imports have no browser/network side effect', () => {
  assert.equal(URLS.length, 4); assert.ok(Object.isFrozen(URLS));
  for (const url of URLS) assert.equal(requestDecision(request(url)), 'allowed');
  for (const url of ['https://www.youtube.com/watch?v=unreviewed0', 'https://www.leukerecepten.nl/recepten/other/',
    'https://youtube.com/', 'https://www.gstatic.com/anything']) {
    assert.equal(requestDecision(request(url)), 'blocked-document');
  }
});

test('only GET/HEAD HTTPS requests of explicit types/hosts; no loopback or broad suffix allow', () => {
  assert.equal(requestDecision(request(URLS[0], 'HEAD')), 'allowed');
  assert.equal(requestDecision(request('https://www.youtube.com/s/player/fixture.js', 'GET', 'Script')), 'allowed');
  assert.equal(requestDecision(request('https://www.leukerecepten.nl/assets/style.css', 'GET', 'Stylesheet')), 'allowed');
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS', 'get']) assert.equal(requestDecision(request(URLS[0], method)), 'blocked-method-or-type');
  for (const url of ['http://www.youtube.com/watch?v=1y58ztVt5QU', 'https://a:b@www.youtube.com/', 'file:///D:/anything',
    'https://127.0.0.1/', 'https://localhost/', 'https://www.youtube.com.evil.invalid/', 'https://evil.youtube.com/',
    'https://www.youtube.com:444/watch?v=1y58ztVt5QU', 'data:text/plain,hello', 'wss://www.youtube.com/socket']) {
    assert.notEqual(requestDecision(request(url, 'GET', 'XHR')), 'allowed', url);
  }
});

test('consent/account requests blocked; no media/fonts/images/worker/websocket/download allowances', () => {
  assert.equal(requestDecision(request('https://consent.youtube.com/m', 'GET', 'Document')), 'blocked-consent');
  assert.equal(requestDecision(request('https://www.youtube.com/signin', 'GET', 'XHR')), 'blocked-account');
  for (const resourceType of ['Media', 'Image', 'Font', 'WebSocket', 'Manifest', 'Worker', 'ServiceWorker']) {
    assert.equal(requestDecision(request(URLS[0], 'GET', resourceType)), 'blocked-method-or-type');
  }
  for (const host of ['www.gstatic.com', 'i.ytimg.com', 's.ytimg.com']) {
    for (const type of ['Script', 'Stylesheet']) assert.equal(requestDecision(request(`https://${host}/asset`, 'GET', type)), 'allowed');
    assert.notEqual(requestDecision(request(`https://${host}/asset`, 'GET', 'XHR')), 'allowed');
  }
  for (const host of ['googlevideo.com', 'rr1.googlevideo.com', 'accounts.google.com', 'googleads.g.doubleclick.net']) {
    assert.equal(requestDecision(request(`https://${host}/asset`, 'GET', 'Script')), 'blocked-host');
  }
});

test('encoded account and telemetry paths cannot bypass request policy', () => {
  for (const path of ['/%73ignin', '/%6cogin', '/%61ccount', '/%6fauth', '/x%2Fsignin', '/%EF%BD%93ignin']) {
    assert.equal(requestDecision(request(`https://www.youtube.com${path}`, 'GET', 'XHR')), 'blocked-account', path);
  }
  for (const path of ['/%2573ignin', '/%252Flogin', '/%GG', '/%E0%A4%A', '/x%5Clogin', '/signin%3Fnext']) {
    assert.equal(requestDecision(request(`https://www.youtube.com${path}`, 'GET', 'XHR')), 'blocked-encoded-path', path);
  }
  for (const path of ['/api/stats/playback', '/%61pi/stats/watchtime', '/gen_204', '/generate_204']) {
    assert.equal(requestDecision(request(`https://www.youtube.com${path}`, 'GET', 'XHR')), 'blocked-telemetry', path);
  }
});

test('serialization keeps only bounded prefix and exact hashes, no full body or URL query tokens', () => {
  const s = snapshot(); s.signals.currentUrl += '&privateQuery=must-not-persist';
  const result = serializeSnapshot(s), bytes = JSON.stringify(result);
  assert.equal(result.capture.bodyPrefix.length, 160); assert.equal(result.capture.bodyLength, s.capture.text.length);
  assert.equal(result.capture.bodySha256, sha(s.capture.text)); assert.equal(result.capture.titleSha256, sha(s.capture.title));
  assert.equal(result.elapsedMs, 1234); assert.equal(result.nativeAttestation, false);
  assert.equal(result.videoIdMismatch, false); assert.equal(result.videoIdentityObserved, true);
  assert.equal(bytes.includes('must-not-persist'), false); assert.equal(bytes.includes(s.capture.text), false);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.capture) && Object.isFrozen(result.current));
});

test('SPA/video signals reveal mismatches without guessing identity when DOM evidence missing', () => {
  for (const field of ['watchVideoId', 'metaVideoId']) {
    const s = snapshot(); s.signals[field] = 'rd5EWR83AGs'; assert.equal(serializeSnapshot(s).videoIdMismatch, true);
  }
  const s = snapshot(); s.signals.canonicalUrl = URLS[2]; assert.equal(serializeSnapshot(s).videoIdMismatch, true);
  s.signals = { currentUrl: 'https://www.youtube.com/', canonicalUrl: '', watchVideoId: '', metaVideoId: '', watchHeading: '' };
  assert.equal(serializeSnapshot(s).videoIdentityObserved, false); assert.equal(serializeSnapshot(s).videoIdMismatch, false);
});

test('unsupported capture retained as unsupported, not silently replaced with body/title guesses', () => {
  const s = snapshot(); s.capture = { contractVersion: 'page-content/1', status: 'unsupported', reason: 'missing-region' };
  const result = serializeSnapshot(s); assert.deepEqual(result.capture, { status: 'unsupported', reason: 'missing-region' });
  assert.equal(Object.hasOwn(result.capture, 'bodyPrefix'), false); assert.equal(result.nativeAttestation, false);
});

test('malformed/unbounded snapshots and extra fields reject', () => {
  for (const change of [s => { s.expectedUrl = 'https://example.invalid/'; }, s => { s.phase = 'retry'; },
    s => { s.elapsedMs = Infinity; }, s => { s.capture.text = 'x'.repeat(4097); }, s => { s.capture.title = 'x'.repeat(201); },
    s => { s.signals.watchVideoId += 'long'; }, s => { s.signals.watchHeading = 'x'.repeat(161); },
    s => { s.capture.extractorVersion = 'unreviewed'; }, s => { s.capture.extra = true; },
    s => { s.signals.currentUrl = 'x'.repeat(2049); }, s => { s.extra = true; }]) {
    const s = snapshot(); change(s); assert.throws(() => serializeSnapshot(s));
  }
});

test('pure public helpers reject proxy/accessor/coercion inputs without invoking them', () => {
  let calls = 0;
  const proxy = new Proxy({}, { ownKeys() { calls++; throw Error('trap'); }, getPrototypeOf() { calls++; throw Error('trap'); } });
  assert.throws(() => requestDecision(proxy)); assert.throws(() => serializeSnapshot(proxy));
  const s = snapshot(); Object.defineProperty(s.capture, 'status', { enumerable: true, get() { calls++; return 'collected'; } });
  assert.throws(() => serializeSnapshot(s));
  const r = request(); Object.defineProperty(r, 'url', { enumerable: true, get() { calls++; return URLS[0]; } });
  assert.throws(() => requestDecision(r));
  assert.equal(requestDecision(request({ toString() { calls++; return URLS[0]; } })), 'blocked-method-or-type');
  assert.equal(calls, 0);
});
