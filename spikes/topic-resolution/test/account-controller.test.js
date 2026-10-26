import assert from "node:assert/strict";
import test from "node:test";
import { createAccountController } from "../browser/core/account-controller.js";

const account = { id: "synthetic-user", username: "reader", state: "active", replyEmail: false };
const session = { accessToken: "synthetic-access", refreshToken: "synthetic-refresh", accessExpiresAt: 90000, refreshExpiresAt: 990000 };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function fixture(extra = {}) {
  let saved = null, clock = 1000, context = { topicId: "topic-a", draft: "unsent" };
  const calls = [], notified = [];
  const storage = { load: async () => saved, save: async (value) => { saved = value; }, clear: async () => { saved = null; } };
  const client = { requestCode: async (value) => { calls.push(["request", value]); return { challengeId: "challenge", expiresIn: 600 }; },
    verifyCode: async (value) => { calls.push(["verify", value]); return { account, session }; },
    setUsername: async (_, { username }) => ({ ...account, username }), setReplyEmail: async (_, { enabled }) => ({ ...account, replyEmail: enabled }),
    me: async () => account, renew: async () => ({ account, session }), logout: async (value) => { calls.push(["logout", value]); }, ...extra.client };
  const controller = createAccountController({ client, storage: extra.storage ?? storage, now: () => clock, nonce: () => "nonce",
    readContext: () => context, onAuthenticated: (value) => notified.push(value) });
  return { controller, calls, notified, client, storage, saved: () => saved, time: (value) => { clock = value; }, context: (value) => { context = value; } };
}
async function login(f) { f.controller.open(); await f.controller.requestCode("reader@example.test"); await f.controller.verifyCode("123456"); }
test("email, code and profile flow stays independent and never exposes credentials", async () => {
  const f = fixture(); await login(f);
  assert.equal(f.controller.renderSnapshot().stage, "profile"); assert.equal(f.notified.length, 1);
  assert.equal(f.notified[0].automaticPost, false); assert.equal(f.notified[0].context.draft, "unsent");
  assert.equal(JSON.stringify(f.controller.renderSnapshot()).includes("synthetic-access"), false);
  assert.equal(f.controller.renderSnapshot().canChatGPT, false);
  assert.deepEqual(f.calls[1][1], { challengeId: "challenge", code: "123456", clientNonce: "nonce" });
});
test("first verification requires username; changed context is returned without posting", async () => {
  const f = fixture({ client: { verifyCode: async () => ({ account: { ...account, username: null }, session }) } });
  await login(f); assert.equal(f.controller.renderSnapshot().stage, "username"); assert.equal(f.notified.length, 0);
  f.context({ topicId: "topic-b" }); await f.controller.setUsername("new_reader");
  assert.equal(f.notified[0].context.topicId, "topic-a"); assert.equal(f.notified[0].currentContext.topicId, "topic-b");
});
test("AI username reservations block first naming and renaming before dispatch", async () => {
  for (const initialUsername of [null, "reader"]) {
    const submitted = [];
    const f = fixture({ client: {
      verifyCode: async () => ({ account: { ...account, username: initialUsername }, session }),
      setUsername: async (_, { username }) => { submitted.push(username); return { ...account, username }; },
    } });
    await login(f);
    for (const username of ["ai", "AI", "Ai", "ai_", "AI_shopper", "aI_Helper", "_ai", "_AI", "_AiHelper"]) {
      assert.equal(await f.controller.setUsername(username), false);
      assert.match(f.controller.renderSnapshot().error, /AI names are reserved/);
      assert.equal(f.controller.renderSnapshot().account.username, initialUsername ?? "");
    }
    assert.deepEqual(submitted, []);
    for (const username of ["Aidan", "chair", "daily_reader", "trail_ai", "my_ai_shopper"]) {
      assert.equal(await f.controller.setUsername(username), true);
      assert.equal(f.controller.renderSnapshot().account.username, username);
    }
    assert.deepEqual(submitted, ["Aidan", "chair", "daily_reader", "trail_ai", "my_ai_shopper"]);
  }
});

test("local validation and cooldown avoid extra requests", async () => {
  const f = fixture(); f.controller.open(); await f.controller.requestCode("invalid"); assert.equal(f.calls.length, 0);
  await f.controller.requestCode("reader@example.test"); await f.controller.requestCode(); assert.equal(f.calls.length, 1);
  await f.controller.verifyCode("12345"); assert.equal(f.calls.length, 1);
  assert.equal(f.controller.renderSnapshot().resendRemaining, 60);
  f.time(62000); await f.controller.requestCode(); assert.equal(f.calls.length, 2);
  f.time(999999); await f.controller.verifyCode("123456"); assert.equal(f.calls.length, 2);
});
for (const action of ["cancel", "editEmail", "signOut", "dispose"]) test(`${action} fences delayed verification`, async () => {
  const gate = deferred(); const f = fixture({ client: { verifyCode: () => gate.promise } });
  f.controller.open(); await f.controller.requestCode("reader@example.test"); const request = f.controller.verifyCode("123456");
  await f.controller[action](); gate.resolve({ account, session }); await request;
  assert.equal(f.saved(), null); assert.equal(f.controller.renderSnapshot().account, null); assert.equal(f.notified.length, 0);
  assert.equal(f.calls.some(([name, value]) => name === "logout" && value === session.accessToken), true);
});
test("logout fences and clears a save already in flight", async () => {
  const gate = deferred(); let saved = null;
  const storage = { load: async () => saved, save: async (value) => { await gate.promise; saved = value; }, clear: async () => { saved = null; } };
  const f = fixture({ storage }); f.controller.open(); await f.controller.requestCode("reader@example.test");
  const request = f.controller.verifyCode("123456"); await Promise.resolve(); await Promise.resolve();
  const logout = f.controller.signOut(); gate.resolve(); await Promise.all([request, logout]);
  assert.equal(saved, null); assert.equal(f.controller.renderSnapshot().account, null); assert.equal(f.notified.length, 0);
});
test("logout revokes a saved credential without a prior restore", async () => {
  const f = fixture(); await f.storage.save(session); await f.controller.signOut();
  assert.equal(f.saved(), null); assert.deepEqual(f.calls, [["logout", session.accessToken]]);
});
test("stale restore and profile preference cannot resurrect an account", async () => {
  const gate = deferred(); const f = fixture({ client: { me: () => gate.promise } }); await f.storage.save(session);
  const restore = f.controller.restore(); await Promise.resolve(); await f.controller.signOut(); gate.resolve(account); await restore;
  assert.equal(f.controller.renderSnapshot().account, null);
  const g = fixture({ client: { setReplyEmail: () => gate.promise } }); await login(g);
  const preference = g.controller.setReplyEmail(true); await g.controller.signOut(); await preference;
  assert.equal(g.controller.renderSnapshot().account, null);
});
test("restore renews expired access and leaves the sheet closed", async () => {
  const f = fixture(); await f.storage.save({ ...session, accessExpiresAt: 500 }); await f.controller.restore();
  assert.equal(f.controller.renderSnapshot().stage, "closed"); assert.equal(f.controller.renderSnapshot().account.username, "reader");
  assert.equal(f.notified.length, 0);
});
test("errors are friendly allowlisted strings, never service payloads", async () => {
  const f = fixture({ client: { requestCode: async () => { throw Object.assign(new Error("secret response"), { code: "unknown" }); } } });
  f.controller.open(); await f.controller.requestCode("reader@example.test");
  assert.equal(f.controller.renderSnapshot().error.includes("secret"), false); assert.equal(f.controller.renderSnapshot().busy, false);
});
test("username conflicts retain editable username stage", async () => {
  const f = fixture({ client: { verifyCode: async () => ({ account: { ...account, username: "" }, session }),
    setUsername: async () => { throw Object.assign(new Error(), { code: "username-unavailable" }); } } });
  await login(f); await f.controller.setUsername("reader"); assert.equal(f.controller.renderSnapshot().stage, "username");
  assert.match(f.controller.renderSnapshot().error, /taken/);
});
test("prototype-shaped service codes cannot leak objects into rendering", async () => {
  const f = fixture({ client: { requestCode: async () => { throw { code: "__proto__" }; } } });
  f.controller.open(); await f.controller.requestCode("reader@example.test");
  assert.equal(typeof f.controller.renderSnapshot().error, "string"); assert.match(f.controller.renderSnapshot().error, /try again/);
});
test("dispose or cancel during a storage save cannot restore persisted credentials", async () => {
  for (const action of ["cancel", "dispose"]) {
    const gate = deferred(), began = deferred(); let saved = null;
    const f = fixture({ storage: { load: async () => saved, save: async (value) => { began.resolve(); await gate.promise; saved = value; }, clear: async () => { saved = null; } } });
    f.controller.open(); await f.controller.requestCode("reader@example.test"); const request = f.controller.verifyCode("123456");
    await began.promise; f.controller[action](); gate.resolve(); await request;
    assert.equal(saved, null); assert.equal(f.controller.renderSnapshot().account, null);
  }
});
test("delayed renewal cannot resurrect after signout", async () => {
  const gate = deferred(); const f = fixture({ client: { renew: () => gate.promise } }); await login(f);
  const request = f.controller.renew(); await f.controller.signOut(); gate.resolve({ account, session }); await request;
  assert.equal(f.saved(), null); assert.equal(f.controller.renderSnapshot().account, null);
});
for (const action of ["cancel", "open", "dispose"]) test(`${action} during rotation discards the consumed session and revokes fresh credentials`, async () => {
  const gate = deferred(), dispatched = deferred();
  const fresh = { ...session, accessToken: "rotated-access", refreshToken: "rotated-refresh" };
  const f = fixture({ client: { renew: () => { dispatched.resolve(); return gate.promise; } } }); await login(f);
  const request = f.controller.renew();
  assert.equal(f.controller.renderSnapshot().account, null);
  await dispatched.promise; f.controller[action]();
  assert.equal(f.saved(), null); assert.equal(f.controller.renderSnapshot().account, null);
  if (action !== "dispose") { f.controller.open(); assert.equal(f.controller.renderSnapshot().stage, "email"); }
  gate.resolve({ account, session: fresh }); await request;
  assert.equal(f.saved(), null); assert.equal(f.controller.renderSnapshot().account, null);
  assert.equal(f.calls.some(([name, value]) => name === "logout" && value === fresh.accessToken), true);
});
test("cancel during renewal persistence cannot restore either old or fresh session", async () => {
  const saving = deferred(), finishSave = deferred(); let saved = null, saves = 0;
  const fresh = { ...session, accessToken: "rotated-access", refreshToken: "rotated-refresh" };
  const storage = { load: async () => saved, save: async (value) => {
    if (++saves === 2) { saving.resolve(); await finishSave.promise; } saved = value;
  }, clear: async () => { saved = null; } };
  const f = fixture({ storage, client: { renew: async () => ({ account, session: fresh }) } }); await login(f);
  const request = f.controller.renew(); await saving.promise;
  assert.equal(f.controller.renderSnapshot().account, null); assert.equal(saved, null);
  f.controller.cancel(); f.controller.open(); finishSave.resolve(); await request;
  assert.equal(saved, null); assert.equal(f.controller.renderSnapshot().stage, "email");
  assert.equal(f.controller.renderSnapshot().account, null);
  assert.equal(f.calls.some(([name, value]) => name === "logout" && value === fresh.accessToken), true);
});
test("successful rotation adopts only its fresh session after durable save", async () => {
  const fresh = { ...session, accessToken: "rotated-access", refreshToken: "rotated-refresh" };
  const f = fixture({ client: { renew: async () => ({ account, session: fresh }) } }); await login(f);
  await f.controller.renew(); assert.equal(f.saved().accessToken, fresh.accessToken);
  assert.equal(f.controller.renderSnapshot().account.username, "reader");
});
test("new verification survives stale rotated-save cleanup", async () => {
  const saving = deferred(), finishSave = deferred(); let saved = null, saves = 0, verifies = 0;
  const rotated = { ...session, accessToken: "rotated-access", refreshToken: "rotated-refresh" };
  const signedIn = { ...session, accessToken: "new-signin-access", refreshToken: "new-signin-refresh" };
  const storage = { load: async () => saved, save: async (value) => {
    if (++saves === 2) { saving.resolve(); await finishSave.promise; } saved = value;
  }, clear: async () => { saved = null; } };
  const f = fixture({ storage, client: { renew: async () => ({ account, session: rotated }),
    verifyCode: async () => ({ account, session: ++verifies === 1 ? session : signedIn }) } }); await login(f);
  const renewal = f.controller.renew(); await saving.promise; f.controller.cancel(); f.controller.open();
  await f.controller.requestCode("reader@example.test"); const verification = f.controller.verifyCode("123456");
  finishSave.resolve(); await Promise.all([renewal, verification]);
  assert.equal(saved.accessToken, signedIn.accessToken); assert.equal(f.controller.renderSnapshot().stage, "profile");
  assert.equal(f.calls.some(([name, value]) => name === "logout" && value === signedIn.accessToken), false);
});
test("same-tick renew and signout retains a receipt to revoke the old server session", async () => {
  let serverLive = true, rotations = 0;
  const f = fixture({ client: { renew: async () => { rotations++; return { account, session }; },
    logout: async (access) => { assert.equal(access, session.accessToken); serverLive = false; } } }); await login(f);
  const renewal = f.controller.renew(); const signout = f.controller.signOut();
  await Promise.all([renewal, signout]); assert.equal(serverLive, false); assert.equal(rotations, 0);
  assert.equal(f.saved(), null); assert.equal(f.controller.renderSnapshot().account, null);
});
