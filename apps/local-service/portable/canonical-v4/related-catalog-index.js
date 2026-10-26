import { types } from 'node:util';
import { setImmediate as yieldWork } from 'node:timers/promises';
import { ServiceError } from '../../src/domain/errors.js';
import { BROWSER_MODEL_ID, compatibleExtractor } from '../../src/domain/learned-sources.js';
import { createRelatedSourcesPreparation, prepareRelatedSource } from '../../../../spikes/topic-resolution/browser/core/related-sources.js';

const MAX_SOURCES = 131072, MAX_CHUNKS = 512, CHUNK_SIZE = 256;
const MAX_UNITS = 32 * 1024 * 1024, MAX_AGE = 1_000_000_000n;
const MAX_LIFETIME = 300000;
const states = new WeakMap();
const preparedEntries = new WeakMap();
// Reuse only a fully frozen, descriptor-checked evidence input. Mutable callers
// are always revalidated, including between changes() and build().
const evidenceCopies = new WeakMap();
const unsafe = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
function invalid() { throw new TypeError('Invalid Related catalog index input'); }
function capacity() { throw new ServiceError('capacity', 'Related catalog capacity reached'); }
function record(value, names, optional = []) {
  if (!value || typeof value !== 'object' || types.isProxy(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !names.includes(key))) invalid();
  const result = Object.create(null);
  for (const name of names) {
    const descriptor = descriptors[name];
    if (!descriptor && optional.includes(name)) { result[name] = null; continue; }
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
    result[name] = descriptor.value;
  }
  return result;
}
function array(value, maximum) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const length = Object.getOwnPropertyDescriptor(value, 'length').value;
  if (length > maximum) capacity();
  if (Reflect.ownKeys(value).length !== length + 1) invalid();
  const result = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
    result.push(descriptor.value);
  }
  return result;
}
function text(value, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || unsafe.test(value)) invalid();
  return value;
}
function integer(value) {
  if (!Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}
function decimal(value, signed = false) {
  if (typeof value !== 'string' || !(signed ? /^-?(?:0|[1-9]\d{0,19})$/u : /^(?:0|[1-9]\d{0,19})$/u).test(value)) invalid();
  const result = BigInt(value);
  if (result > 18446744073709551615n || result < -18446744073709551615n) invalid();
  return result;
}
function evidence(value) {
  const retained = evidenceCopies.get(value);
  if (retained) return retained;
  const input = record(value, ['generation', 'serverIdentity', 'relations', 'horizon', 'validatedAt', 'witnesses']);
  const generation = text(input.generation, 128), serverIdentity = text(input.serverIdentity, 512), relations = text(input.relations, 8192);
  const horizon = decimal(input.horizon);
  if (typeof input.validatedAt !== 'number' || !Number.isFinite(input.validatedAt) || input.validatedAt < 0) invalid();
  let agesSafe = true, frozenWitnesses = true;
  const ids = new Set(), ordinals = new Set();
  const witnesses = array(input.witnesses, MAX_SOURCES).map(raw => {
    const row = record(raw, ['id', 'stamp', 'ordinal', 'minAge', 'maxAge']);
    frozenWitnesses &&= Object.isFrozen(raw);
    const id = text(row.id, 128), ordinal = integer(row.ordinal);
    if (typeof row.stamp !== 'string' || !/^[a-f0-9]{64}$/u.test(row.stamp) || ids.has(id) || ordinals.has(ordinal)) invalid();
    const minAge = decimal(row.minAge, true), maxAge = decimal(row.maxAge, true);
    if (minAge > maxAge) invalid();
    if (minAge <= 0n || maxAge >= MAX_AGE) agesSafe = false;
    ids.add(id); ordinals.add(ordinal);
    return Object.freeze({ id, stamp: row.stamp, ordinal });
  }).sort((a, b) => a.ordinal - b.ordinal || compare(a.id, b.id));
  const result = { generation, serverIdentity, relations, horizon, validatedAt: input.validatedAt,
    agesSafe, witnesses, byId: new Map(witnesses.map(row => [row.id, row])) };
  if (Object.isFrozen(value) && Object.isFrozen(input.witnesses) && frozenWitnesses) evidenceCopies.set(value, result);
  return result;
}
function previousState(previous) {
  if (previous === null) return null;
  const state = states.get(previous);
  if (!state) invalid();
  return state;
}
function reusable(previous, next) {
  return previous !== null && previous.reusable && next.agesSafe &&
    previous.baseline.generation === next.generation && previous.baseline.serverIdentity === next.serverIdentity &&
    previous.baseline.relations === next.relations && next.validatedAt >= previous.baseline.validatedAt &&
    next.validatedAt - previous.baseline.validatedAt <= MAX_LIFETIME && next.horizon >= previous.baseline.horizon &&
    next.horizon - previous.baseline.horizon < MAX_AGE;
}
function changes(previous, next) {
  const reuse = reusable(previous, next);
  const changedIds = next.witnesses.filter(row => {
    const old = reuse && previous.evidence.byId.get(row.id);
    return !old || old.stamp !== row.stamp || old.ordinal !== row.ordinal;
  }).map(row => row.id);
  const removedIds = previous === null ? [] : previous.evidence.witnesses.filter(row => !next.byId.has(row.id)).map(row => row.id);
  return Object.freeze({ reuse, changedIds: Object.freeze(changedIds), removedIds: Object.freeze(removedIds) });
}

/** No data is reused on absent, expired, rewritten, wrapped or unsafe evidence. */
export function relatedCatalogChanges(previous, input) {
  return changes(previousState(previous), evidence(input));
}

function entry(value) {
  const retained = preparedEntries.get(value);
  if (retained) return retained;
  const input = record(value, ['id', 'url', 'title', 'embedding', 'topicId', 'primaryTopicId', 'extractorVersion', 'ordinal']);
  const id = text(input.id, 128), title = text(input.title, 512);
  text(input.url, 8192);
  if (/\s|\\/u.test(input.url)) invalid();
  let parsed;
  try { parsed = new URL(input.url); } catch { invalid(); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) invalid();
  parsed.hash = '';
  const url = parsed.toString();
  if (url.length > 8192) invalid();
  const topicId = input.topicId === null ? null : text(input.topicId, 128);
  const primaryTopicId = input.primaryTopicId === null ? null : text(input.primaryTopicId, 128);
  const ordinal = integer(input.ordinal);
  if (input.extractorVersion !== undefined && input.extractorVersion !== null) text(input.extractorVersion, 128);
  let embedding = null, prepared = null, dimensions = 0;
  if (input.embedding !== null) {
    const raw = record(input.embedding, ['modelId', 'values']);
    const modelId = text(raw.modelId, 128);
    // The browser core owns the one normalized copy for eligible sources. Keep
    // its parser-owned identity instead of copying to Float64 and back, then
    // descriptor-scanning the same coordinates again. Node proxy rejection
    // remains explicit before the browser's ordinary descriptor-safe reader.
    if (types.isProxy(raw.values)) invalid();
    if (modelId === BROWSER_MODEL_ID && compatibleExtractor(input.extractorVersion)) {
      prepared = prepareRelatedSource({ id, url, title, topicId, embedding: input.embedding });
      dimensions = Object.getOwnPropertyDescriptor(raw.values, 'length').value;
      embedding = { modelId };
    } else {
      validateNumericVector(raw.values);
      embedding = { modelId };
    }
  }
  const eligible = embedding?.modelId === BROWSER_MODEL_ID && compatibleExtractor(input.extractorVersion);
  // Ineligible vectors have been checked, but never need retention or ranking.
  const source = Object.freeze(eligible ? { id, url, title, prepared, topicId,
    primaryTopicId, extractorVersion: input.extractorVersion, ordinal, eligible } : { id, ordinal, eligible });
  const units = eligible ? id.length + url.length + title.length + (topicId?.length ?? 0) + embedding.modelId.length + dimensions : 0;
  return { source, units };
}

/**
 * Fully validate/copy one authoritative entry before retaining a catalog batch.
 * The opaque token carries no database witness or authority; build still checks
 * its identity/ordinal against the complete fresh evidence and cumulative caps.
 * Parser-owned raw vectors can be released immediately after this call.
 */
export function prepareRelatedCatalogEntry(value) {
  const checked = entry(value), token = Object.freeze({});
  preparedEntries.set(token, checked);
  return token;
}

export function readRelatedCatalogCapacityLimits() {
  return Object.freeze({ maximumSources: MAX_SOURCES, maximumUnits: MAX_UNITS,
    maximumChunks: MAX_CHUNKS, chunkSize: CHUNK_SIZE });
}

/**
 * Bound retained normalized data while an authoritative loader streams deltas.
 * Changed/removed rows do not reserve their old units; unchanged reusable rows
 * do. A failed producer cannot continue minting, and the final build still owns
 * completeness, fresh-evidence and cumulative-budget validation independently.
 */
export function createRelatedCatalogEntryPreparation(value) {
  const input = record(value, ['evidence', 'previous'], ['previous']);
  const next = evidence(input.evidence), previous = previousState(input.previous);
  const delta = changes(previous, next), wanted = new Set(delta.changedIds), seen = new Set();
  let units = 0, poisoned = false;
  if (delta.reuse) {
    for (const witness of next.witnesses) {
      if (wanted.has(witness.id)) continue;
      const checked = previous.sources.get(witness.id);
      if (!checked) invalid();
      units += checked.units;
      if (units > MAX_UNITS) capacity();
    }
  }
  return Object.freeze({ prepare(raw) {
    if (poisoned) invalid();
    try {
      const checked = entry(raw), id = checked.source.id;
      if (!wanted.has(id) || seen.has(id) || checked.source.ordinal !== next.byId.get(id).ordinal) invalid();
      const projected = units + checked.units;
      if (projected > MAX_UNITS) capacity();
      seen.add(id); units = projected;
      const token = Object.freeze({}); preparedEntries.set(token, checked);
      return token;
    } catch (error) { poisoned = true; throw error; }
  } });
}

function validateNumericVector(value) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const length = Object.getOwnPropertyDescriptor(value, 'length').value;
  if (!length || length > 1536 || Reflect.ownKeys(value).length !== length + 1) invalid();
  // Ineligible vectors are fully checked but need no retained numeric copy.
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value') ||
        typeof descriptor.value !== 'number' || !Number.isFinite(descriptor.value)) invalid();
  }
}

/**
 * Trusted callers keep authoritative entry data stable until settlement. The
 * container is copied synchronously; rows are validated and privately copied in
 * cooperative batches. No partial index is published if a later batch fails.
 */
export async function buildRelatedCatalogIndex(value) {
  const input = record(value, ['evidence', 'entries', 'previous'], ['previous']);
  const next = evidence(input.evidence), previous = previousState(input.previous);
  const delta = changes(previous, next), wanted = new Set(delta.changedIds);
  // The facade owns these canonical rows and freezes their exposed containers;
  // they are never HTTP-provided records or a mutable shared catalog.
  const suppliedRows = array(input.entries, MAX_SOURCES);
  if (delta.reuse && !delta.changedIds.length && !delta.removedIds.length) {
    if (suppliedRows.length) invalid();
    // The fresh evidence has already passed every age, lifetime and identity
    // guard. Return the same immutable view; never refresh its original baseline.
    return input.previous;
  }
  const supplied = new Map();
  let suppliedUnits = 0, copied = 0;
  for (const raw of suppliedRows) {
    const checked = entry(raw), id = checked.source.id;
    if (!wanted.has(id) || supplied.has(id) || checked.source.ordinal !== next.byId.get(id).ordinal) invalid();
    supplied.set(id, checked); suppliedUnits += checked.units;
    if (suppliedUnits > MAX_UNITS) capacity();
    if (++copied % 128 === 0) await yieldWork();
  }
  if (supplied.size !== wanted.size) invalid();
  const sources = new Map(), chunkEntries = new Map(), affected = new Set();
  let units = 0;
  for (const row of next.witnesses) {
    const checked = supplied.get(row.id) ?? (delta.reuse && previous.sources.get(row.id));
    if (!checked) invalid();
    sources.set(row.id, checked); units += checked.units;
    if (units > MAX_UNITS) capacity();
    if (checked.source.eligible) {
      const chunkId = Math.floor(row.ordinal / CHUNK_SIZE);
      if (!chunkEntries.has(chunkId)) chunkEntries.set(chunkId, []);
      chunkEntries.get(chunkId).push(checked.source);
      if (chunkEntries.size > MAX_CHUNKS) capacity();
    }
  }
  if (delta.reuse) {
    for (const id of [...delta.changedIds, ...delta.removedIds]) {
      const old = previous.sources.get(id);
      if (old?.source.eligible) affected.add(Math.floor(old.source.ordinal / CHUNK_SIZE));
      const fresh = supplied.get(id);
      if (fresh?.source.eligible) affected.add(Math.floor(fresh.source.ordinal / CHUNK_SIZE));
    }
  }
  const chunks = new Map();
  for (const [chunkId, members] of chunkEntries) {
    if (delta.reuse && !affected.has(chunkId) && previous.chunks.has(chunkId)) chunks.set(chunkId, previous.chunks.get(chunkId));
    else {
      const preparation = createRelatedSourcesPreparation();
      preparation.appendPrepared(members.map(source => source.prepared));
      chunks.set(chunkId, preparation.finish());
      await yieldWork();
    }
  }
  const view = Object.freeze({});
  states.set(view, { evidence: next, sources, chunks, reusable: next.agesSafe,
    baseline: delta.reuse ? previous.baseline : next });
  return view;
}

function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function compareCandidates(a, b) {
  const first = a.relationship === 'same-topic', second = b.relationship === 'same-topic';
  if (first !== second) return first ? -1 : 1;
  return (b.similarity ?? 0) - (a.similarity ?? 0) || compare(a.id, b.id) || compare(a.url, b.url) ||
    compare(a.title, b.title) || compare(a.topicId ?? '', b.topicId ?? '');
}

export async function rankRelatedCatalogIndex(view, sourceId, limit) {
  const state = previousState(view);
  text(sourceId, 128); integer(limit); limit = Math.min(100, limit);
  const source = state.sources.get(sourceId)?.source;
  if (!source) throw new ServiceError('not-found', 'Object unavailable');
  if (!source.eligible) throw new ServiceError('unavailable', 'Related Sources unavailable');
  const query = source.prepared;
  const ranked = [];
  for (const chunk of state.chunks.values()) {
    ranked.push(...chunk.rankPrepared(query, { limit, minSimilarity: 0.88, fallbackMinSimilarity: 0.80 }));
    await yieldWork();
  }
  const ordinary = ranked.filter(candidate => candidate.relationship === 'same-topic' || candidate.similarity >= 0.88);
  const candidates = ordinary.length ? ordinary : ranked;
  candidates.sort(compareCandidates);
  const maximum = ordinary.length ? limit : Math.min(limit, 1);
  const ids = new Set(), urls = new Set(), results = [];
  for (const candidate of candidates) {
    if (ids.has(candidate.id) || urls.has(candidate.url)) continue;
    ids.add(candidate.id); urls.add(candidate.url);
    if (results.length < maximum) results.push(Object.freeze({ id: candidate.id, url: candidate.url,
      title: candidate.title, relationship: candidate.relationship, method: candidate.method,
      topicId: state.sources.get(candidate.id).source.primaryTopicId }));
  }
  return Object.freeze(results);
}
