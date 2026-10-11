import assert from "node:assert/strict";
import test from "node:test";
import { createAccountSessionStorage, ACCOUNT_SESSION_KEY } from "../browser/core/account-session-storage.js";
import { createLocalServiceClient } from "../browser/core/local-service-client.js";
import { createLocalAiClient } from "../browser/core/local-ai-client.js";
import { readActorId } from "../browser/core/local-service-contract.js";

const actorId = "account-12345678-1234-4123-8123-123456789abc";
const session = { accessToken: "a".repeat(43), refreshToken: "b".repeat(43), accessExpiresAt: 90000, refreshExpiresAt: 990000 };
const pairing = "p".repeat(43);
function storageFixture(extra = {}) {
  let values = {}, token = pairing; const calls = [];
  const storageSession = { get: async () => structuredClone(values), set: async value => { values = { ...values, ...value }; },
    remove: async key => { delete values[key]; }, setAccessLevel: async value => { calls.push(value); }, ...extra };
  const storage = createAccountSessionStorage({ storageSession, getPairingToken: async () => token, withLock: work => work() });
  return { storage, values: () => values, calls, pair: value => { token = value; } };
}
test("app renewal credentials use trusted Chrome session RAM and bind exact pairing", async () => {
  const f = storageFixture(); await f.storage.save(session); assert.deepEqual(await f.storage.load(), session);
  assert.deepEqual(f.values()[ACCOUNT_SESSION_KEY], { version: 1, pairingToken: pairing, session });
  assert.equal(f.calls.every(value => value.accessLevel === "TRUSTED_CONTEXTS"), true);
  f.pair("q".repeat(43)); assert.equal(await f.storage.load(), null); assert.deepEqual(f.values(), {});
});
test("storage rejects malformed credentials and clears absent service pairing", async () => {
  const f = storageFixture(); await assert.rejects(f.storage.save({ ...session, accessToken: "unsafe" }));
  await f.storage.save(session); f.pair(null); assert.equal(await f.storage.load(), null);
  assert.deepEqual(f.values(), {});
});
test("pairing change during a session write removes its result", async () => {
  let f; f = storageFixture({ set: async () => { f.pair("q".repeat(43)); } });
  await assert.rejects(f.storage.save(session)); assert.deepEqual(f.values(), {});
});
test("account actors accept exact generated identifiers only", () => {
  assert.equal(readActorId(actorId), actorId); assert.equal(readActorId("demo-alex"), "demo-alex");
  for (const invalid of ["account-reader", actorId.toUpperCase(), actorId.replace("-4123", "-1123"), "demo-caller"]) assert.throws(() => readActorId(invalid));
});
for (const kind of ["service", "ai"]) {
  test(`${kind} sends only account session header and preserves pairing on auth failure`, async () => {
    const calls = []; let revoked = 0, pairingCleared = 0;
    const config = { getToken: async () => pairing, getAccountToken: id => { assert.equal(id, actorId); return session.accessToken; },
      onUnauthorized: () => { pairingCleared++; }, onAccountUnauthorized: token => { assert.equal(token, session.accessToken); revoked++; },
      fetchImpl: async (url, options) => { calls.push(options); return new Response('{"error":"authentication-required"}',
        { status: 401, headers: { "Content-Type": "application/json" } }); } };
    const client = kind === "service" ? createLocalServiceClient(config) : createLocalAiClient(config);
    const request = kind === "service" ? client.command({ generation: "generation", revision: 0 },
      { type: "create-topic", title: "Fixture", kind: "general" }, actorId) : client.resumable(actorId);
    await assert.rejects(request, error => error.code === "authentication-required");
    assert.equal(calls[0].headers["X-Account-Session"], session.accessToken);
    assert.equal(calls[0].headers["X-Demo-Actor"], undefined); assert.equal(calls[0].headers.Authorization, `Bearer ${pairing}`);
    assert.equal(revoked, 1); assert.equal(pairingCleared, 0);
  });
  test(`${kind} rejects missing app credential before transport and never substitutes demo`, async () => {
    let fetched = 0;
    const config = { getToken: async () => pairing, getAccountToken: () => null, fetchImpl: async () => { fetched++; } };
    const client = kind === "service" ? createLocalServiceClient(config) : createLocalAiClient(config);
    const request = kind === "service" ? client.command({ generation: "generation", revision: 0 },
      { type: "create-topic", title: "Fixture", kind: "general" }, actorId) : client.resumable(actorId);
    await assert.rejects(request, error => error.code === "authentication-required"); assert.equal(fetched, 0);
  });
}
test("catalog retains guest-readable paired reads without account credentials", async () => {
  let headers;
  const client = createLocalServiceClient({ getToken: async () => pairing, getAccountToken: () => { throw new Error("Unexpected app credential request"); },
    fetchImpl: async (_, options) => { headers = options.headers; return new Response('{}', { headers: { "Content-Type": "application/json" } }); } });
  await assert.rejects(client.catalog(), error => error.code === "invalid-response");
  assert.equal(headers["X-Account-Session"], undefined); assert.equal(headers["X-Demo-Actor"], undefined);
});
test("account-owned resumable read uses exact POST empty body while legacy demo reads retain GET", async () => {
  const calls = [];
  const client = createLocalAiClient({ getToken: () => pairing, getAccountToken: () => session.accessToken,
    fetchImpl: async (_, options) => { calls.push(options); return new Response('{"job":null}', { headers: { "Content-Type": "application/json" } }); } });
  assert.equal(await client.resumable(actorId), null); assert.equal(calls[0].method, "POST"); assert.equal(calls[0].body, "{}");
  assert.equal(calls[0].headers["X-Account-Session"], session.accessToken); assert.equal(calls[0].headers["X-Demo-Actor"], undefined);
  assert.equal(await client.resumable("demo-alex"), null); assert.equal(calls[1].method, "GET"); assert.equal(calls[1].body, undefined);
});
