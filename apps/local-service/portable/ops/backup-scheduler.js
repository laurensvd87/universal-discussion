// Dormant orchestration only. Import/construction never starts a timer or backup.
// Adapters own consistent encrypted publication, off-host durability, protection
// of recovery handles and retention policy. Do not wire the synthetic dump CLI
// into this scheduler: it does not provide those guarantees.
const MAX_DELAY_MS = 2_147_483_647;
const MAX_FAILURES = 1_000_000;

function invalid() { throw new TypeError('backup-scheduler-config'); }
function delay(value) {
  if (!Number.isSafeInteger(value) || value < 1_000 || value > MAX_DELAY_MS) invalid();
  return value;
}

/**
 * backup({startedAtMs}) -> opaque recovery handle (must not resolve prematurely).
 * verify(handle) -> exactly true after independent recovery/durability checks.
 * prune({protectedRecoveryPoint}) -> retention pass preserving this verified point.
 * All three hooks must await their real work, including cleanup on rejection.
 * No timeout releases the lock: a hung adapter requires operator intervention.
 * onStatus receives fixed fields only; it is best-effort observation, not work.
 * A single instance serializes work; multi-process fencing belongs in the adapter.
 */
export function createBackupScheduler(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) invalid();
  const allowed = new Set(['intervalMs', 'staleAfterMs', 'backup', 'verify', 'prune', 'onStatus', 'now', 'setTimeout', 'clearTimeout']);
  if (Object.keys(options).some(key => !allowed.has(key))) invalid();
  const intervalMs = delay(options.intervalMs);
  const staleAfterMs = delay(options.staleAfterMs);
  if (staleAfterMs < intervalMs) invalid();
  const { backup, verify, prune, onStatus = () => {}, now = Date.now,
    setTimeout: scheduleTimer = globalThis.setTimeout,
    clearTimeout: cancelTimer = globalThis.clearTimeout } = options;
  for (const hook of [backup, verify, prune, onStatus, now, scheduleTimer, cancelTimer]) {
    if (typeof hook !== 'function') invalid();
  }
  let observedTime = 0;
  function clock() {
    let value;
    try { value = now(); } catch { invalid(); }
    if (!Number.isSafeInteger(value) || value < 0) invalid();
    // A backwards wall-clock adjustment must not make a backup younger.
    observedTime = Math.max(observedTime, value);
    return observedTime;
  }
  clock();
  let running = false, stopping = false, timer = null, work = null, shutdown = null;
  let generation = 0;
  let nextRunAtMs = null, phase = 'idle', lastSuccessAtMs = null, lastVerifiedAtMs = null;
  let lastErrorCode = null, consecutiveFailures = 0;

  function getStatus() {
    const age = lastSuccessAtMs === null ? null : Math.max(0, clock() - lastSuccessAtMs);
    return Object.freeze({ running, stopping, phase, nextRunAtMs,
      lastSuccessAtMs, lastVerifiedAtMs, backupAgeMs: age,
      backupStale: age === null || age >= staleAfterMs,
      lastErrorCode, consecutiveFailures });
  }
  function publish() {
    try {
      // Observer failures and return values never become logs, backup errors or
      // write authority. No unbounded event/status history is retained here.
      Promise.resolve(onStatus(getStatus())).catch(() => {});
    } catch { /* best-effort status observer */ }
  }
  function failure(code) {
    lastErrorCode = code;
    consecutiveFailures = Math.min(MAX_FAILURES, consecutiveFailures + 1);
  }
  async function operate() {
    const startedAtMs = clock();
    let point;
    phase = 'backup'; publish();
    try { point = await backup(Object.freeze({ startedAtMs })); }
    catch { failure('backup-failed'); return; }
    if (point === null || point === undefined) { failure('backup-failed'); return; }
    phase = 'verify'; publish();
    try {
      if (await verify(point) !== true) { failure('verification-failed'); return; }
    } catch { failure('verification-failed'); return; }
    // Count age from snapshot start, not from possibly slow publication or
    // verification. Retention never runs after a failed creation/verification.
    lastSuccessAtMs = startedAtMs;
    lastVerifiedAtMs = clock();
    phase = 'prune'; publish();
    try {
      await prune(Object.freeze({ protectedRecoveryPoint: point }));
      lastErrorCode = null; consecutiveFailures = 0;
    }
    catch { failure('retention-failed'); }
  }
  function arm() {
    // One future slot after completion; missed slots are skipped, never queued.
    nextRunAtMs = clock() + intervalMs;
    if (!Number.isSafeInteger(nextRunAtMs)) invalid();
    const scheduledGeneration = ++generation;
    timer = scheduleTimer(() => tick(scheduledGeneration), intervalMs);
  }
  function tick(scheduledGeneration) {
    if (scheduledGeneration !== generation) return;
    timer = null;
    if (!running || work) return;
    nextRunAtMs = null;
    // Assign before invoking any hook so reentrant stop/start cannot overlap work.
    work = Promise.resolve().then(operate).catch(() => failure('scheduler-failed')).finally(() => {
      work = null; phase = 'idle';
      if (running) {
        try { arm(); }
        catch { running = false; nextRunAtMs = null; failure('scheduler-failed'); }
      }
      publish();
    });
  }
  function start() {
    if (stopping) throw new Error('backup-scheduler-stopping');
    if (running) return false;
    running = true;
    try { arm(); }
    catch {
      running = false; nextRunAtMs = null; failure('scheduler-failed');
      throw new Error('backup-scheduler-timer');
    }
    publish();
    return true;
  }
  function stop() {
    if (stopping) return shutdown;
    running = false; stopping = true; nextRunAtMs = null;
    generation++;
    if (timer !== null) {
      try { cancelTimer(timer); } catch { failure('scheduler-failed'); }
      timer = null;
    }
    shutdown = Promise.resolve(work).then(() => {
      stopping = false; shutdown = null; publish();
    });
    publish();
    return shutdown;
  }
  return Object.freeze({ start, stop, getStatus });
}
