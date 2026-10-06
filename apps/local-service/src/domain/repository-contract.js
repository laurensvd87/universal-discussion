import { fail } from "./errors.js";
import { assertValidPersistedState } from "./persisted-state.js";
import { assertReadableDiscussions, MAX_RESPONSE_BYTES } from "./discussion-view.js";
import { readExpectedVersion } from "./validation.js";

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const encoder = new TextEncoder();
// Catalog also includes a small fixed model, actor and version header. Reserve
// more than those fields so a successful write keeps the whole HTTP read under
// its one-MiB response ceiling without introducing a Source or Topic count cap.
const CATALOG_HEADER_RESERVE_BYTES = 4 * 1024;

export function assertReadableCatalog(state) {
  const linked = new Map(state.sourceLinks.map(({ sourceId, topicId }) => [sourceId, topicId]));
  const projected = {
    topics: state.topics.map(({ id, title, kind, provenance }) => ({ id, title, kind, provenance })),
    sources: state.sources.map(({ id, url, title, provenance }) => ({
      id, url, title, provenance, topicId: linked.get(id) ?? null,
    })),
  };
  if (encoder.encode(JSON.stringify(projected)).byteLength > MAX_RESPONSE_BYTES - CATALOG_HEADER_RESERVE_BYTES) {
    fail("capacity", "Catalog capacity reached");
  }
}

export function serializeSnapshot(state, serialize = JSON.stringify) {
  assertValidPersistedState(state);
  assertReadableCatalog(state);
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
  if (!reset && current.schema === next.schema) {
    for (const root of next.contributions.filter((entry) => entry.rootId === null)) {
      const previous = current.contributions.find((entry) => entry.id === root.id);
      if (previous && (previous.originalTopicId !== root.originalTopicId || previous.learnedOrigin !== root.learnedOrigin)) {
        fail("conflict", "Original publication context changed");
      }
    }
  }
  assertReadableDiscussions(next);
}
