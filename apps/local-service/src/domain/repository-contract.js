import { fail } from "./errors.js";
import { assertValidPersistedState } from "./persisted-state.js";
import { assertReadableDiscussions } from "./discussion-view.js";
import { readExpectedVersion } from "./validation.js";

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const encoder = new TextEncoder();

export function serializeSnapshot(state, serialize = JSON.stringify) {
  assertValidPersistedState(state);
  const document = serialize(state);
  if (typeof document !== "string" || encoder.encode(document).byteLength > MAX_DOCUMENT_BYTES) {
    fail("capacity", "Capacity reached");
  }
  return document;
}

export function assertExpected(current, expectedValue) {
  const expected = readExpectedVersion(expectedValue);
  if (current.generation !== expected.generation || current.revision !== expected.revision) {
    fail("conflict", "State changed");
  }
  return expected;
}

export function assertTransition(current, next, reset) {
  if (reset) {
    if (next.generation === current.generation || next.revision !== 0) fail("conflict", "Invalid reset version");
  } else if (
    next.generation !== current.generation || !Number.isSafeInteger(next.revision) ||
    next.revision !== current.revision + 1
  ) {
    fail("conflict", "Invalid successor version");
  }
  assertReadableDiscussions(next);
}
