import { accountEnglish } from "../locales/account-en.js";

// All identity and storage capabilities are injected. This module never fetches,
// reads browser storage, posts a message or connects an AI provider.
export function createAccountController({ client, storage, renderer = () => {}, onAuthenticated = () => {},
  readContext = () => null, now = Date.now, nonce = () => globalThis.crypto.randomUUID(), resendSeconds = 60,
  capabilities: injectedCapabilities, onConnectChatGPT, onExport = () => {} } = {}) {
  let epoch = 0, disposed = false, credentials = null, challenge = null, context = null;
  let capabilityEpoch = 0, emailVerified = false, pendingSaveAccess = null, renewing = false, operationFence = null;
  const normalizeCapabilities = value => {
    if (!value || typeof value.chatGPTIdentity !== "boolean" || typeof value.emailCode !== "boolean" ||
        Object.keys(value).sort().join() !== "chatGPTIdentity,emailCode") throw new Error("Invalid capabilities");
    return Object.freeze({ ...value });
  };
  // Legacy injected fixture clients have no live capability endpoint.
  let capabilities = normalizeCapabilities(injectedCapabilities ?? {
    chatGPTIdentity: client?.capabilities?.chatGPTIdentity === true,
    emailCode: client?.capabilities?.emailCode ?? typeof client?.getCapabilities !== "function",
  });
  let persistence = Promise.resolve();
  const pendingRotationAccess = new Set();
  let state = { stage: "closed", busy: false, email: "", account: null, error: "", notice: "", resendAt: 0 };
  const listeners = new Set();
  const snapshot = () => Object.freeze({ ...state, account: state.account ? Object.freeze({ ...state.account }) : null,
    resendRemaining: Math.max(0, Math.ceil((state.resendAt - now()) / 1000)),
    canChatGPT: capabilities.chatGPTIdentity && typeof client.signInChatGPT === "function",
    canConnectChatGPT: !capabilities.chatGPTIdentity && typeof onConnectChatGPT === "function",
    canEmail: capabilities.emailCode,
    canReplyEmail: capabilities.emailCode && emailVerified, renewing });
  const emit = () => { if (!disposed) { const value = snapshot(); renderer(value); listeners.forEach((fn) => fn(value)); } };
  const patch = (value) => { state = { ...state, ...value }; emit(); };
  const active = (ticket) => !disposed && ticket === epoch;
  const write = (ticket, value, sharedFence) => {
    persistence = persistence.catch(() => {}).then(async () => {
      if (!active(ticket)) return;
      await storage?.save?.(value, sharedFence);
      if (!active(ticket)) await storage?.clear?.({ expectedAccessToken: value.accessToken });
    });
    return persistence;
  };
  const clear = options => { persistence = persistence.catch(() => {}).then(() => storage?.clear?.(options)); return persistence; };
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
    const attemptedAccess = credentials?.accessToken;
    const ticket = ++epoch; patch({ busy: true, error: "", notice: "" });
    try { return await work(ticket); } catch (error) {
      const errors = { "verification-failed": "code_invalid", "authentication-required": "session_expired",
        "username-unavailable": "username_taken", "request-unavailable": "rate_limited" };
      const key = Object.hasOwn(errors, error?.code) ? errors[error.code] : error?.code;
      if (active(ticket) && key === "session_expired") {
        credentials = null; challenge = null; emailVerified = false;
        patch({ account: null, stage: state.stage === "closed" ? "closed" : "email" });
        try { if (attemptedAccess) await clear({ expectedAccessToken: attemptedAccess }); } catch { /* failure remains a signed-out state */ }
      }
      if (active(ticket)) patch({ error: Object.hasOwn(accountEnglish, key) ? accountEnglish[key] : accountEnglish.unavailable });
      return false;
    } finally { if (active(ticket)) patch({ busy: false }); }
  };
  const accept = async (ticket, result, notify = true, verifiedEmail = false, sharedFence) => {
    const nextAccount = project(result.account), nextCredentials = session(result.session);
    const revokeUnused = async () => { try { await client.logout(nextCredentials.accessToken); } catch { /* never restore unused credentials */ } };
    if (!active(ticket)) { await revokeUnused(); return false; }
    pendingSaveAccess = nextCredentials.accessToken;
    try { await write(ticket, nextCredentials, sharedFence); } catch (error) { await revokeUnused(); throw error; }
    finally { if (pendingSaveAccess === nextCredentials.accessToken) pendingSaveAccess = null; }
    if (!active(ticket)) { await revokeUnused(); return false; }
    credentials = nextCredentials; challenge = null; emailVerified = verifiedEmail || nextAccount.replyEmail;
    const needsUsername = !nextAccount.username;
    patch({ account: nextAccount, stage: !notify && state.stage === "closed" ? "closed" : needsUsername ? "username" : "profile", notice: needsUsername ? "" : accountEnglish.done });
    if (notify && !needsUsername) onAuthenticated({ account: { ...nextAccount }, context, currentContext: readContext(), automaticPost: false });
    return true;
  };
  const rotate = async (ticket, refreshToken, oldAccessToken) => {
    // Rotation consumes the old session on the server. Invalidate it locally
    // before dispatch so cancel/open cannot advertise that consumed session.
    pendingRotationAccess.add(oldAccessToken);
    renewing = true;
    const hadVerifiedEmail = emailVerified;
    credentials = null; challenge = null; emailVerified = false;
    patch({ account: null, stage: state.stage === "closed" ? "closed" : "email" });
    const revokeOld = async () => { try { await client.logout(oldAccessToken); } catch { /* no local authentication survives */ }
      pendingRotationAccess.delete(oldAccessToken); };
    try {
      const sharedFence = typeof storage?.captureFence === "function" ? await storage.captureFence() : undefined;
      operationFence = sharedFence ?? null;
      await clear({ expectedAccessToken: oldAccessToken });
      if (!active(ticket)) { await revokeOld(); return false; }
      const result = await client.renew({ refreshToken });
      pendingRotationAccess.delete(oldAccessToken);
      return await accept(ticket, result, false, hadVerifiedEmail, sharedFence);
    } catch (error) { await revokeOld(); throw error; }
    finally { if (active(ticket)) { renewing = false; emit(); } }
  };
  const api = {
    renderSnapshot: snapshot,
    subscribe(fn) { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); },
    async refreshCapabilities() {
      if (disposed || typeof client.getCapabilities !== "function") return false;
      const ticket = ++capabilityEpoch;
      try {
        const next = normalizeCapabilities(await client.getCapabilities());
        if (disposed || ticket !== capabilityEpoch) return false;
        capabilities = next;
        if (!next.emailCode && state.stage === "code") { ++epoch; challenge = null; patch({ stage: "email", busy: false }); }
        else emit();
        return true;
      } catch { if (!disposed && ticket === capabilityEpoch) { capabilities = { chatGPTIdentity: false, emailCode: false }; emit(); } return false; }
    },
    // Private composition seam: credentials never enter rendering or events.
    async withAppSession(work) {
      if (disposed || typeof work !== "function" || !credentials || !state.account?.username || state.busy) return false;
      if (credentials.accessExpiresAt <= now() && !await api.renew()) return false;
      if (!credentials || disposed || !state.account?.username) return false;
      const ticket = epoch, accessToken = credentials.accessToken, accountId = state.account.id;
      const isCurrent = () => active(ticket) && credentials?.accessToken === accessToken && state.account?.id === accountId;
      return work(Object.freeze({ accessToken, accountId, isCurrent }));
    },
    getAccessToken(actorId) {
      return !disposed && !state.busy && state.account?.username && credentials?.accessExpiresAt > now() &&
        (actorId === undefined || actorId === `account-${state.account.id}`)
        ? credentials.accessToken : null;
    },
    async reconcileSession() {
      if (disposed) return false;
      const ticket = epoch;
      const sharedFence = typeof storage?.captureFence === "function" ? await storage.captureFence() : undefined;
      const saved = await storage?.load?.();
      if (!active(ticket)) return false;
      const fenceChanged = operationFence !== null && sharedFence !== operationFence;
      if (!fenceChanged && (saved?.accessToken === credentials?.accessToken || saved?.accessToken && saved.accessToken === pendingSaveAccess || !saved && !credentials && !pendingSaveAccess)) return false;
      ++epoch; renewing = false; credentials = null; challenge = null; emailVerified = false; operationFence = sharedFence ?? null;
      patch({ account: null, busy: false, stage: state.stage === "closed" ? "closed" : "email", error: "", notice: "" });
      return saved ? api.restore() : true;
    },
    async rejectedSession(accessToken) {
      // Compare private RAM/storage even when the sheet is busy; never clear a
      // different session accepted after an earlier request was dispatched.
      if (disposed || typeof accessToken !== "string") return false;
      const ticket = epoch;
      const saved = await storage?.load?.();
      if (!active(ticket) || credentials?.accessToken !== accessToken && saved?.accessToken !== accessToken) return false;
      if (credentials && credentials.accessToken !== accessToken || saved && saved.accessToken !== accessToken) return false;
      return api.signOut();
    },
    open() { if (disposed) return; ++epoch; renewing = false; context = structuredClone(readContext()); challenge = null;
      patch({ stage: state.account ? (state.account.username ? "profile" : "username") : "email", busy: false, error: "", notice: "" }); },
    cancel() { if (disposed) return; ++epoch; renewing = false; challenge = null; context = null; patch({ stage: "closed", busy: false, error: "", notice: "" }); },
    editEmail() { if (disposed) return; ++epoch; challenge = null; patch({ stage: "email", busy: false, error: "", notice: "" }); },
    requestCode(email = state.email) {
      if (!["email", "code"].includes(state.stage) || state.busy || disposed || !capabilities.emailCode) return Promise.resolve(false);
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
      if (state.stage !== "code" || !challenge || !capabilities.emailCode) return Promise.resolve(false);
      const value = String(code).trim();
      if (!/^\d{6}$/.test(value)) { patch({ error: accountEnglish.codeInvalid }); return Promise.resolve(false); }
      if (now() >= challenge.expiresAt) { patch({ error: accountEnglish.code_expired }); return Promise.resolve(false); }
      const current = { ...challenge };
      return run(async (ticket) => {
        const sharedFence = typeof storage?.captureFence === "function" ? await storage.captureFence() : undefined;
        operationFence = sharedFence ?? null;
        if (!active(ticket)) return false;
        return accept(ticket, await client.verifyCode({ challengeId: current.id, code: value, clientNonce: current.clientNonce }), true, true, sharedFence);
      });
    },
    setUsername(username) {
      if (!["username", "profile"].includes(state.stage) || !credentials) return Promise.resolve(false);
      const value = String(username).trim();
      if (/^(?:ai$|ai_|_ai)/i.test(value)) { patch({ error: accountEnglish.username_reserved }); return Promise.resolve(false); }
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
      if (state.stage !== "profile" || !credentials || typeof enabled !== "boolean" || !snapshot().canReplyEmail) return Promise.resolve(false);
      const access = credentials.accessToken;
      return run(async (ticket) => { const result = await client.setReplyEmail(access, { enabled });
        if (!active(ticket)) return false; patch({ account: project(result.account ?? result) }); return true; });
    },
    exportData() {
      if (state.stage !== "profile" || !credentials || typeof client.exportData !== "function") return Promise.resolve(false);
      const access = credentials.accessToken, accountId = state.account.id;
      return run(async ticket => {
        let after = null, result = null, bytes = 0, metadata = null;
        const seen = new Set();
        do {
          const page = await client.exportData(access, after);
          if (!active(ticket)) return false;
          if (page.account.id !== accountId || !Array.isArray(page.posts)) throw new Error("Invalid account data");
          const currentMetadata = JSON.stringify({ version: page.version, account: page.account, identities: page.identities, contacts: page.contacts });
          if (metadata !== null && metadata !== currentMetadata) throw new Error("Account data changed");
          metadata = currentMetadata;
          bytes += new TextEncoder().encode(JSON.stringify(page)).byteLength;
          if (bytes > 8_388_608 || seen.size > 10000 || page.next !== null && seen.has(page.next)) throw new Error("Account data too large");
          if (!result) result = { version: page.version, account: page.account, identities: page.identities, contacts: page.contacts, posts: [] };
          result.posts.push(...page.posts);
          after = page.next; if (after !== null) seen.add(after);
        } while (after !== null);
        if (typeof client.exportPrivateData === "function") {
          let privateAfter = null, privateVersion = null;
          const privateSeen = new Set(), conversations = new Map();
          result.privateMessages = [];
          do {
            const page = await client.exportPrivateData(access, privateAfter, privateVersion);
            if (!active(ticket)) return false;
            if (privateVersion !== null && page.version !== privateVersion) throw new Error("Private account data changed");
            privateVersion = page.version;
            bytes += new TextEncoder().encode(JSON.stringify(page)).byteLength;
            if (bytes > 8_388_608 || privateSeen.size > 10000 || page.next !== null && privateSeen.has(page.next)) throw new Error("Account data too large");
            for (const conversation of page.conversations) conversations.set(conversation.id, conversation);
            result.privateMessages.push(...page.messages);
            privateAfter = page.next; if (privateAfter !== null) privateSeen.add(privateAfter);
          } while (privateAfter !== null);
          result.privateVersion = privateVersion;
          result.privateConversations = [...conversations.values()];
        }
        if (!active(ticket)) return false;
        await onExport(result); return true;
      });
    },
    requestDeletion() {
      if (disposed || state.busy || state.stage !== "profile" || !credentials || typeof client.deleteAccount !== "function") return false;
      patch({ stage: "delete", error: "", notice: "" }); return true;
    },
    cancelDeletion() { if (!disposed && !state.busy && state.stage === "delete") patch({ stage: "profile", error: "" }); },
    deleteAccount() {
      if (state.stage !== "delete" || !credentials || typeof client.deleteAccount !== "function") return Promise.resolve(false);
      const access = credentials.accessToken;
      return run(async ticket => {
        credentials = null; emailVerified = false; challenge = null; context = null;
        patch({ account: null });
        await clear({ invalidate: true });
        if (!active(ticket)) { try { await client.logout(access); } catch { /* confirmed deletion leaves no app session */ } return false; }
        try {
          await client.deleteAccount(access);
          if (active(ticket)) patch({ notice: accountEnglish.deleted });
          return true;
        } finally {
          // The server may have consumed the account before a failed response.
          if (active(ticket)) patch({ account: null, stage: "email" });
        }
      });
    },
    signInChatGPT() {
      if (state.stage !== "email" || !snapshot().canChatGPT) return Promise.resolve(false);
      return run(async (ticket) => {
        const sharedFence = typeof storage?.captureFence === "function" ? await storage.captureFence() : undefined;
        operationFence = sharedFence ?? null;
        if (!active(ticket)) return false;
        return accept(ticket, await client.signInChatGPT(), true, false, sharedFence);
      });
    },
    connectChatGPT() {
      if (state.stage !== "email" || !snapshot().canConnectChatGPT) return Promise.resolve(false);
      return run(async (ticket) => {
        await onConnectChatGPT();
        if (!active(ticket)) return false;
        // Connecting AI does not also sign in or switch the discussion account.
        return api.refreshCapabilities();
      });
    },
    restore() {
      return run(async (ticket) => {
        let saved = await storage?.load?.(); if (!active(ticket) || !saved) return false;
        operationFence = typeof storage?.captureFence === "function" ? await storage.captureFence() : null;
        if (!active(ticket)) return false;
        saved = session(saved);
        if (saved.refreshExpiresAt <= now()) { await clear({ expectedAccessToken: saved.accessToken }); return false; }
        if (saved.accessExpiresAt <= now()) return rotate(ticket, saved.refreshToken, saved.accessToken);
        let result;
        try { result = await client.me(saved.accessToken); }
        catch (error) {
          if (error?.code === "authentication-required" && active(ticket)) {
            await clear({ expectedAccessToken: saved.accessToken }); return false;
          }
          throw error;
        }
        if (!active(ticket)) return false; const account = project(result.account ?? result); credentials = saved;
        emailVerified = account.replyEmail; patch({ account }); return true;
      });
    },
    renew() { if (!credentials) return Promise.resolve(false); const { refreshToken, accessToken } = credentials;
      return run(async (ticket) => rotate(ticket, refreshToken, accessToken)); },
    async signOut() {
      if (disposed) return false; ++epoch; const old = credentials, rotatingAccess = [...pendingRotationAccess];
      pendingRotationAccess.clear(); renewing = false; operationFence = null; credentials = null; challenge = null; context = null; emailVerified = false;
      patch({ stage: "email", busy: false, account: null, email: "", error: "", notice: "", resendAt: 0 });
      let saved;
      persistence = persistence.catch(() => {}).then(async () => {
        try { saved = await storage?.load?.(); } catch { /* RAM session still allows revocation */ }
        await storage?.clear?.({ invalidate: true });
      });
      let cleared = true;
      try { await persistence; } catch { cleared = false; if (!disposed) patch({ error: accountEnglish.unavailable }); }
      for (const access of new Set([old?.accessToken, saved?.accessToken, ...rotatingAccess].filter(Boolean))) {
        try { await client.logout(access); } catch { /* local revocation is immediate */ }
      }
      return cleared;
    },
    tick() { emit(); },
    dispose() { ++epoch; ++capabilityEpoch; disposed = true; renewing = false; credentials = null; challenge = null; context = null; emailVerified = false;
      state = { stage: "closed", busy: false, email: "", account: null, error: "", notice: "", resendAt: 0 }; listeners.clear(); },
  };
  emit(); return Object.freeze(api);
}
