import { STATE_SCHEMA } from "./demo-state.js";
import { assertValidLegacyPersistedState, assertValidPersistedState } from "./persisted-state.js";
import { clone } from "./validation.js";

// Validate before adding fields; corrupt/unknown old shapes cannot be repaired
// by migration. No source lineage is guessed from text or current membership.
export function migrateLegacyState(state) {
  assertValidLegacyPersistedState(state);
  const next = clone(state);
  next.schema = STATE_SCHEMA;
  next.revision += 1;
  for (const topic of next.topics) if (topic.provenance === "owner-local-learned-topic/v1") topic.retainTight = false;
  for (const root of next.contributions.filter((entry) => entry.rootId === null)) {
    const topicId = next.discussions.find((entry) => entry.id === root.discussionId).topicId;
    Object.assign(root, { anchor: { kind: "topic", topicId }, originalTopicId: topicId, learnedOrigin: false });
  }
  return assertValidPersistedState(next);
}
