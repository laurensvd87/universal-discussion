import { readPairingToken } from "./local-service-contract.js";

export const PAIRING_KEY = "localServicePairingV1";
const LEGACY_KEY = "localServicePairingToken";
const MESSAGE = "Local service pairing unavailable";
export const EXTENSION_CONNECTION_UNAVAILABLE = "extension-connection-unavailable";
export class LocalServiceSessionProxyError extends Error {
  constructor() {
    // A missing bridge reply and an explicit worker/storage refusal are both
    // internal extension-state failures. Neither asks for a new bearer token.
    super("Extension state unavailable");
    this.name = "LocalServiceSessionProxyError";
    this.code = EXTENSION_CONNECTION_UNAVAILABLE;
  }
}

// The background worker is the sole writer. Legacy session credentials are
// discarded, never promoted into persistent storage.
export function createLocalServiceSession({ storageLocal, storageSession }) {
  if ([storageLocal, storageSession].some((area) => !area ||
      ["setAccessLevel", "get", "set", "remove"].some((key) => typeof area[key] !== "function"))) throw new TypeError(MESSAGE);
  let pending = Promise.resolve();
  function serial(operation) {
    const result = pending.then(async () => {
      try {
        await storageLocal.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
        await storageSession.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
        await storageSession.remove(LEGACY_KEY);
        return await operation();
      } catch { throw new Error(MESSAGE); }
    });
    pending = result.catch(() => {});
    return result;
  }
  async function read() {
    const values = await storageLocal.get(PAIRING_KEY);
    const descriptor = Object.getOwnPropertyDescriptor(values ?? {}, PAIRING_KEY);
    if (!descriptor) return null;
    if (!Object.hasOwn(descriptor, "value")) throw new Error(MESSAGE);
    const record = descriptor.value;
    try {
      if (!record || Object.getPrototypeOf(record) !== Object.prototype ||
          Reflect.ownKeys(record).length !== 2 || record.version !== 1) throw new TypeError();
      return readPairingToken(record.token);
    } catch { await storageLocal.remove(PAIRING_KEY); return null; }
  }
  return Object.freeze({
    getToken() { return serial(read); },
    isPaired() { return serial(async () => (await read()) !== null); },
    setToken(token) {
      let valid;
      try { valid = readPairingToken(token); } catch { return Promise.reject(new Error(MESSAGE)); }
      return serial(async () => { await storageLocal.set({ [PAIRING_KEY]: { version: 1, token: valid } }); });
    },
    clear() { return serial(async () => { await storageLocal.remove(PAIRING_KEY); }); },
    clearIfCurrent(token) {
      let valid;
      try { valid = readPairingToken(token); } catch { return Promise.reject(new Error(MESSAGE)); }
      return serial(async () => {
        if (await read() !== valid) return false;
        await storageLocal.remove(PAIRING_KEY);
        return true;
      });
    },
  });
}

// Trusted popup to background RPC; the credential never reaches a page context.
export function createLocalServiceSessionProxy({ sendMessage }) {
  if (typeof sendMessage !== "function") throw new TypeError(MESSAGE);
  async function call(type, value) {
    try {
      const reply = await sendMessage({ target: "local-pairing", type, ...(value === undefined ? {} : { value }) });
      if (!reply || reply.ok !== true || !Object.hasOwn(reply, "value") ||
          (type === "paired" && typeof reply.value !== "boolean") ||
          (type === "get" && reply.value !== null && readPairingToken(reply.value) !== reply.value)) throw new Error(MESSAGE);
      return reply.value;
    } catch { throw new LocalServiceSessionProxyError(); }
  }
  return Object.freeze({
    getToken: () => call("get"), isPaired: () => call("paired"),
    setToken: (token) => call("set", token), clear: () => call("clear"),
    clearIfCurrent: (token) => call("clear-if-current", token),
  });
}
