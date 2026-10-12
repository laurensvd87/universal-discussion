import { AccountError } from "./account-errors.js";
import { fail } from "../domain/errors.js";

// Two stores, no distributed-transaction claim: deleting disables auth first,
// then one canonical transaction removes all owned bodies; startup completes
// interrupted erasure before the service accepts account operations.
export function createAccountLifecycle({ accounts, service, ai, privateDiscussions = null }) {
  function finish(accountId) {
    const actorId = `account-${accountId}`;
    ai?.cancelAccount?.(actorId);
    privateDiscussions?.cancelAccount(actorId);
    service.withdrawAccountContributions(actorId);
    privateDiscussions?.eraseAccount(actorId);
    return accounts.finishDeletion(accountId);
  }
  return Object.freeze({
    resume() { for (const id of accounts.listDeletingAccountIds()) finish(id); },
    route(request) {
      if (Object.hasOwn(request.headers, "x-demo-actor")) fail("forbidden", "Action unavailable");
      if (request.method !== "POST" || request.headers["content-type"] !== "application/json" ||
          typeof request.body !== "string" || Buffer.byteLength(request.body) > 4096) fail("invalid", "Invalid request");
      const token = request.headers["x-account-session"];
      if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(token)) throw new AccountError("authentication-required");
      let body;
      try { body = JSON.parse(request.body); } catch { fail("invalid", "Invalid request"); }
      if (!body || typeof body !== "object" || Array.isArray(body)) fail("invalid", "Invalid request");
      if (["/v1/account/public-chats/list", "/v1/account/public-chats/read"].includes(request.url.pathname)) {
        const principal = accounts.resolvePrincipal(token);
        const value = request.url.pathname.endsWith("/list") ? service.accountPublicChats(principal.id, body)
          : service.accountPublicChat(principal.id, body);
        return { status: 200, value };
      }
      if (request.url.pathname === "/v1/account/delete") {
        if (Object.keys(body).join() !== "confirmation" || body.confirmation !== "DELETE MY ACCOUNT")
          fail("invalid", "Invalid request");
        const { accountId } = accounts.beginDeletion(token);
        return { status: 200, value: finish(accountId) };
      }
      if (request.url.pathname === "/v1/account/private-data" && privateDiscussions) {
        const own = accounts.exportOwnAccount(token);
        return { status: 200, value: privateDiscussions.exportPage(`account-${own.account.id}`, body) };
      }
      if (request.url.pathname !== "/v1/account/data" || Object.keys(body).join() !== "after" ||
          !(body.after === null || typeof body.after === "string" && /^[A-Za-z0-9._:-]{1,128}$/u.test(body.after)))
        fail("invalid", "Invalid request");
      const own = accounts.exportOwnAccount(token);
      const posts = service.accountContributions(`account-${own.account.id}`).toSorted((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      // One revision per bounded page, including retained edit history. A post
      // with fifty long revisions must not exceed the export transport budget.
      const rows = posts.flatMap(post => post.revisions.map((revision, revisionIndex) => ({
        cursor: `${post.id}:${revisionIndex}`,
        post: { ...post, revisions: [revision], revisionIndex, totalRevisions: post.revisions.length },
      })));
      const start = body.after === null ? 0 : rows.findIndex(row => row.cursor === body.after) + 1;
      if (body.after !== null && start === 0) fail("conflict", "Export changed");
      const page = rows.slice(start, start + 1);
      return { status: 200, value: { ...own, version: typeof service.version === "function" ? service.version() : service.catalog().version,
        posts: page.map(row => row.post), next: start + 1 < rows.length ? page[0].cursor : null } };
    },
  });
}
