import assert from "node:assert/strict";
import test from "node:test";
import { createLocalServiceSession, createLocalServiceSessionProxy, LocalServiceSessionProxyError, PAIRING_KEY } from "../browser/core/local-service-session.js";

const OLD = "synthetic-old-capability-for-tests-only";
const NEW = "synthetic-new-capability-for-tests-only";
const LEGACY = "localServicePairingToken";
function area(initial = {}) {
  let values = { ...initial };
  let trusted = false;
  const calls = [];
  return {
    calls,
    snapshot: () => structuredClone(values),
    async setAccessLevel(value) { assert.deepEqual(value, { accessLevel: "TRUSTED_CONTEXTS" }); trusted = true; calls.push("restrict"); },
    async get(key) { assert.equal(trusted, true); calls.push(`get:${key}`); return { [key]: values[key] }; },
    async set(input) { assert.equal(trusted, true); calls.push("set"); values = { ...values, ...input }; },
    async remove(key) { assert.equal(trusted, true); calls.push(`remove:${key}`); delete values[key]; },
  };
}

test("durable pairing survives owner reconstruction, discards legacy without promotion and preserves preferences", async () => {
  const local = area({ preference: "keep" });
  const ephemeral = area({ [LEGACY]: OLD });
  const first = createLocalServiceSession({ storageLocal: local, storageSession: ephemeral });
  assert.equal(await first.getToken(), null);
  assert.deepEqual(ephemeral.snapshot(), {});
  await first.setToken(NEW);
  assert.deepEqual(local.snapshot(), { preference: "keep", [PAIRING_KEY]: { version: 1, token: NEW } });
  const restarted = createLocalServiceSession({ storageLocal: local, storageSession: ephemeral });
  assert.equal(await restarted.getToken(), NEW);
  await restarted.clear();
  assert.deepEqual(local.snapshot(), { preference: "keep" });
});

test("stale 401 cannot remove a newer credential", async () => {
  const local = area(); const session = createLocalServiceSession({ storageLocal: local, storageSession: area() });
  await session.setToken(OLD);
  await session.setToken(NEW);
  assert.equal(await session.clearIfCurrent(OLD), false);
  assert.equal(await session.getToken(), NEW);
  assert.equal(await session.clearIfCurrent(NEW), true);
  assert.equal(await session.getToken(), null);
});

test("malformed record is removed and invalid input never persists", async () => {
  const local = area({ [PAIRING_KEY]: { version: 2, token: OLD } });
  const session = createLocalServiceSession({ storageLocal: local, storageSession: area() });
  assert.equal(await session.getToken(), null);
  await assert.rejects(session.setToken("short"), { message: "Local service pairing unavailable" });
  assert.deepEqual(local.snapshot(), {});
});

test("storage failure is generic and transient failure preserves durable key", async () => {
  const local = area({ [PAIRING_KEY]: { version: 1, token: OLD } });
  const session = createLocalServiceSession({ storageLocal: local, storageSession: area() });
  const get = local.get;
  local.get = async () => { throw new Error(OLD); };
  await assert.rejects(session.getToken(), { message: "Local service pairing unavailable" });
  assert.deepEqual(local.snapshot(), { [PAIRING_KEY]: { version: 1, token: OLD } });
  local.get = get;
  assert.equal(await session.getToken(), OLD);
});

test("trusted popup proxy has fixed actions and safe, classified failures", async () => {
  const calls = [];
  const proxy = createLocalServiceSessionProxy({ sendMessage: async (message) => {
    calls.push(message); return { ok: true, value: message.type === "get" ? OLD : null };
  } });
  assert.equal(await proxy.getToken(), OLD);
  await proxy.setToken(NEW);
  assert.deepEqual(calls, [
    { target: "local-pairing", type: "get" },
    { target: "local-pairing", type: "set", value: NEW },
  ]);
  for (const sendMessage of [async () => ({ ok: false, error: NEW }),
    async () => ({ ok: true }), async () => ({ ok: true, value: "not-a-token" }),
    async () => { throw new Error(NEW); }]) {
    await assert.rejects(createLocalServiceSessionProxy({ sendMessage }).getToken(), (error) =>
      error instanceof LocalServiceSessionProxyError && error.code === "extension-connection-unavailable" &&
      error.message === "Extension state unavailable" && !error.message.includes(NEW));
  }
});
