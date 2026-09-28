import { fail } from "./errors.js";

export const MAX_RESPONSE_BYTES = 1_048_576;
const encoder = new TextEncoder();

export function discussionView(state, topicId) {
  const topic = state.topics.find((entry) => entry.id === topicId);
  const discussion = state.discussions.find((entry) => entry.topicId === topicId);
  if (!topic || !discussion) fail("not-found", "Object unavailable");
  const contributions = state.contributions.filter((entry) => entry.discussionId === discussion.id);
  const roots = contributions.filter((entry) => entry.rootId === null).sort(newestFirst).map((root) => ({
    ...projectContribution(root),
    replies: contributions.filter((entry) => entry.rootId === root.id).sort(oldestFirst).map(projectContribution),
  }));
  return {
    version: { generation: state.generation, revision: state.revision },
    topic: { id: topic.id, title: topic.title, kind: topic.kind },
    discussionId: discussion.id,
    roots,
  };
}

export function assertReadableDiscussions(state) {
  // Until pagination is implemented, reject growth before committing a state
  // whose discussion cannot be read within the API's existing response budget.
  for (const topic of state.topics) {
    if (encoder.encode(JSON.stringify(discussionView(state, topic.id))).byteLength > MAX_RESPONSE_BYTES) {
      fail("capacity", "Discussion capacity reached");
    }
  }
}

function projectContribution(entry) {
  if (entry.withdrawn) return { id: entry.id, rootId: entry.rootId, replyToId: entry.replyToId, state: "deleted", label: "Deleted" };
  return {
    id: entry.id, rootId: entry.rootId, replyToId: entry.replyToId,
    state: "visible", authorId: entry.authorId, actorType: entry.actorType,
    body: entry.revisions.at(-1).body, createdAt: entry.createdAt, edited: entry.revisions.length > 1,
  };
}

function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function newestFirst(left, right) {
  return compareText(right.createdAt, left.createdAt) || compareText(right.id, left.id);
}
function oldestFirst(left, right) {
  return compareText(left.createdAt, right.createdAt) || compareText(left.id, right.id);
}
