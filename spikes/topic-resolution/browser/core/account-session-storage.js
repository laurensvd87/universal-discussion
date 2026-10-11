import { readPairingToken, record } from "./local-service-contract.js";

export const ACCOUNT_SESSION_KEY = "discussionAccountSessionV1";
export const ACCOUNT_SESSION_FENCE_KEY = "discussionAccountSessionFenceV1";
const validToken = value => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/u.test(value);
function readSession(value) {
  const item = record(value, ["accessToken", "refreshToken", "accessExpiresAt", "refreshExpiresAt"]);
  if (!validToken(item.accessToken) || !validToken(item.refreshToken) ||
      !Number.isSafeInteger(item.accessExpiresAt) || !Number.isSafeInteger(item.refreshExpiresAt) ||
      item.accessExpiresAt <= 0 || item.refreshExpiresAt <= item.accessExpiresAt) throw new TypeError();
  return { ...item };
}

// Session RAM belongs to trusted extension contexts, never Chrome local storage.
export function createAccountSessionStorage({ storageSession, getPairingToken, withLock, nonce = () => globalThis.crypto.randomUUID() } = {}) {
  if (!storageSession || ["get", "set", "remove", "setAccessLevel"].some(key => typeof storageSession[key] !== "function") ||
      typeof getPairingToken !== "function" || typeof withLock !== "function" || typeof nonce !== "function") throw new TypeError("Account session storage unavailable");
  let pending = Promise.resolve();
  const serial = work => {
    const result = pending.catch(() => {}).then(async () => {
      try { return await withLock(async () => { await storageSession.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }); return work(); }); }
      catch { throw new Error("Account session storage unavailable"); }
    });
    pending = result; return result;
  };
  const readFence = async () => {
    const values = await storageSession.get(ACCOUNT_SESSION_FENCE_KEY);
    const existing = values?.[ACCOUNT_SESSION_FENCE_KEY];
    if (typeof existing === "string" && /^[a-f0-9-]{36}$/u.test(existing)) return existing;
    const value = nonce();
    if (typeof value !== "string" || !/^[a-f0-9-]{36}$/u.test(value)) throw new TypeError();
    await storageSession.set({ [ACCOUNT_SESSION_FENCE_KEY]: value }); return value;
  };
  return Object.freeze({
    captureFence: () => serial(readFence),
    load: () => serial(async () => {
      const values = await storageSession.get(ACCOUNT_SESSION_KEY);
      const stored = values?.[ACCOUNT_SESSION_KEY];
      if (stored === undefined) return null;
      try {
        const item = record(stored, ["version", "pairingToken", "session"]);
        if (item.version !== 1 || readPairingToken(item.pairingToken) !== readPairingToken(await getPairingToken())) throw new TypeError();
        return readSession(item.session);
      } catch { await storageSession.remove(ACCOUNT_SESSION_KEY); return null; }
    }),
    save: (value, expectedFence) => serial(async () => {
      if (expectedFence !== undefined && await readFence() !== expectedFence) throw new Error();
      const session = readSession(value), pairingToken = readPairingToken(await getPairingToken());
      await storageSession.set({ [ACCOUNT_SESSION_KEY]: { version: 1, pairingToken, session } });
      // A pairing switch during a slow storage write must discard the old grant.
      if (await getPairingToken() !== pairingToken) { await storageSession.remove(ACCOUNT_SESSION_KEY); throw new Error(); }
    }),
    clear: ({ invalidate = false, expectedAccessToken } = {}) => serial(async () => {
      if (invalidate) {
        const value = nonce();
        if (typeof value !== "string" || !/^[a-f0-9-]{36}$/u.test(value)) throw new TypeError();
        await storageSession.set({ [ACCOUNT_SESSION_FENCE_KEY]: value });
      }
      if (expectedAccessToken !== undefined) {
        const stored = (await storageSession.get(ACCOUNT_SESSION_KEY))?.[ACCOUNT_SESSION_KEY];
        if (stored?.session?.accessToken !== expectedAccessToken) return false;
      }
      await storageSession.remove(ACCOUNT_SESSION_KEY); return true;
    }),
  });
}
