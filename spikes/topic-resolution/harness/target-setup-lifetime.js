// Harness-only cancellation: a matching CDP session's actual detach proves that
// no further setup command can protect or resume that vanished session.
class TargetSetupCanceled extends Error {
  constructor() { super('Detached target setup canceled'); }
}

export const isTargetSetupCanceled = error => error instanceof TargetSetupCanceled;

export function createTargetSetupLifetime() {
  let detached = false, completed = false, abandoned = false;
  let cancel;
  const cancellation = new Promise(resolve => { cancel = resolve; });
  const canceled = new TargetSetupCanceled();
  async function step(operation) {
    if (detached) throw canceled;
    // Both outcomes remain observed even when detach wins the race. In
    // particular, a late CDP timeout cannot become an unhandled rejection.
    const command = Promise.resolve(operation());
    const result = await Promise.race([command, cancellation]);
    if (result === canceled) throw canceled;
    return result;
  }
  function detach() {
    detached = true;
    if (!completed) { abandoned = true; cancel(canceled); }
  }
  function complete() {
    if (detached) throw canceled;
    completed = true;
  }
  return Object.freeze({ step, detach, complete, get abandoned() { return abandoned; } });
}
