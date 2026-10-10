import { assertValidPersistedState } from './persisted-state.js';
import { LEARNED_SOURCE_PROVENANCE } from './learned-sources.js';
import { compareTopicPartitions } from './topic-partition-comparison.js';
import { discussionView, MAX_RESPONSE_BYTES } from './discussion-view.js';
import { readExpectedVersion } from './validation.js';
import { fail } from './errors.js';

const encoded = new TextEncoder();
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

// Synthetic-only projection. No candidate policy/model runs here. Preview IDs
// are display-only and never authoritative without a canonical Topic lookup.
export function projectExperimentalTopics(state, candidatePartitions, expectedVersion) {
  assertValidPersistedState(state);
  const expected = readExpectedVersion(expectedVersion);
  if (expected.generation !== state.generation || expected.revision !== state.revision) {
    fail('conflict', 'State changed');
  }
  const eligibleLinks = state.sourceLinks.filter((link) => link.method === 'learned-provisional' &&
    state.sources.some((source) => source.id === link.sourceId && source.provenance === LEARNED_SOURCE_PROVENANCE));
  const eligible = new Set(eligibleLinks.map((link) => link.sourceId));
  const currentByTopic = new Map();
  for (const link of eligibleLinks) {
    if (!currentByTopic.has(link.topicId)) currentByTopic.set(link.topicId, []);
    currentByTopic.get(link.topicId).push(link.sourceId);
  }
  const comparison = compareTopicPartitions({
    sourceIds: [...eligible],
    currentPartitions: [...currentByTopic].map(([topicId, sourceIds]) => ({ topicId, sourceIds })),
    candidatePartitions,
    sourceRoots: state.contributions.filter((root) => root.rootId === null && root.anchor.kind === 'source' &&
      eligible.has(root.anchor.sourceId)).map((root) => ({ rootId: root.id, sourceId: root.anchor.sourceId })),
  });
  const roots = state.contributions.filter((entry) => entry.rootId === null);
  // Reuse the canonical renderer: it already handles withdrawn roots/replies,
  // source links, provenance labels and ordering. No alternate post body path.
  const rendered = new Map(state.topics.flatMap((topic) => discussionView(state, topic.id).roots
    .map((root) => [root.id, root])));
  const discussionByTopic = new Map(state.discussions.map((entry) => [entry.topicId, entry.id]));
  const groups = comparison.candidateGroups.map((group) => {
    const members = new Set(group.sourceIds);
    const groupedRoots = roots.filter((root) => root.anchor.kind === 'source' && members.has(root.anchor.sourceId) &&
      rendered.has(root.id)).sort((a, b) => compare(b.createdAt, a.createdAt) || compare(b.id, a.id));
    return { previewId: group.previewId, sourceIds: group.sourceIds,
      createRootTargets: group.sourceIds.map((sourceId) => {
        const topicId = eligibleLinks.find((link) => link.sourceId === sourceId).topicId;
        return { sourceId, topicId, discussionId: discussionByTopic.get(topicId) };
      }),
      roots: groupedRoots.map((root) => ({
        ...rendered.get(root.id),
        // The canonical discussion remains the only valid write target for replies.
        canonicalDiscussionId: root.discussionId,
      })) };
  });
  const projectedRoots = new Set(groups.flatMap((group) => group.roots.map((root) => root.id)));
  const { candidateGroups, ...summary } = comparison;
  const result = {
    stateVersion: { generation: state.generation, revision: state.revision },
    groups,
    pinnedRootIds: roots.filter((root) => rendered.has(root.id) && !projectedRoots.has(root.id)).map((root) => root.id),
    ...summary,
  };
  if (encoded.encode(JSON.stringify(result)).byteLength > MAX_RESPONSE_BYTES) {
    fail('capacity', 'Discussion capacity reached');
  }
  return result;
}
