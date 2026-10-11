import assert from "node:assert/strict";
import test from "node:test";
import { AccountRepository } from "../../../apps/local-service/src/accounts/account-repository.js";
import { AccountService } from "../../../apps/local-service/src/accounts/account-service.js";
import { createAccountSessionStorage, ACCOUNT_SESSION_KEY, ACCOUNT_SESSION_FENCE_KEY } from "../browser/core/account-session-storage.js";
import { createAccountController } from "../browser/core/account-controller.js";

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function setup(t) {
  const repository = new AccountRepository(); t.after(() => repository.close());
  const accounts = new AccountService({ repository, hmacKey: Buffer.alloc(32, 7), mailSink: null, fixtureOnly: false,
    chatgptIdentity: () => ({ issuer: "https://auth.openai.com", clientId: "synthetic-shared-client", subject: "synthetic-shared-subject" }) });
  const signed = accounts.signInChatGPT({}); accounts.setUsername(signed.session.accessToken, { username: "Reader" });
  let values = {}, lockQueue = Promise.resolve(); const listeners = [], events = [];
  const emit = key => { if ([ACCOUNT_SESSION_KEY, ACCOUNT_SESSION_FENCE_KEY].includes(key))
    for (const listener of listeners) events.push(Promise.resolve().then(listener)); };
  const area = { setAccessLevel: async () => {}, get: async () => structuredClone(values),
    set: async value => { for (const [key, item] of Object.entries(value)) { values[key] = structuredClone(item); emit(key); } },
    remove: async key => { if (Object.hasOwn(values, key)) { delete values[key]; emit(key); } } };
  const withLock = work => { const result = lockQueue.catch(() => {}).then(work); lockQueue = result; return result; };
  const storage = () => createAccountSessionStorage({ storageSession: area, getPairingToken: async () => "p".repeat(43), withLock });
  const client = { capabilities: { chatGPTIdentity: true, emailCode: false }, me: token => accounts.me(token),
    signInChatGPT: () => accounts.signInChatGPT({}), renew: body => accounts.renew(body), logout: token => accounts.logout(token) };
  const create = (extra = {}) => createAccountController({ client: { ...client, ...extra }, storage: storage() });
  const flush = async () => { while (events.length) { const current = events.splice(0); await Promise.all(current); } };
  return { accounts, signed, storage, create, client, listeners, flush, values: () => values };
}
test("peer logout after renewal consumed old credentials rejects and revokes held fresh session", async t => {
  const f = setup(t), held = deferred(), issued = deferred(); let fresh;
  const initialStorage = f.storage(); await initialStorage.save(f.signed.session, await initialStorage.captureFence());
  const a = f.create({ renew: body => { fresh = f.accounts.renew(body); issued.resolve(); return held.promise; } }), b = f.create();
  await a.restore(); await b.restore();
  f.listeners.push(() => a.reconcileSession(), () => b.reconcileSession());
  const rotation = a.renew(); await issued.promise; await f.flush();
  assert.equal(b.renderSnapshot().account, null);
  await b.signOut(); await f.flush();
  assert.equal(a.renderSnapshot().renewing, false);
  held.resolve(fresh); assert.equal(await rotation, false); await f.flush();
  assert.equal(a.renderSnapshot().account, null); assert.equal(b.renderSnapshot().account, null);
  assert.equal(f.values()[ACCOUNT_SESSION_KEY], undefined);
  assert.equal(f.accounts.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE revoked=0").get().n, 0);
  // A later deliberate login captures the new fence and is allowed.
  a.open(); assert.equal(await a.signInChatGPT(), true); await f.flush();
  assert.equal(a.renderSnapshot().account.username, "Reader");
});
test("two simultaneous renewals cannot let the rejected old refresh erase the peer's fresh session", async t => {
  const f = setup(t); const initial = f.storage(); await initial.save(f.signed.session, await initial.captureFence());
  const a = f.create(), b = f.create(); await a.restore(); await b.restore();
  const result = await Promise.all([a.renew(), b.renew()]);
  assert.equal(result.filter(Boolean).length, 1);
  const saved = await initial.load(); assert.ok(saved); assert.equal(f.accounts.me(saved.accessToken).username, "Reader");
  assert.equal(f.accounts.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE revoked=0").get().n, 1);
});
test("old-session cleanup cannot clear a newer accepted receipt and missing shared lock is rejected", async t => {
  const f = setup(t), storage = f.storage(), fence = await storage.captureFence();
  await storage.save(f.signed.session, fence);
  const newer = f.accounts.renew({ refreshToken: f.signed.session.refreshToken }); await storage.save(newer.session, fence);
  assert.equal(await storage.clear({ expectedAccessToken: f.signed.session.accessToken }), false);
  assert.equal((await storage.load()).accessToken, newer.session.accessToken);
  assert.throws(() => createAccountSessionStorage({ storageSession: { get() {}, set() {}, remove() {}, setAccessLevel() {} }, getPairingToken() {} }));
});
