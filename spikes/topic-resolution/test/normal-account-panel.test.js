import assert from "node:assert/strict";
import test from "node:test";
import { mountAccountPanel } from "../browser/chromium/account-panel.js";

const account = { id: "12345678-1234-4123-8123-123456789abc", username: "reader", state: "active", replyEmail: false };
const session = { accessToken: "a".repeat(43), refreshToken: "b".repeat(43), accessExpiresAt: Date.now() + 100000, refreshExpiresAt: Date.now() + 1000000 };
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture(extra = {}) {
  const document = { activeElement: null, createElement: tag => new Node(tag) };
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.handlers = {}; this.hidden = false; this.disabled = false; this.value = ""; }
    append(...nodes) { this.children.push(...nodes); } setAttribute(key, value) { this.attrs[key] = value; }
    addEventListener(name, handler) { this.handlers[name] = handler; } focus() { document.activeElement = this; }
    remove() { this.removed = true; } dispatch(name) { this.handlers[name]?.({ preventDefault() {} }); }
  }
  const mount = new Node("main"), calls = [], changes = [];
  let saved = extra.saved ?? null, listener;
  const client = { capabilities: { chatGPTIdentity: false, emailCode: false },
    getCapabilities: async () => { calls.push("capabilities"); return { chatGPTIdentity: true, emailCode: false }; },
    me: async () => { calls.push("me"); return account; },
    signInChatGPT: async () => { calls.push("login"); return { account, session }; },
    logout: async token => { calls.push(["logout", token]); }, ...extra.client };
  const storage = { load: async () => saved, save: async value => { saved = value; }, clear: async () => { saved = null; }, ...extra.storage };
  const panel = mountAccountPanel({ document, mount, client, storage, onAccountChange: value => changes.push(value),
    onConnectChatGPT: () => { calls.push("connect"); }, onSessionChanged: fn => { listener = fn; return () => { listener = null; }; } });
  return { panel, calls, changes, document, mount, storage, save: value => { saved = value; }, saved: () => saved, event: () => listener?.() };
}
test("normal panel startup probes local capabilities and restores independently without provider launch", async () => {
  const f = fixture({ saved: session }); await f.panel.initialize();
  assert.deepEqual(f.calls, ["capabilities", "me"]); assert.equal(f.panel.getActorId(), `account-${account.id}`);
  assert.equal(f.panel.getAccessToken(`account-${account.id}`), session.accessToken); assert.equal(f.panel.getAccessToken("demo-alex"), null);
  assert.equal(f.panel.elements.overlay.hidden, true); assert.equal(f.panel.elements.button.textContent, "@reader");
  assert.equal(JSON.stringify(f.changes).includes(session.accessToken), false);
});
test("sign-in request only opens compact sheet and local capability read; connected identity reuse stays deliberate", async () => {
  const f = fixture(); await f.panel.initialize(); await f.panel.requestSignIn();
  assert.deepEqual(f.calls, ["capabilities", "capabilities"]); assert.equal(f.panel.elements.form.hidden, true);
  assert.equal(f.panel.elements.emailNotice.hidden, false); assert.equal(f.panel.elements.chatGPT.hidden, false);
  assert.equal(f.document.activeElement, f.panel.elements.chatGPT);
  await f.panel.controller.signInChatGPT(); assert.equal(f.panel.getActorId(), `account-${account.id}`);
  assert.equal(f.calls.includes("connect"), false); assert.equal(f.panel.elements.toggle.disabled, true);
});
test("late rejection cannot log out a different accepted session", async () => {
  const f = fixture({ saved: session }); await f.panel.initialize();
  assert.equal(await f.panel.rejectedSession("c".repeat(43)), false); assert.equal(f.panel.getAccessToken(), session.accessToken);
  assert.equal(await f.panel.rejectedSession(session.accessToken), true);
  assert.equal(f.saved(), null); assert.equal(f.panel.getActorId(), null);
});
test("cross-panel changes invalidate visible account before restoring validated replacement", async () => {
  const gate = defer(); let reads = 0;
  const f = fixture({ saved: session, client: { me: async () => ++reads === 1 ? account : gate.promise } });
  await f.panel.initialize(); const fresh = { ...session, accessToken: "c".repeat(43) };
  f.save(fresh); const reconcile = f.panel.onSessionChanged();
  await Promise.resolve(); await Promise.resolve(); assert.equal(f.panel.getActorId(), null);
  gate.resolve({ ...account, id: "22345678-1234-4123-8123-123456789abc", username: "other_reader" });
  await reconcile; assert.equal(f.panel.getActorId(), "account-22345678-1234-4123-8123-123456789abc");
  assert.equal(f.panel.getAccessToken(), fresh.accessToken);
  f.save(null); await f.panel.onSessionChanged(); assert.equal(f.panel.getActorId(), null);
});
test("own session save notification neither loops nor cancels login", async () => {
  let f;
  f = fixture({ storage: { save: async value => { f.save(value); f.event(); } } });
  await f.panel.requestSignIn(); assert.equal(await f.panel.controller.signInChatGPT(), true);
  await Promise.resolve(); assert.equal(f.panel.getAccessToken(), session.accessToken);
  const before = f.calls.length; assert.equal(await f.panel.onSessionChanged(), false); assert.equal(f.calls.length, before);
});
test("dispose closes modal, removes elements and fences pending startup", async () => {
  const gate = defer(); const f = fixture({ client: { getCapabilities: () => gate.promise } });
  const initialize = f.panel.initialize(); f.panel.dispose(); gate.resolve({ chatGPTIdentity: true, emailCode: false });
  assert.equal(await initialize, false); assert.equal(f.panel.getAccessToken(), null); assert.equal(f.panel.getActorId(), null);
  assert.equal(f.panel.elements.button.removed, true); assert.equal(f.panel.elements.overlay.removed, true);
  assert.equal(await f.panel.requestSignIn(), false);
});
test("ordinary same-account renewal keeps presentation stable but suppresses consumed credential", async () => {
  const gate = defer(), dispatched = defer();
  const f = fixture({ saved: session, client: { renew: () => { dispatched.resolve(); return gate.promise; } } });
  await f.panel.initialize(); const before = f.changes.length;
  const renewal = f.panel.controller.renew(); await dispatched.promise;
  assert.equal(f.panel.getActorId(), `account-${account.id}`); assert.equal(f.panel.getAccessToken(), null);
  assert.equal(f.changes.length, before); gate.resolve({ account, session: { ...session, accessToken: "c".repeat(43) } });
  await renewal; assert.equal(f.changes.length, before); assert.equal(f.panel.getAccessToken(), "c".repeat(43));
});
test("failed or cancelled renewal removes stable presentation and never restores old credentials", async () => {
  const f = fixture({ saved: session, client: { renew: async () => { throw new Error("unavailable"); } } });
  await f.panel.initialize(); await f.panel.controller.renew(); assert.equal(f.panel.getActorId(), null); assert.equal(f.changes.at(-1), null);
  for (const action of ["cancel", "signOut"]) {
    const gate = defer(), dispatched = defer();
    const g = fixture({ saved: session, client: { renew: () => { dispatched.resolve(); return gate.promise; } } });
    await g.panel.initialize(); const renewal = g.panel.controller.renew(); await dispatched.promise;
    await g.panel.controller[action](); assert.equal(g.panel.getActorId(), null);
    gate.resolve({ account, session: { ...session, accessToken: "c".repeat(43) } }); await renewal;
    assert.equal(g.panel.getActorId(), null); assert.equal(g.panel.getAccessToken(), null);
  }
});
