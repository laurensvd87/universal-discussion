// Public opaque actor IDs only. Possessing an ID never authenticates a caller.
export const ACCOUNT_ACTOR = /^account-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export const ACCOUNT_STATE_SCHEMA = "demo-state/v3";
export function isAccountActor(value) { return typeof value === "string" && ACCOUNT_ACTOR.test(value); }
export function isAccountPrincipal(actor) {
  return actor?.type === "human" && actor.demo === false && isAccountActor(actor.id) &&
    actor.id === `account-${actor.accountId}` && typeof actor.displayName === "string" &&
    /^[A-Za-z0-9_]{3,24}$/u.test(actor.displayName);
}
export const ACCOUNT_COMMANDS = new Set(["create-root", "reply", "edit", "withdraw", "share-insight", "share-insight-reply"]);
