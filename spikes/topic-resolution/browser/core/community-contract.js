import { inspectPageUrl } from "./page-content-policy.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const UNSAFE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
function record(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid community response");
  return value;
}
function string(value, max, empty = false) {
  if (typeof value !== "string" || value.length > max || (!empty && !value.length) || UNSAFE.test(value)) throw new TypeError("Invalid community response");
  return value;
}
function id(value) { if (!ID.test(string(value, 128))) throw new TypeError("Invalid identifier"); return value; }
function count(value) { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("Invalid count"); return value; }
function url(value) {
  if (inspectPageUrl(value)?.url !== value || !inspectPageUrl(value)?.supported) throw new TypeError("Invalid source URL");
  return value;
}
export function readDiscovery(value) {
  record(value); record(value.version);
  id(value.version.generation); count(value.version.revision); string(value.query, 256, true);
  if (!Array.isArray(value.results) || value.results.length > 25 ||
      !(value.nextCursor === null || typeof value.nextCursor === "string" && value.nextCursor.length <= 2048)) throw new TypeError("Invalid discovery page");
  for (const result of value.results) {
    record(result); id(result.topicId); id(result.discussionId); string(result.title, 200);
    string(result.kind, 40); string(result.snippet, 600, true); count(result.visibleCount);
    if (result.updatedAt !== null) string(result.updatedAt, 40);
    if (!Array.isArray(result.sources) || result.sources.length > 5) throw new TypeError("Invalid discovery sources");
    for (const source of result.sources) { record(source); id(source.id); string(source.title, 200); url(source.url); }
  }
  return value;
}

// Private transport only accepts bounded JSON. Text is rendered with textContent;
// all page destinations must independently pass the public URL policy.
export function readPrivateResponse(value) {
  record(value);
  const inspect = (item, depth = 0, field = "") => {
    if (depth > 8) throw new TypeError("Invalid private response");
    if (item === null || typeof item === "boolean") return;
    if (typeof item === "string") { string(item, 16000, true); return; }
    if (typeof item === "number") { count(item); return; }
    if (Array.isArray(item)) {
      if (item.length > (field === "citations" ? 50 : 25)) throw new TypeError("Invalid private page");
      item.forEach(child => inspect(child, depth + 1)); return;
    }
    record(item);
    for (const [key, child] of Object.entries(item)) {
      if (["__proto__", "constructor", "prototype", "accessToken", "refreshToken", "idToken", "pairingToken",
        "access_token", "refresh_token", "id_token", "session", "sessions", "accountSession", "authorization",
        "credentials", "codeVerifier", "code_verifier"].includes(key)) throw new TypeError("Invalid private response");
      if (key === "sourceUrl" && child !== null) url(child);
      inspect(child, depth + 1, key);
    }
  };
  inspect(value);
  return value;
}
