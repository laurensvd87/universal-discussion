import { createHash, createPublicKey, randomBytes, verify as verifySignature } from "node:crypto";

const ISSUER = "https://auth.openai.com";
const DISCOVERY = `${ISSUER}/.well-known/openid-configuration`;
const AUTHORIZE = `${ISSUER}/api/accounts/authorize`;
const TOKEN = `${ISSUER}/api/accounts/oauth/token`;
const RESOURCE = "https://api.openai.com/v1";
const SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const ATTEMPT_MS = 5 * 60_000;
const MAX_BYTES = 65_536;

const FAILURE_STAGES = new Set(["callback-invalid", "callback-expired", "token-exchange-rejected",
  "token-exchange-failed", "token-response-invalid", "discovery-failed",
  "identity-verification-failed", "registration-failed"]);
const IDENTITY_SUBSTAGES = new Set(["jwks-request-failed", "jwks-invalid", "token-header-invalid",
  "matching-key-invalid", "signature-invalid", "claims-invalid"]);
export class ChatGPTConnectionFailure extends Error {
  constructor(stage, substage = null) {
    super("ChatGPT connection could not be verified");
    if (!FAILURE_STAGES.has(stage)) throw new TypeError("Invalid connection failure stage");
    if (substage !== null && (stage !== "identity-verification-failed" || !IDENTITY_SUBSTAGES.has(substage)))
      throw new TypeError("Invalid identity verification substage");
    this.failureStage = stage;
    if (substage !== null) this.failureSubstage = substage;
  }
}

function invalid() { throw new Error("ChatGPT connection could not be verified"); }
class IdentityVerificationError extends Error {
  constructor(substage) {
    super("ChatGPT identity could not be verified");
    this.substage = substage;
  }
}
function identityInvalid(substage) { throw new IdentityVerificationError(substage); }
const UNUSABLE_REFRESH = new Set(["invalid_grant", "invalid_refresh_token", "token_expired",
  "refresh_token_expired", "refresh_token_invalidated", "refresh_token_reused"]);
class OAuthRequestError extends Error {
  constructor(code, status) {
    super("ChatGPT authorization request failed");
    this.code = code;
    this.status = status;
  }
}
function requiredText(value, max = 512) {
  if (typeof value !== "string" || !value || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) invalid();
  return value;
}
function exactUri(value) {
  requiredText(value, 200);
  let parsed;
  try { parsed = new URL(value); } catch { invalid(); }
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || !parsed.port ||
      parsed.pathname !== "/auth/callback" || parsed.search || parsed.hash || parsed.username || parsed.password ||
      parsed.toString() !== value) invalid();
  return value;
}
function authEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { invalid(); }
  if (url.origin !== ISSUER || url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      !url.pathname.startsWith("/")) invalid();
  return url.toString();
}
function jwtPart(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length > 16_384) invalid();
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); } catch { invalid(); }
}
function safeRegistration(value) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !["clientId", "subject", "email", "label"].includes(key))) invalid();
  const clientId = requiredText(value.clientId, 256);
  if (clientId === "dynamic_agent_client") invalid();
  return { clientId, subject: requiredText(value.subject, 256),
    email: value.email == null ? null : requiredText(value.email, 320),
    label: value.label == null ? null : requiredText(value.label, 320) };
}

export function createChatGPTConnection({ hostId, agentName, readRegistration, writeRegistration,
  fetchImpl, refreshStore = null, now = Date.now, random = randomBytes } = {}) {
  requiredText(hostId, 256); requiredText(agentName, 128);
  if (typeof readRegistration !== "function" || typeof writeRegistration !== "function" ||
      typeof fetchImpl !== "function" || typeof now !== "function" || typeof random !== "function") invalid();
  if (refreshStore !== null && (typeof refreshStore.read !== "function" ||
      typeof refreshStore.write !== "function" || typeof refreshStore.clear !== "function")) invalid();
  let pending = null;
  let active = null;
  let refreshFlight = null;
  let retryClientId = null;
  let disposed = false;
  let epoch = 0;
  const requests = new Set();
  let storageTail = Promise.resolve();
  function storage(operation) {
    const task = storageTail.then(operation, operation);
    storageTail = task.catch(() => {});
    return task;
  }
  async function clearStored() {
    if (refreshStore) await storage(() => refreshStore.clear());
  }
  async function saveStored(clientId, subject, refreshToken) {
    if (refreshStore && refreshToken) await storage(() => refreshStore.write({ clientId, subject, refreshToken }));
  }
  async function persistOrForget(clientId, subject, refreshToken) {
    if (!refreshToken) {
      try { await clearStored(); } catch { /* No durable grant for this account. */ }
      return;
    }
    try { await saveStored(clientId, subject, refreshToken); }
    catch { try { await clearStored(); } catch { /* Never report credentials or storage paths. */ } }
  }
  function abortRequests() { for (const controller of requests) controller.abort(); }
  function currentPending() {
    if (pending?.expiresAt <= now()) pending = null;
    return pending;
  }

  function fresh() {
    const value = random(32);
    if (!Buffer.isBuffer(value) || value.length !== 32) invalid();
    return value.toString("base64url");
  }
  async function request(url, options = {}, { empty = false, oauthError = false } = {}) {
    authEndpoint(url);
    const controller = new AbortController();
    requests.add(controller);
    let response;
    try {
      response = await fetchImpl(url, { ...options, redirect: "error", credentials: "omit",
        cache: "no-store", referrerPolicy: "no-referrer",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) });
      if (controller.signal.aborted || disposed) invalid();
      if (response.redirected || (response.url && response.url !== url)) invalid();
      if (empty && response.status === 200) { await response.body?.cancel?.(); return null; }
      const jsonResponse = /^application\/json(?:\s*;|$)/iu.test(response.headers.get("content-type") ?? "");
      if (response.status !== 200 && (!oauthError || !jsonResponse)) throw new OAuthRequestError(null, response.status);
      if (!jsonResponse) invalid();
      const reader = response.body?.getReader();
      if (!reader) invalid();
      const chunks = []; let bytes = 0;
      try {
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          bytes += item.value.byteLength;
          if (bytes > MAX_BYTES) { await reader.cancel(); invalid(); }
          chunks.push(item.value);
        }
      } finally { reader.releaseLock(); }
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (response.status !== 200) {
        const code = typeof value?.error === "string" && /^[a-z][a-z0-9_]{0,79}$/u.test(value.error)
          ? value.error : null;
        throw new OAuthRequestError(code, response.status);
      }
      return value;
    } catch (error) { if (error instanceof OAuthRequestError) throw error; invalid(); }
    finally { requests.delete(controller); }
  }
  async function discovery() {
    const value = await request(DISCOVERY);
    if (value?.issuer !== ISSUER || value.authorization_endpoint !== AUTHORIZE || value.token_endpoint !== TOKEN) invalid();
    return { jwksUri: authEndpoint(value.jwks_uri), revocationEndpoint: authEndpoint(value.revocation_endpoint) };
  }
  async function verifyIdToken(token, clientId, nonce, jwksUri) {
    try { requiredText(token, 20_000); } catch { identityInvalid("token-header-invalid"); }
    const parts = token.split(".");
    if (parts.length !== 3) identityInvalid("token-header-invalid");
    let header, claims;
    try { header = jwtPart(parts[0]); } catch { identityInvalid("token-header-invalid"); }
    try { claims = jwtPart(parts[1]); } catch { identityInvalid("claims-invalid"); }
    if (header?.alg !== "RS256" || typeof header.kid !== "string" || !header.kid ||
        (header.typ !== undefined && header.typ !== "JWT") || header.crit !== undefined)
      identityInvalid("token-header-invalid");
    let jwks;
    try { jwks = await request(jwksUri); } catch { identityInvalid("jwks-request-failed"); }
    if (!Array.isArray(jwks?.keys) || jwks.keys.length < 1 || jwks.keys.length > 20 ||
        jwks.keys.some((key) => !key || typeof key !== "object" || Array.isArray(key)))
      identityInvalid("jwks-invalid");
    const matches = jwks.keys.filter((key) => key.kid === header.kid && key.kty === "RSA" &&
      (!key.use || key.use === "sig") && (!key.alg || key.alg === "RS256") && !key.d);
    if (matches.length !== 1) identityInvalid("matching-key-invalid");
    let key;
    try { key = createPublicKey({ key: matches[0], format: "jwk" }); }
    catch { identityInvalid("matching-key-invalid"); }
    let signatureValid;
    try { signatureValid = verifySignature("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key,
      Buffer.from(parts[2], "base64url")); }
    catch { identityInvalid("signature-invalid"); }
    if (!signatureValid) identityInvalid("signature-invalid");
    const seconds = Math.floor(now() / 1000);
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) identityInvalid("claims-invalid");
    const audienceMatches = claims.aud === clientId ||
      Array.isArray(claims.aud) && claims.aud.length === 1 && claims.aud[0] === clientId;
    if (claims.iss !== ISSUER || !audienceMatches ||
        claims.azp !== undefined && claims.azp !== clientId ||
        nonce !== null && claims.nonce !== nonce ||
        typeof claims.sub !== "string" || !claims.sub || !Number.isInteger(claims.exp) ||
        !Number.isInteger(claims.iat) || claims.exp <= seconds - 5 || claims.iat > seconds + 5 ||
        (claims.nbf !== undefined && (!Number.isInteger(claims.nbf) || claims.nbf > seconds + 5)))
      identityInvalid("claims-invalid");
    let subject;
    try { subject = requiredText(claims.sub, 256); } catch { identityInvalid("claims-invalid"); }
    return { subject, email: typeof claims.email === "string" &&
      claims.email.length <= 320 && !/[\u0000-\u001f\u007f]/u.test(claims.email) ? claims.email : null };
  }
  function credentials(value, clientId) {
    if (value?.token_type !== "Bearer" || !Number.isInteger(value.expires_in) || value.expires_in < 60 ||
        value.expires_in > 86_400 || typeof value.scope !== "string") invalid();
    const scopes = new Set(value.scope.split(" ").filter(Boolean));
    const planEnabled = scopes.has("chatgpt.tokens.use.direct") && scopes.has("resource.invoke") &&
      scopes.has("offline_access") && value.refresh_token != null;
    return { clientId, accessToken: requiredText(value.access_token, 20_000),
      refreshToken: value.refresh_token == null && !planEnabled ? null : requiredText(value.refresh_token, 20_000),
      idToken: value.id_token == null ? null : requiredText(value.id_token, 20_000), expiresAt: now() + value.expires_in * 1000,
      scopes, planEnabled };
  }
  function status() {
    if (disposed) return { connected: false, planEnabled: false, pending: false, account: null };
    return { connected: Boolean(active), planEnabled: Boolean(active?.planEnabled), pending: Boolean(currentPending()),
      account: active ? { clientId: active.clientId, label: active.label } : null };
  }
  let restoreFlight = null;
  function restore() {
    if (restoreFlight) return restoreFlight;
    restoreFlight = (async () => {
      if (!refreshStore || disposed || active || currentPending()) return false;
      const before = epoch;
      let registration, saved;
      try {
        registration = safeRegistration(await readRegistration());
        saved = await storage(() => refreshStore.read());
      } catch { return false; }
      if (!registration || !saved) return false;
      if (saved.clientId !== registration.clientId || saved.subject !== registration.subject ||
          typeof saved.refreshToken !== "string") {
        try { await clearStored(); } catch { /* Keep disconnected on corrupt storage. */ }
        return false;
      }
      try {
        const endpoints = await discovery();
        if (disposed || epoch !== before || active || currentPending()) return false;
        const value = await request(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "refresh_token", client_id: registration.clientId,
            refresh_token: saved.refreshToken, resource: RESOURCE }).toString() }, { oauthError: true });
        const tokens = credentials(value, registration.clientId);
        if (!tokens.planEnabled) {
          await clearStored();
          return false;
        }
        if (value.id_token) {
          const identity = await verifyIdToken(value.id_token, registration.clientId, null, endpoints.jwksUri);
          if (identity.subject !== registration.subject) {
            await clearStored();
            return false;
          }
        }
        if (disposed || epoch !== before || active || currentPending()) return false;
        await persistOrForget(registration.clientId, registration.subject, tokens.refreshToken);
        if (disposed || epoch !== before || active || currentPending()) return false;
        active = { ...tokens, ...registration, jwksUri: endpoints.jwksUri,
          revocationEndpoint: endpoints.revocationEndpoint };
        return true;
      } catch (error) {
        if (error instanceof OAuthRequestError && UNUSABLE_REFRESH.has(error.code)) {
          try { await clearStored(); } catch { /* Keep disconnected on unusable storage. */ }
        }
        return false;
      }
    })();
    return restoreFlight;
  }
  async function start({ redirectUri } = {}) {
    if (disposed || currentPending()) invalid();
    exactUri(redirectUri);
    let starting = {}; pending = starting;
    try {
      const registration = safeRegistration(await readRegistration());
      if (disposed || pending !== starting) invalid();
      const state = fresh(), nonce = fresh(), verifier = fresh();
      starting = { state, nonce, verifier, redirectUri, registration, retryClientId,
        expiresAt: now() + ATTEMPT_MS };
      pending = starting;
      const parameters = new URLSearchParams({ client_id: registration?.clientId ?? retryClientId ?? "dynamic_agent_client",
        ext_agent_host_id: hostId, response_type: "code", redirect_uri: redirectUri, scope: SCOPES,
        resource: RESOURCE, state, nonce, code_challenge_method: "S256",
        code_challenge: createHash("sha256").update(verifier).digest("base64url") });
      if (!registration && !retryClientId) parameters.set("agent_name_hint", agentName);
      else if (registration?.email) parameters.set("login_hint", registration.email);
      if (active && !active.planEnabled) parameters.set("prompt", "consent");
      return `${AUTHORIZE}?${parameters}`;
    } catch {
      if (pending === starting) pending = null;
      invalid();
    }
  }
  async function completeCallback({ redirectUri, url } = {}) {
    const expired = pending?.expiresAt <= now();
    const attempt = currentPending();
    if (disposed || !attempt || attempt.processing || !attempt.state || redirectUri !== attempt.redirectUri)
      throw new ChatGPTConnectionFailure(expired ? "callback-expired" : "callback-invalid");
    let callback;
    try { callback = new URL(url); } catch { throw new ChatGPTConnectionFailure("callback-invalid"); }
    if (`${callback.origin}${callback.pathname}` !== redirectUri || callback.hash || callback.username || callback.password ||
        [...callback.searchParams.keys()].some((key) => callback.searchParams.getAll(key).length !== 1) ||
        callback.searchParams.get("state") !== attempt.state) throw new ChatGPTConnectionFailure("callback-invalid");
    attempt.processing = true;
    let failureStage = "callback-invalid";
    try {
    if (callback.searchParams.has("error")) invalid();
    const code = requiredText(callback.searchParams.get("code"), 2_048);
    const returnedClientId = callback.searchParams.get("client_id");
    const clientId = attempt.registration?.clientId ?? attempt.retryClientId ?? requiredText(returnedClientId, 256);
    if (clientId === "dynamic_agent_client" ||
        (attempt.registration || attempt.retryClientId) && returnedClientId && returnedClientId !== clientId) invalid();
    const before = epoch;
    let tokenResponse;
    failureStage = "token-exchange-failed";
    try {
      tokenResponse = await request(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code,
          code_verifier: attempt.verifier, redirect_uri: redirectUri, resource: RESOURCE }).toString() }, { oauthError: true });
    } catch (error) {
      if (!attempt.registration && error instanceof OAuthRequestError && error.code === "invalid_grant") retryClientId = clientId;
      if (error instanceof OAuthRequestError) failureStage = "token-exchange-rejected";
      throw error;
    }
    failureStage = "token-response-invalid";
    const tokens = credentials(tokenResponse, clientId);
    failureStage = "discovery-failed";
    const endpoints = await discovery();
    failureStage = "identity-verification-failed";
    const identity = await verifyIdToken(tokens.idToken, clientId, attempt.nonce, endpoints.jwksUri);
    if (attempt.expiresAt <= now()) failureStage = "callback-expired";
    if (attempt.registration && identity.subject !== attempt.registration.subject || disposed || before !== epoch ||
        pending !== attempt || attempt.expiresAt <= now()) invalid();
    const registration = { clientId, subject: identity.subject, email: identity.email,
      label: identity.email ?? identity.subject };
    failureStage = "registration-failed";
    await writeRegistration(registration);
    if (disposed || before !== epoch || pending !== attempt) invalid();
    await persistOrForget(clientId, identity.subject, tokens.refreshToken);
    if (disposed || before !== epoch || pending !== attempt) invalid();
    active = { ...tokens, ...registration, jwksUri: endpoints.jwksUri, revocationEndpoint: endpoints.revocationEndpoint };
    retryClientId = null;
    pending = null;
    return status();
    } catch (error) {
      throw new ChatGPTConnectionFailure(failureStage,
        failureStage === "identity-verification-failed" && error instanceof IdentityVerificationError
          ? error.substage : null);
    } finally { if (pending === attempt) pending = null; }
  }
  async function getAccessToken() {
    if (disposed || !active || !active.planEnabled) invalid();
    if (active.expiresAt > now() + 60_000) return active.accessToken;
    if (!refreshFlight) {
      const original = active; const before = epoch;
      const flight = (async () => {
        try {
          const value = await request(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ grant_type: "refresh_token", client_id: original.clientId,
              refresh_token: original.refreshToken, resource: RESOURCE }).toString() }, { oauthError: true });
          const updated = credentials({ ...value, id_token: value.id_token ?? original.idToken }, original.clientId);
          if (value.id_token) {
            const identity = await verifyIdToken(value.id_token, original.clientId, null, original.jwksUri);
            if (identity.subject !== original.subject) invalid();
          }
          if (disposed || epoch !== before || active !== original) invalid();
          await persistOrForget(original.clientId, original.subject, updated.refreshToken);
          if (disposed || epoch !== before || active !== original) invalid();
          active = { ...original, ...updated };
          if (!active.planEnabled) invalid();
          return active.accessToken;
        } catch (error) {
          if (active === original && error instanceof OAuthRequestError && UNUSABLE_REFRESH.has(error.code)) {
            active = null;
            try { await clearStored(); } catch { /* The invalid grant cannot be resumed. */ }
          }
          invalid();
        }
      })();
      const settled = flight.finally(() => { if (refreshFlight === settled) refreshFlight = null; });
      refreshFlight = settled;
    }
    return refreshFlight;
  }
  async function disconnect() {
    const previous = active; epoch += 1; pending = null; active = null; refreshFlight = null;
    retryClientId = null; abortRequests();
    let saved = null;
    if (!previous && refreshStore) {
      try { saved = await storage(() => refreshStore.read()); } catch { /* Clear even if read fails. */ }
    }
    let localCleared = true;
    try { await clearStored(); } catch { localCleared = false; }
    const token = previous?.refreshToken ?? saved?.refreshToken;
    const clientId = previous?.clientId ?? saved?.clientId;
    if (!token || !clientId || disposed) {
      if (!localCleared) invalid();
      return { revocationConfirmed: false };
    }
    try {
      const endpoint = previous?.revocationEndpoint ?? (await discovery()).revocationEndpoint;
      await request(endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token, token_type_hint: "refresh_token", client_id: clientId }).toString() }, { empty: true });
      if (!localCleared) invalid();
      return { revocationConfirmed: true };
    } catch { if (!localCleared) invalid(); return { revocationConfirmed: false }; }
  }
  function dispose() { disposed = true; epoch += 1; pending = null; active = null; refreshFlight = null;
    retryClientId = null; abortRequests(); }
  return Object.freeze({ start, completeCallback, getAccessToken, status, restore, disconnect, dispose });
}
