import assert from 'node:assert/strict';
import test from 'node:test';
import { createTargetSetupLifetime, isTargetSetupCanceled } from '../harness/target-setup-lifetime.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('actual detach cancels a paused setup and prevents subsequent commands', async () => {
  const lifetime = createTargetSetupLifetime(), paused = deferred(), commands = [];
  const setup = (async () => {
    await lifetime.step(() => { commands.push('enable'); return paused.promise; });
    await lifetime.step(() => { commands.push('resume'); });
    lifetime.complete();
  })();
  await Promise.resolve();
  lifetime.detach();
  await assert.rejects(setup, isTargetSetupCanceled);
  assert.deepEqual(commands, ['enable']);
  assert.equal(lifetime.abandoned, true);
  paused.resolve();
});

test('a live target timeout rejects without cancellation', async () => {
  const lifetime = createTargetSetupLifetime(), failure = new Error('Synthetic live timeout');
  await assert.rejects(lifetime.step(() => Promise.reject(failure)), error => error === failure);
  assert.equal(lifetime.abandoned, false);
});

test('a fault observed before detach remains a fault', async () => {
  const lifetime = createTargetSetupLifetime(), failure = new Error('Synthetic setup failure');
  const outcome = lifetime.step(() => Promise.reject(failure));
  await assert.rejects(outcome, error => error === failure);
  lifetime.detach();
  await assert.rejects(outcome, error => error === failure);
});

test('a command rejection queued before detach wins even in the same turn', async () => {
  const lifetime = createTargetSetupLifetime(), paused = deferred(), failure = new Error('Synthetic earlier rejection');
  const outcome = lifetime.step(() => paused.promise);
  paused.reject(failure);
  lifetime.detach();
  await assert.rejects(outcome, error => error === failure);
});

test('a late failure of an actually canceled step stays handled', async () => {
  const lifetime = createTargetSetupLifetime(), paused = deferred();
  const outcome = lifetime.step(() => paused.promise);
  await Promise.resolve();
  lifetime.detach();
  await assert.rejects(outcome, isTargetSetupCanceled);
  paused.reject(new Error('Synthetic late timeout'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(lifetime.abandoned, true);
});

test('completed setup is not abandoned when its target later detaches', async () => {
  const lifetime = createTargetSetupLifetime();
  assert.equal(await lifetime.step(() => Promise.resolve('ready')), 'ready');
  lifetime.complete();
  lifetime.detach();
  assert.equal(lifetime.abandoned, false);
});
