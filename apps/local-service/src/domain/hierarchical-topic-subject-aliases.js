// Experimental lexical evidence only. Exact reviewed titles plus an opening
// token cue do NOT establish subject centrality, captured-text attestation,
// historical Source identity, canonical membership, or permission to act.
import { createHash } from 'node:crypto';
import { types } from 'node:util';

export const SUBJECT_ALIAS_LIMITS = Object.freeze({ maxEntries: 128, maxTitlesPerEntry: 8,
  maxBodyAliasesPerEntry: 8, maxTotalTitles: 512, maxTotalBodyAliases: 512,
  maxTitleUnits: 1024, maxBodyUnits: 4096, openingBodyUnits: 512,
  maxIdentifierUnits: 160, maxProvenanceUnits: 256 });
const SCHEMA = 'hierarchical-topic-subject-aliases/v1';
const DEFINITION = Object.freeze({ schema: SCHEMA,
  normalization: 'unicode-nfkc-lowercase-unicode-whitespace-collapse/v1',
  whitespace: 'unicode-White_Space-plus-FEFF',
  controls: 'reject-nonwhitespace-Cc-Cf-and-unpaired-surrogates',
  titleRule: 'exact-reviewed-entire-normalized-title-no-suffix-stripping',
  bodyRule: 'reviewed-token-cue-in-first-512-raw-utf16-surrogate-backoff',
  tokenCharacters: 'unicode-L-M-N-Pc',
  languageRule: 'exact-en-de-nl-fr-es',
  ambiguityRule: 'distinct-entity-abstain-even-when-node-equal',
  limits: SUBJECT_ALIAS_LIMITS,
  evidenceStrength: 'title-and-opening-token-cue',
  semanticGateRequired: true, experimental: true, productionValidated: false, assignmentAuthority: false });
const handles = new WeakMap(), languages = new Set(['en', 'de', 'nl', 'fr', 'es']);
const invalid = () => { throw new TypeError('Invalid experimental subject alias evidence'); };
const digest = value => createHash('sha256').update(value).digest('hex');
const hash = value => digest(JSON.stringify(value));
const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const whitespace = /[\p{White_Space}\uFEFF]+/gu;
const token = /[\p{L}\p{M}\p{N}\p{Pc}]/u;

function record(value, fields) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).length !== fields.length) invalid();
  const copy = {};
  for (const field of fields) {
    const d = Object.getOwnPropertyDescriptor(value, field);
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) invalid();
    copy[field] = d.value;
  }
  return copy;
}
function list(value, maximum) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const length = Object.getOwnPropertyDescriptor(value, 'length').value;
  if (length > maximum || Reflect.ownKeys(value).length !== length + 1) invalid();
  return Array.from({ length }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) invalid();
    return d.value;
  });
}
function text(value, maximum, empty = false) {
  if (typeof value !== 'string' || value.length > maximum || (!empty && !value.length)) invalid();
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) invalid();
    } else if (code >= 0xdc00 && code <= 0xdfff) invalid();
  }
  if (/[\p{Cc}\p{Cf}]/u.test(value.replace(whitespace, ''))) invalid();
  return value;
}
function identifier(value) {
  text(value, 160);
  if (value.trim() !== value || /[\p{Cc}\p{Cf}]/u.test(value)) invalid();
  return value;
}
function sha(value) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) invalid(); }
function language(value) { if (typeof value !== 'string' || !languages.has(value)) invalid(); }
function normalize(value) {
  return value.normalize('NFKC').toLowerCase().replace(whitespace, ' ').trim();
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
function strings(value, maximum, units) {
  const raw = list(value, maximum).map(v => text(v, units));
  if (!raw.length) invalid();
  const normalized = raw.map(normalize);
  if (normalized.some(v => !v.length) || new Set(normalized).size !== normalized.length) invalid();
  return { raw: [...raw].sort(lexical), normalized: normalized.sort(lexical) };
}
function opening(body) {
  let end = Math.min(body.length, SUBJECT_ALIAS_LIMITS.openingBodyUnits);
  const last = body.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end--;
  const raw = body.slice(0, end), next = pointAt(body, end);
  // A truncated word cannot manufacture a token boundary (koalaverse at the
  // cutoff must not become koala). Look beyond the window only for boundary
  // continuity, never to supply any subject characters or cue.
  const nextNormalized = normalize(next);
  const rightBoundaryKnown = end === body.length || /[\p{White_Space}\uFEFF]$/u.test(raw) ||
    !token.test(pointAt(nextNormalized, 0));
  return { text: normalize(raw), rightBoundaryKnown };
}
function pointAt(value, index) { return index < value.length ? String.fromCodePoint(value.codePointAt(index)) : ''; }
function pointBefore(value, index) {
  const previous = value.charCodeAt(index - 1);
  return index ? pointAt(value, index - (previous >= 0xdc00 && previous <= 0xdfff ? 2 : 1)) : '';
}
function hasTokenCue(body, alias, rightBoundaryKnown) {
  let from = 0;
  while (from <= body.length - alias.length) {
    const index = body.indexOf(alias, from);
    if (index < 0) return false;
    const before = pointBefore(body, index), after = pointAt(body, index + alias.length);
    if ((!before || !token.test(before)) && (!after || !token.test(after)) &&
        (index + alias.length < body.length || rightBoundaryKnown)) return true;
    from = index + 1;
  }
  return false;
}

export function compileHierarchySubjectAliases(input) {
  if (arguments.length !== 1) invalid();
  const a = record(input, ['schema', 'revision', 'builderHash', 'entries']);
  if (a.schema !== SCHEMA) invalid(); identifier(a.revision); sha(a.builderHash);
  let titleCount = 0, aliasCount = 0;
  const entityNodes = new Map(), uniqueEntries = new Set(), rawEntries = [];
  const entries = list(a.entries, SUBJECT_ALIAS_LIMITS.maxEntries).map(value => {
    const e = record(value, ['entityId', 'nodeId', 'language', 'capturedTitles', 'bodyAliases', 'reviewer', 'provenance']);
    identifier(e.entityId); identifier(e.nodeId); language(e.language);
    text(e.reviewer, 256); text(e.provenance, 256);
    if (!normalize(e.reviewer) || !normalize(e.provenance)) invalid();
    if (entityNodes.has(e.entityId) && entityNodes.get(e.entityId) !== e.nodeId) invalid();
    entityNodes.set(e.entityId, e.nodeId);
    const key = JSON.stringify([e.entityId, e.language]);
    if (uniqueEntries.has(key)) invalid(); uniqueEntries.add(key);
    const titles = strings(e.capturedTitles, 8, 1024), aliases = strings(e.bodyAliases, 8, 160);
    if (aliases.normalized.some(alias => !/[\p{L}\p{N}]/u.test(alias))) invalid();
    titleCount += titles.raw.length; aliasCount += aliases.raw.length;
    if (titleCount > 512 || aliasCount > 512) invalid();
    const metadata = { entityId: e.entityId, nodeId: e.nodeId, language: e.language, reviewer: e.reviewer, provenance: e.provenance };
    rawEntries.push({ ...metadata, capturedTitles: titles.raw, bodyAliases: aliases.raw });
    return { ...metadata, capturedTitles: titles.normalized, bodyAliases: aliases.normalized };
  });
  if (!entries.length) invalid();
  const order = (x, y) => lexical(x.entityId, y.entityId) || lexical(x.language, y.language);
  entries.sort(order); rawEntries.sort(order);
  const inventoryHash = hash({ schema: SCHEMA, revision: a.revision, builderHash: a.builderHash, entries: rawEntries });
  const matcherDefinitionHash = hash(DEFINITION);
  const semanticIdentityHash = hash({ schema: SCHEMA, revision: a.revision, builderHash: a.builderHash,
    matcherDefinitionHash, entries });
  const identity = freeze({ schema: SCHEMA, revision: a.revision, builderHash: a.builderHash, inventoryHash,
    matcherDefinitionHash, semanticIdentityHash, entryCount: entries.length, entityCount: entityNodes.size,
    titleCount, bodyAliasCount: aliasCount, evidenceStrength: DEFINITION.evidenceStrength,
    semanticGateRequired: true, inputUntrusted: true, experimental: true, productionValidated: false, assignmentAuthority: false });
  const handle = Object.freeze({}); handles.set(handle, { entries, identity }); return handle;
}

export function describeHierarchySubjectAliases(handle) {
  if (arguments.length !== 1) invalid();
  const state = handles.get(handle); if (!state) invalid();
  return state.identity;
}

export function matchHierarchySubjectAliases(handle, input) {
  if (arguments.length !== 2) invalid();
  const state = handles.get(handle); if (!state) invalid();
  const a = record(input, ['sourceId', 'sourceVersion', 'builderHash', 'language', 'title', 'body']);
  identifier(a.sourceId); identifier(a.sourceVersion); sha(a.builderHash); language(a.language);
  if (a.builderHash !== state.identity.builderHash) invalid();
  text(a.title, 1024, true); text(a.body, 4096, true);
  const title = normalize(a.title), body = opening(a.body), hits = new Map();
  for (const entry of state.entries) {
    if (entry.language === a.language && entry.capturedTitles.includes(title) &&
        entry.bodyAliases.some(alias => hasTokenCue(body.text, alias, body.rightBoundaryKnown))) {
      hits.set(entry.entityId, entry.nodeId);
    }
  }
  const status = hits.size === 1 ? 'evidence-candidate' : hits.size > 1 ? 'ambiguous' : 'no-evidence';
  const candidateEntityIds = hits.size === 1 ? [...hits.keys()] : [], candidateNodeIds = hits.size === 1 ? [...hits.values()] : [];
  const definition = { ...state.identity, schema: 'hierarchical-topic-subject-alias-evidence/v1',
    sourceId: a.sourceId, sourceVersion: a.sourceVersion, language: a.language,
    titleHash: digest(a.title), bodyHash: digest(a.body), status, matchedEntityCount: hits.size,
    candidateEntityIds, candidateNodeIds };
  return freeze({ ...definition, evidenceHash: hash(definition) });
}
