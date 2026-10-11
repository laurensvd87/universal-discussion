import { randomUUID } from 'node:crypto';

export async function processOneJob(repository, { workerId, leaseSeconds = 30 } = {}) {
  const job = await repository.claimJob({ workerId, leaseSeconds });
  if (!job) return false;
  const claim = { jobId: job.id, workerId, leaseToken: job.leaseToken };
  // Only fixture bookkeeping exists here. No provider or mail adapter is loaded.
  if (job.kind !== 'bookkeeping') await repository.failJob(claim);
  else await repository.completeJob(claim);
  return true;
}

export async function runWorker({ repository, signal, sleep = (ms, abortSignal) => new Promise(resolve => {
  const timer = setTimeout(done, ms);
  function done() { clearTimeout(timer); abortSignal?.removeEventListener('abort', done); resolve(); }
  abortSignal?.addEventListener('abort', done, { once: true });
  if (abortSignal?.aborted) done();
}), logger = () => {}, workerId = randomUUID() }) {
  let idleMs = 100;
  while (!signal.aborted) {
    try {
      const worked = await processOneJob(repository, { workerId });
      idleMs = worked ? 100 : Math.min(idleMs * 2, 5000);
    } catch { idleMs = Math.min(idleMs * 2, 5000); logger({ requestId: workerId, code: 'worker-unavailable' }); }
    if (!signal.aborted) await sleep(idleMs, signal);
  }
}
