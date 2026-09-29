import assert from "node:assert/strict";
import test from "node:test";
import { createCaptureSession, CAPTURE_SESSION_KEY as KEY, BLOCKED_ORIGINS_KEY as BLOCKED } from "../browser/core/capture-session.js";

const origin = "https://example.com";
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { resolve, promise }; };
const tick = () => new Promise((done) => setImmediate(done));
function fixture({ saved, blocked = [], validOrigin = (value) => value === origin } = {}) {
  let sequence = 0;
  const state = { saved, blocked, window: { id: 1, type: "normal", incognito: false }, foreground: { windowId: 1 },
    permitted: true, gate: null, localGate: null, restoreGate: null, fail: null, fences: 0, writes: [] };
  const area = (name) => ({
    setAccessLevel: async ({ accessLevel }) => { assert.equal(accessLevel, "TRUSTED_CONTEXTS"); if (state.fail === "access") throw Error("denied"); },
    get: async (key) => ({ [key]: structuredClone(name === "session" ? state.saved : state.blocked) }),
    set: async (value) => {
      state.writes.push(value);
      if (state.gate) await state.gate.promise;
      if (name === "local" && state.localGate) await state.localGate.promise;
      if (name === "session" && value[KEY]?.windowId !== null && state.restoreGate) await state.restoreGate.promise;
      if (state.fail === name) throw Error("unavailable");
      if (name === "session") state.saved = structuredClone(value[KEY]); else state.blocked = structuredClone(value[BLOCKED]);
    },
    remove: async (key) => { assert.equal(key, KEY); state.saved = undefined; },
  });
  const dependencies = { storageSession: area("session"), storageLocal: area("local"),
    getWindow: async (id) => state.window?.id === id ? state.window : null,
    hasAccess: async () => state.permitted, readForeground: async () => state.foreground,
    validOrigin, nonce: () => `synthetic-revision-${String(++sequence).padStart(6, "0")}`,
    onInvalidate: () => { state.fences++; } };
  const session = createCaptureSession(dependencies);
  const start = async () => session.start(1, (await session.snapshot()).sessionRevision);
  return { session, state, start, reconstruct: () => createCaptureSession(dependencies) };
}

test("native wildcard access without a lease stays off and status revision stays stable", async () => {
  const h = fixture(); const before = await h.session.snapshot();
  assert.equal(before.enabled, false); assert.equal(before.sessionWindowId, null);
  assert.equal((await h.session.snapshot()).sessionRevision, before.sessionRevision);
  await h.start(); assert.equal((await h.session.snapshot()).enabled, true);
  assert.deepEqual(Object.keys(h.state.saved).sort(), ["revision", "schema", "windowId"]);
});
test("Stop rejects a grant completed with the previous status ticket even while inactive", async () => {
  const h = fixture(); const before = await h.session.snapshot();
  await h.session.stop();
  await assert.rejects(h.session.start(1, before.sessionRevision), /changed/u);
  assert.equal((await h.session.snapshot()).enabled, false);
});
test("Start requires the exact live foreground normal window and native broad grant", async () => {
  for (const change of ["focus", "closed", "incognito", "popup", "permission"]) {
    const h = fixture(); await h.session.snapshot();
    if (change === "focus") h.state.foreground.windowId = 2;
    if (change === "closed") h.state.window = null;
    if (change === "incognito") h.state.window.incognito = true;
    if (change === "popup") h.state.window.type = "popup";
    if (change === "permission") h.state.permitted = false;
    await assert.rejects(h.start()); assert.equal((await h.session.snapshot()).enabled, false);
  }
});
test("worker reconstruction retains a valid lease, while restart/reload empty storage stays off", async () => {
  const h = fixture(); await h.start();
  assert.equal((await h.reconstruct().snapshot()).sessionWindowId, 1);
  h.state.saved = undefined;
  assert.equal((await h.reconstruct().snapshot()).enabled, false);
});
test("different foreground windows pause use without rebinding the retained lease", async () => {
  const h = fixture(); await h.start(); h.state.foreground.windowId = 2;
  assert.equal((await h.session.snapshot()).sessionWindowId, 1);
  assert.equal((await h.reconstruct().snapshot()).sessionWindowId, 1);
});
test("window-close event beats delayed window validation during worker reconstruction", async () => {
  const h = fixture(); await h.start();
  const gate = deferred(); const oldWindow = structuredClone(h.state.window);
  // Reconstruction sees the persisted lease but its original window lookup is
  // delayed until after the removal event; the returned observation is stale.
  const storageSession = { setAccessLevel: async () => {}, get: async () => ({ [KEY]: h.state.saved }),
    set: async (value) => { h.state.saved = value[KEY]; }, remove: async () => { h.state.saved = undefined; } };
  const reconstructed = createCaptureSession({ storageSession,
    storageLocal: { setAccessLevel: async () => {}, get: async () => ({ [BLOCKED]: [] }), set: async () => {} },
    getWindow: () => gate.promise, hasAccess: async () => true, readForeground: async () => ({ windowId: 1 }),
    validOrigin: () => true });
  await tick(); await reconstructed.closeWindow(1); gate.resolve(oldWindow);
  assert.equal((await reconstructed.snapshot()).enabled, false);
  assert.equal(h.state.saved.windowId, null);
});
test("Stop and bound-window closure beat an in-flight Start session write", async () => {
  for (const control of ["stop", "close"]) {
    const h = fixture(); const before = await h.session.snapshot(); h.state.gate = deferred();
    const starting = h.session.start(1, before.sessionRevision); const rejected = assert.rejects(starting);
    await tick();
    const ending = control === "stop" ? h.session.stop() : h.session.closeWindow(1);
    assert.equal((await h.session.snapshot()).enabled, false);
    h.state.gate.resolve(); h.state.gate = null;
    await ending; await rejected;
    assert.equal(h.state.saved.windowId, null); assert.equal((await h.reconstruct().snapshot()).enabled, false);
  }
});
test("closed bound window never authorizes a new window and revocation ends the lease", async () => {
  const h = fixture(); await h.start(); h.state.window = { id: 2, type: "normal" };
  await h.session.closeWindow(1); assert.equal((await h.session.snapshot()).enabled, false);
  h.state.foreground.windowId = 2;
  await h.session.start(2, (await h.session.snapshot()).sessionRevision); h.state.permitted = false;
  assert.equal((await h.session.snapshot()).enabled, false); assert.equal(h.state.saved.windowId, null);
});
test("blocking is immediate while serialized writes wait; unblock changes only local consent", async () => {
  const h = fixture(); await h.start(); h.state.gate = deferred();
  const blocking = h.session.setBlocked(origin, true);
  await tick(); assert.deepEqual((await h.session.snapshot()).blockedOrigins, [origin]);
  h.state.gate.resolve(); h.state.gate = null; await blocking;
  assert.deepEqual(h.state.blocked, [origin]);
  await h.session.stop(); await h.session.setBlocked(origin, false);
  assert.equal((await h.session.snapshot()).enabled, false); assert.equal(h.state.permitted, true);
});
test("invalid lease, blocked list and trusted storage failure stay off", async () => {
  for (const settings of [{ saved: { enabled: true } }, { blocked: ["https://private.invalid"] }]) {
    const h = fixture(settings); assert.equal((await h.session.snapshot()).enabled, false); await assert.rejects(h.start());
  }
  const h = fixture(); h.state.fail = "access";
  assert.equal((await h.session.snapshot()).enabled, false); await assert.rejects(h.start());
});
test("partial local write failure clears restorable session authority", async () => {
  const h = fixture(); await h.start(); h.state.fail = "local";
  await assert.rejects(h.session.setBlocked(origin, true)); await tick();
  assert.equal((await h.session.snapshot()).enabled, false); assert.equal(h.state.saved, undefined);
  assert.equal((await h.reconstruct().snapshot()).enabled, false);
});

test("block overflow preserves 100 saved sites, ends capture and reconstructs off", async () => {
  const blocked = Array.from({ length: 100 }, (_, index) => `https://site${index}.example.com`);
  const h = fixture({ blocked, validOrigin: (value) => /^https:\/\/site\d+\.example\.com$/u.test(value) });
  await h.start(); h.state.gate = deferred();
  const overflow = h.session.setBlocked("https://site100.example.com", true);
  const rejected = assert.rejects(overflow, /capacity/u);
  await tick();
  const pending = await h.session.snapshot();
  assert.equal(pending.enabled, false); assert.deepEqual(pending.blockedOrigins, blocked);
  h.state.gate.resolve(); h.state.gate = null; await rejected;
  assert.equal(h.state.saved.windowId, null); assert.deepEqual(h.state.blocked, blocked);
  assert.equal((await h.reconstruct().snapshot()).enabled, false);
  await h.session.stop(); assert.deepEqual((await h.session.snapshot()).blockedOrigins, blocked);
});

test("more than 100 concurrent block reservations remain bounded and cannot restore a lease", async () => {
  const h = fixture({ validOrigin: (value) => /^https:\/\/site\d+\.example\.com$/u.test(value) });
  await h.start(); h.state.gate = deferred();
  const operations = Array.from({ length: 105 }, (_, index) => h.session.setBlocked(`https://site${index}.example.com`, true));
  const settled = Promise.allSettled(operations);
  await tick(); const pending = await h.session.snapshot();
  assert.equal(pending.enabled, false); assert.equal(pending.blockedOrigins.length, 100);
  h.state.gate.resolve(); h.state.gate = null;
  const results = await settled; assert.equal(results.filter((result) => result.status === "rejected").length, 5);
  assert.equal(h.state.saved.windowId, null); assert.equal(h.state.blocked.length, 100);
  assert.equal((await h.reconstruct().snapshot()).enabled, false);
});

test("a block before initialization discovers a full saved list without oversized status or lease restoration", async () => {
  const blocked = Array.from({ length: 100 }, (_, index) => `https://site${index}.example.com`);
  const h = fixture({ blocked, saved: { schema: "capture-session/1", revision: "saved-control-revision-0001", windowId: 1 },
    validOrigin: (value) => /^https:\/\/site\d+\.example\.com$/u.test(value) });
  const overflow = h.session.setBlocked("https://site100.example.com", true);
  const rejected = assert.rejects(overflow, /capacity/u);
  const snapshot = await h.session.snapshot();
  assert.equal(snapshot.enabled, false); assert.deepEqual(snapshot.blockedOrigins, blocked);
  await rejected;
  assert.equal(h.state.saved.windowId, null); assert.equal((await h.reconstruct().snapshot()).enabled, false);
});

test("reconstruction between inactive lease write and block commit stays off; concurrent Start is rejected", async () => {
  const h = fixture(); await h.start(); h.state.localGate = deferred();
  const blocking = h.session.setBlocked(origin, true); await tick();
  assert.equal(h.state.saved.windowId, null); assert.deepEqual(h.state.blocked, []);
  const pending = await h.session.snapshot(); assert.equal(pending.enabled, false);
  const reconstructed = await h.reconstruct().snapshot();
  assert.equal(reconstructed.enabled, false); assert.deepEqual(reconstructed.blockedOrigins, []);
  await assert.rejects(h.session.start(1, pending.sessionRevision), /changed/u);
  h.state.localGate.resolve(); h.state.localGate = null; await blocking;
  const completed = await h.session.snapshot();
  assert.equal(completed.enabled, true); assert.equal(completed.sessionWindowId, 1); assert.deepEqual(completed.blockedOrigins, [origin]);
  assert.equal((await h.reconstruct().snapshot()).enabled, true); assert.deepEqual(h.state.blocked, [origin]);
});

for (const stage of ["block-write", "restore-write"]) {
  for (const control of ["stop", "close", "revoke"]) {
    test(`${control} during ${stage} prevents configuration transaction from restoring capture`, async () => {
      const h = fixture(); await h.start(); const gate = deferred();
      if (stage === "block-write") h.state.localGate = gate; else h.state.restoreGate = gate;
      const blocking = h.session.setBlocked(origin, true); await tick();
      assert.equal((await h.session.snapshot()).enabled, false);
      if (control === "close") h.state.window = null;
      if (control === "revoke") h.state.permitted = false;
      const ending = control === "close" ? h.session.closeWindow(1) : h.session.stop();
      gate.resolve(); h.state.localGate = null; h.state.restoreGate = null;
      await blocking; await ending;
      assert.equal((await h.session.snapshot()).enabled, false); assert.equal(h.state.saved.windowId, null);
      h.state.permitted = true; h.state.window = { id: 1, type: "normal", incognito: false };
      const reconstructed = await h.reconstruct().snapshot(); assert.equal(reconstructed.enabled, false);
      assert.deepEqual(reconstructed.blockedOrigins, [origin]);
    });
  }
}

test("native access lost without an event during restore write leaves persisted capture off", async () => {
  const h = fixture(); await h.start(); h.state.restoreGate = deferred();
  const blocking = h.session.setBlocked(origin, true); await tick();
  h.state.permitted = false; h.state.restoreGate.resolve(); h.state.restoreGate = null;
  await blocking;
  assert.equal(h.state.saved.windowId, null); assert.equal((await h.session.snapshot()).enabled, false);
  h.state.permitted = true; assert.equal((await h.reconstruct().snapshot()).enabled, false);
});
