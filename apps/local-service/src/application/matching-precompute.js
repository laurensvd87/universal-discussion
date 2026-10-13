// Disposable worker-side mathematical preparation. One flight and one dirty
// flag coalesce committed Source changes; no timer/job per visitor or message.
// Warm results are never returned to clients or used as write authority.
export function startMatchingPrecompute({ repository, executor, delayMs = 250,
  schedule = setTimeout, cancelSchedule = clearTimeout }) {
  if (!repository || typeof repository.version !== 'function' || typeof repository.subscribeMatching !== 'function' ||
      !executor || typeof executor.read !== 'function' || !Number.isInteger(delayMs) || delayMs < 0 || delayMs > 5000)
    throw new TypeError('Invalid matching preparation');
  let closed = false, dirty = true, flight = null, timer = null;
  const abort = new AbortController();
  function plan() {
    if (closed || timer !== null || flight !== null || !dirty) return;
    timer = schedule(() => { timer = null; void run(); }, delayMs);
    timer?.unref?.();
  }
  async function run() {
    if (closed || flight !== null || !dirty) return;
    dirty = false;
    const job = {}; flight = job;
    try { await executor.read('warmMatching', null, { version: repository.version(), signal: abort.signal }); }
    catch { /* A missed preparation cannot change a commit or serve stale data. */ }
    finally { if (flight === job) flight = null; plan(); }
  }
  const stop = repository.subscribeMatching(() => { if (!closed) { dirty = true; plan(); } });
  plan();
  return Object.freeze({ close() {
    if (closed) return; closed = true; stop();
    if (timer !== null) cancelSchedule(timer); timer = null; dirty = false; abort.abort();
  } });
}
