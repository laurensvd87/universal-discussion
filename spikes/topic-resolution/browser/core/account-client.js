// Dormant account transport: explicit injection only, never started by popup code.
const BASE = "http://127.0.0.1:4174/v1/account";
const MAX_BYTES = 16_384;
const encoder = new TextEncoder();
const credential = value => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/u.test(value);
export class AccountClientError extends Error {
  constructor(code) { super("Account request failed"); this.name = "AccountClientError"; this.code = code; }
}
const fail = code => { throw new AccountClientError(code); };
function account(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join() !== "id,replyEmail,state,username" ||
      typeof value.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(value.id) ||
      value.state !== "active" || typeof value.replyEmail !== "boolean" ||
      !(value.username === null || typeof value.username === "string" && /^[A-Za-z0-9_]{3,24}$/u.test(value.username))) fail("invalid-response");
  return Object.freeze({ ...value });
}
function authenticated(value) {
  if (!value || Object.keys(value).sort().join() !== "account,session") fail("invalid-response");
  const s = value.session;
  if (!s || Object.keys(s).sort().join() !== "accessExpiresAt,accessToken,refreshExpiresAt,refreshToken" ||
      !credential(s.accessToken) || !credential(s.refreshToken) ||
      !Number.isSafeInteger(s.accessExpiresAt) || !Number.isSafeInteger(s.refreshExpiresAt) ||
      s.accessExpiresAt <= 0 || s.refreshExpiresAt <= s.accessExpiresAt) fail("invalid-response");
  return Object.freeze({ account: account(value.account), session: Object.freeze({ ...s }) });
}
export function createAccountClient({ fetchImpl, getPairingToken, timeoutMs = 5000 } = {}) {
  if (typeof fetchImpl !== "function" || typeof getPairingToken !== "function" ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new TypeError("Invalid account client configuration");
  async function request(path, body, accessToken, project, maxBytes = MAX_BYTES) {
    if (accessToken !== undefined && !credential(accessToken)) fail("authentication-required");
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    if (serialized !== undefined && encoder.encode(serialized).byteLength > 4096) fail("invalid-request");
    const controller = new AbortController();
    let reader;
    let timer;
    const interrupted = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reader?.cancel().catch(() => {}); reject(new AccountClientError("unavailable")); }, timeoutMs);
    });
    const operation = (async () => {
      const token = await getPairingToken();
      if (controller.signal.aborted) fail("unavailable");
      if (typeof token !== "string" || !/^[A-Za-z0-9._-]{32,256}$/u.test(token)) fail("pairing-required");
      const headers = { Authorization: `Bearer ${token}`,
        ...(serialized === undefined ? {} : { "Content-Type": "application/json" }),
        ...(accessToken === undefined ? {} : { "X-Account-Session": accessToken }) };
      const response = await fetchImpl(BASE + path, { method: serialized === undefined ? "GET" : "POST", headers,
        ...(serialized === undefined ? {} : { body: serialized }), signal: controller.signal,
        redirect: "error", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
      if (!response || response.redirected || response.url && response.url !== BASE + path ||
          !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(response.headers?.get("content-type") ?? "")) fail("invalid-response");
      const length = response.headers.get("content-length");
      if (length !== null && (!/^\d+$/u.test(length) || Number(length) > maxBytes)) fail("invalid-response");
      if (!response.body?.getReader) fail("invalid-response");
      reader = response.body.getReader();
      const chunks = []; let bytes = 0;
      while (true) {
        const next = await reader.read();
        if (controller.signal.aborted) fail("unavailable");
        if (next.done) break;
        if (!(next.value instanceof Uint8Array) || (bytes += next.value.byteLength) > maxBytes) fail("invalid-response");
        chunks.push(next.value);
      }
      const content = new Uint8Array(bytes); let offset = 0;
      for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.byteLength; }
      let value;
      try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content)); } catch { fail("invalid-response"); }
      if (response.status !== 200) {
        const permitted = { 400: ["invalid-request", "verification-failed"],
          401: ["unauthorized", "authentication-required"], 403: ["forbidden"],
          409: ["username-unavailable", "account-switch-required", "chatgpt-unavailable", "email-unavailable"], 429: ["request-unavailable"], 404: ["not-found"] };
        if (!value || Object.keys(value).join() !== "error" || !permitted[response.status]?.includes(value.error)) fail("unavailable");
        fail(value.error === "unauthorized" ? "pairing-required" : value.error);
      }
      return project(value);
    })();
    try { return await Promise.race([operation, interrupted]); }
    catch (error) { if (error instanceof AccountClientError) throw error; fail("unavailable"); }
    finally { clearTimeout(timer); controller.abort(); await reader?.cancel().catch(() => {}); }
  }
  return Object.freeze({
    capabilities: Object.freeze({ chatGPTIdentity: false, emailCode: false }),
    getCapabilities: () => request("/capabilities", {}, undefined, value => {
      if (!value || typeof value !== "object" || Array.isArray(value) ||
          Object.keys(value).sort().join() !== "chatGPTIdentity,emailCode" ||
          typeof value.chatGPTIdentity !== "boolean" || typeof value.emailCode !== "boolean") fail("invalid-response");
      return Object.freeze({ ...value });
    }),
    signInChatGPT: () => request("/chatgpt", {}, undefined, authenticated),
    requestCode: body => request("/email/request", body, undefined, value => {
      if (!value || Object.keys(value).sort().join() !== "challengeId,expiresIn" ||
          typeof value.challengeId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(value.challengeId) || value.expiresIn !== 600) fail("invalid-response");
      return Object.freeze({ ...value });
    }),
    verifyCode: body => request("/email/verify", body, undefined, authenticated),
    me: token => request("/me", {}, token, account),
    renew: body => request("/session/renew", body, undefined, authenticated),
    setUsername: (token, body) => request("/username", body, token, account),
    setReplyEmail: (token, body) => request("/preferences", body, token, account),
    exportData: (token, after = null) => request("/data", { after }, token, value => {
      if (!value || Object.keys(value).sort().join() !== "account,contacts,identities,next,posts,version" ||
          !value.version || Object.keys(value.version).sort().join() !== "generation,revision" ||
          typeof value.version.generation !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value.version.generation) ||
          !Number.isSafeInteger(value.version.revision) || value.version.revision < 0 ||
          !Array.isArray(value.identities) || value.identities.length > 20 ||
          !Array.isArray(value.contacts) || value.contacts.length > 20 ||
          !Array.isArray(value.posts) || value.posts.length > 1 ||
          !(value.next === null || typeof value.next === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}:(?:[0-9]|[1-4][0-9])$/u.test(value.next))) fail("invalid-response");
      for (const identity of value.identities) {
        if (!identity || Object.keys(identity).sort().join() !== "clientId,issuer,subject" ||
            Object.values(identity).some(item => typeof item !== "string" || !item || item.length > 4096)) fail("invalid-response");
      }
      for (const contact of value.contacts) {
        if (!contact || Object.keys(contact).sort().join() !== "email,verifiedAt" ||
            typeof contact.email !== "string" || contact.email.length > 254 || !Number.isSafeInteger(contact.verifiedAt)) fail("invalid-response");
      }
      // Stored own-post schemas can evolve; auth secrets are never export DTOs.
      const inspect = (item, depth = 0) => {
        if (depth > 24) fail("invalid-response");
        if (item === null || ["string", "boolean", "number"].includes(typeof item)) return;
        if (!item || typeof item !== "object") fail("invalid-response");
        for (const [key, nested] of Object.entries(item)) {
          if (["__proto__", "constructor", "prototype", "accessToken", "refreshToken", "idToken", "access_token", "refresh_token", "id_token",
            "session", "sessions", "credentials", "codeVerifier", "code"].includes(key)) fail("invalid-response");
          inspect(nested, depth + 1);
        }
      };
      value.posts.forEach(post => {
        if (!post || typeof post !== "object" || Array.isArray(post) || !Array.isArray(post.revisions) || post.revisions.length !== 1 ||
            !Number.isInteger(post.revisionIndex) || post.revisionIndex < 0 || post.revisionIndex > 49 ||
            !Number.isInteger(post.totalRevisions) || post.totalRevisions < 1 || post.totalRevisions > 50 || post.revisionIndex >= post.totalRevisions) fail("invalid-response");
        inspect(post);
      });
      return Object.freeze({ ...value, account: account(value.account) });
    }, 131072),
    deleteAccount: token => request("/delete", { confirmation: "DELETE MY ACCOUNT" }, token, value => {
      if (!value || Object.keys(value).join() !== "deleted" || value.deleted !== true) fail("invalid-response");
      return Object.freeze({ deleted: true });
    }),
    logout: token => request("/session/logout", {}, token, value => {
      if (!value || Object.keys(value).join() !== "loggedOut" || value.loggedOut !== true) fail("invalid-response");
      return Object.freeze({ loggedOut: true });
    }),
  });
}
