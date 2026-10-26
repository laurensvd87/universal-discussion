import test from 'node:test';
import assert from 'node:assert/strict';
import { startPostgresIngestionWorkerLoop } from '../src/application/postgres-ingestion-worker-loop.js';

const selected = { operationId: 'private-operation-secret', input: { title: 'private-body-secret', url: 'https://private.invalid/secret' } };
const result = { version: { generation: 'private-generation-secret', revision: 77 } };

test('worker monotonic progress includes the actual awaited apply, with only fixed outcome/numeric fields', async () => {
  let time = 100, claims = 0, applied = 0;
  const progress = [], outcomes = [];
  const worker = startPostgresIngestionWorkerLoop({ monotonicNow: () => time,
    repository: {
      async claim() { time += 7; return ++claims === 1 ? selected : null; },
      async apply(claim, values) { assert.equal(claim, selected); assert.deepEqual(values, { representedValues: [1, 0] }); time += 3500; applied++; return result; },
      async failClaim() { assert.fail('unexpected failure write'); },
    }, referenceMatcher: { represent(input) { assert.equal(input, selected.input); time += 13; return [1, 0]; } },
    onProgress: event => progress.push(event), onOutcome: event => outcomes.push(event) });
  await worker.whenIdle(); await worker.close();
  assert.equal(applied, 1); assert.equal(progress.length, 1, 'idle polling emits no progress spam');
  assert.deepEqual(progress[0], { outcome: 'completed', claimMs: 7, prepareMs: 13, applyMs: 3500, totalMs: 3520, capped: 0 });
  assert.ok(Object.isFrozen(progress[0]));
  assert.doesNotMatch(JSON.stringify(progress), /private|secret|https|operationId|revision|generation/u);
  assert.deepEqual(outcomes, [{ outcome: 'completed', operationId: selected.operationId, version: result.version }],
    'existing trusted outcome payload is unchanged');
});

test('worker progress distinguishes fixed failures and includes deterministic failure-finalization time without retry', async () => {
  for (const mode of ['claim', 'deterministic', 'failure-write', 'representation', 'apply']) {
    let time = 0, claimed = 0, applied = 0, failed = 0, notify;
    const eventReady = new Promise(resolve => { notify = resolve; });
    const worker = startPostgresIngestionWorkerLoop({ monotonicNow: () => time,
      repository: {
        async claim() { time += 7; claimed++; if (mode === 'claim') throw Error('private-claim-secret'); return selected; },
        async apply() { time += 3500; applied++; throw Error('private-apply-secret'); },
        async failClaim(claim, value) { assert.equal(claim, selected); assert.deepEqual(value, { code: 'representation-failed' });
          time += 200; failed++; if (mode === 'failure-write') throw Error('private-write-secret'); return true; },
      }, referenceMatcher: { represent() { time += 13;
        if (['deterministic', 'failure-write'].includes(mode)) throw new TypeError('private-representation-secret');
        if (mode === 'representation') throw Error('private-representation-secret'); return [1, 0]; } },
      onProgress: notify });
    const event = await eventReady; await worker.close();
    const outcome = { claim: 'claim-failed', deterministic: 'representation-failed', 'failure-write': 'representation-uncertain',
      representation: 'representation-uncertain', apply: 'apply-uncertain' }[mode];
    assert.equal(event.outcome, outcome); assert.equal(event.claimMs, 7);
    assert.equal(event.prepareMs, mode === 'claim' ? 0 : 13);
    assert.equal(event.applyMs, mode === 'apply' ? 3500 : 0);
    assert.equal(event.totalMs, mode === 'claim' ? 7 : ['deterministic', 'failure-write'].includes(mode) ? 220 : mode === 'apply' ? 3520 : 20);
    assert.equal(event.capped, 0); assert.equal(claimed, 1); assert.equal(applied, mode === 'apply' ? 1 : 0);
    assert.equal(failed, ['deterministic', 'failure-write'].includes(mode) ? 1 : 0);
    assert.doesNotMatch(JSON.stringify(event), /private|secret|https|operationId/u);
  }
});

test('invalid or regressing diagnostic clocks suppress measurement without changing accepted work', async () => {
  let descending = 100;
  for (const monotonicNow of [() => NaN, () => -1, () => { throw Error('clock failed'); }, () => --descending]) {
    let claims = 0, applied = 0; const events = [];
    const worker = startPostgresIngestionWorkerLoop({ monotonicNow,
      repository: { async claim() { return ++claims === 1 ? selected : null; },
        async apply() { applied++; return result; }, async failClaim() { assert.fail('unexpected mutation'); } },
      referenceMatcher: { represent: () => [1, 0] }, onProgress: event => events.push(event) });
    await worker.whenIdle(); await worker.close();
    assert.equal(applied, 1); assert.deepEqual(events, []);
  }
});

test('progress observer failures cannot stop, retry or terminalize an accepted apply', async () => {
  for (const onProgress of [() => { throw Error('observer failed'); }, async () => { throw Error('observer failed'); }]) {
    let claims = 0, applied = 0, outcomes = 0;
    const worker = startPostgresIngestionWorkerLoop({ onProgress,
      repository: { async claim() { return ++claims === 1 ? selected : null; },
        async apply() { applied++; return result; }, async failClaim() { assert.fail('unexpected mutation'); } },
      referenceMatcher: { represent: () => [1, 0] }, onOutcome: () => outcomes++ });
    await worker.whenIdle(); await worker.close();
    assert.equal(applied, 1); assert.equal(outcomes, 1);
  }
});

test('aborted preparation still prevents apply and reports only a content-free elapsed outcome', async () => {
  let time = 0, worker, notify;
  const eventReady = new Promise(resolve => { notify = resolve; });
  worker = startPostgresIngestionWorkerLoop({ monotonicNow: () => time,
    repository: { async claim() { time += 5; return selected; },
      async apply() { assert.fail('abort must win'); }, async failClaim() { assert.fail('no failure write'); } },
    referenceMatcher: { represent() { time += 10; void worker.close(); return [1, 0]; } }, onProgress: notify });
  const event = await eventReady; await worker.close();
  assert.deepEqual(event, { outcome: 'aborted', claimMs: 5, prepareMs: 10, applyMs: 0, totalMs: 15, capped: 0 });
});

test('long elapsed measurements are explicitly capped rather than unbounded or nonfinite', async () => {
  const ticks = [0, 1, 2, 86_400_100]; let tick = 0, claims = 0; const events = [];
  const worker = startPostgresIngestionWorkerLoop({ monotonicNow: () => ticks[Math.min(tick++, ticks.length - 1)],
    repository: { async claim() { return ++claims === 1 ? selected : null; }, async apply() { return result; }, async failClaim() {} },
    referenceMatcher: { represent: () => [1, 0] }, onProgress: value => events.push(value) });
  await worker.whenIdle(); await worker.close();
  assert.deepEqual(events, [{ outcome: 'completed', claimMs: 1, prepareMs: 1, applyMs: 86_400_000, totalMs: 86_400_000, capped: 1 }]);
});
