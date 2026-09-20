import { createHash } from "node:crypto";

export const CANONICAL_JSON_DIGEST_ALGORITHM = "canonical-json-sha256/1.0.0";

function canonicalize(value, seen) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON numbers must be finite");
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new TypeError(`Canonical JSON cannot encode ${typeof value}`);
  }
  if (seen.has(value)) {
    throw new TypeError("Canonical JSON cannot encode cyclic data");
  }

  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const entryKeys = Reflect.ownKeys(descriptors).filter((key) => key !== "length");
    const expectedKeys = Array.from({ length: value.length }, (_, index) => String(index));
    if (
      entryKeys.length !== expectedKeys.length ||
      entryKeys.some(
        (key, index) =>
          key !== expectedKeys[index] ||
          descriptors[key].get ||
          descriptors[key].set ||
          !descriptors[key].enumerable,
      )
    ) {
      throw new TypeError("Canonical JSON arrays must be dense enumerable data arrays");
    }
    result = `[${expectedKeys.map((key) => canonicalize(value[key], seen)).join(",")}]`;
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON objects must be plain data objects");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.some(
        (key) =>
          typeof key !== "string" ||
          descriptors[key].get ||
          descriptors[key].set ||
          !descriptors[key].enumerable,
      )
    ) {
      throw new TypeError("Canonical JSON objects must contain enumerable string data fields only");
    }
    result = `{${keys
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`)
      .join(",")}}`;
  }
  seen.delete(value);
  return result;
}

export function canonicalJson(value) {
  return canonicalize(value, new Set());
}

export function canonicalJsonSha256(value) {
  const digest = createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
  return `sha256:${digest}`;
}
