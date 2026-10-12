import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupScheduler } from '../ops/backup-scheduler.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function fixture(extra = {}) {
  let time = 10_000, id = 0;
  const timers = new Map(), calls = [], statuses = [];
  const options = { intervalMs: 1_000, staleAfterMs: 3_000,
    now: () => time,
    setTimeout: (callback, delay) => { timers.set(++id, { callback, at: time + delay }); return id; },
    clearTimeout: handle => timers.delete(handle),
    backup: async () => { calls.push('backup'); return 'opaque-secret-handle'; },
    verify: async point => { calls.push(['verify', point]); return true; },
    prune: async policy => calls.push(['prune', policy]),
    onStatus: status => statuses.push(status), ...extra };
  const scheduler = createBackupScheduler(options);
  async function advance(ms) {
    time += ms;
    // Snapshot due timers; do not fabricate a catch-up loop.
    for (const [handle, timer] of [...timers]) if (timer.at <= time) {
      timers.delete(handle); timer.callback();
    }
    await flush();
  }
  return { scheduler, advance, timers, calls, statuses, setTime: value => { time = value; } };
}

test('construction/import are dormant; start is explicit/idempotent and first run is delayed', async () => {
  const f = fixture();
  assert.equal(f.timers.size, 0); assert.deepEqual(f.calls, []);
  assert.equal(f.scheduler.getStatus().backupStale, true);
  assert.equal(f.scheduler.start(), true); assert.equal(f.scheduler.start(), false);
  assert.equal(f.timers.size, 1);
  await f.advance(999); assert.deepEqual(f.calls, []);
  await f.advance(1);
  assert.deepEqual(f.calls, ['backup', ['verify', 'opaque-secret-handle'],
    ['prune', { protectedRecoveryPoint: 'opaque-secret-handle' }]]);
  assert.equal(f.scheduler.getStatus().lastSuccessAtMs, 11_000);
  assert.equal(f.scheduler.getStatus().lastVerifiedAtMs, 11_000);
  assert.equal(f.scheduler.getStatus().nextRunAtMs, 12_000);
  await f.scheduler.stop(); assert.equal(f.timers.size, 0);
});

test('shutdown waits through backup, verification and retention; start cannot release the lock', async () => {
  const backup = deferred(), verify = deferred(), prune = deferred();
  const f = fixture({ backup: () => backup.promise, verify: () => verify.promise, prune: () => prune.promise });
  f.scheduler.start(); await f.advance(1_000);
  let stopped = false;
  const shutdown = f.scheduler.stop(); shutdown.then(() => { stopped = true; });
  assert.equal(f.scheduler.stop(), shutdown);
  assert.throws(() => f.scheduler.start(), /backup-scheduler-stopping/);
  await f.advance(100_000); assert.equal(stopped, false); assert.equal(f.timers.size, 0);
  backup.resolve('point'); await flush();
  assert.equal(f.scheduler.getStatus().phase, 'verify'); assert.equal(stopped, false);
  assert.equal(f.scheduler.getStatus().lastSuccessAtMs, null);
  verify.resolve(true); await flush();
  assert.equal(f.scheduler.getStatus().phase, 'prune'); assert.equal(stopped, false);
  assert.equal(f.scheduler.getStatus().backupAgeMs, 100_000);
  assert.equal(f.scheduler.getStatus().backupStale, true);
  prune.resolve(); await shutdown;
  assert.equal(stopped, true); assert.equal(f.scheduler.getStatus().phase, 'idle');
  assert.equal(f.scheduler.start(), true); await f.scheduler.stop();
});

test('long-running work never overlaps, times out artificially or creates catch-up storms', async () => {
  const pending = deferred(); let attempts = 0;
  const f = fixture({ backup: () => { attempts++; return attempts === 1 ? pending.promise : 'next'; } });
  f.scheduler.start(); await f.advance(1_000); await f.advance(1_000_000);
  assert.equal(attempts, 1); assert.equal(f.timers.size, 0);
  pending.resolve('first'); await flush();
  assert.equal(attempts, 1); assert.equal(f.timers.size, 1);
  assert.equal(f.scheduler.getStatus().nextRunAtMs, 1_012_000);
  await f.advance(999); assert.equal(attempts, 1);
  await f.advance(1); assert.equal(attempts, 2);
  await f.scheduler.stop();
});

test('failed backup or verification preserves last good point and skips all pruning', async () => {
  let attempt = 0, verification = 0, pruneCount = 0;
  const secret = 'private-provider-token-page-text';
  const f = fixture({ backup: () => {
    attempt++;
    if (attempt === 2) throw new Error(secret);
    return `point-${attempt}`;
  }, verify: () => { verification++; if (attempt === 3) throw new Error(secret); return true; },
  prune: () => { pruneCount++; } });
  f.scheduler.start(); await f.advance(1_000);
  await f.advance(1_000);
  assert.equal(f.scheduler.getStatus().lastErrorCode, 'backup-failed');
  assert.equal(f.scheduler.getStatus().lastSuccessAtMs, 11_000);
  await f.advance(1_000);
  assert.equal(f.scheduler.getStatus().lastErrorCode, 'verification-failed');
  assert.equal(f.scheduler.getStatus().consecutiveFailures, 2);
  assert.equal(f.scheduler.getStatus().lastSuccessAtMs, 11_000);
  assert.equal(pruneCount, 1); assert.equal(verification, 2);
  assert.equal(JSON.stringify(f.statuses).includes(secret), false);
  assert.equal(JSON.stringify(f.statuses).includes('point-'), false);
  await f.advance(1_000);
  assert.equal(f.scheduler.getStatus().lastSuccessAtMs, 14_000);
  assert.equal(f.scheduler.getStatus().lastErrorCode, null);
  assert.equal(f.scheduler.getStatus().consecutiveFailures, 0);
  assert.equal(pruneCount, 2); await f.scheduler.stop();
});

test('verification must affirm exactly true; missing backup handle never invokes verification', async () => {
  for (const result of [false, undefined, null, 1, 'true', {}]) {
    const f = fixture({ verify: () => result });
    f.scheduler.start(); await f.advance(1_000);
    assert.equal(f.scheduler.getStatus().lastErrorCode, 'verification-failed');
    assert.equal(f.scheduler.getStatus().lastSuccessAtMs, null);
    assert.equal(f.calls.length, 1); await f.scheduler.stop();
  }
  for (const result of [undefined, null]) {
    const f = fixture({ backup: () => result });
    f.scheduler.start(); await f.advance(1_000);
    assert.equal(f.scheduler.getStatus().lastErrorCode, 'backup-failed');
    assert.deepEqual(f.calls, []); await f.scheduler.stop();
  }
});

test('retention failures retain verified success and report only fixed error signals', async () => {
  const f = fixture({ prune: () => { throw new Error('secret storage path'); } });
  f.scheduler.start(); await f.advance(1_000);
  const status = f.scheduler.getStatus();
  assert.equal(status.lastSuccessAtMs, 11_000); assert.equal(status.lastErrorCode, 'retention-failed');
  assert.equal(status.consecutiveFailures, 1);
  assert.ok(Object.isFrozen(status));
  assert.equal(JSON.stringify(f.statuses).includes('secret'), false);
  await f.advance(1_000);
  assert.equal(f.scheduler.getStatus().lastSuccessAtMs, 12_000);
  assert.equal(f.scheduler.getStatus().consecutiveFailures, 2);
  await f.scheduler.stop();
});

test('observer synchronous/asynchronous failures do not prevent subsequent backup slots', async () => {
  for (const onStatus of [() => { throw new Error('secret'); }, async () => { throw new Error('secret'); }]) {
    const f = fixture({ onStatus }); f.scheduler.start();
    await f.advance(1_000); await f.advance(1_000);
    assert.equal(f.calls.filter(value => value === 'backup').length, 2);
    assert.equal(f.scheduler.getStatus().lastErrorCode, null); await f.scheduler.stop();
  }
});

test('cancelled stale timer callback cannot create work after stop/restart', async () => {
  const f = fixture(); f.scheduler.start();
  const stale = [...f.timers.values()][0].callback;
  await f.scheduler.stop(); f.scheduler.start(); stale(); await flush();
  assert.deepEqual(f.calls, []); assert.equal(f.timers.size, 1);
  await f.advance(1_000); assert.equal(f.calls[0], 'backup'); await f.scheduler.stop();
});

test('clock rollback cannot reduce backup age; status contains a fixed bounded field set', async () => {
  const f = fixture(); f.scheduler.start(); await f.advance(1_000);
  f.setTime(12_000); assert.equal(f.scheduler.getStatus().backupAgeMs, 1_000);
  f.setTime(10_000); assert.equal(f.scheduler.getStatus().backupAgeMs, 1_000);
  assert.deepEqual(Object.keys(f.scheduler.getStatus()), ['running', 'stopping', 'phase', 'nextRunAtMs',
    'lastSuccessAtMs', 'lastVerifiedAtMs', 'backupAgeMs', 'backupStale', 'lastErrorCode', 'consecutiveFailures']);
  await f.scheduler.stop();
});

test('strict configuration rejects unknown flags, coercion, unsafe timers and absent hooks', () => {
  const base = { intervalMs: 1_000, staleAfterMs: 2_000, backup() {}, verify() {}, prune() {} };
  for (const intervalMs of [undefined, null, '1000', 999, 0, -1, 1.5, Infinity, NaN, 2_147_483_648]) {
    assert.throws(() => createBackupScheduler({ ...base, intervalMs }), /backup-scheduler-config/);
  }
  for (const extra of [{ staleAfterMs: 999 }, { staleAfterMs: '2000' }, { staleAfterMs: 2_147_483_648 },
    { backup: null }, { verify: false }, { prune: undefined }, { onStatus: 1 }, { now: () => NaN },
    { now: () => -1 }, { now: () => { throw new Error('private clock failure'); } },
    { setTimeout: 1 }, { clearTimeout: 1 }, { enabled: true }, { runImmediately: true }]) {
    assert.throws(() => createBackupScheduler({ ...base, ...extra }), /backup-scheduler-config/);
  }
  for (const value of [undefined, null, []]) assert.throws(() => createBackupScheduler(value), /backup-scheduler-config/);
});

test('timer failure is sanitized and leaves scheduler stopped', () => {
  const f = fixture({ setTimeout() { throw new Error('secret infrastructure detail'); } });
  assert.throws(() => f.scheduler.start(), /^Error: backup-scheduler-timer$/);
  assert.equal(f.scheduler.getStatus().running, false); assert.equal(f.scheduler.getStatus().nextRunAtMs, null);
  assert.equal(f.scheduler.getStatus().lastErrorCode, 'scheduler-failed');
});
