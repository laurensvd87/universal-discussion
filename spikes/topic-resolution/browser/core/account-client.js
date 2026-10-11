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
  async function request(path, body, accessToken, project) {
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
      if (length !== null && (!/^\d+$/u.test(length) || Number(length) > MAX_BYTES)) fail("invalid-response");
      if (!response.body?.getReader) fail("invalid-response");
      reader = response.body.getReader();
      const chunks = []; let bytes = 0;
      while (true) {
        const next = await reader.read();
        if (controller.signal.aborted) fail("unavailable");
        if (next.done) break;
        if (!(next.value instanceof Uint8Array) || (bytes += next.value.byteLength) > MAX_BYTES) fail("invalid-response");
        chunks.push(next.value);
      }
      const content = new Uint8Array(bytes); let offset = 0;
      for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.byteLength; }
      let value;
      try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content)); } catch { fail("invalid-response"); }
      if (response.status !== 200) {
        const permitted = { 400: ["invalid-request", "verification-failed"],
          401: ["unauthorized", "authentication-required"], 403: ["forbidden"],
          409: ["username-unavailable"], 429: ["request-unavailable"], 404: ["not-found"] };
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
    capabilities: Object.freeze({ chatGPTIdentity: false }),
    requestCode: body => request("/email/request", body, undefined, value => {
      if (!value || Object.keys(value).sort().join() !== "challengeId,expiresIn" ||
          typeof value.challengeId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(value.challengeId) || value.expiresIn !== 600) fail("invalid-response");
      return Object.freeze({ ...value });
    }),
    verifyCode: body => request("/email/verify", body, undefined, authenticated),
    me: token => request("/me", undefined, token, account),
    renew: body => request("/session/renew", body, undefined, authenticated),
    setUsername: (token, body) => request("/username", body, token, account),
    setReplyEmail: (token, body) => request("/preferences", body, token, account),
    logout: token => request("/session/logout", {}, token, value => {
      if (!value || Object.keys(value).join() !== "loggedOut" || value.loggedOut !== true) fail("invalid-response");
      return Object.freeze({ loggedOut: true });
    }),
  });
}
