import { Worker } from 'node:worker_threads';
import { types } from 'node:util';
import { ServiceError, fail } from '../domain/errors.js';
import { selectTopicSpaceGroups } from '../domain/topic-space-grouping.js';
import { RIDGE_PARAMETER_SHA256, readRidgeTopicAdapter, createRidgeTopicTransform } from '../domain/ridge-topic-adapter.js';
import { normalizeTopicSpacePolicy } from './topic-space-policy.js';
import { createPostgresPublicReadFlights } from './postgres-public-read-flights.js';

const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const unavailable = () => fail('unavailable', 'Topic groups unavailable');
function request(value) {
  if (!value || typeof value !== 'object' || types.isProxy(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('invalid', 'Invalid topic query');
  const fields = Object.getOwnPropertyDescriptors(value), names = ['sourceId', 'query', 'offset', 'limit'];
  if (Reflect.ownKeys(fields).length !== names.length || names.some(key =>
    !fields[key]?.enumerable || !Object.hasOwn(fields[key], 'value'))) fail('invalid', 'Invalid topic query');
  const result = Object.fromEntries(names.map(key => [key, fields[key].value]));
  if (result.sourceId !== null && (typeof result.sourceId !== 'string' || !ID.test(result.sourceId)) ||
      typeof result.query !== 'string' || result.query.length > 256 ||
      /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(result.query) ||
      !Number.isSafeInteger(result.offset) || result.offset < 0 || result.offset > 20480 || result.limit !== 20)
    fail('invalid', 'Invalid topic query');
  return result;
}
const sameStamp = (a, b) => a && b && a.version.generation === b.version.generation && a.fingerprint === b.fingerprint;
const samePolicy = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function freezePublic(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezePublic(child);
    Object.freeze(value);
  }
  return value;
}
const safeText = (value, max, fallback = '') => typeof value === 'string'
  ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '').trim().slice(0, max) || fallback : fallback;

/** Derived public discovery only: never used as canonical write/AI authority. */
export function createTopicSpaceDiscovery({ reads, policyStore, topicAdapter = null, buildHierarchy = null } = {}) {
  if (!reads || ['topicSpaceStamp', 'topicSpaceInputs', 'topicSpaceCards', 'topicSpaceSource'].some(name => typeof reads[name] !== 'function') ||
      !policyStore || typeof policyStore.read !== 'function' || typeof policyStore.update !== 'function' ||
      buildHierarchy !== null && typeof buildHierarchy !== 'function') throw new TypeError('Invalid topic discovery dependencies');
  const flights = createPostgresPublicReadFlights({ maxTasks: 8, maxWaiters: 4096 });
  // Trusted startup supplies the installed pinned model. Null is solely the
  // already-represented synthetic component seam, never a production fallback.
  const adapter = topicAdapter === null ? null : readRidgeTopicAdapter(topicAdapter, { expectedParameterSha256: RIDGE_PARAMETER_SHA256 });
  const transform = adapter === null ? null : createRidgeTopicTransform(adapter);
  let closed = false, closing = null, current = null, building = null, capacityStamp = null, failedUntil = 0;
  let worker = null, cancelWorker = null;
  function build(entries, options) {
    if (buildHierarchy) return buildHierarchy(entries.map(entry => ({ ...entry,
      vector: entry.vector && transform ? Array.from(transform(entry.vector)) : entry.vector })), options);
    return new Promise((resolve, reject) => {
      let done = false;
      const task = new Worker(new URL('./topic-space-build-worker.js', import.meta.url), {
        workerData: { entries, generation: options.generation, topicAdapter: adapter },
        resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
      });
      worker = task;
      async function finish(error, hierarchy) {
        if (done) return;
        done = true; clearTimeout(timer);
        // Await exit, including on success, before admitting another build.
        try { await task.terminate(); } catch { /* already exited */ }
        if (worker === task) { worker = null; cancelWorker = null; }
        if (error) reject(error); else resolve(hierarchy);
      }
      const timer = setTimeout(() => finish(Object.assign(new Error('Topic grouping capacity reached'), { code: 'TOPIC_SPACE_CAPACITY' })), 8000);
      cancelWorker = () => finish(new ServiceError('unavailable', 'Topic groups unavailable'));
      task.once('message', result => {
        if (!result || result.ok !== true || !result.hierarchy) {
          finish(Object.assign(new Error('Topic grouping failed'), { code: result?.capacity ? 'TOPIC_SPACE_CAPACITY' : 'unavailable' }));
        } else finish(null, result.hierarchy);
      });
      task.once('error', error => finish(error));
      task.once('exit', () => { if (!done) finish(new ServiceError('unavailable', 'Topic groups unavailable')); });
    });
  }
  function refresh() {
    if (closed) return Promise.resolve();
    if (building) return building;
    if (Date.now() < failedUntil) return Promise.resolve();
    building = (async () => {
      let inputs;
      try {
        inputs = await reads.topicSpaceInputs();
        if (closed) return;
        const hierarchy = await build(inputs.entries, { generation: inputs.version.generation });
        if (closed) return;
        // Validate even injected/serialized worker output before retaining it.
        selectTopicSpaceGroups(hierarchy, { policy: policyStore.read().policy, limit: 0 });
        const stamp = await reads.topicSpaceStamp();
        if (!closed && sameStamp(inputs, stamp)) { current = { ...stamp, hierarchy }; capacityStamp = null; }
      } catch (error) {
        if (closed) return;
        if (inputs && ['capacity', 'TOPIC_SPACE_CAPACITY'].includes(error?.code)) capacityStamp = inputs;
        else failedUntil = Date.now() + 5000;
      }
    })().finally(() => { building = null; });
    return building;
  }
  function shell(version, policy, state) {
    return freezePublic({ schema: 'topic-spaces/v1', version, policy, state, total: 0, groups: [] });
  }
  async function queryPublic(input) {
    if (closed) unavailable();
    const policy = policyStore.read().policy;
    let stamp;
    try { stamp = await reads.topicSpaceStamp(); }
    catch (error) {
      if (error?.code !== 'capacity' || typeof reads.header !== 'function') throw error;
      return shell((await reads.header()).version, policy, 'capacity');
    }
    if (closed) unavailable();
    if (!sameStamp(current, stamp)) {
      if (!sameStamp(capacityStamp, stamp)) void refresh();
      return shell(stamp.version, policy, sameStamp(capacityStamp, stamp) ? 'capacity' : 'building');
    }
    const model = current;
    const source = input.sourceId === null ? null : await reads.topicSpaceSource(input.sourceId);
    if (source && source.version.generation !== stamp.version.generation) fail('conflict', 'Topic groups changed');
    // A Source without an existing authoritative vector has no contextual hit.
    const selected = source && source.vector === null ? { total: 0, groups: [] } :
      selectTopicSpaceGroups(model.hierarchy, { policy, vector: source?.vector && transform ? Array.from(transform(source.vector)) : source?.vector ?? null,
        query: input.query, offset: input.offset, limit: input.limit });
    const rootIds = selected.groups.flatMap(group => group.rootIds.slice(0, 3));
    const hydrated = await reads.topicSpaceCards(rootIds);
    const cards = new Map(hydrated.cards.map(card => [card.rootId, card]));
    if (cards.size !== rootIds.length || rootIds.some(id => !cards.has(id))) fail('conflict', 'Topic groups changed');
    const finalStamp = await reads.topicSpaceStamp();
    const finalSource = source && await reads.topicSpaceSource(input.sourceId);
    if (closed || !sameStamp(model, finalStamp) || hydrated.version.generation !== finalStamp.version.generation ||
        !samePolicy(policy, policyStore.read().policy) || source && (source.stamp !== finalSource.stamp ||
          finalSource.version.generation !== finalStamp.version.generation)) fail('conflict', 'Topic groups changed');
    const groups = selected.groups.map(group => ({
      id: group.id, parentId: group.parentId, policyTopicId: group.policyTopicId,
      title: safeText(group.title, 200, 'Discussion'), specificity: group.specificity,
      threadCount: group.rootIds.length, humanCount: group.humanCount, aiCount: group.aiCount, score: group.score,
      threads: group.rootIds.slice(0, 3).map(id => {
        const card = cards.get(id), timestamp = Date.parse(card.updatedAt);
        return { rootId: card.rootId, topicId: card.topicId, discussionId: card.discussionId, sourceId: card.sourceId,
          title: safeText(card.title, 200, 'Discussion'), snippet: safeText(card.snippet, 600), url: card.url,
          humanCount: card.humanCount, aiCount: card.aiCount,
          updatedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null };
      }),
    }));
    return freezePublic({ ...shell(finalStamp.version, policy, 'ready'), total: selected.total, groups });
  }
  function owner(actorId = null) {
    if (closed) unavailable();
    const state = policyStore.read();
    return { policy: state.policy, canManage: state.ownerAccountId !== null && actorId === `account-${state.ownerAccountId}` };
  }
  return Object.freeze({ start: refresh, owner,
    query(body, { signal, isCurrent = () => true } = {}) {
      const input = request(body);
      return flights('topic-spaces', input, queryPublic, { signal, isCurrent: () => !closed && isCurrent() === true });
    },
    async updatePolicy(body, actorId, { isCurrent = () => true } = {}) {
      const before = policyStore.read();
      if (closed || before.ownerAccountId === null || actorId !== `account-${before.ownerAccountId}` || isCurrent() !== true)
        fail('forbidden', 'Owner required');
      // Reuse the strict store parser without mutating or invoking caller getters.
      if (!body || typeof body !== 'object' || types.isProxy(body)) fail('invalid', 'Invalid policy');
      const fields = Object.getOwnPropertyDescriptors(body), names = ['expectedRevision', 'defaultSpecificity', 'topicOverrides'];
      if (Reflect.ownKeys(fields).length !== 3 || names.some(name => !fields[name]?.enumerable || !Object.hasOwn(fields[name], 'value')))
        fail('invalid', 'Invalid policy');
      if (fields.expectedRevision.value !== before.policy.revision) fail('conflict', 'Policy changed');
      const next = normalizeTopicSpacePolicy({ schema: 'topic-space-policy/v1', revision: before.policy.revision,
        defaultSpecificity: fields.defaultSpecificity.value, topicOverrides: fields.topicOverrides.value });
      const stamp = await reads.topicSpaceStamp();
      if (!sameStamp(current, stamp)) { void refresh(); fail('conflict', 'Topic groups building'); }
      const baseIds = new Set(current.hierarchy.nodes.filter(node => node.level === 0).map(node => node.id));
      const oldOverrides = new Map(before.policy.topicOverrides.map(item => [item.spaceId, item]));
      if (next.topicOverrides.some(item => !baseIds.has(item.spaceId) &&
          JSON.stringify(item) !== JSON.stringify(oldOverrides.get(item.spaceId)))) fail('invalid', 'Unknown topic group');
      const policy = policyStore.update({ expectedRevision: before.policy.revision,
        defaultSpecificity: next.defaultSpecificity, topicOverrides: next.topicOverrides.filter(item => baseIds.has(item.spaceId)) }, () => {
        if (closed || isCurrent() !== true) return false;
        const fresh = policyStore.read();
        return fresh.ownerAccountId === before.ownerAccountId && samePolicy(fresh.policy, before.policy);
      });
      return { policy, canManage: true };
    },
    close() {
      if (closing) return closing;
      closed = true; current = null;
      closing = (async () => { await cancelWorker?.(); await building; })();
      return closing;
    },
  });
}
