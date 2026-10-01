// Only re-open read-only local projections after a transient service outage.
// Never replay commands or provider inference.
export function createReadOnlyServiceRetry({ open, schedule = setTimeout, cancelSchedule = clearTimeout }) {
  if (typeof open !== "function" || typeof schedule !== "function" || typeof cancelSchedule !== "function")
    throw new TypeError("Invalid service retry adapter");
  let timer = null;
  let delay = 1000;
  let disposed = false;
  function observe(state) {
    if (disposed) return;
    if (["ready", "choose-topic"].includes(state?.phase)) delay = 1000;
    if (state?.phase !== "error" || state?.error !== "unavailable") {
      if (timer !== null) cancelSchedule(timer);
      timer = null;
      return;
    }
    if (timer !== null) return;
    timer = schedule(() => {
      timer = null;
      if (disposed) return;
      delay = Math.min(delay * 2, 5000);
      Promise.resolve().then(open).catch(() => {});
    }, delay);
  }
  function dispose() { disposed = true; if (timer !== null) cancelSchedule(timer); timer = null; }
  return Object.freeze({ observe, dispose });
}
