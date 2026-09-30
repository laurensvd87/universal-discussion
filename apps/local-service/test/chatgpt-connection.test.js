import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { createChatGPTConnection } from "../src/ai/chatgpt-connection.js";

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
function idToken(clientId, nonce, changes = {}) {
  const header = enc({ alg: "RS256", typ: "JWT", kid: "synthetic-key" });
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
    if (url === JWKS) return json(options.jwks ?? { keys: [publicJwk] });
    if (url === TOKEN) {
      const form = new URLSearchParams(request.body);
      if (form.get("grant_type") === "refresh_token" && options.refreshImpl) return options.refreshImpl(request);
      if (form.get("grant_type") === "refresh_token") return json(options.refreshTokens ?? {
        ...tokenResponse(form.get("client_id"), "unused"), access_token: "access-refreshed", refresh_token: "refresh-rotated" });
      return json(tokens ?? tokenResponse(form.get("client_id"), options.nonce));
    }
    if (url === REVOKE) return revocationResponse;
    assert.fail(`Unexpected endpoint: ${url}`);
  };
  const connection = createChatGPTConnection({ hostId: "urn:uuid:synthetic-host", agentName: "Universal Discussion",
    readRegistration: async () => registration,
    writeRegistration: async (value) => { writes.push(value); registration = value; },
    fetchImpl, now: () => clock,
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
    setTokens: (value) => { tokens = value; }, setRevocation: (value) => { revocationResponse = value; } };
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

test("missing plan scope, hostile discovery and oversized responses fail closed", async () => {
  const f = fixture(); const auth = await f.start();
  f.setTokens(tokenResponse("oaiapp_synthetic", auth.searchParams.get("nonce"), { scope: "openid profile email" }));
  await assert.rejects(f.complete(auth));
  assert.equal(f.connection.status().connected, false);
  const g = fixture({ discovery: { issuer: ISSUER, authorization_endpoint: `${ISSUER}/api/accounts/authorize`,
    token_endpoint: TOKEN, jwks_uri: "https://attacker.example/keys", revocation_endpoint: REVOKE } });
  const second = await g.start(); await assert.rejects(g.complete(second));
  assert.deepEqual(g.writes, []);
  const h = fixture(); const third = await h.start();
  h.setTokens(tokenResponse("oaiapp_synthetic", third.searchParams.get("nonce"), { extra: "x".repeat(70_000) }));
  await assert.rejects(h.complete(third));
  assert.deepEqual(h.writes, []);
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
