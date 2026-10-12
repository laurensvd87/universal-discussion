import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupScheduler } from '../ops/backup-scheduler.js';

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(extra = {}) {
  let time = 50_000, counter = 0;
  const timers = new Map(), history = [], operations = [];
  const scheduler = createBackupScheduler({ intervalMs: 1_000, staleAfterMs: 2_000,
    now: () => time,
    setTimeout(callback, delay) { const id = ++counter; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    backup: () => { operations.push('backup'); return { secret: 'RECOVERY_HANDLE_SECRET' }; },
    verify: () => { operations.push('verify'); return true; },
    prune: () => { operations.push('prune'); },
    onStatus: value => history.push(value), ...extra });
  function tick() {
    const [id, timer] = [...timers][0]; timers.delete(id); time += timer.delay; timer.callback();
  }
  return { scheduler, timers, history, operations, tick, setTime(value) { time = value; } };
}

test('Trust: throwing timer cancellation is sanitized and stale delivery cannot restart work', async () => {
  const f = harness({ clearTimeout() { throw new Error('PRIVATE_TIMER_SECRET'); } });
  f.scheduler.start();
  const oldCallback = [...f.timers.values()][0].callback;
  const shutdown = f.scheduler.stop();
  assert.equal(typeof shutdown.then, 'function');
  assert.equal(f.scheduler.stop(), shutdown);
  await shutdown;
  assert.equal(f.scheduler.getStatus().lastErrorCode, 'scheduler-failed');
  assert.equal(f.scheduler.getStatus().stopping, false);
  assert.equal(f.scheduler.start(), true);
  oldCallback(); await flush();
  assert.deepEqual(f.operations, []);
  assert.equal(JSON.stringify(f.history).includes('PRIVATE_TIMER_SECRET'), false);
  await f.scheduler.stop();
});

test('Trust: stop in the queued-before-hook window waits for actual settlement and cleanup', async () => {
  const pending = deferred(); let calls = 0, stopped = false;
  const f = harness({ backup: () => { calls++; return pending.promise; } });
  f.scheduler.start(); f.tick();
  const shutdown = f.scheduler.stop(); shutdown.then(() => { stopped = true; });
  assert.throws(() => f.scheduler.start(), /^Error: backup-scheduler-stopping$/);
  await flush(); assert.equal(calls, 1); assert.equal(stopped, false);
  pending.reject(new Error('PRIVATE_BACKUP_SECRET')); await shutdown;
  assert.equal(stopped, true); assert.deepEqual(f.operations, []);
  assert.equal(f.timers.size, 0);
  assert.equal(f.scheduler.getStatus().lastErrorCode, 'backup-failed');
});

test('Trust: reentrant stop during verification never skips verified-point retention or overlaps', async () => {
  const verification = deferred(), retention = deferred();
  let scheduler, shutdown, stopped = false, protectedPoint;
  const point = { secret: 'EXACT_POINT_SECRET' };
  const f = harness({ backup: () => point, verify: () => verification.promise,
    prune: policy => { protectedPoint = policy.protectedRecoveryPoint; return retention.promise; },
    onStatus(status) {
      if (status.phase === 'verify' && !shutdown) {
        shutdown = scheduler.stop(); shutdown.then(() => { stopped = true; });
      }
    } });
  scheduler = f.scheduler; scheduler.start(); f.tick(); await flush();
  assert.equal(scheduler.getStatus().lastSuccessAtMs, null);
  assert.equal(scheduler.getStatus().stopping, true);
  assert.equal(stopped, false); assert.equal(f.timers.size, 0);
  verification.resolve(true); await flush();
  assert.equal(protectedPoint, point); assert.equal(stopped, false);
  assert.equal(scheduler.getStatus().phase, 'prune');
  retention.resolve(); await shutdown;
  assert.equal(stopped, true); assert.equal(scheduler.getStatus().phase, 'idle');
  assert.equal(scheduler.getStatus().lastSuccessAtMs, 51_000);
});

test('Trust: a rejecting thenable cannot masquerade as verification or prune the last good point', async () => {
  const good = { secret: 'LAST_GOOD_RECOVERY_POINT' }, bad = { secret: 'UNVERIFIED_POINT' };
  let attempt = 0; const protectedPoints = [];
  const f = harness({ backup: () => ++attempt === 1 ? good : bad,
    verify: point => point === good ? true : { then(resolve, reject) { reject(new Error('PRIVATE_VERIFY_SECRET')); } },
    prune: policy => { assert.ok(Object.isFrozen(policy)); protectedPoints.push(policy.protectedRecoveryPoint); } });
  f.scheduler.start(); f.tick(); await flush(); f.tick(); await flush();
  assert.deepEqual(protectedPoints, [good]);
  assert.equal(f.scheduler.getStatus().lastSuccessAtMs, 51_000);
  assert.equal(f.scheduler.getStatus().backupStale, false);
  assert.equal(f.scheduler.getStatus().lastErrorCode, 'verification-failed');
  f.setTime(53_000); assert.equal(f.scheduler.getStatus().backupStale, true);
  assert.equal(JSON.stringify(f.history).includes('SECRET'), false);
  assert.equal(JSON.stringify(f.history).includes('RECOVERY_POINT'), false);
  await f.scheduler.stop();
});

test('Trust: failure to schedule the next slot leaves verified recovery intact and creates no retry loop', async () => {
  let armCalls = 0, queued;
  const f = harness({ setTimeout(callback) {
    if (++armCalls > 1) throw new Error('PRIVATE_TIMER_SECRET');
    queued = callback; return 7;
  } });
  f.scheduler.start(); f.setTime(51_000); queued(); await flush();
  assert.deepEqual(f.operations, ['backup', 'verify', 'prune']);
  assert.equal(armCalls, 2);
  const status = f.scheduler.getStatus();
  assert.equal(status.running, false); assert.equal(status.nextRunAtMs, null);
  assert.equal(status.lastSuccessAtMs, 51_000);
  assert.equal(status.lastErrorCode, 'scheduler-failed');
  await flush(); assert.equal(armCalls, 2);
  assert.equal(JSON.stringify(f.history).includes('SECRET'), false);
  await f.scheduler.stop();
});

test('Trust: invalid and overflowing clock readings fail closed without invoking backup', async () => {
  const f = harness();
  f.setTime(Number.MAX_SAFE_INTEGER);
  assert.throws(() => f.scheduler.start(), /^Error: backup-scheduler-timer$/);
  assert.equal(f.scheduler.getStatus().running, false);
  assert.equal(f.timers.size, 0); assert.deepEqual(f.operations, []);
  await f.scheduler.stop();
  const invalid = harness(); invalid.scheduler.start(); invalid.tick(); invalid.setTime(NaN);
  await flush();
  assert.deepEqual(invalid.operations, []); assert.equal(invalid.timers.size, 0);
  invalid.setTime(52_000);
  assert.equal(invalid.scheduler.getStatus().running, false);
  assert.equal(invalid.scheduler.getStatus().lastErrorCode, 'scheduler-failed');
  await invalid.scheduler.stop();
});
