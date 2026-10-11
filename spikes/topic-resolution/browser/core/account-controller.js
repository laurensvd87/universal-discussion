import { accountEnglish } from "../locales/account-en.js";

// All identity and storage capabilities are injected. This module never fetches,
// reads browser storage, posts a message or connects an AI provider.
export function createAccountController({ client, storage, renderer = () => {}, onAuthenticated = () => {},
  readContext = () => null, now = Date.now, nonce = () => globalThis.crypto.randomUUID(), resendSeconds = 60 } = {}) {
  let epoch = 0, disposed = false, credentials = null, challenge = null, context = null;
  let persistence = Promise.resolve();
  const pendingRotationAccess = new Set();
  let state = { stage: "closed", busy: false, email: "", account: null, error: "", notice: "", resendAt: 0 };
  const listeners = new Set();
  const snapshot = () => Object.freeze({ ...state, account: state.account ? Object.freeze({ ...state.account }) : null,
    resendRemaining: Math.max(0, Math.ceil((state.resendAt - now()) / 1000)),
    canChatGPT: client?.capabilities?.chatGPTIdentity === true && typeof client.signInChatGPT === "function" });
  const emit = () => { if (!disposed) { const value = snapshot(); renderer(value); listeners.forEach((fn) => fn(value)); } };
  const patch = (value) => { state = { ...state, ...value }; emit(); };
  const active = (ticket) => !disposed && ticket === epoch;
  const write = (ticket, value) => {
    persistence = persistence.catch(() => {}).then(async () => {
      if (!active(ticket)) return;
      await storage?.save?.(value);
      if (!active(ticket)) await storage?.clear?.();
    });
    return persistence;
  };
  const clear = () => { persistence = persistence.catch(() => {}).then(() => storage?.clear?.()); return persistence; };
  const project = (account) => {
    if (!account || typeof account.id !== "string" || !["active", "pending", "pending_username"].includes(account.state)) throw new Error("Invalid account");
    return { id: account.id, username: typeof account.username === "string" ? account.username : "", state: account.state, replyEmail: account.replyEmail === true };
  };
  const session = (value) => {
    if (!value || typeof value.accessToken !== "string" || !value.accessToken || typeof value.refreshToken !== "string" || !value.refreshToken ||
      !Number.isFinite(value.accessExpiresAt) || !Number.isFinite(value.refreshExpiresAt)) throw new Error("Invalid session");
    return { accessToken: value.accessToken, refreshToken: value.refreshToken, accessExpiresAt: value.accessExpiresAt, refreshExpiresAt: value.refreshExpiresAt };
  };
  const run = async (work) => {
    if (disposed || state.busy) return false;
    const ticket = ++epoch; patch({ busy: true, error: "", notice: "" });
    try { return await work(ticket); } catch (error) {
      const errors = { "verification-failed": "code_invalid", "authentication-required": "session_expired",
        "username-unavailable": "username_taken", "request-unavailable": "rate_limited" };
      const key = Object.hasOwn(errors, error?.code) ? errors[error.code] : error?.code;
      if (active(ticket) && key === "session_expired") {
        credentials = null; challenge = null;
        patch({ account: null, stage: state.stage === "closed" ? "closed" : "email" });
        try { await clear(); } catch { /* failure remains a signed-out state */ }
      }
      if (active(ticket)) patch({ error: Object.hasOwn(accountEnglish, key) ? accountEnglish[key] : accountEnglish.unavailable });
      return false;
    } finally { if (active(ticket)) patch({ busy: false }); }
  };
  const accept = async (ticket, result, notify = true) => {
    const nextAccount = project(result.account), nextCredentials = session(result.session);
    const revokeUnused = async () => { try { await client.logout(nextCredentials.accessToken); } catch { /* never restore unused credentials */ } };
    if (!active(ticket)) { await revokeUnused(); return false; }
    try { await write(ticket, nextCredentials); } catch (error) { await revokeUnused(); throw error; }
    if (!active(ticket)) { await revokeUnused(); return false; }
    credentials = nextCredentials; challenge = null;
    const needsUsername = !nextAccount.username;
    patch({ account: nextAccount, stage: !notify && state.stage === "closed" ? "closed" : needsUsername ? "username" : "profile", notice: needsUsername ? "" : accountEnglish.done });
    if (notify && !needsUsername) onAuthenticated({ account: { ...nextAccount }, context, currentContext: readContext(), automaticPost: false });
    return true;
  };
  const rotate = async (ticket, refreshToken, oldAccessToken) => {
    // Rotation consumes the old session on the server. Invalidate it locally
    // before dispatch so cancel/open cannot advertise that consumed session.
    pendingRotationAccess.add(oldAccessToken);
    credentials = null; challenge = null;
    patch({ account: null, stage: state.stage === "closed" ? "closed" : "email" });
    const revokeOld = async () => { try { await client.logout(oldAccessToken); } catch { /* no local authentication survives */ }
      pendingRotationAccess.delete(oldAccessToken); };
    try {
      await clear();
      if (!active(ticket)) { await revokeOld(); return false; }
      const result = await client.renew({ refreshToken });
      pendingRotationAccess.delete(oldAccessToken);
      return accept(ticket, result, false);
    } catch (error) { await revokeOld(); throw error; }
  };
  const api = {
    renderSnapshot: snapshot,
    subscribe(fn) { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); },
    open() { if (disposed) return; ++epoch; context = structuredClone(readContext()); challenge = null;
      patch({ stage: state.account ? (state.account.username ? "profile" : "username") : "email", busy: false, error: "", notice: "" }); },
    cancel() { if (disposed) return; ++epoch; challenge = null; context = null; patch({ stage: "closed", busy: false, error: "", notice: "" }); },
    editEmail() { if (disposed) return; ++epoch; challenge = null; patch({ stage: "email", busy: false, error: "", notice: "" }); },
    requestCode(email = state.email) {
      if (!["email", "code"].includes(state.stage) || state.busy || disposed) return Promise.resolve(false);
      const address = String(email).trim();
      if (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { patch({ error: accountEnglish.emailInvalid }); return Promise.resolve(false); }
      if (state.stage === "code" && now() < state.resendAt) return Promise.resolve(false);
      return run(async (ticket) => {
        const clientNonce = nonce(); const result = await client.requestCode({ email: address, clientNonce });
        if (!active(ticket)) return false;
        if (typeof result?.challengeId !== "string" || !result.challengeId || !Number.isFinite(result.expiresIn) || result.expiresIn <= 0) throw new Error("Invalid challenge");
        challenge = { id: result.challengeId, clientNonce, expiresAt: now() + result.expiresIn * 1000 };
        patch({ stage: "code", email: address, resendAt: now() + resendSeconds * 1000 }); return true;
      });
    },
    verifyCode(code) {
      if (state.stage !== "code" || !challenge) return Promise.resolve(false);
      const value = String(code).trim();
      if (!/^\d{6}$/.test(value)) { patch({ error: accountEnglish.codeInvalid }); return Promise.resolve(false); }
      if (now() >= challenge.expiresAt) { patch({ error: accountEnglish.code_expired }); return Promise.resolve(false); }
      const current = { ...challenge };
      return run(async (ticket) => accept(ticket, await client.verifyCode({ challengeId: current.id, code: value, clientNonce: current.clientNonce })));
    },
    setUsername(username) {
      if (!["username", "profile"].includes(state.stage) || !credentials) return Promise.resolve(false);
      const value = String(username).trim();
      if (!/^[A-Za-z0-9_]{3,24}$/.test(value)) { patch({ error: accountEnglish.usernameInvalid }); return Promise.resolve(false); }
      const access = credentials.accessToken;
      return run(async (ticket) => {
        const result = await client.setUsername(access, { username: value });
        if (!active(ticket)) return false;
        const account = project(result.account ?? result); patch({ account, stage: "profile", notice: accountEnglish.done });
        onAuthenticated({ account: { ...account }, context, currentContext: readContext(), automaticPost: false }); return true;
      });
    },
    setReplyEmail(enabled) {
      if (state.stage !== "profile" || !credentials || typeof enabled !== "boolean") return Promise.resolve(false);
      const access = credentials.accessToken;
      return run(async (ticket) => { const result = await client.setReplyEmail(access, { enabled });
        if (!active(ticket)) return false; patch({ account: project(result.account ?? result) }); return true; });
    },
    signInChatGPT() {
      if (state.stage !== "email" || !snapshot().canChatGPT) return Promise.resolve(false);
      return run(async (ticket) => accept(ticket, await client.signInChatGPT()));
    },
    restore() {
      return run(async (ticket) => {
        let saved = await storage?.load?.(); if (!active(ticket) || !saved) return false;
        saved = session(saved);
        if (saved.refreshExpiresAt <= now()) { await clear(); return false; }
        if (saved.accessExpiresAt <= now()) return rotate(ticket, saved.refreshToken, saved.accessToken);
        const result = await client.me(saved.accessToken);
        if (!active(ticket)) return false; const account = project(result.account ?? result); credentials = saved;
        patch({ account }); return true;
      });
    },
    renew() { if (!credentials) return Promise.resolve(false); const { refreshToken, accessToken } = credentials;
      return run(async (ticket) => rotate(ticket, refreshToken, accessToken)); },
    async signOut() {
      if (disposed) return false; ++epoch; const old = credentials, rotatingAccess = [...pendingRotationAccess];
      pendingRotationAccess.clear(); credentials = null; challenge = null; context = null;
      patch({ stage: "email", busy: false, account: null, email: "", error: "", notice: "", resendAt: 0 });
      let saved;
      persistence = persistence.catch(() => {}).then(async () => {
        try { saved = await storage?.load?.(); } catch { /* RAM session still allows revocation */ }
        await storage?.clear?.();
      });
      let cleared = true;
      try { await persistence; } catch { cleared = false; if (!disposed) patch({ error: accountEnglish.unavailable }); }
      for (const access of new Set([old?.accessToken, saved?.accessToken, ...rotatingAccess].filter(Boolean))) {
        try { await client.logout(access); } catch { /* local revocation is immediate */ }
      }
      return cleared;
    },
    tick() { emit(); },
    dispose() { ++epoch; disposed = true; credentials = null; challenge = null; context = null;
      state = { stage: "closed", busy: false, email: "", account: null, error: "", notice: "", resendAt: 0 }; listeners.clear(); },
  };
  emit(); return Object.freeze(api);
}
