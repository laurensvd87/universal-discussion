import { types } from "node:util";
import { ServiceError, fail } from "../domain/errors.js";

// Pending public reads only. No completed response, private DTO, or authority is
// cached. Every caller retains its own cancellation and delivery checks.
export function createPostgresPublicReadFlights({ maxTasks = 32, maxWaiters = 4096 } = {}) {
  const pending = new Map();
  let waiters = 0;
  function normalized(value, depth = 0) {
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string" && value.length <= 8192) return value;
    if (Number.isSafeInteger(value)) return value;
    if (depth > 3 || !value || typeof value !== "object" || types.isProxy(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("invalid", "Invalid request");
    const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
    if (keys.length > 8 || keys.some(key => typeof key !== "string" || !descriptors[key].enumerable ||
        !Object.hasOwn(descriptors[key], "value"))) fail("invalid", "Invalid request");
    return Object.fromEntries(keys.sort().map(key => [key, normalized(descriptors[key].value, depth + 1)]));
  }
  return function read(method, input, work, { signal, isCurrent } = {}) {
    if (signal?.aborted || isCurrent && !isCurrent()) return Promise.reject(new ServiceError("unavailable", "Read unavailable"));
    const admittedInput = normalized(input);
    const key = JSON.stringify([method, admittedInput]);
    if (key.length > 16384) fail("capacity", "Read capacity reached");
    if (waiters >= maxWaiters) fail("capacity", "Read capacity reached");
    let job = pending.get(key);
    if (!job) {
      if (pending.size >= maxTasks) fail("capacity", "Read capacity reached");
      job = Promise.resolve().then(() => work(admittedInput));
      pending.set(key, job);
      const retire = () => { if (pending.get(key) === job) pending.delete(key); };
      job.then(retire, retire);
    }
    waiters++;
    return new Promise((resolve, reject) => {
      let settled = false;
      function finish(failed, value) {
        if (settled) return;
        settled = true; waiters--; signal?.removeEventListener("abort", abort);
        if (failed) reject(value); else resolve(value);
      }
      function abort() { finish(true, new ServiceError("unavailable", "Read unavailable")); }
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      job.then(value => {
        try { if (signal?.aborted || isCurrent && !isCurrent()) { abort(); return; } }
        catch (error) { finish(true, error); return; }
        finish(false, value);
      }, error => finish(true, error));
    });
  };
}
