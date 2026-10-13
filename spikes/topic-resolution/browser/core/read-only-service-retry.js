// Only re-open read-only local projections after a transient service outage.
// Never replay commands or provider inference.
export function createReadOnlyServiceRetry({ open, schedule = setTimeout, cancelSchedule = clearTimeout }) {
  if (typeof open !== "function" || typeof schedule !== "function" || typeof cancelSchedule !== "function")
    throw new TypeError("Invalid service retry adapter");
  let timer = null;
  let delay = 1000;
  let disposed = false;
  let attempts = 0;
  let retryContext = null;
  function observe(state) {
    if (disposed) return;
    const context = JSON.stringify(state?.selection === "manual"
      ? [state.topicId, state.sourceId, state.actorId]
      : [state?.resolution?.currentTabId, state?.resolution?.currentWindowId, state?.resolution?.currentUrl,
        state?.resolution?.documentId, state?.resolution?.sessionRevision, state?.actorId]);
    if (context !== retryContext) { retryContext = context; delay = 1000; attempts = 0; }
    if (state?.phase === "ready" || state?.phase === "choose-topic" && !state?.sourceId && !state?.topicId && !state?.resolution?.enabled)
      { delay = 1000; attempts = 0; }
    const readFailure = state?.readRetryable === true && ["unavailable", "capacity", "conflict"].includes(state?.error) ||
      state?.readRetryable === undefined && state?.error === "unavailable";
    if (state?.phase !== "error" || !readFailure || attempts >= 8) {
      if (timer !== null) cancelSchedule(timer);
      timer = null;
      return;
    }
    if (timer !== null) return;
    timer = schedule(() => {
      timer = null;
      if (disposed) return;
      attempts++;
      delay = Math.min(delay * 2, 5000);
      Promise.resolve().then(open).catch(() => {});
    }, delay);
  }
  function dispose() { disposed = true; if (timer !== null) cancelSchedule(timer); timer = null; }
  return Object.freeze({ observe, dispose });
}
