import { createHash } from 'node:crypto';
import { types } from 'node:util';

function plain(value) {
  if (!value || typeof value !== 'object' || types.isProxy(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('Invalid matching input');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value') ||
        typeof descriptor.value === 'function') throw new TypeError('Invalid matching input');
  }
}

function embeddingBytes(embedding) {
  if (embedding === null) return 'null';
  plain(embedding);
  if (Object.keys(embedding).sort().join(',') !== 'modelId,values' || typeof embedding.modelId !== 'string') throw new TypeError('Invalid matching input');
  const values = embedding.values;
  dense(values);
  const encoded = [];
  for (let index = 0; index < values.length; index++) {
    const value = Object.getOwnPropertyDescriptor(values, index).value;
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('Invalid matching input');
    encoded.push(Object.is(value, -0) ? '-0' : JSON.stringify(value));
  }
  return `{"modelId":${JSON.stringify(embedding.modelId)},"values":[${encoded.join(',')}]}`;
}

function dense(values) {
  if (!Array.isArray(values) || types.isProxy(values) || Object.getPrototypeOf(values) !== Array.prototype ||
      Reflect.ownKeys(values).length !== values.length + 1) throw new TypeError('Invalid matching input');
  for (let index = 0; index < values.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(values, index);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError('Invalid matching input');
  }
}

// Stream only public matching inputs into content-free identities. The optional
// embedding text lets normalized storage hash vectors without decoding/copying
// them. Receipts, posts, actors and canonical revisions are never inputs.
export function createMatchingInputHasher() {
  const grouping = createHash('sha256'), pins = createHash('sha256'), routing = createHash('sha256');
  const add = (hash, value) => { const text = JSON.stringify(value); hash.update(`${Buffer.byteLength(text)}:`); hash.update(text); };
  return {
    source(source, embeddingText) {
      plain(source);
      if (embeddingText === undefined) embeddingText = embeddingBytes(source.embedding);
      add(grouping, ['source', source.id, source.url, source.title, source.provenance,
        source.extractorVersion ?? null, source.policyVersion ?? null, embeddingText ?? null]);
    },
    link(link) {
      plain(link);
      add(grouping, ['link', link.sourceId, link.method]);
      if (link.method === 'manual-confirmed') add(pins, [link.sourceId, link.topicId]);
      add(routing, [link.sourceId, link.topicId]);
    },
    finish() {
      const identity = grouping.digest('hex');
      return { grouping: identity, ranking: createHash('sha256').update(identity).update(pins.digest('hex')).digest('hex'),
        routing: routing.digest('hex') };
    },
  };
}

export function matchingInputIdentity(state) {
  plain(state);
  if (!Array.isArray(state?.sources) || !Array.isArray(state?.sourceLinks)) throw new TypeError('Invalid matching snapshot');
  dense(state.sources); dense(state.sourceLinks);
  const hasher = createMatchingInputHasher();
  for (const source of state.sources) {
    plain(source);
    if (['id', 'url', 'title', 'provenance'].some(key => typeof source[key] !== 'string')) throw new TypeError('Invalid matching input');
    if (['extractorVersion', 'policyVersion'].some(key => source[key] !== undefined && typeof source[key] !== 'string')) throw new TypeError('Invalid matching input');
  }
  for (const link of state.sourceLinks) {
    plain(link);
    if (typeof link.sourceId !== 'string' || typeof link.method !== 'string' ||
        link.topicId !== undefined && typeof link.topicId !== 'string') throw new TypeError('Invalid matching input');
  }
  // Canonical IDs are unique; sorting makes ordinary insertion order immaterial.
  for (const source of [...state.sources].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) hasher.source(source);
  for (const link of [...state.sourceLinks].sort((a, b) => a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0)) hasher.link(link);
  return hasher.finish();
}

// One mathematical partition per exact matching input, not canonical revision.
// Current posts, routing, permissions and response versions are projected later.
export function createSnapshotTopicPlanner(plan, inputIdentity = null) {
  if (typeof plan !== 'function') throw new TypeError('Invalid Topic planner');
  if (inputIdentity !== null && typeof inputIdentity !== 'function') throw new TypeError('Invalid matching identity');
  let cached = null;
  return state => {
    if (!state || typeof state.generation !== 'string' || !state.generation ||
        !Number.isSafeInteger(state.revision) || state.revision < 0) throw new TypeError('Invalid Topic snapshot');
    if (state.limits !== undefined) {
      plain(state.limits);
      if (Object.keys(state.limits).some(key => !['maxWorkUnits', 'maxCachedPairs', 'workBudgetMs', 'maxEdgeBytes'].includes(key) ||
          typeof state.limits[key] !== 'number' || !Number.isFinite(state.limits[key]))) throw new TypeError('Invalid matching limits');
    }
    const input = inputIdentity !== null ? inputIdentity(state) : Array.isArray(state.sources) && Array.isArray(state.sourceLinks)
      ? matchingInputIdentity(state).grouping : `revision:${state.revision}`;
    const key = JSON.stringify([state.generation, input, state.limits ?? null]);
    if (cached?.key === key) return cached.result;
    // Failure leaves no result for these inputs; never serve another partition.
    const result = plan(state);
    cached = { key, result };
    return result;
  };
}
