import { inspectPageUrl } from "./page-content-policy.js";
import { record as exactRecord, readId, readVersion } from "./local-service-contract.js";

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
function readScope(value) {
  const descriptor = Object.getOwnPropertyDescriptor(value, "scope");
  if (!descriptor) return {};
  if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "string" ||
      !/^[a-f0-9]{64}$/u.test(descriptor.value)) throw new TypeError("Invalid read-only scope");
  return {scope:descriptor.value};
}
function url(value) {
  if (inspectPageUrl(value)?.url !== value || !inspectPageUrl(value)?.supported) throw new TypeError("Invalid source URL");
  return value;
}
export function readDiscovery(value) {
  record(value); readScope(value); record(value.version);
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

// Public account previews are a narrow read projection, not an account export
// or a current-page write/Insight attestation. Reject unexpected/secret fields.
function publicCursor(value) {
  if (value === null) return null;
  string(value, 2048);
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u.test(value)) throw new TypeError("Invalid chat cursor");
  return value;
}
function publicArray(value, project) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 25) throw new TypeError("Invalid chat page");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) throw new TypeError("Invalid chat page");
  const items = Array.from({length:value.length}, (_, index) => {
    const descriptor = descriptors[index];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError("Invalid chat page");
    return project(descriptor.value);
  });
  if (new Set(items.map(item => item.id)).size !== items.length) throw new TypeError("Duplicate chat entry");
  return items;
}
function publicSource(value) { return value === null ? null : url(string(value, 8192)); }
function actorType(value) {
  if (!["human", "agent"].includes(value)) throw new TypeError("Invalid chat actor");
  return value;
}
function publicChat(value) {
  const item = exactRecord(value, ["id", "visibility", "topicId", "discussionId", "title", "sourceId", "sourceUrl", "createdAt", "updatedAt", "actorType", "ownedHuman", "ownedAgent"]);
  if (item.visibility !== "public" || typeof item.ownedHuman !== "boolean" || typeof item.ownedAgent !== "boolean" || !item.ownedHuman && !item.ownedAgent) throw new TypeError("Invalid owned conversation");
  if ((item.sourceId === null) !== (item.sourceUrl === null)) throw new TypeError("Invalid chat source");
  return {id:readId(item.id),visibility:"public",topicId:readId(item.topicId),discussionId:readId(item.discussionId),
    title:string(item.title,200),sourceId:item.sourceId === null ? null : readId(item.sourceId),sourceUrl:publicSource(item.sourceUrl),
    createdAt:string(item.createdAt,64),updatedAt:string(item.updatedAt,64),actorType:actorType(item.actorType),
    ownedHuman:item.ownedHuman,ownedAgent:item.ownedAgent};
}
function publicMessage(value) {
  const item = exactRecord(value, ["id", "replyToId", "actorType", "state", "body", "createdAt", "authorLabel", "sourceUrl"]);
  if (!["visible", "deleted"].includes(item.state) || item.state === "deleted" && (item.body !== "" || item.sourceUrl !== null)) throw new TypeError("Invalid public message");
  const message = {id:readId(item.id),replyToId:item.replyToId === null ? null : readId(item.replyToId),
    actorType:actorType(item.actorType),state:item.state,body:string(item.body,8000,item.state === "deleted"),
    createdAt:string(item.createdAt,64),authorLabel:string(item.authorLabel,200),sourceUrl:publicSource(item.sourceUrl)};
  if (message.replyToId === message.id) throw new TypeError("Invalid message parent");
  return message;
}
export function readAccountPublicChatsRequest(action, value) {
  if (!["list", "read"].includes(action)) throw new TypeError("Invalid chat action");
  const hasQuery=action==="list" && Object.hasOwn(value??{},"query");
  const item = exactRecord(value, action === "list" ? ["after", "limit",...(hasQuery?["query"]:[])] : ["rootId", "after", "limit"]);
  if(hasQuery && (typeof item.query!=="string" || item.query.length>256 || /[\u0000-\u0008\u000b\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]|[\uD800-\uDFFF]/u.test(item.query))) throw new TypeError("Invalid chat query");
  if (!Number.isInteger(item.limit) || item.limit < 1 || item.limit > 25) throw new TypeError("Invalid chat limit");
  return {...(action === "read" ? {rootId:readId(item.rootId)} : {}),after:publicCursor(item.after),limit:item.limit,...(hasQuery?{query:item.query.replace(/\s+/gu," ").trim()}: {})};
}
export function readAccountPublicChatsResponse(action, value, rootId = null) {
  const scope = readScope(value);
  const item = exactRecord(value, [...(action === "list" ? ["version", "chats", "next"] : ["version", "conversation", "messages", "next"]),...Object.keys(scope)]);
  const common = {version:readVersion(item.version),next:publicCursor(item.next),...scope};
  if (action === "list") return {...common,chats:publicArray(item.chats,publicChat)};
  if (action !== "read") throw new TypeError("Invalid chat action");
  const conversation = publicChat(item.conversation);
  if (conversation.id !== rootId) throw new TypeError("Wrong chat destination");
  return {...common,conversation,messages:publicArray(item.messages,publicMessage)};
}
