import test from 'node:test';
import assert from 'node:assert/strict';
import { SETUP_STAGES, CompatibilityProtocolError, projectCompatibilityStage, projectBrowserVersion } from './run.mjs';

const version = () => ({ protocolVersion: '1.3', product: 'Chrome/143.0.1234.56',
  revision: 'must-not-persist-revision', userAgent: 'must-not-persist-ua', jsVersion: 'must-not-persist-js' });

test('version observation retains only bounded protocol and numeric Chrome major', () => {
  const d = projectBrowserVersion(version());
  assert.deepEqual(d, { protocolVersion: '1.3', chromeMajor: 143 }); assert.ok(Object.isFrozen(d));
  const serialized = JSON.stringify(d); assert.equal(serialized.includes('must-not-persist'), false);
  assert.deepEqual(projectBrowserVersion({ ...version(), product: 'HeadlessChrome/144.0.1.2' }), { protocolVersion: '1.3', chromeMajor: 144 });
});

test('version projection rejects arbitrary identities, malformed protocol and unbounded fields', () => {
  for (const change of [v => { v.protocolVersion = 'secret arbitrary server text'; }, v => { v.product = 'OtherBrowser/3.4'; },
    v => { v.product = 'Chrome/143.0.0.0 extra'; }, v => { v.userAgent = 'x'.repeat(513); },
    v => { v.extra = true; }, v => { delete v.revision; }]) {
    const v = version(); change(v); assert.throws(() => projectBrowserVersion(v));
  }
});

test('fixed command error metadata exposes method and integer code, never protocol server text', () => {
  const error = new CompatibilityProtocolError('ServiceWorker.stopAllWorkers', -32601);
  assert.equal(error.method, 'ServiceWorker.stopAllWorkers'); assert.equal(error.code, -32601);
  assert.equal(error.message, 'Reviewed CDP command rejected');
  const d = projectCompatibilityStage({ stage: 'stop-service-workers', status: 'rejected', code: error.code });
  assert.deepEqual(d, { stage: 'stop-service-workers', method: 'ServiceWorker.stopAllWorkers', status: 'rejected', code: -32601 });
  assert.ok(Object.isFrozen(d)); assert.equal(Object.hasOwn(d, 'params'), false); assert.equal(Object.hasOwn(d, 'message'), false);
});

test('stage allowlist mirrors blank setup and cannot smuggle navigation or arbitrary commands', () => {
  assert.ok(Object.isFrozen(SETUP_STAGES)); assert.equal(Object.values(SETUP_STAGES).includes('Page.navigate'), false);
  assert.equal(Object.values(SETUP_STAGES).includes('Runtime.evaluate'), false);
  for (const stage of Object.keys(SETUP_STAGES)) {
    const d = projectCompatibilityStage({ stage, status: 'ok', code: null }); assert.equal(d.method, SETUP_STAGES[stage]);
  }
  assert.equal(SETUP_STAGES['empty-permissions-1'], 'Browser.grantPermissions');
  assert.equal(SETUP_STAGES['empty-permissions-2'], 'Browser.grantPermissions');
  assert.equal(SETUP_STAGES['empty-permissions-3'], 'Browser.grantPermissions');
  for (const stage of ['Page.navigate', 'https://example.invalid/', '__proto__', 'unknown-stage']) {
    assert.throws(() => projectCompatibilityStage({ stage, status: 'ok', code: null }));
  }
  assert.throws(() => new CompatibilityProtocolError('Page.navigate', -32601));
});

test('stage schema, status/code correspondence and signed integer bounds reject malformed metadata', () => {
  for (const input of [{ stage: 'browser-version', status: 'ok', code: -32601 },
    { stage: 'browser-version', status: 'rejected', code: null }, { stage: 'browser-version', status: 'rejected', code: -1.5 },
    { stage: 'browser-version', status: 'rejected', code: -2147483649 }, { stage: 'browser-version', status: 'rejected', code: Infinity },
    { stage: 'browser-version', status: 'failed: server leaked text', code: null },
    { stage: 'browser-version', status: 'ok', code: null, responseText: 'private' }]) {
    assert.throws(() => projectCompatibilityStage(input));
  }
  assert.equal(projectCompatibilityStage({ stage: 'close-browser', status: 'transport-unavailable', code: null }).code, null);
});

test('proxy/getter/coercion inputs do not execute in safe projectors', () => {
  let calls = 0;
  const proxy = new Proxy({}, { getPrototypeOf() { calls++; throw Error('trap'); }, ownKeys() { calls++; throw Error('trap'); } });
  assert.throws(() => projectBrowserVersion(proxy)); assert.throws(() => projectCompatibilityStage(proxy));
  const v = version(); Object.defineProperty(v, 'product', { enumerable: true, get() { calls++; return 'Chrome/143.0'; } });
  assert.throws(() => projectBrowserVersion(v));
  const stage = { stage: 'browser-version', status: 'ok', code: null };
  Object.defineProperty(stage, 'code', { enumerable: true, get() { calls++; return null; } });
  assert.throws(() => projectCompatibilityStage(stage));
  assert.throws(() => new CompatibilityProtocolError({ toString() { calls++; return 'Browser.close'; } }, -32601));
  assert.equal(calls, 0);
});
