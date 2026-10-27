import { canPostHumanDiscussion } from "./discussion-readiness.js";
import { readSemanticTarget } from "./local-service-contract.js";
const sameVersion = (a, b) => Boolean(a && b && a.generation === b.generation && a.revision === b.revision);

// Display only: the controller's separate private binding authorizes delivery.
// This projection never adds the selected root to the foreground page's graph.
export function resolveSemanticTarget(state, targetId=state?.draft?.targetId, binding=null) {
  if(!canPostHumanDiscussion(state) || state.needsFreshRead || state.error || !state.draft?.semantic ||
    state.draft.mode!=='reply' || state.draft.detached || targetId!==state.draft.targetId || typeof targetId!=='string')return null;
  let value;
  try {value=readSemanticTarget(state.semanticSelection);}catch{return null;}
  if(value.targetId!==targetId || value.version.generation!==state.catalog?.version?.generation)return null;
  const target=value.targetId===value.root.id?value.root:value.root.replies[0];
  const projected={nodeId:value.nodeId,topicId:value.topic.id,topic:value.topic,discussionId:value.discussionId,
    root:value.root,target,actors:value.actors,rootRevision:value.rootRevision,targetRevision:value.targetRevision,semantic:true};
  if(binding && (['nodeId','topicId','discussionId','rootRevision','targetRevision'].some(key=>binding[key]!==undefined&&binding[key]!==projected[key]) ||
    binding.rootId!==undefined&&binding.rootId!==value.root.id || binding.targetId!==undefined&&binding.targetId!==target.id ||
    binding.rootBody!==undefined&&binding.rootBody!==value.root.body || binding.targetBody!==undefined&&binding.targetBody!==target.body))return null;
  return projected;
}

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
