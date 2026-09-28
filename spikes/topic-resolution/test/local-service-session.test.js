import assert from "node:assert/strict";
import test from "node:test";
import { createLocalServiceSession } from "../browser/core/local-service-session.js";

const TOKEN = "synthetic-session-capability-for-tests-only";
const KEY = "localServicePairingToken";
function fakeSession() {
  let values = {};
  let trusted = false;
  const calls = [];
  return {
    calls,
    snapshot() { return { ...values }; },
    async setAccessLevel(input) { calls.push("restrict"); assert.deepEqual(input, { accessLevel: "TRUSTED_CONTEXTS" }); trusted = true; },
    async get(key) { calls.push("read"); assert.equal(trusted, true); assert.equal(key, KEY); trusted = false; return { ...values }; },
    async set(input) { calls.push("write"); assert.equal(trusted, true); trusted = false; assert.deepEqual(Object.keys(input), [KEY]); values = { ...input }; },
    async remove(key) { calls.push("clear"); assert.equal(key, KEY); values = {}; },
  };
}

test("pairing uses only injected session storage and always restricts trusted contexts first", async () => {
  const storage = fakeSession();
  const pairing = createLocalServiceSession({ storageSession: storage });
  assert.equal(await pairing.isPaired(), false);
  await pairing.setToken(TOKEN);
  assert.equal(await pairing.isPaired(), true);
  assert.equal(await pairing.getToken(), TOKEN);
  await pairing.clear();
  assert.equal(await pairing.getToken(), null);
  assert.deepEqual(storage.snapshot(), {});
  assert.deepEqual(storage.calls, ["restrict", "read", "restrict", "write", "restrict", "read", "restrict", "read", "restrict", "clear", "restrict", "read"]);
  assert.equal(Object.isFrozen(pairing), true);
  assert.deepEqual(Object.keys(pairing), ["getToken", "isPaired", "setToken", "clear"]);
});

test("serialized pairing write/read/clear prevents late write resurrection", async () => {
  const storage = fakeSession();
  let release;
  const write = storage.set.bind(storage);
  storage.set = async (input) => { await new Promise((resolve) => { release = resolve; }); return write(input); };
  const pairing = createLocalServiceSession({ storageSession: storage });
  const saved = pairing.setToken(TOKEN);
  const read = pairing.isPaired();
  const cleared = pairing.clear();
  const final = pairing.isPaired();
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(storage.calls, ["restrict"]);
  release();
  await saved;
  assert.equal(await read, true);
  await cleared;
  assert.equal(await final, false);
  assert.deepEqual(storage.snapshot(), {});
});

test("invalid/header-injection tokens never write or echo sensitive values", async () => {
  const storage = fakeSession();
  const pairing = createLocalServiceSession({ storageSession: storage });
  for (const token of [null, "short", " ".repeat(40), "x".repeat(513), `${TOKEN}\r\nX-Header: private`, `${TOKEN} secret`, `${TOKEN}☃`]) {
    await assert.rejects(pairing.setToken(token), { message: "Local service pairing unavailable" });
  }
  assert.deepEqual(storage.calls, []);
  assert.equal(await pairing.isPaired(), false);
});

test("storage denial is generic, fails closed and does not poison later clear", async () => {
  const storage = fakeSession();
  const restrict = storage.setAccessLevel.bind(storage);
  storage.setAccessLevel = async () => { throw new Error(TOKEN); };
  const pairing = createLocalServiceSession({ storageSession: storage });
  await assert.rejects(pairing.setToken(TOKEN), { message: "Local service pairing unavailable" });
  await assert.rejects(pairing.getToken(), { message: "Local service pairing unavailable" });
  assert.deepEqual(storage.calls, []);
  storage.setAccessLevel = restrict;
  await pairing.clear();
  assert.equal(await pairing.isPaired(), false);
});

test("malformed stored token is removed, restart is unpaired, storage errors stay generic", async () => {
  const storage = fakeSession();
  storage.get = async () => ({ [KEY]: "malformed" });
  const pairing = createLocalServiceSession({ storageSession: storage });
  assert.equal(await pairing.getToken(), null);
  assert.deepEqual(storage.calls, ["restrict", "clear"]);
  const restarted = createLocalServiceSession({ storageSession: fakeSession() });
  assert.equal(await restarted.isPaired(), false);
  storage.get = async () => { throw new Error(TOKEN); };
  await assert.rejects(pairing.getToken(), { message: "Local service pairing unavailable" });
});
