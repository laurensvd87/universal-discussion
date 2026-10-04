import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryDemoService } from "../../../apps/local-service/src/application/create-demo-service.js";
import { createRequestHandler } from "../../../apps/local-service/src/http/request-handler.js";
import { createLocalDiscussionController } from "../browser/core/local-discussion-controller.js";
import { createLocalServiceClient } from "../browser/core/local-service-client.js";
import { createLocalServiceSession, PAIRING_KEY } from "../browser/core/local-service-session.js";
import { projectDiscussionShell } from "../browser/chromium/popup-shell.js";
import { EN } from "../browser/locales/en.js";
import { lookupIndicatorFixtureByNormalizedUrl } from "../browser/fixtures/indicator-fixtures.js";

const TOKEN = "A".repeat(43);
const ORIGIN = "chrome-extension://synthetic-reconnect-test";
const HOST = "127.0.0.1:4174";

function storageArea() {
  const values = {};
  return {
    snapshot: () => structuredClone(values),
    async setAccessLevel({ accessLevel }) { assert.equal(accessLevel, "TRUSTED_CONTEXTS"); },
    async get(key) { return { [key]: values[key] }; },
    async set(input) { Object.assign(values, input); },
    async remove(key) { delete values[key]; },
  };
}

test("stored pairing reconnects after a service outage and popup reopen", async () => {
  const local = storageArea();
  const ephemeral = storageArea();
  const session = createLocalServiceSession({ storageLocal: local, storageSession: ephemeral });
  await session.setToken(TOKEN);
  const service = createMemoryDemoService({ nextId: (type) => `${type}-synthetic`, now: () => "2026-10-04T00:00:00.000Z" });
  const start = () => createRequestHandler({ service, config: { hostHeader: HOST, origin: ORIGIN, capability: TOKEN } });
  let handle = start();
  let requests = 0;
  let unauthorizedClears = 0;
  const client = createLocalServiceClient({
    getToken: () => session.getToken(),
    onUnauthorized: async (used) => { unauthorizedClears++; await session.clearIfCurrent(used); },
    fetchImpl: async (url, options) => {
      requests++;
      if (!handle) throw new Error("synthetic service stopped");
      const result = await handle({ url: new URL(url).pathname, method: options.method,
        headers: { host: HOST, origin: ORIGIN, ...options.headers }, body: options.body ?? null });
      return new Response(result.body, { status: result.status, headers: result.headers });
    },
  });
  const openPopup = async () => {
    // Each controller is a fresh popup; the session and storage outlive it.
    const controller = createLocalDiscussionController({ client, session,
      readActiveTab: async () => ({ tabId: 7, url: "https://example.com/" }),
      observeTabLifecycle: () => () => {}, lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl });
    await controller.open();
    return controller;
  };

  const first = await openPopup();
  assert.equal(first.currentState().phase, "ready");
  assert.equal(projectDiscussionShell(first.currentState()).connectionText, EN.uiConnected);
  first.dispose();

  handle = null;
  const offline = await openPopup();
  assert.equal(offline.currentState().phase, "error");
  assert.equal(projectDiscussionShell(offline.currentState()).connectionText, EN.uiServiceUnavailable);
  assert.deepEqual(local.snapshot(), { [PAIRING_KEY]: { version: 1, token: TOKEN } });
  offline.dispose();

  handle = start(); // A fresh service handler with the same synthetic persisted pairing.
  const reopened = await openPopup();
  assert.equal(reopened.currentState().phase, "ready");
  assert.equal(reopened.currentState().topicId, "reserved-domain-demo");
  assert.equal(projectDiscussionShell(reopened.currentState()).connectionText, EN.uiConnected);
  assert.deepEqual(local.snapshot(), { [PAIRING_KEY]: { version: 1, token: TOKEN } });
  assert.equal(unauthorizedClears, 0);
  assert.ok(requests >= 6);
  reopened.dispose();
});
