import { canPostHumanDiscussion } from "./discussion-readiness.js";
const sameVersion = (a, b) => Boolean(a && b && a.generation === b.generation && a.revision === b.revision);

// Resolve only a canonical visible chain from the selected discussion or a
// version-matched earlier same-Source read. Related/alternate projections are
// deliberately outside this authority path.
export function resolveDiscussionTarget(state, targetId, binding = null) {
  if (!canPostHumanDiscussion(state) || state.needsFreshRead || typeof targetId !== "string" ||
      !state.topicId || !state.catalog || !state.discussion ||
      state.catalog.version && state.discussion.version &&
        !sameVersion(state.catalog.version, state.discussion.version) ||
      state.sourceId && (() => { const source = state.catalog.sources?.find((item) => item.id === state.sourceId);
        return !source || source.topicId !== undefined && source.topicId !== state.topicId; })()) return null;
  const views = [{ topicId: state.topicId, discussionId: state.discussion.discussionId,
    roots: state.discussion.roots, earlier: false }];
  const prior = state.priorDiscussions;
  if (state.sourceId && prior && sameVersion(prior.version, state.catalog.version) &&
      prior.sourceId === state.sourceId && prior.currentTopicId === state.topicId) {
    for (const view of state.earlierDiscussions ?? []) {
      const priorTopic = prior.topics?.find((topic) => topic.id === view.topicId);
      const catalogTopic = state.catalog.topics?.find((topic) => topic.id === view.topicId);
      if (!priorTopic || !catalogTopic || !state.catalog.version || !state.discussion.version ||
          !sameVersion(state.catalog.version, state.discussion.version) || view.topicId === state.topicId ||
          !sameVersion(view.version, state.catalog.version) ||
          priorTopic.title !== catalogTopic.title || priorTopic.kind !== catalogTopic.kind ||
          view.title !== priorTopic.title || !view.discussionId) continue;
      views.push({ ...view, earlier: true });
    }
  }
  for (const view of views) {
    if (binding && (binding.topicId !== undefined && binding.topicId !== view.topicId ||
        binding.discussionId !== undefined && binding.discussionId !== view.discussionId)) continue;
    for (const root of view.roots ?? []) {
      if (root?.id !== targetId && !(root?.replies ?? []).some((reply) => reply.id === targetId)) continue;
      const target = root.id === targetId ? root : root.replies.find((reply) => reply.id === targetId);
      if (root.state !== "visible" || target?.state !== "visible" ||
          target !== root && target.rootId !== root.id ||
          typeof root.body !== "string" || typeof target.body !== "string" ||
          view.earlier && root.origin?.sourceId !== state.sourceId) return null;
      if (binding && (binding.topicId !== undefined && binding.topicId !== view.topicId ||
          binding.discussionId !== undefined && binding.discussionId !== view.discussionId ||
          binding.rootId !== undefined && binding.rootId !== root.id ||
          binding.rootBody !== undefined && binding.rootBody !== root.body ||
          binding.targetBody !== undefined && binding.targetBody !== target.body)) return null;
      return { topicId: view.topicId, discussionId: view.discussionId, root, target, earlier: view.earlier };
    }
  }
  return null;
}
