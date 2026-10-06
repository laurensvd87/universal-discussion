import { fail } from "./errors.js";
import { readId } from "./validation.js";

function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

export function priorDiscussionsView(state, sourceId) {
  sourceId = readId(sourceId);
  const source = state.sources.find((entry) => entry.id === sourceId);
  const link = state.sourceLinks.find((entry) => entry.sourceId === sourceId);
  if (!source || !link || !state.topics.some((entry) => entry.id === link.topicId)) {
    fail("not-found", "Object unavailable");
  }

  const discussionTopics = new Map(state.discussions.map((entry) => [entry.id, entry.topicId]));
  const grouped = new Map();
  for (const root of state.contributions) {
    if (root.rootId !== null || root.withdrawn || root.originSourceId !== sourceId) continue;
    const topicId = discussionTopics.get(root.discussionId);
    if (!topicId || topicId === link.topicId) continue;
    const previous = grouped.get(topicId);
    if (!previous) grouped.set(topicId, { rootCount: 1, newestAt: root.createdAt, newestId: root.id });
    else {
      previous.rootCount++;
      if (compareText(root.createdAt, previous.newestAt) > 0 ||
          (root.createdAt === previous.newestAt && compareText(root.id, previous.newestId) > 0)) {
        previous.newestAt = root.createdAt;
        previous.newestId = root.id;
      }
    }
  }

  const topics = state.topics.filter((entry) => grouped.has(entry.id)).map(({ id, title, kind }) => ({
    id, title, kind, rootCount: grouped.get(id).rootCount,
  })).sort((left, right) => {
    const a = grouped.get(left.id); const b = grouped.get(right.id);
    return compareText(b.newestAt, a.newestAt) || compareText(b.newestId, a.newestId) || compareText(left.id, right.id);
  });
  return {
    version: { generation: state.generation, revision: state.revision },
    sourceId, currentTopicId: link.topicId, topics,
  };
}
