import { types } from "node:util";
import { fail } from "./errors.js";

export const REFERENCE_TOPIC_POLICY_VERSION = "ridge1-fixed-reference-radius/v1";
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const invalid = () => fail("invalid", "Invalid reference Topic membership plan");

function readValues(values) {
  if (!values || types.isProxy(values) ||
      !(Array.isArray(values) || values instanceof Float64Array) ||
      ![Array.prototype, Float64Array.prototype].includes(Object.getPrototypeOf(values)) ||
      values.length !== 384 || Reflect.ownKeys(values).length !== (Array.isArray(values) ? 385 : 384)) invalid();
  const copy = [];
  for (let axis = 0; axis < 384; axis++) {
    const descriptor = Object.getOwnPropertyDescriptor(values, String(axis));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") ||
        !Number.isFinite(descriptor.value)) invalid();
    copy.push(descriptor.value);
  }
  if (Math.abs(Math.hypot(...copy) - 1) > 1e-6) invalid();
  return Object.freeze(copy);
}

// Pure planning seam, not a command or a write-authority DTO. Inputs are already
// qualified, represented Ridge1 coordinates; index IDs name existing references.
// The caller must persist and version-check the complete plan atomically before
// publishing a new reference. Losing a plan never changes the index or storage.
export function planReferenceTopicMembership(input, { index, nextTopicId }) {
  if (!input || types.isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype) invalid();
  const fields = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(fields).length !== 2 ||
      !["sourceId", "representedValues"].every(key => fields[key]?.enumerable && Object.hasOwn(fields[key], "value")) ||
      typeof fields.sourceId.value !== "string" || !ID.test(fields.sourceId.value) ||
      typeof index?.query !== "function" || typeof nextTopicId !== "function") invalid();
  const represented = readValues(fields.representedValues.value);
  const result = index.query(represented);
  if (result?.complete !== true) fail("unavailable", "Reference Topic search incomplete");
  if (!Array.isArray(result.ids) || types.isProxy(result.ids) ||
      Reflect.ownKeys(result.ids).length !== result.ids.length + 1) invalid();
  const topicIds = [], seen = new Set();
  for (let position = 0; position < result.ids.length; position++) {
    const field = Object.getOwnPropertyDescriptor(result.ids, String(position));
    if (!field?.enumerable || !Object.hasOwn(field, "value") ||
        typeof field.value !== "string" || !ID.test(field.value) || seen.has(field.value)) invalid();
    seen.add(field.value); topicIds.push(field.value);
  }
  topicIds.sort();
  let newReference = null;
  if (topicIds.length === 0) {
    const topicId = nextTopicId();
    if (typeof topicId !== "string" || !ID.test(topicId)) invalid();
    topicIds.push(topicId);
    newReference = Object.freeze({ topicId, referenceSourceId: fields.sourceId.value,
      representedValues: represented });
  }
  return Object.freeze({ policyVersion: REFERENCE_TOPIC_POLICY_VERSION,
    sourceId: fields.sourceId.value, topicIds: Object.freeze(topicIds), newReference });
}
