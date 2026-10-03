import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { ChatGPTConnectionFailure, createChatGPTConnection } from "../src/ai/chatgpt-connection.js";

const ISSUER = "https://auth.openai.com";
const DISCOVERY = `${ISSUER}/.well-known/openid-configuration`;
const JWKS = `${ISSUER}/.well-known/jwks.json`;
const TOKEN = `${ISSUER}/api/accounts/oauth/token`;
const REVOKE = `${ISSUER}/oauth/revoke`;
const REDIRECT = "http://127.0.0.1:1455/auth/callback";
const NOW = Date.UTC(2026, 8, 29, 12);
const SCOPE = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = { ...pair.publicKey.export({ format: "jwk" }), kid: "synthetic-key", alg: "RS256", use: "sig" };
const enc = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
function idToken(clientId, nonce, changes = {}, headerChanges = {}) {
  const header = enc({ alg: "RS256", typ: "JWT", kid: "synthetic-key", ...headerChanges });
  const payload = enc({ iss: ISSUER, aud: clientId, sub: "account-1", email: "synthetic@example.com",
    nonce, iat: NOW / 1000, exp: NOW / 1000 + 3600, ...changes });
  const content = `${header}.${payload}`;
  return `${content}.${sign("RSA-SHA256", Buffer.from(content), pair.privateKey).toString("base64url")}`;
}
function tokenResponse(clientId, nonce, changes = {}) {
  return { access_token: "access-synthetic", refresh_token: "refresh-synthetic", id_token: idToken(clientId, nonce),
    token_type: "Bearer", expires_in: 3600, scope: SCOPE, ...changes };
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
function fixture(options = {}) {
  const calls = []; const writes = [];
  let clock = NOW; let count = 0; let registration = options.registration ?? null;
  let tokens = options.tokens ?? null;
  let revocationResponse = options.revocationResponse ?? new Response(null, { status: 200 });
  const discovery = { issuer: ISSUER, authorization_endpoint: `${ISSUER}/api/accounts/authorize`,
    token_endpoint: TOKEN, jwks_uri: JWKS, revocation_endpoint: REVOKE };
  const fetchImpl = async (url, request) => {
    calls.push({ url, request });
    if (url === DISCOVERY) return json(options.discovery ?? discovery);
    if (url === JWKS) return options.jwksImpl ? options.jwksImpl() : json(options.jwks ?? { keys: [publicJwk] });
    if (url === TOKEN) {
      const form = new URLSearchParams(request.body);
      if (form.get("grant_type") === "refresh_token" && options.refreshImpl) return options.refreshImpl(request);
      if (form.get("grant_type") === "refresh_token") return json(options.refreshTokens ?? {
        ...tokenResponse(form.get("client_id"), "unused"), access_token: "access-refreshed", refresh_token: "refresh-rotated" });
      if (options.exchangeImpl) return options.exchangeImpl(request);
      return json(tokens ?? tokenResponse(form.get("client_id"), options.nonce));
    }
    if (url === REVOKE) return revocationResponse;
    assert.fail(`Unexpected endpoint: ${url}`);
  };
  const connection = createChatGPTConnection({ hostId: "urn:uuid:synthetic-host", agentName: "Universal Discussion",
    readRegistration: async () => options.readImpl ? options.readImpl(registration) : registration,
    writeRegistration: async (value) => { if (options.writeImpl) await options.writeImpl(value);
      writes.push(value); registration = value; },
    fetchImpl, refreshStore: options.refreshStore ?? null, now: () => clock,
    random: () => { count += 1; return Buffer.alloc(32, count); } });
  async function start() {
    const authUrl = new URL(await connection.start({ redirectUri: REDIRECT }));
    options.nonce = authUrl.searchParams.get("nonce");
    return authUrl;
  }
  async function complete(authUrl, changes = {}) {
    const clientId = changes.clientId ?? "oaiapp_synthetic";
    const callback = new URL(REDIRECT);
    callback.searchParams.set("state", changes.state ?? authUrl.searchParams.get("state"));
    callback.searchParams.set("code", changes.code ?? "synthetic-code");
    if (!changes.omitClientId) callback.searchParams.set("client_id", clientId);
    return connection.completeCallback({ redirectUri: REDIRECT, url: callback.toString() });
  }
  return { connection, calls, writes, start, complete, setClock: (value) => { clock = value; },
    registration: () => registration, setTokens: (value) => { tokens = value; },
    setRevocation: (value) => { revocationResponse = value; } };
}

test("dynamic registration uses one-use state, nonce and S256 PKCE; tokens stay out of status", async () => {
  const f = fixture();
  assert.deepEqual(f.calls, []);
  const auth = await f.start();
  assert.equal(auth.origin, ISSUER);
  assert.equal(auth.pathname, "/api/accounts/authorize");
  assert.equal(auth.searchParams.get("client_id"), "dynamic_agent_client");
  assert.equal(auth.searchParams.get("ext_agent_host_id"), "urn:uuid:synthetic-host");
  assert.equal(auth.searchParams.get("agent_name_hint"), "Universal Discussion");
  assert.equal(auth.searchParams.get("redirect_uri"), REDIRECT);
  assert.equal(auth.searchParams.get("resource"), "https://api.openai.com/v1");
  assert.equal(auth.searchParams.get("scope"), SCOPE);
  assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
  assert.equal(auth.searchParams.get("code_challenge").length, 43);
  assert.notEqual(auth.searchParams.get("nonce"), auth.searchParams.get("state"));
  assert.equal(f.calls.length, 0);
  const status = await f.complete(auth);
  assert.equal(status.connected, true);
  assert.deepEqual(f.writes, [{ clientId: "oaiapp_synthetic", subject: "account-1",
    email: "synthetic@example.com", label: "synthetic@example.com" }]);
  assert.equal(JSON.stringify(status).includes("access-synthetic"), false);
  assert.equal(JSON.stringify(status).includes("refresh-synthetic"), false);
  assert.equal(await f.connection.getAccessToken(), "access-synthetic");
  assert.equal(f.calls.every(({ url, request }) => url.startsWith(ISSUER) && request.redirect === "error"), true);
  const exchange = f.calls.find(({ url }) => url === TOKEN);
  const form = new URLSearchParams(exchange.request.body);
  assert.equal(form.get("client_id"), "oaiapp_synthetic");
  assert.equal(form.get("grant_type"), "authorization_code");
  assert.equal(form.get("redirect_uri"), REDIRECT);
  assert.equal(form.get("code_verifier").length, 43);
  await assert.rejects(f.complete(auth));
  assert.equal(f.calls.filter(({ url }) => url === TOKEN).length, 1);
});

test("callback mismatch preserves the attempt; malformed matching callback and expiry consume it", async () => {
  for (const change of [{ state: "wrong" }, { clientId: "dynamic_agent_client" }, { code: "" }]) {
    const f = fixture(); const auth = await f.start();
    await assert.rejects(f.complete(auth, change));
    assert.equal(f.calls.length, 0);
    if (change.state === "wrong") await f.complete(auth);
    else await assert.rejects(f.complete(auth));
  }
  const f = fixture(); const auth = await f.start();
  f.setClock(NOW + 5 * 60_000);
  await assert.rejects(f.complete(auth));
  assert.equal(f.calls.length, 0);
  assert.equal(f.connection.status().pending, false);
  await f.start();
});

test("a matching callback cannot be exchanged twice or replaced while exchange is pending", async () => {
  let release;
  const f = fixture();
  const original = f.connection;
  const auth = await f.start();
  const delayed = createChatGPTConnection({ hostId: "urn:uuid:synthetic-host", agentName: "Universal Discussion",
    readRegistration: async () => null, writeRegistration: async () => {}, now: () => NOW,
    random: () => Buffer.alloc(32, 7), fetchImpl: async () => new Promise((resolve) => { release = resolve; }) });
  const pendingAuth = new URL(await delayed.start({ redirectUri: REDIRECT }));
  const callback = new URL(REDIRECT);
  callback.searchParams.set("state", pendingAuth.searchParams.get("state"));
  callback.searchParams.set("code", "synthetic-code");
  callback.searchParams.set("client_id", "oaiapp_synthetic");
  const inFlight = delayed.completeCallback({ redirectUri: REDIRECT, url: callback.toString() });
  await assert.rejects(delayed.start({ redirectUri: REDIRECT }));
  await assert.rejects(delayed.completeCallback({ redirectUri: REDIRECT, url: callback.toString() }));
  delayed.dispose();
  release(json({}));
  await assert.rejects(inFlight);
  assert.equal(delayed.status().connected, false);
  assert.equal(original.status().pending, true);
  original.dispose();
});

test("OIDC signature, issuer, audience, expiry and nonce failures never activate", async () => {
  for (const changed of [
    { iss: "https://attacker.example" }, { aud: "oaiapp_other" }, { exp: NOW / 1000 - 10 },
    { nonce: "wrong" }, { sub: "" },
  ]) {
    const f = fixture(); const auth = await f.start();
    f.setTokens(tokenResponse("oaiapp_synthetic", auth.searchParams.get("nonce"), {
      id_token: idToken("oaiapp_synthetic", auth.searchParams.get("nonce"), changed) }));
    await assert.rejects(f.complete(auth));
    assert.equal(f.connection.status().connected, false);
    assert.deepEqual(f.writes, []);
  }
  const f = fixture(); const auth = await f.start();
  const signed = idToken("oaiapp_synthetic", auth.searchParams.get("nonce"));
  const parts = signed.split("."); parts[2] = `${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;
  f.setTokens(tokenResponse("oaiapp_synthetic", auth.searchParams.get("nonce"), { id_token: parts.join(".") }));
  await assert.rejects(f.complete(auth));
  assert.deepEqual(f.writes, []);
});

test("single-client audience arrays are accepted; other audiences and azp are rejected", async () => {
  for (const claims of [
    { aud: ["oaiapp_synthetic"] },
    { aud: ["oaiapp_synthetic"], azp: "oaiapp_synthetic" },
  ]) {
    const f = fixture(); const auth = await f.start();
    f.setTokens(tokenResponse("oaiapp_synthetic", auth.searchParams.get("nonce"), {
      id_token: idToken("oaiapp_synthetic", auth.searchParams.get("nonce"), claims) }));
    assert.equal((await f.complete(auth)).connected, true);
  }
  for (const claims of [
    { aud: [] }, { aud: ["oaiapp_other"] },
    { aud: ["oaiapp_synthetic", "oaiapp_other"] },
    { aud: "oaiapp_synthetic", azp: "oaiapp_other" },
    { aud: ["oaiapp_synthetic"], azp: "oaiapp_other" },
  ]) {
    const f = fixture(); const auth = await f.start();
    f.setTokens(tokenResponse("oaiapp_synthetic", auth.searchParams.get("nonce"), {
      id_token: idToken("oaiapp_synthetic", auth.searchParams.get("nonce"), claims) }));
    await assert.rejects(f.complete(auth), (error) => error.failureStage === "identity-verification-failed" &&
      error.failureSubstage === "claims-invalid");
    assert.deepEqual(f.writes, []);
  }
});

test("identity substages identify only fixed verification boundaries", async () => {
  const scenarios = [
    { substage: "jwks-request-failed", options: { jwksImpl: () => { throw new Error("SECRET_JWKS"); } } },
    { substage: "jwks-invalid", options: { jwks: { keys: [] } } },
    { substage: "token-header-invalid", header: { alg: "ES256" } },
    { substage: "matching-key-invalid", options: { jwks: { keys: [{ ...publicJwk, kid: "other" }] } } },
    { substage: "signature-invalid", corruptSignature: true },
    { substage: "claims-invalid", claims: { nonce: "wrong" } },
  ];
  for (const scenario of scenarios) {
    const f = fixture(scenario.options); const auth = await f.start();
    let signed = idToken("oaiapp_synthetic", auth.searchParams.get("nonce"), scenario.claims, scenario.header);
    if (scenario.corruptSignature) {
      const parts = signed.split(".");
      parts[2] = `${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;
      signed = parts.join(".");
    }
    f.setTokens(tokenResponse("oaiapp_synthetic", auth.searchParams.get("nonce"), { id_token: signed }));
    await assert.rejects(f.complete(auth), (error) => {
      assert.ok(error instanceof ChatGPTConnectionFailure);
      assert.equal(error.failureStage, "identity-verification-failed");
      assert.equal(error.failureSubstage, scenario.substage);
      assert.equal(JSON.stringify(error).includes("SECRET"), false);
      return true;
    });
    assert.deepEqual(f.writes, []);
  }
});

test("returning account binds issued client and verified subject without replacing active credentials", async () => {
  const f = fixture({ registration: { clientId: "oaiapp_saved", subject: "account-1", email: "synthetic@example.com" } });
  const auth = await f.start();
  assert.equal(auth.searchParams.get("client_id"), "oaiapp_saved");
  assert.equal(auth.searchParams.has("agent_name_hint"), false);
  assert.equal(auth.searchParams.get("login_hint"), "synthetic@example.com");
  await assert.rejects(f.complete(auth, { clientId: "oaiapp_other" }));
  assert.equal(f.calls.length, 0);
  const retry = await f.start();
  f.setTokens(tokenResponse("oaiapp_saved", retry.searchParams.get("nonce"), {
    id_token: idToken("oaiapp_saved", retry.searchParams.get("nonce"), { sub: "account-2" }) }));
  await assert.rejects(f.complete(retry, { omitClientId: true }));
  assert.equal(f.connection.status().connected, false);
  assert.deepEqual(f.writes, []);
});

test("failed account replacement leaves the previously validated connection active", async () => {
  const f = fixture(); const first = await f.start(); await f.complete(first);
  const second = await f.start();
  assert.equal(second.searchParams.get("client_id"), "oaiapp_synthetic");
  f.setTokens(tokenResponse("oaiapp_synthetic", second.searchParams.get("nonce"), {
    id_token: idToken("oaiapp_synthetic", second.searchParams.get("nonce"), { sub: "other-account" }) }));
  await assert.rejects(f.complete(second, { omitClientId: true }));
  assert.equal(f.connection.status().connected, true);
  assert.equal(await f.connection.getAccessToken(), "access-synthetic");
  assert.equal(f.writes.length, 1);
});

test("valid identity without plan scope remains signed in but cannot send inference", async () => {
  const f = fixture(); const auth = await f.start();
  f.setTokens(tokenResponse("oaiapp_synthetic", auth.searchParams.get("nonce"), {
    scope: "openid profile email", refresh_token: undefined }));
  const status = await f.complete(auth);
  assert.equal(status.connected, true);
  assert.equal(status.planEnabled, false);
  await assert.rejects(f.connection.getAccessToken());
  assert.equal(f.writes.length, 1);
  assert.equal(auth.searchParams.has("prompt"), false);
  const reconnect = await f.start();
  assert.equal(reconnect.searchParams.get("client_id"), "oaiapp_synthetic");
  assert.equal(reconnect.searchParams.get("prompt"), "consent");
  f.setTokens(tokenResponse("oaiapp_synthetic", reconnect.searchParams.get("nonce")));
  assert.equal((await f.complete(reconnect, { omitClientId: true })).planEnabled, true);
  const ordinary = await f.start();
  assert.equal(ordinary.searchParams.has("prompt"), false);
});

test("hostile discovery and oversized responses fail closed", async () => {
  const g = fixture({ discovery: { issuer: ISSUER, authorization_endpoint: `${ISSUER}/api/accounts/authorize`,
    token_endpoint: TOKEN, jwks_uri: "https://attacker.example/keys", revocation_endpoint: REVOKE } });
  const second = await g.start(); await assert.rejects(g.complete(second));
  assert.deepEqual(g.writes, []);
  const h = fixture(); const third = await h.start();
  h.setTokens(tokenResponse("oaiapp_synthetic", third.searchParams.get("nonce"), { extra: "x".repeat(70_000) }));
  await assert.rejects(h.complete(third));
  assert.deepEqual(h.writes, []);
});

test("first-registration invalid_grant retries with issued client ID", async () => {
  let exchanges = 0;
  const f = fixture({ exchangeImpl: (request) => {
    exchanges += 1;
    if (exchanges === 1) return json({ error: "invalid_grant" }, 400);
    return json(tokenResponse(new URLSearchParams(request.body).get("client_id"), f.nonce));
  } });
  const first = await f.start();
  await assert.rejects(f.complete(first), (error) => error instanceof ChatGPTConnectionFailure &&
    error.failureStage === "token-exchange-rejected" && !JSON.stringify(error).includes("invalid_grant"));
  const second = await f.start();
  f.nonce = second.searchParams.get("nonce");
  assert.equal(second.searchParams.get("client_id"), "oaiapp_synthetic");
  assert.equal(second.searchParams.has("agent_name_hint"), false);
  await f.complete(second, { omitClientId: true });
  assert.equal(f.connection.status().connected, true);
  assert.equal(exchanges, 2);
});

test("callback failure stages are fixed and never contain provider or callback secrets", async () => {
  const secret = "SENSITIVE_PROVIDER_BODY_AND_CODE";
  const cases = [
    { stage: "callback-invalid", change: { state: "wrong" } },
    { stage: "callback-expired", expire: true },
    { stage: "token-exchange-rejected", options: { exchangeImpl: () => json({ error: "invalid_grant", detail: secret }, 400) } },
    { stage: "token-exchange-failed", options: { exchangeImpl: () => { throw new Error(secret); } } },
    { stage: "token-response-invalid", options: { exchangeImpl: () => json({ access_token: secret }) } },
    { stage: "discovery-failed", options: { discovery: { issuer: secret } } },
    { stage: "identity-verification-failed", options: { jwks: { keys: [] } } },
    { stage: "registration-failed", options: { writeImpl: () => { throw new Error(secret); } } },
  ];
  for (const scenario of cases) {
    const f = fixture(scenario.options); const auth = await f.start();
    if (scenario.expire) f.setClock(NOW + 5 * 60_000);
    await assert.rejects(f.complete(auth, scenario.change), (error) => {
      assert.ok(error instanceof ChatGPTConnectionFailure);
      assert.equal(error.failureStage, scenario.stage);
      const projected = JSON.stringify(error);
      assert.equal(projected.includes(secret), false);
      assert.equal(projected.includes("synthetic-code"), false);
      assert.equal(projected.includes("state"), false);
      return true;
    });
    assert.equal(f.connection.status().connected, false);
  }
});

test("attempt that expires during identity verification reports callback expiry", async () => {
  let advance;
  const f = fixture({ jwksImpl: () => { advance(); return json({ keys: [publicJwk] }); } });
  advance = () => f.setClock(NOW + 5 * 60_000);
  const auth = await f.start();
  await assert.rejects(f.complete(auth), (error) => error instanceof ChatGPTConnectionFailure &&
    error.failureStage === "callback-expired");
  assert.deepEqual(f.writes, []);
});

test("temporary refresh failure keeps credentials; terminal refresh error clears them", async () => {
  let refreshes = 0;
  const f = fixture({ refreshImpl: () => {
    refreshes += 1;
    if (refreshes === 1) return json({ error: "temporarily_unavailable" }, 503);
    if (refreshes === 2) return json({ error: "invalid_grant" }, 400);
    assert.fail("Unexpected refresh");
  } });
  const auth = await f.start(); await f.complete(auth);
  f.setClock(NOW + 3_550_000);
  await assert.rejects(f.connection.getAccessToken());
  assert.equal(f.connection.status().connected, true);
  await assert.rejects(f.connection.getAccessToken());
  assert.equal(f.connection.status().connected, false);
  assert.equal(refreshes, 2);
});

test("disconnect attempts documented refresh-token revocation then clears local tokens", async () => {
  const f = fixture(); const auth = await f.start(); await f.complete(auth);
  const result = await f.connection.disconnect();
  assert.deepEqual(result, { revocationConfirmed: true });
  const revoke = f.calls.find(({ url }) => url === REVOKE);
  assert.equal(new URLSearchParams(revoke.request.body).get("token_type_hint"), "refresh_token");
  assert.equal(new URLSearchParams(revoke.request.body).get("token"), "refresh-synthetic");
  assert.equal(f.connection.status().connected, false);
  await assert.rejects(f.connection.getAccessToken());
  const g = fixture(); const next = await g.start(); await g.complete(next);
  g.setRevocation(new Response(null, { status: 500 }));
  assert.deepEqual(await g.connection.disconnect(), { revocationConfirmed: false });
  assert.equal(g.connection.status().connected, false);
});

test("explicit disconnect clears account A before dynamic registration of account B", async () => {
  let saved = null;
  const refreshStore = { async read() { return saved; }, async write(value) { saved = value; },
    async clear() { saved = null; } };
  const f = fixture({ refreshStore });
  const first = await f.start(); await f.complete(first);
  assert.equal(f.registration().subject, "account-1");
  assert.equal(saved.subject, "account-1");
  assert.deepEqual(await f.connection.disconnect(), { revocationConfirmed: true });
  assert.equal(f.registration(), null);
  assert.equal(saved, null);
  const second = await f.start();
  assert.equal(second.searchParams.get("client_id"), "dynamic_agent_client");
  assert.equal(second.searchParams.has("login_hint"), false);
  assert.equal(second.searchParams.get("agent_name_hint"), "Universal Discussion");
  f.setTokens(tokenResponse("oaiapp_account_b", second.searchParams.get("nonce"), {
    id_token: idToken("oaiapp_account_b", second.searchParams.get("nonce"),
      { sub: "account-2", email: "second@example.com" }) }));
  await f.complete(second, { clientId: "oaiapp_account_b" });
  assert.equal(f.registration().subject, "account-2");
  assert.equal(f.registration().clientId, "oaiapp_account_b");
  assert.equal(saved.subject, "account-2");
});

test("failed protected credential clear retains old registration and prevents account switch", async () => {
  let saved = null;
  const refreshStore = { async read() { return saved; }, async write(value) { saved = value; },
    async clear() { throw new Error("SECRET_STORAGE_PATH"); } };
  const f = fixture({ refreshStore });
  const first = await f.start(); await f.complete(first);
  await assert.rejects(f.connection.disconnect(), (error) =>
    !String(error).includes("SECRET_STORAGE_PATH"));
  assert.equal(f.connection.status().connected, false);
  assert.equal(f.registration().subject, "account-1");
  assert.equal(saved.subject, "account-1");
  const next = await f.start();
  assert.equal(next.searchParams.get("client_id"), "oaiapp_synthetic");
  assert.equal(next.searchParams.get("login_hint"), "synthetic@example.com");
});

test("failed remote revocation still clears local credentials and account mapping", async () => {
  let saved = null;
  const refreshStore = { async read() { return saved; }, async write(value) { saved = value; },
    async clear() { saved = null; } };
  const f = fixture({ refreshStore });
  const first = await f.start(); await f.complete(first);
  f.setRevocation(new Response(null, { status: 500 }));
  assert.deepEqual(await f.connection.disconnect(), { revocationConfirmed: false });
  assert.equal(saved, null);
  assert.equal(f.registration(), null);
  const next = await f.start();
  assert.equal(next.searchParams.get("client_id"), "dynamic_agent_client");
  assert.equal(next.searchParams.has("login_hint"), false);
});

test("registration clear failure cannot silently authorize a different account", async () => {
  const f = fixture({ writeImpl: (value) => {
    if (value === null) throw new Error("SECRET_REGISTRATION_PATH");
  } });
  const first = await f.start(); await f.complete(first);
  await assert.rejects(f.connection.disconnect(), (error) =>
    !String(error).includes("SECRET_REGISTRATION_PATH"));
  assert.equal(f.connection.status().connected, false);
  assert.equal(f.registration().subject, "account-1");
  const next = await f.start();
  assert.equal(next.searchParams.get("client_id"), "oaiapp_synthetic");
});

test("near expiry, concurrent callers share one refresh and replacement tokens remain memory-only", async () => {
  const f = fixture(); const auth = await f.start(); await f.complete(auth);
  f.setClock(NOW + 3_550_000);
  const values = await Promise.all([f.connection.getAccessToken(), f.connection.getAccessToken(), f.connection.getAccessToken()]);
  assert.deepEqual(values, ["access-refreshed", "access-refreshed", "access-refreshed"]);
  const refreshes = f.calls.filter(({ url, request }) => url === TOKEN && new URLSearchParams(request.body).get("grant_type") === "refresh_token");
  assert.equal(refreshes.length, 1);
  assert.equal(new URLSearchParams(refreshes[0].request.body).get("refresh_token"), "refresh-synthetic");
  assert.equal(JSON.stringify(f.connection.status()).includes("refresh-rotated"), false);
  await f.connection.disconnect();
  const revoke = f.calls.find(({ url }) => url === REVOKE);
  assert.equal(new URLSearchParams(revoke.request.body).get("token"), "refresh-rotated");
});

test("disconnect aborts an outstanding refresh and stale credentials cannot reactivate", async () => {
  let release;
  let refreshSignal;
  const f = fixture({ refreshImpl: (request) => {
    refreshSignal = request.signal;
    return new Promise((resolve) => { release = resolve; });
  } });
  const auth = await f.start(); await f.complete(auth);
  f.setClock(NOW + 3_550_000);
  const refreshing = f.connection.getAccessToken();
  assert.equal(refreshSignal.aborted, false);
  await f.connection.disconnect();
  assert.equal(refreshSignal.aborted, true);
  release(json({ ...tokenResponse("oaiapp_synthetic", "unused"), access_token: "stale-access" }));
  await assert.rejects(refreshing);
  assert.equal(f.connection.status().connected, false);
});

test("protected refresh record restores after restart, rotates before use and clears on disconnect", async () => {
  let saved = null;
  const writes = [];
  const refreshStore = {
    async read() { return saved; },
    async write(value) { saved = { ...value }; writes.push({ ...value }); },
    async clear() { saved = null; },
  };
  const first = fixture({ refreshStore });
  const auth = await first.start(); await first.complete(auth);
  assert.deepEqual(saved, { clientId: "oaiapp_synthetic", subject: "account-1", refreshToken: "refresh-synthetic" });
  first.connection.dispose();
  const second = fixture({ registration: first.writes[0], refreshStore });
  assert.equal(second.connection.status().connected, false);
  assert.equal(second.calls.length, 0);
  assert.equal(await second.connection.restore(), true);
  assert.equal(await second.connection.restore(), true);
  assert.equal(second.calls.filter(({ url, request }) => url === TOKEN &&
    new URLSearchParams(request.body).get("grant_type") === "refresh_token").length, 1);
  assert.equal(saved.refreshToken, "refresh-rotated");
  assert.equal(await second.connection.getAccessToken(), "access-refreshed");
  assert.equal(JSON.stringify(second.connection.status()).includes("refresh-rotated"), false);
  assert.deepEqual(await second.connection.disconnect(), { revocationConfirmed: true });
  assert.equal(saved, null);
  const revoke = second.calls.find(({ url }) => url === REVOKE);
  assert.equal(new URLSearchParams(revoke.request.body).get("token"), "refresh-rotated");
  assert.equal(writes.length, 2);
});

test("restore rejects mismatched or unusable stored credentials without connecting", async () => {
  let saved = { clientId: "other-client", subject: "account-1", refreshToken: "synthetic-secret" };
  const refreshStore = { async read() { return saved; }, async write() { assert.fail("No write expected"); },
    async clear() { saved = null; } };
  const registration = { clientId: "oaiapp_synthetic", subject: "account-1",
    email: "synthetic@example.com", label: "synthetic@example.com" };
  const mismatch = fixture({ registration, refreshStore });
  assert.equal(await mismatch.connection.restore(), false);
  assert.equal(saved, null);
  assert.equal(mismatch.calls.length, 0);
  saved = { clientId: registration.clientId, subject: registration.subject, refreshToken: "synthetic-secret" };
  const invalidGrant = fixture({ registration, refreshStore, refreshImpl: () => json({ error: "invalid_grant" }, 400) });
  assert.equal(await invalidGrant.connection.restore(), false);
  assert.equal(saved, null);
  assert.equal(invalidGrant.connection.status().connected, false);
  saved = { clientId: registration.clientId, subject: registration.subject, refreshToken: "synthetic-secret" };
  const changedIdentity = fixture({ registration, refreshStore, refreshTokens: tokenResponse(registration.clientId,
    "unused", { id_token: idToken(registration.clientId, "unused", { sub: "other-account" }) }) });
  assert.equal(await changedIdentity.connection.restore(), false);
  assert.equal(saved, null);
  assert.equal(changedIdentity.connection.status().connected, false);
});

test("late account A restore cannot erase account B after Disconnect and sign-in", async () => {
  const accountA = { clientId: "oaiapp_account_a", subject: "account-1",
    email: "first@example.com", label: "first@example.com" };
  let saved = { clientId: accountA.clientId, subject: accountA.subject, refreshToken: "refresh-a" };
  const clears = [];
  const refreshStore = {
    async read() { return saved; },
    async write(value) { saved = { ...value }; },
    async clear() { clears.push(saved?.subject ?? null); saved = null; },
  };
  let releaseRead;
  let markReadStarted;
  const readStarted = new Promise((resolve) => { markReadStarted = resolve; });
  const oldRead = new Promise((resolve) => { releaseRead = resolve; });
  let firstRead = true;
  const f = fixture({ registration: accountA, refreshStore, readImpl: async (registration) => {
    if (firstRead) { firstRead = false; markReadStarted(); return oldRead; }
    return registration;
  } });
  const restoring = f.connection.restore();
  await readStarted;
  await f.connection.disconnect();
  const next = await f.start();
  assert.equal(next.searchParams.get("client_id"), "dynamic_agent_client");
  f.setTokens(tokenResponse("oaiapp_account_b", next.searchParams.get("nonce"), {
    id_token: idToken("oaiapp_account_b", next.searchParams.get("nonce"),
      { sub: "account-2", email: "second@example.com" }) }));
  await f.complete(next, { clientId: "oaiapp_account_b" });
  releaseRead(accountA);
  assert.equal(await restoring, false);
  assert.equal(f.registration().subject, "account-2");
  assert.equal(saved.subject, "account-2");
  assert.equal(saved.clientId, "oaiapp_account_b");
  assert.deepEqual(clears, ["account-1"]);
  assert.equal(f.connection.status().connected, true);
});

test("protected-store write failure leaves a validated sign-in in RAM only", async () => {
  let clears = 0;
  const refreshStore = { async read() { return null; }, async write() { throw new Error("private storage detail"); },
    async clear() { clears += 1; } };
  const f = fixture({ refreshStore });
  const auth = await f.start(); await f.complete(auth);
  assert.equal(f.connection.status().connected, true);
  assert.equal(await f.connection.getAccessToken(), "access-synthetic");
  assert.equal(clears, 1);
  await f.connection.disconnect();
  assert.equal(clears, 2);
});

test("a new account grant without refresh permission clears an older protected grant", async () => {
  let saved = { clientId: "oaiapp_synthetic", subject: "account-1", refreshToken: "older-synthetic-token" };
  const refreshStore = { async read() { return saved; }, async write(value) { saved = { ...value }; },
    async clear() { saved = null; } };
  const f = fixture({ refreshStore });
  const auth = await f.start();
  f.setTokens(tokenResponse("oaiapp_synthetic", auth.searchParams.get("nonce"), {
    scope: "openid profile email", refresh_token: undefined }));
  assert.equal((await f.complete(auth)).planEnabled, false);
  assert.equal(saved, null);
});

test("ordinary token refresh replaces the protected rotating token before returning access", async () => {
  let saved = null;
  const refreshStore = { async read() { return saved; }, async write(value) { saved = { ...value }; },
    async clear() { saved = null; } };
  const f = fixture({ refreshStore });
  const auth = await f.start(); await f.complete(auth);
  assert.equal(saved.refreshToken, "refresh-synthetic");
  f.setClock(NOW + 3_550_000);
  assert.equal(await f.connection.getAccessToken(), "access-refreshed");
  assert.equal(saved.refreshToken, "refresh-rotated");
  assert.equal(JSON.stringify(f.connection.status()).includes("refresh-rotated"), false);
});

test("disconnect clears and attempts revocation even after a transient restore failure", async () => {
  let saved = { clientId: "oaiapp_synthetic", subject: "account-1", refreshToken: "saved-synthetic" };
  const refreshStore = { async read() { return saved; }, async write() { assert.fail("No write expected"); },
    async clear() { saved = null; } };
  const registration = { clientId: "oaiapp_synthetic", subject: "account-1",
    email: "synthetic@example.com", label: "synthetic@example.com" };
  const f = fixture({ registration, refreshStore, refreshImpl: () => json({ error: "temporarily_unavailable" }, 503) });
  assert.equal(await f.connection.restore(), false);
  assert.equal(saved.refreshToken, "saved-synthetic");
  assert.deepEqual(await f.connection.disconnect(), { revocationConfirmed: true });
  assert.equal(saved, null);
  const revoke = f.calls.find(({ url }) => url === REVOKE);
  assert.equal(new URLSearchParams(revoke.request.body).get("token"), "saved-synthetic");
});
