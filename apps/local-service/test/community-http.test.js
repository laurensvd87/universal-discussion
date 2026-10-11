import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDormantLocalApplication } from "../src/startup.js";
import { deterministicDependencies } from "./helpers.js";

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "udl-community-http-"));
  const origin = `chrome-extension://${"b".repeat(32)}`;
  let identity = { issuer: "https://auth.openai.com", clientId: "fixture", subject: "alice" };
  const app = openDormantLocalApplication({ config: { host: "127.0.0.1", port: 4174, origin, capability: "fixture-community-pairing-token-long-enough" },
    databasePath: join(directory, "canonical.sqlite"), ...deterministicDependencies(), accountsEnabled: true,
    accountHmacKey: Buffer.alloc(32, 18), ai: { accountIdentity: () => identity, cancelAccount() {}, dispose() {} } });
  t.after(() => { app.close(); rmSync(directory, { recursive: true, force: true }); });
  const request = async (path, body, token, extra = {}) => {
    const response = await app.handle({ method: "POST", url: path,
      headers: { host: "127.0.0.1:4174", origin, authorization: "Bearer fixture-community-pairing-token-long-enough", "content-type": "application/json",
        ...(token ? { "x-account-session": token } : {}), ...extra }, body: JSON.stringify(body) });
    return { status: response.status, value: JSON.parse(response.body) };
  };
  const login = async (subject, username) => {
    identity = { ...identity, subject };
    const signed = await request("/v1/account/chatgpt", {}); assert.equal(signed.status, 200);
    const named = await request("/v1/account/username", { username }, signed.value.session.accessToken); assert.equal(named.status, 200);
    return signed.value.session.accessToken;
  };
  return { request, login, origin };
}
test("normal application composes private isolation, guest discovery, own export and deletion", async t => {
  const f = fixture(t), alice = await f.login("alice", "Alice");
  const created = await f.request("/v1/private/create", { operationId: "private-first", body: "Private orchid secret",
    sourceId: "reserved-example-com", sourceUrl: "https://example.com/" }, alice);
  assert.equal(created.status, 200); const conversationId = created.value.conversationId;
  assert.equal((await f.request("/v1/private/read", { conversationId, after: null, limit: 25 }, alice)).value.messages[0].body, "Private orchid secret");
  const bob = await f.login("bob", "Bob");
  const denied = await f.request("/v1/private/read", { conversationId, after: null, limit: 25 }, bob);
  assert.equal(denied.status, 404);
  assert.equal((await f.request("/v1/private/list", { after: null, limit: 25 }, bob)).value.conversations.length, 0);
  for (const token of [alice, bob, undefined]) {
    const found = await f.request("/v1/discover/search", { query: "orchid", limit: 20, cursor: null }, token);
    assert.equal(found.status, 200); assert.deepEqual(found.value.results, []);
  }
  const exported = await f.request("/v1/account/private-data", { after: null, expectedVersion: null }, alice);
  assert.equal(exported.status, 200); assert.equal(exported.value.messages[0].body, "Private orchid secret");
  assert.equal(exported.value.messages[0].conversationId, conversationId);
  assert.equal((await f.request("/v1/account/delete", { confirmation: "DELETE MY ACCOUNT" }, alice)).status, 200);
  assert.notEqual((await f.request("/v1/private/read", { conversationId, after: null, limit: 25 }, alice)).status, 200);
  assert.equal((await f.request("/v1/private/list", { after: null, limit: 25 }, bob)).status, 200);
});
test("private routes require exact Origin, pairing, named session and exact action input", async t => {
  const f = fixture(t), token = await f.login("alice", "Alice");
  const body = { after: null, limit: 25 };
  for (const headers of [{ origin: "https://attacker.invalid" }, { origin: "" }, { authorization: "Bearer wrong" }, { "x-demo-actor": "demo-alex" }])
    assert.notEqual((await f.request("/v1/private/list", body, token, headers)).status, 200);
  assert.notEqual((await f.request("/v1/private/list", body)).status, 200);
  assert.notEqual((await f.request("/v1/private/list", { ...body, ownerId: "other" }, token)).status, 200);
  assert.equal((await f.request("/v1/private/not-an-action", {}, token)).status, 404);
  assert.equal((await f.request("/v1/discover/search", { query: "", limit: 20, cursor: null })).status, 200);
});
