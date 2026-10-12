import assert from "node:assert/strict";
import test from "node:test";
import { createDiscussionService } from "../src/application/discussion-service.js";
import { createRequestHandler } from "../src/http/request-handler.js";
import { frozenClone } from "../src/domain/validation.js";
import { AccountError } from "../src/accounts/account-errors.js";

const version = { generation: "synthetic-encoding", revision: 0 };
const config = { hostHeader: "127.0.0.1:4174", origin: `chrome-extension://${"a".repeat(32)}`, capability: "synthetic-pairing" };
const actorId = "11111111-1111-4111-8111-111111111111";
const actor = name => ({ id: `account-${actorId}`, accountId: actorId, type: "human", demo: false, displayName: name });
const request = (url = "/v1/catalog", extra = {}) => ({ method: "GET", url, body: null,
  headers: { host: config.hostHeader, origin: config.origin, authorization: `Bearer ${config.capability}`, ...extra } });

for (const method of ["catalog", "catalogContext", "catalogPage"]) {
  test(`Trust: ${method} renews actor labels while sharing an immutable coalesced projection`, async () => {
    let displayName = "First_name";
    const catalog = { version, actors: [], topics: [], sources: [{ id: "source-one", title: "Immutable public Source" }] };
    const workerValue = frozenClone(method === "catalogPage" ? { version, catalog, nextCursor: null } : catalog);
    const calls = [];
    const service = createDiscussionService({ repository: { version: () => version }, ranking: { model: {} }, sources: [], topicSeeds: [],
      nextId: () => "unused", now: () => "unused", readAccountActors: () => [actor(displayName)],
      readExecutor: { async read(...args) { calls.push(args); return workerValue; } } });
    const input = method === "catalog" ? null : method === "catalogContext" ? { sourceId: null, topicId: null } : { kind: "sources", limit: 1, cursor: null };
    const first = await service.readPublic(method, input), repeated = await service.readPublic(method, input);
    assert.equal(first, repeated, "unchanged labels reuse the same immutable DTO");
    const projection = value => method === "catalogPage" ? value.catalog : value;
    assert.equal(projection(first).actors.at(-1).displayName, "First_name");
    assert.deepEqual(Object.keys(projection(first).actors.at(-1)).sort(), ["displayName", "id", "type"]);
    assert.throws(() => { projection(first).sources[0].title = "Changed"; }, TypeError);
    displayName = "Renewed_name";
    const renewed = await service.readPublic(method, input);
    assert.notEqual(renewed, first);
    assert.equal(projection(renewed).actors.at(-1).displayName, "Renewed_name");
    assert.equal(projection(first).actors.at(-1).displayName, "First_name");
    assert.equal(projection(workerValue).actors.length, 0, "worker payload remains account-free");
    assert.ok(calls.every(([, , options]) => Object.keys(options).sort().join(",") === "signal,version"));
  });
}

test("Trust: immutable public encodings coalesce while each request renews pairing authority", async t => {
  const value = frozenClone({ version, sources: [{ title: "Immutable source title" }], actors: [] });
  let encoded = 0, paired = true, reads = 0;
  const stringify = JSON.stringify;
  t.mock.method(JSON, "stringify", (input, ...rest) => { if (input === value) encoded++; return stringify(input, ...rest); });
  const handle = createRequestHandler({ config, pairingVerifier: { verify: () => paired },
    service: { async readPublic() { reads++; return value; } } });
  const first = await handle(request()), second = await handle(request());
  assert.equal(first.status, 200); assert.equal(second.body, first.body); assert.equal(encoded, 1); assert.equal(reads, 2);
  assert.throws(() => { value.sources[0].title = "Altered cached encoding"; }, TypeError);
  paired = false;
  const revoked = await handle(request());
  assert.equal(revoked.status, 401); assert.equal(encoded, 1); assert.equal(reads, 2);
  assert.equal(revoked.body.includes("Immutable source title"), false);
});

test("Trust: provider, account and private DTOs never use public encoding reuse", async t => {
  const value = frozenClone({ synthetic: "nonpublic-value" });
  let encodings = 0;
  const stringify = JSON.stringify;
  t.mock.method(JSON, "stringify", (input, ...rest) => { if (input === value) encodings++; return stringify(input, ...rest); });
  const accounts = { me: () => value, resolvePrincipal: () => actor("First_name") };
  const handle = createRequestHandler({ config, service: {}, ai: { status: () => value }, accounts, accountWrites: true,
    privateDiscussions: { read: () => value } });
  for (const url of ["/v1/ai/status", "/v1/account/me"]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await handle(request(url, { "x-account-session": "s".repeat(43) }));
      assert.equal(result.status, 200);
    }
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await handle({ ...request("/v1/private/read", { "x-account-session": "s".repeat(43), "content-type": "application/json" }),
      method: "POST", body: "{}" });
    assert.equal(result.status, 200);
  }
  assert.equal(encodings, 6);
});

test("Trust: oversized frozen public DTO cannot escape the response byte bound", async () => {
  const value = frozenClone({ text: "x".repeat(1_048_577) });
  const handle = createRequestHandler({ config, service: { readPublic: async () => value } });
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await handle(request());
    assert.equal(result.status, 500); assert.equal(result.body, '{"error":"internal"}');
  }
});

test("Trust: optional app session revoked during public read cannot deliver or encode its DTO", async () => {
  const value = frozenClone({ version, sources: [{ title: "Do not deliver after session revocation" }] });
  let release, signedIn = true;
  const handle = createRequestHandler({ config, accountWrites: true,
    accounts: { me() { if (!signedIn) throw new AccountError("authentication-required"); return actor("First_name"); } },
    service: { readPublic() { return new Promise(resolve => { release = () => resolve(value); }); } } });
  const pending = handle(request("/v1/catalog", { "x-account-session": "s".repeat(43) }));
  signedIn = false; release();
  const result = await pending;
  assert.equal(result.status, 401);
  assert.equal(result.body.includes("Do not deliver"), false);
});

test("Trust: canonical mutation after service delivery but before encoding rejects the old DTO", async () => {
  let current = { ...version }, release;
  const workerResult = new Promise(resolve => { release = resolve; });
  const value = frozenClone({ version, roots: [{ body: "Superseded public body" }] });
  const service = createDiscussionService({ repository: { version: () => current }, ranking: { model: {} }, sources: [], topicSeeds: [],
    nextId: () => "unused", now: () => "unused", readExecutor: { read: () => workerResult } });
  const handle = createRequestHandler({ config, service });
  const pending = handle(request("/v1/topics/topic-one/discussion"));
  // Place the canonical mutation between the service's Promise continuation and
  // the HTTP encoding continuation, after the service's own version check.
  workerResult.then(() => queueMicrotask(() => { current = { ...version, revision: 1 }; }));
  release(value);
  const result = await pending;
  assert.equal(result.status, 409); assert.equal(result.body.includes("Superseded public body"), false);
});
