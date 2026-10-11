import assert from "node:assert/strict";
import { createInsightController } from "../browser/core/insight-controller.js";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createAccountClient } from "../browser/core/account-client.js";
import { createAccountController } from "../browser/core/account-controller.js";

test("deliberate guest Insight actions open sign-in without page read, provider call or post", async () => {
  let signIns = 0, reads = 0, calls = 0, shares = 0;
  const controller = createInsightController({ requestSignIn: () => { signIns++; },
    shareInsight: () => { shares++; }, readArticle: async () => { reads++; },
    aiClient: { start: () => { calls++; } } });
  controller.observe({ phase: "ready", actorId: null });
  assert.equal(signIns, 0);
  assert.equal(await controller.createInsights({ automatic: true }), false);
  assert.equal(await controller.createFollowup("published-target"), false);
  assert.equal(signIns, 2); assert.equal(reads, 0); assert.equal(calls, 0); assert.equal(shares, 0);
  controller.dispose();
  await controller.createInsights(); assert.equal(signIns, 2);
});

const account = { id: "app-reader", username: "reader", state: "active", replyEmail: false };
const session = { accessToken: "a".repeat(43), refreshToken: "b".repeat(43), accessExpiresAt: 90000, refreshExpiresAt: 990000 };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const capabilities = { chatGPTIdentity: true, emailCode: false };
function fixture(extra = {}) {
  const calls = []; let saved = null;
  const client = { capabilities, getCapabilities: async () => capabilities,
    signInChatGPT: async () => { calls.push("login"); return { account, session }; },
    requestCode: async () => { calls.push("email"); }, logout: async token => { calls.push(["logout", token]); }, ...extra.client };
  const controller = createAccountController({ client, now: () => 1000,
    storage: { save: async value => { saved = value; }, clear: async () => { saved = null; }, load: async () => saved },
    ...extra.options });
  return { controller, calls, saved: () => saved };
}
test("paired capability and ChatGPT requests have exact server-only payloads", async () => {
  const calls = [];
  const client = createAccountClient({ getPairingToken: async () => "p".repeat(43), fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(url.endsWith("capabilities") ? capabilities : url.endsWith("/me") ? account : { account, session }), { headers: { "Content-Type": "application/json" } });
  } });
  assert.deepEqual(await client.getCapabilities(), capabilities);
  assert.deepEqual(await client.signInChatGPT(), { account, session });
  assert.deepEqual(await client.me(session.accessToken), account);
  assert.equal(calls[0].options.method, "POST"); assert.equal(calls[0].options.body, "{}");
  assert.equal(calls[1].options.body, "{}"); assert.equal(calls[1].options.headers["X-Account-Session"], undefined);
  assert.equal(calls[1].options.credentials, "omit"); assert.equal(calls[1].options.redirect, "error");
  assert.equal(calls[2].options.method, "POST"); assert.equal(calls[2].options.body, "{}");
  assert.equal(calls[2].options.headers["X-Account-Session"], session.accessToken);
});
for (const value of [null, [], {}, { chatGPTIdentity: "true", emailCode: false }, { ...capabilities, email: "private@example.test" }]) {
  test(`malformed server capabilities fail closed: ${JSON.stringify(value)}`, async () => {
    const client = createAccountClient({ getPairingToken: async () => "p".repeat(43), fetchImpl: async () =>
      new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } }) });
    await assert.rejects(client.getCapabilities(), error => error.code === "invalid-response");
  });
}
test("connected ChatGPT reuse is explicit and email never pretends delivery", async () => {
  let connects = 0, notices = 0;
  const f = fixture({ options: { onConnectChatGPT: async () => { connects++; }, onAuthenticated: () => { notices++; } } });
  f.controller.open(); await f.controller.refreshCapabilities();
  assert.deepEqual(f.calls, []); assert.equal(connects, 0);
  assert.equal(await f.controller.requestCode("reader@example.com"), false);
  assert.equal(await f.controller.connectChatGPT(), false);
  assert.equal(await f.controller.signInChatGPT(), true);
  assert.equal(notices, 1); assert.equal(f.controller.renderSnapshot().canReplyEmail, false);
  assert.equal(await f.controller.setReplyEmail(true), false);
  assert.equal(await f.controller.signInChatGPT(), false); // profile cannot silently switch
  assert.equal(JSON.stringify(f.controller.renderSnapshot()).includes(session.accessToken), false);
});
test("disconnected connection seam refreshes capability without signing in", async () => {
  let connects = 0;
  const f = fixture({ client: { capabilities: { chatGPTIdentity: false, emailCode: false } },
    options: { onConnectChatGPT: async () => { connects++; } } });
  f.controller.open(); assert.equal(await f.controller.connectChatGPT(), true);
  assert.equal(connects, 1); assert.deepEqual(f.calls, []); assert.equal(f.controller.renderSnapshot().account, null);
  assert.equal(f.controller.renderSnapshot().canChatGPT, true);
});
for (const action of ["cancel", "signOut", "dispose"]) test(`${action} fences late ChatGPT identity session`, async () => {
  const gate = deferred(); const f = fixture({ client: { signInChatGPT: () => gate.promise } });
  f.controller.open(); const login = f.controller.signInChatGPT(); await f.controller[action]();
  gate.resolve({ account, session }); await login;
  assert.equal(f.saved(), null); assert.equal(f.controller.renderSnapshot().account, null);
  assert.deepEqual(f.calls, [["logout", session.accessToken]]);
});
test("private account access receipt invalidates on logout and remains outside rendering", async () => {
  const f = fixture(); f.controller.open(); await f.controller.signInChatGPT();
  let receipt;
  await f.controller.withAppSession(value => { receipt = value; assert.equal(value.isCurrent(), true); });
  assert.equal(receipt.accessToken, session.accessToken); assert.equal(f.controller.getAccessToken(), session.accessToken);
  await f.controller.signOut(); assert.equal(receipt.isCurrent(), false); assert.equal(f.controller.getAccessToken(), null);
});
test("failed capabilities replace prior enabled state conservatively", async () => {
  const f = fixture({ client: { getCapabilities: async () => ({ ...capabilities, extra: true }) } });
  f.controller.open(); assert.equal(await f.controller.refreshCapabilities(), false);
  assert.equal(f.controller.renderSnapshot().canChatGPT, false); assert.equal(f.controller.renderSnapshot().canEmail, false);
});
test("account surface preserves CSP by building safe native elements only", async () => {
  const source = await readFile(new URL("../browser/chromium/account-sheet.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|\bfetch\s*\(/);
  assert.match(source, /emailComingSoon/); assert.match(source, /toggle\.disabled = value\.busy \|\| value\.canReplyEmail === false/);
});
test("account export is deliberate, own-account paginated and never rendered", async () => {
  const exports = [], requests = [];
  const f = fixture({ client: { exportData: async (_, after) => { requests.push(after); return { account,
    identities: [], contacts: [], posts: [{ id: after === null ? "post-a" : "post-b", body: "private own post" }], next: after === null ? "post-a" : null }; } },
    options: { onExport: data => { exports.push(data); } } });
  f.controller.open(); await f.controller.signInChatGPT(); assert.deepEqual(requests, []);
  assert.equal(await f.controller.exportData(), true); assert.deepEqual(requests, [null, "post-a"]);
  assert.equal(exports[0].posts.length, 2); assert.equal(JSON.stringify(f.controller.renderSnapshot()).includes("private own post"), false);
});
test("export cancellation and cyclic pagination cannot download stale private data", async () => {
  let exports = 0; const gate = deferred();
  const f = fixture({ client: { exportData: () => gate.promise }, options: { onExport: () => { exports++; } } });
  f.controller.open(); await f.controller.signInChatGPT(); const request = f.controller.exportData(); f.controller.cancel();
  gate.resolve({ account, identities: [], contacts: [], posts: [], next: null }); await request; assert.equal(exports, 0);
  const g = fixture({ client: { exportData: async () => ({ account, identities: [], contacts: [], posts: [], next: "same" }) },
    options: { onExport: () => { exports++; } } });
  g.controller.open(); await g.controller.signInChatGPT(); assert.equal(await g.controller.exportData(), false); assert.equal(exports, 0);
});
test("export rejects changing catalog or private metadata between revision pages", async () => {
  for (const change of ["version", "account", "contacts"]) {
    let pages = 0, downloads = 0;
    const f = fixture({ client: { exportData: async () => {
      const page = { account, identities: [], contacts: [], version: { generation: "generation", revision: 1 }, posts: [], next: pages++ === 0 ? "post:0" : null };
      if (pages > 1) {
        if (change === "version") page.version.revision = 2;
        if (change === "account") page.account = { ...account, username: "changed" };
        if (change === "contacts") page.contacts = [{ email: "reader@example.test", verifiedAt: 1 }];
      }
      return page;
    } }, options: { onExport: () => { downloads++; } } });
    f.controller.open(); await f.controller.signInChatGPT(); assert.equal(await f.controller.exportData(), false); assert.equal(downloads, 0);
  }
});
test("export client accepts bounded revision rows and rejects bulk revisions or secrets", async () => {
  const page = { account, identities: [], contacts: [], version: { generation: "generation", revision: 1 },
    posts: [{ id: "post-a", revisions: [{ body: "Own stored revision" }], revisionIndex: 0, totalRevisions: 2 }], next: "post-a:0" };
  let value = page, options;
  const client = createAccountClient({ getPairingToken: async () => "p".repeat(43), fetchImpl: async (_, requestOptions) => {
    options = requestOptions; return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
  } });
  assert.deepEqual(await client.exportData(session.accessToken), page); assert.equal(options.body, '{"after":null}');
  value = { ...page, posts: [{ ...page.posts[0], revisions: [{ body: "First" }, { body: "Second" }] }] };
  await assert.rejects(client.exportData(session.accessToken), error => error.code === "invalid-response");
  value = { ...page, posts: [{ ...page.posts[0], accessToken: session.accessToken }] };
  await assert.rejects(client.exportData(session.accessToken), error => error.code === "invalid-response");
  value = { ...page, posts: [{ ...page.posts[0], revisions: [{ body: "x".repeat(132000) }] }] };
  await assert.rejects(client.exportData(session.accessToken), error => error.code === "invalid-response");
});
test("deletion requires separate confirmation and clears session immediately despite cancel or failed response", async () => {
  for (const action of ["cancel", "signOut"]) {
    const gate = deferred(), dispatched = deferred(); let deletes = 0;
    const f = fixture({ client: { deleteAccount: () => { deletes++; dispatched.resolve(); return gate.promise; } } });
    f.controller.open(); await f.controller.signInChatGPT();
    assert.equal(await f.controller.deleteAccount(), false); assert.equal(deletes, 0);
    assert.equal(f.controller.requestDeletion(), true); assert.equal(deletes, 0);
    const request = f.controller.deleteAccount(); await dispatched.promise;
    assert.equal(f.controller.getAccessToken(), null); assert.equal(f.saved(), null);
    await f.controller[action](); gate.resolve({ deleted: true }); await request;
    assert.equal(f.controller.renderSnapshot().account, null); assert.equal(f.saved(), null);
  }
  const f = fixture({ client: { deleteAccount: async () => { throw new Error("response lost"); } } });
  f.controller.open(); await f.controller.signInChatGPT(); f.controller.requestDeletion();
  assert.equal(await f.controller.deleteAccount(), false); assert.equal(f.saved(), null); assert.equal(f.controller.getAccessToken(), null);
});
