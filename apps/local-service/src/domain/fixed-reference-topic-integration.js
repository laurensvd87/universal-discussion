import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { clone, readId } from './validation.js';
import { fail } from './errors.js';
import { qualifyRetainedTopicContext } from './guarded-body-topic-planner.js';
import { checkedUnit } from './ridge-topic-planner.js';
import { RIDGE_PARAMETER_SHA256, readRidgeTopicAdapter, createRidgeTopicTransform } from './ridge-topic-adapter.js';
import { createTopicRadiusIndex } from './topic-radius-index.js';
import { planReferenceTopicMembership, REFERENCE_TOPIC_POLICY_VERSION } from './reference-topic-membership.js';
import { sourceStamp, pinSourceRoots } from './source-threads.js';

const LEARNED = 'owner-local-page-embedding/v1', TOPIC = 'owner-local-learned-topic/v1';
export const FIXED_REFERENCE_SCHEMA = 'demo-state/v4';

export function createInstalledFixedReferenceMatcher(artifact) {
  const adapter = readRidgeTopicAdapter(artifact, { expectedParameterSha256: RIDGE_PARAMETER_SHA256 });
  return createFixedReferenceMatcher({ transform: createRidgeTopicTransform(adapter) });
}

// Trusted dependency seam for offline numeric fixtures. Production construction
// above verifies the pinned artifact; no request can choose a transform or index.
export function createFixedReferenceMatcher({ transform, parameterSha256 = RIDGE_PARAMETER_SHA256, indexOptions = {} }) {
  if (typeof transform !== 'function' || parameterSha256 !== RIDGE_PARAMETER_SHA256 ||
      indexOptions.floor !== undefined && indexOptions.floor !== 0.8639003810829322) throw new TypeError('Invalid reference matcher');
  let generation, index = null, inventory = new Map();
  const reset = () => { index = null; inventory.clear(); };
  const represent = source => qualifyRetainedTopicContext({ url: source.url, title: source.title }) === null
    ? Array.from(checkedUnit(transform(source.embedding.values))) : null;
  return Object.freeze({ represent,
    plan(state, source, nextTopicId) {
      const deadline = performance.now() + 10000;
      const current = () => { if (performance.now() >= deadline) fail('capacity', 'Reference matching work budget reached'); };
      try {
        if (state.generation !== generation) { reset(); generation = state.generation; }
        index ??= createTopicRadiusIndex(indexOptions);
        const refs = new Map();
        const sourceIds = new Set(state.sources.map(item => item.id));
        for (const topic of state.topics) {
          current(); const reference = topic.reference;
          if (reference === undefined || reference === null) continue;
          if (reference.parameterSha256 !== parameterSha256 || !sourceIds.has(reference.sourceId))
            fail('unavailable', 'Reference model unavailable');
          const identity = createHash('sha256').update(JSON.stringify(reference)).digest('hex');
          refs.set(topic.id, identity);
          if (inventory.get(topic.id) !== identity) {
            if (inventory.has(topic.id)) index.update({ id: topic.id, values: reference.values });
            else index.insert({ id: topic.id, values: reference.values });
          }
        }
        for (const id of inventory.keys()) if (!refs.has(id)) { current(); index.delete(id); }
        inventory = refs; current();
        const representedValues = represent(source); current();
        if (representedValues === null) {
          const topicId = readId(nextTopicId());
          return { policyVersion: REFERENCE_TOPIC_POLICY_VERSION, topicIds: [topicId], newTopicId: topicId, reference: null };
        }
        const result = planReferenceTopicMembership({ sourceId: source.id, representedValues }, { index, nextTopicId });
        current();
        return { policyVersion: result.policyVersion, topicIds: [...result.topicIds],
          newTopicId: result.newReference?.topicId ?? null,
          reference: result.newReference ? { sourceId: source.id, values: [...result.newReference.representedValues], parameterSha256 } : null };
      } catch (error) { reset(); throw error; }
    },
  });
}

function fresh(state, nextId, kind) {
  const id = readId(nextId(kind));
  if ([...state.sources, ...state.topics, ...state.discussions, ...state.contributions].some(item => item.id === id)) fail('conflict', 'Identifier collision');
  return id;
}

export function applyFixedReferenceIngest(state, input, operationDigest, dependencies) {
  const next = clone(state);
  let source = next.sources.find(item => item.url === input.url);
  if (source && source.provenance !== LEARNED) fail('forbidden', 'Source unavailable for ingestion');
  const prior = source, link = source && next.sourceLinks.find(item => item.sourceId === source.id);
  if (source && !link) fail('invalid', 'Source destination unavailable');
  const identical = source && source.title === input.title && sourceStamp(source) === sourceStamp(input);
  if (source && !identical) pinSourceRoots(next, source.id);
  if (!source) {
    source = { id: fresh(next, dependencies.nextId, 'source'), url: input.url, provenance: LEARNED };
    next.sources.push(source);
  }
  Object.assign(source, { title: input.title, embedding: input.embedding, extractorVersion: input.extractorVersion,
    operationId: input.operationId, operationDigest,
    policyVersion: prior && (identical || link?.method === 'manual-confirmed') ? source.policyVersion : REFERENCE_TOPIC_POLICY_VERSION });
  if (!identical && link?.method !== 'manual-confirmed' || !prior) {
    if (!dependencies.referenceMatcher) fail('unavailable', 'Reference model unavailable');
    const plan = dependencies.referenceMatcher.plan(next, source, () => fresh(next, dependencies.nextId, 'topic'));
    if (plan.policyVersion !== REFERENCE_TOPIC_POLICY_VERSION || !Array.isArray(plan.topicIds) || !plan.topicIds.length)
      fail('invalid', 'Invalid reference Topic plan');
    if (plan.newTopicId !== null) {
      const topicId = readId(plan.newTopicId);
      next.topics.push({ id: topicId, kind: 'general', title: source.title, createdAt: dependencies.now(), provenance: TOPIC,
        retainTight: false, reference: plan.reference });
      next.discussions.push({ id: fresh(next, dependencies.nextId, 'discussion'), topicId });
    }
    source.topicIds = [...new Set(plan.topicIds.map(readId))].sort();
    if (source.topicIds.length !== plan.topicIds.length || source.topicIds.some(id => !next.topics.some(topic => topic.id === id))) fail('invalid', 'Invalid reference Topic plan');
    const primary = link && source.topicIds.includes(link.topicId) ? link.topicId : source.topicIds[0];
    if (link) link.topicId = primary;
    else next.sourceLinks.push({ sourceId: source.id, topicId: primary, method: 'learned-provisional' });
  }
  next.revision++;
  const primary = next.sourceLinks.find(item => item.sourceId === source.id);
  return { state: next, result: { sourceId: source.id, topicId: primary.topicId, topicIds: [...source.topicIds],
    assignment: primary.method === 'manual-confirmed' ? 'confirmed' : 'provisional', policyVersion: source.policyVersion } };
}
