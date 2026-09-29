import { inspectPageUrl } from "./page-content-policy.js";

const PHASES = new Set(["off", "checking", "not-enabled", "unpaired", "processing", "ready", "unsupported", "error"]);
const CONTEXT_REASONS = new Set([
  "context-unavailable", "window-unavailable", "window-query-failed", "tab-query-failed",
  "window-changed", "tab-changed", "focus-expired", "focus-changed",
  "window-unfocused", "unsupported-window", "tab-unavailable", "page-loading",
  "url-unavailable", "incognito", "unsupported-url",
]);
const FIELDS = ["phase", "reason", "tabId", "url", "documentId", "sourceId", "topicId", "assignment", "sequence", "enabled", "blockedOrigins", "currentOrigin", "currentTabId", "currentUrl", "contextReason", "sessionWindowId", "currentWindowId", "sessionRevision", "hostAccess"];
const id = (value) => typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/u.test(value);
const tab = (value) => value === null || (Number.isSafeInteger(value) && value >= 0);
const nullable = (value, validator) => value === null || validator(value);
function originList(value, validate) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > 100 || Reflect.ownKeys(descriptors).length !== length + 1) return false;
  for (let index = 0; index < length; index++) {
    const descriptor = descriptors[index];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || !validate(descriptor.value)) return false;
  }
  return true;
}
export function projectPageResolution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError("Page matching unavailable");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== FIELDS.length || keys.some((key) => !FIELDS.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError("Page matching unavailable");
  const url = (input) => typeof input === "string" && inspectPageUrl(input).supported && inspectPageUrl(input).url === input;
  const origin = (input) => typeof input === "string" && (input === "http://127.0.0.1:4173" || inspectPageUrl(input + "/").origin === input);
  if (!PHASES.has(value.phase) || !nullable(value.reason, (item) => typeof item === "string" && /^[a-z0-9-]{1,64}$/u.test(item)) ||
      !tab(value.tabId) || !tab(value.currentTabId) || !nullable(value.url, url) || !nullable(value.currentUrl, url) ||
      !nullable(value.documentId, id) || !nullable(value.sourceId, id) || !nullable(value.topicId, id) ||
      !nullable(value.assignment, (item) => ["confirmed", "provisional"].includes(item)) ||
      !Number.isSafeInteger(value.sequence) || value.sequence < 0 || typeof value.enabled !== "boolean" ||
      !originList(value.blockedOrigins, origin) ||
      !tab(value.sessionWindowId) || !tab(value.currentWindowId) || !id(value.sessionRevision) || typeof value.hostAccess !== "boolean" ||
      value.enabled !== (value.sessionWindowId !== null) ||
      !nullable(value.currentOrigin, origin) || !nullable(value.contextReason, (item) => CONTEXT_REASONS.has(item))) throw new TypeError("Page matching unavailable");
  if ((value.currentOrigin === null) !== (value.contextReason !== null) ||
      (value.currentOrigin === null) !== (value.currentTabId === null) ||
      (value.currentOrigin === null) !== (value.currentUrl === null) ||
      (value.currentOrigin === null) !== (value.currentWindowId === null) ||
      (value.currentUrl !== null && inspectPageUrl(value.currentUrl).origin !== value.currentOrigin)) throw new TypeError("Page matching unavailable");
  return Object.freeze({ ...value, blockedOrigins: Object.freeze([...value.blockedOrigins]) });
}
export function isReadyPageResolution(value) {
  return value?.enabled === true && value.phase === "ready" && value.tabId !== null && value.documentId !== null &&
    value.sourceId !== null && value.topicId !== null && value.currentTabId === value.tabId && value.currentUrl === value.url &&
    value.hostAccess === true && value.sessionWindowId !== null && value.currentWindowId === value.sessionWindowId &&
    !value.blockedOrigins.includes(value.currentOrigin);
}
export function samePageResolution(left, right) {
  return left && right && ["sequence", "tabId", "url", "documentId", "sourceId", "topicId", "enabled", "phase", "currentTabId", "currentUrl", "currentOrigin", "contextReason", "sessionWindowId", "currentWindowId", "sessionRevision", "hostAccess"]
    .every((key) => left[key] === right[key]) && left.blockedOrigins.length === right.blockedOrigins.length &&
    left.blockedOrigins.every((origin, index) => origin === right.blockedOrigins[index]);
}
