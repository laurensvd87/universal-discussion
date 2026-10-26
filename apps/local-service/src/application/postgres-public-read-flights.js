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
      job = { subscribers: new Set() };
      pending.set(key, job);
      const settle = (failed, value) => {
        if (pending.get(key) === job) pending.delete(key);
        const subscribers = [...job.subscribers];
        job.subscribers.clear();
        for (const subscriber of subscribers) subscriber.deliver(failed, value);
      };
      // One reaction pair per physical job. Cancelled readers are removable;
      // they must not accumulate promise reactions on a stalled shared read.
      Promise.resolve().then(() => work(admittedInput)).then(
        value => settle(false, value), error => settle(true, error));
    }
    waiters++;
    return new Promise((resolve, reject) => {
      let settled = false;
      function retire() {
        if (settled) return false;
        settled = true; waiters--; job.subscribers.delete(subscriber);
        signal?.removeEventListener("abort", abort);
        return true;
      }
      function abort() { if (retire()) reject(new ServiceError("unavailable", "Read unavailable")); }
      const subscriber = { deliver(failed, value) {
        if (!retire()) return;
        if (!failed) {
          try { if (signal?.aborted || isCurrent && !isCurrent() || signal?.aborted) {
            reject(new ServiceError("unavailable", "Read unavailable"));return;
          } }
          catch (error) { reject(signal?.aborted ? new ServiceError("unavailable", "Read unavailable") : error);return; }
        }
        if (failed) reject(value);else resolve(value);
      } };
      job.subscribers.add(subscriber);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    });
  };
}
