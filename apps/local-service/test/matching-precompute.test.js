import assert from 'node:assert/strict';
import test from 'node:test';
import { startMatchingPrecompute } from '../src/application/matching-precompute.js';
import { canonicalReadInput } from '../src/application/canonical-read-queue.js';
import { createRequestHandler } from '../src/http/request-handler.js';
import { demoService } from './helpers.js';

const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
function fixture() {
  const timers = new Map(), jobs = []; let serial = 0, revision = 0, listener, unsubscribed = false;
  const repository = { version: () => ({ generation: 'synthetic-warm-generation', revision }),
    subscribeMatching(value) { listener = value; return () => { unsubscribed = true; listener = null; }; } };
  const executor = { read(method, input, options) {
    return new Promise((resolve, reject) => { jobs.push({ method, input, options, resolve, reject }); });
  } };
  const controller = startMatchingPrecompute({ repository, executor,
    schedule(callback) { const id = { serial: ++serial, unref() {} }; timers.set(id, callback); return id; },
    cancelSchedule(id) { timers.delete(id); } });
  return { controller, timers, jobs, change() { revision++; listener?.({ version: repository.version() }); },
    comment() { revision++; }, tick() { const [id, callback] = [...timers][0]; timers.delete(id); callback(); },
    get unsubscribed() { return unsubscribed; } };
}

test('startup preparation is a version-only internal read, never a page or actor request', async () => {
  const f = fixture(); assert.equal(f.timers.size, 1); f.tick(); await flush();
  assert.equal(f.jobs.length, 1); assert.equal(f.jobs[0].method, 'warmMatching'); assert.equal(f.jobs[0].input, null);
  assert.deepEqual(f.jobs[0].options.version, { generation: 'synthetic-warm-generation', revision: 0 });
  f.jobs[0].resolve(f.jobs[0].options.version); await flush(); assert.equal(f.timers.size, 0); f.controller.close();
});

test('messages never schedule preparation; many Source changes coalesce into one pending latest-version flight', async () => {
  const f = fixture(); f.tick(); await flush();
  for (let i = 0; i < 100; i++) f.comment();
  assert.equal(f.jobs.length, 1); assert.equal(f.timers.size, 0);
  for (let i = 0; i < 100; i++) f.change();
  assert.equal(f.jobs.length, 1); assert.equal(f.timers.size, 0);
  f.jobs[0].reject(Object.assign(new Error('Old version'), { code: 'conflict' })); await flush();
  assert.equal(f.timers.size, 1); f.tick(); await flush(); assert.equal(f.jobs.length, 2);
  assert.equal(f.jobs[1].options.version.revision, 200); f.jobs[1].resolve(f.jobs[1].options.version); await flush();
  assert.equal(f.timers.size, 0); f.controller.close();
});

test('failure never spins or retries commands; a later real Source change can prepare again', async () => {
  const f = fixture(); f.tick(); await flush(); f.jobs[0].reject(new Error('Synthetic capacity')); await flush();
  assert.equal(f.timers.size, 0); f.change(); assert.equal(f.timers.size, 1);
  f.tick(); await flush(); assert.equal(f.jobs.length, 2); f.jobs[1].resolve({}); await flush(); f.controller.close();
});

test('close releases timers/subscription and aborts only disposable preparation', async () => {
  const queued = fixture(); queued.controller.close(); assert.equal(queued.timers.size, 0); assert.equal(queued.unsubscribed, true);
  queued.change(); assert.equal(queued.timers.size, 0);
  const active = fixture(); active.tick(); await flush(); active.change(); active.controller.close();
  assert.equal(active.jobs[0].options.signal.aborted, true); active.jobs[0].resolve({}); await flush();
  assert.equal(active.timers.size, 0); assert.equal(active.unsubscribed, true);
});

test('internal warm input is fixed null and has no public HTTP or public service read route', async () => {
  const version = { generation: 'synthetic-warm-generation', revision: 0 };
  assert.deepEqual(canonicalReadInput('warmMatching', null, version), { method: 'warmMatching', input: null, version });
  assert.throws(() => canonicalReadInput('warmMatching', { sourceId: 'caller-chosen' }, version));
  const service = demoService(); assert.throws(() => service.readPublic('warmMatching', null), error => error.code === 'invalid');
  const config = { hostHeader: '127.0.0.1:4174', origin: `chrome-extension://${'a'.repeat(32)}`, capability: 'synthetic-warm-capability' };
  const handle = createRequestHandler({ config, service });
  const response = await handle({ method: 'POST', url: '/v1/warm-matching', body: '{}',
    headers: { host: config.hostHeader, origin: config.origin, authorization: `Bearer ${config.capability}`, 'content-type': 'application/json' } });
  assert.equal(response.status, 404);
});
