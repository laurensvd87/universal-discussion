import { readPairingToken } from "./local-service-contract.js";

const KEY = "localServicePairingToken";
const MESSAGE = "Local service pairing unavailable";

// Inject only chrome.storage.session from a trusted extension context.
export function createLocalServiceSession({ storageSession }) {
  if (!storageSession || ["setAccessLevel", "get", "set", "remove"].some((key) => typeof storageSession[key] !== "function")) {
    throw new TypeError(MESSAGE);
  }
  let pending = Promise.resolve();
  function serial(operation) {
    const result = pending.then(async () => {
      try {
        await storageSession.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
        return await operation();
      } catch { throw new Error(MESSAGE); }
    });
    pending = result.catch(() => {});
    return result;
  }
  async function read() {
    const values = await storageSession.get(KEY);
    const descriptor = Object.getOwnPropertyDescriptor(values ?? {}, KEY);
    if (!descriptor) return null;
    if (!Object.hasOwn(descriptor, "value")) throw new Error(MESSAGE);
    try { return readPairingToken(descriptor.value); }
    catch { await storageSession.remove(KEY); return null; }
  }
  return Object.freeze({
    getToken() { return serial(read); },
    isPaired() { return serial(async () => (await read()) !== null); },
    setToken(token) {
      let valid;
      try { valid = readPairingToken(token); } catch { return Promise.reject(new Error(MESSAGE)); }
      return serial(async () => { await storageSession.set({ [KEY]: valid }); });
    },
    clear() { return serial(async () => { await storageSession.remove(KEY); }); },
  });
}
