import { fail } from "./errors.js";

const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

export function readRecord(value, allowed, required = allowed) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid", "Invalid request");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail("invalid", "Invalid request");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string" || !allowed.includes(key))) {
    fail("invalid", "Invalid request");
  }
  for (const key of required) if (!Object.hasOwn(descriptors, key)) fail("invalid", "Invalid request");
  const result = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) fail("invalid", "Invalid request");
    result[key] = descriptor.value;
  }
  return result;
}

export function readText(value, maximum, { optional = false } = {}) {
  if (optional && value === undefined) return undefined;
  if (
    typeof value !== "string" || value.length === 0 || value.length > maximum ||
    value.trim() === "" || UNSAFE_TEXT.test(value)
  ) fail("invalid", "Invalid request");
  return value;
}

export function readId(value) {
  return readText(value, 128);
}

export function readExpectedVersion(value) {
  const record = readRecord(value, ["generation", "revision"]);
  const generation = readId(record.generation);
  if (!Number.isSafeInteger(record.revision) || record.revision < 0) fail("invalid", "Invalid request");
  return { generation, revision: record.revision };
}

export function clone(value) {
  return structuredClone(value);
}

export function frozenClone(value) {
  return deepFreeze(clone(value));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
