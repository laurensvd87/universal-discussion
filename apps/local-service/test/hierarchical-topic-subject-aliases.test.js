import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compileHierarchySubjectAliases as compile, describeHierarchySubjectAliases as describe,
  matchHierarchySubjectAliases as match, SUBJECT_ALIAS_LIMITS } from '../src/domain/hierarchical-topic-subject-aliases.js';

// Invented alias metadata; no captured pages, classifier or encoder is used.
const builderHash = 'a'.repeat(64), sha = text => createHash('sha256').update(text).digest('hex');
const entry = (entityId, nodeId, capturedTitles, bodyAliases, language = 'en') => ({ entityId, nodeId, language,
  capturedTitles, bodyAliases, reviewer: 'synthetic-reviewer', provenance: 'independent-test-fixture-not-real-page-review' });
function fixture() {
  return { schema: 'hierarchical-topic-subject-aliases/v1', revision: 'review-fixture-1', builderHash,
    entries: [entry('gta-v', 'games-gta', ['Grand Theft Auto V', 'Grand Theft Auto V — Sample Encyclopedia'], ['Grand Theft Auto V', 'GTA V']),
      entry('koala', 'nature-koalas', ['Koala'], ['koala', 'Phascolarctos cinereus']),
      entry('koala', 'nature-koalas', ['Koalabär'], ['Koalabär', 'Koala'], 'de'),
      entry('gta-game', 'games-gta', ['GTA'], ['GTA']), entry('gta-toronto', 'geography-places', ['GTA'], ['GTA'])] };
}
const witness = (title = 'Grand Theft Auto V', body = 'Grand Theft Auto V is the central subject of this invented description.') => ({
  sourceId: 'synthetic-source-17', sourceVersion: 'incarnation-4/input-9', builderHash, language: 'en', title, body });

test('exact full reviewed title plus opening token yields only bound non-authoritative evidence', () => {
  const d = match(compile(fixture()), witness());
  assert.equal(d.status, 'evidence-candidate'); assert.deepEqual(d.candidateEntityIds, ['gta-v']);
  assert.deepEqual(d.candidateNodeIds, ['games-gta']); assert.equal(d.evidenceStrength, 'title-and-opening-token-cue');
  assert.equal(d.semanticGateRequired, true); assert.equal(d.inputUntrusted, true);
  assert.equal(d.assignmentAuthority, false); assert.equal(d.productionValidated, false); assert.equal(d.experimental, true);
  assert.equal(d.sourceId, 'synthetic-source-17'); assert.equal(d.sourceVersion, 'incarnation-4/input-9');
  assert.equal(d.titleHash, sha(witness().title)); assert.equal(d.bodyHash, sha(witness().body));
  for (const key of ['title', 'body', 'confidence', 'assignment', 'selectedPath', 'authority', 'vector', 'reviewer']) assert.equal(Object.hasOwn(d, key), false);
  assert.ok(Object.isFrozen(d) && Object.isFrozen(d.candidateEntityIds) && Object.isFrozen(d.candidateNodeIds));
});

test('koala normalizes case, NFKC and Unicode whitespace without fuzzy spelling or transliteration', () => {
  const h = compile(fixture());
  assert.equal(match(h, witness(' ＫＯＡＬＡ\u00a0', 'A study describes the KOALA\u2003population.')).status, 'evidence-candidate');
  for (const title of ['Kоala', 'Koála', 'Koalas', 'koala?', 'About Koala', 'Re: Koala', 'Koala — Provider']) {
    assert.equal(match(h, witness(title, 'The koala population is described here.')).status, 'no-evidence', title);
  }
  assert.equal(match(h, witness('Grand Theft Auto V — Sample Encyclopedia')).status, 'evidence-candidate');
  for (const title of ['Grand Theft Auto V — Unreviewed Provider', 'Grand Theft Auto V - Sample Encyclopedia']) {
    assert.equal(match(h, witness(title)).status, 'no-evidence');
  }
});

test('token boundaries exclude substrings, Unicode letters, combining marks and underscore identifiers', () => {
  const h = compile(fixture());
  for (const body of ['koalaverse', 'xkoala', 'koala_software', 'koala\u0301', 'koala猫', '猫koala']) {
    assert.equal(match(h, witness('Koala', body)).status, 'no-evidence', body);
  }
  for (const body of ['(koala)', 'A koala, in this text.', '🐨koala🐨', 'Phascolarctos cinereus appears here.']) {
    assert.equal(match(h, witness('Koala', body)).status, 'evidence-candidate');
  }
});

test('different entity senses abstain, even when both senses map to the same node', () => {
  const a = fixture(), h = compile(a), ambiguous = match(h, witness('GTA', 'GTA is an abbreviation used in this description.'));
  assert.equal(ambiguous.status, 'ambiguous'); assert.equal(ambiguous.matchedEntityCount, 2);
  assert.deepEqual(ambiguous.candidateEntityIds, []); assert.deepEqual(ambiguous.candidateNodeIds, []);
  a.entries.at(-1).nodeId = 'games-gta';
  assert.equal(match(compile(a), witness('GTA', 'GTA appears here.')).status, 'ambiguous');
});

test('one entity is deduplicated across reviewed translations and multiple matching body aliases', () => {
  const h = compile(fixture()); assert.equal(describe(h).entityCount, 4); assert.equal(describe(h).entryCount, 5);
  const d = match(h, { ...witness('Koalabär', 'Koalabär und Koala werden hier beschrieben.'), language: 'de' });
  assert.deepEqual(d.candidateEntityIds, ['koala']); assert.equal(d.matchedEntityCount, 1);
  assert.equal(match(h, witness('Koalabär', 'Koala appears here.')).status, 'no-evidence');
  const a = fixture(); a.entries[2].nodeId = 'other-node'; assert.throws(() => compile(a));
});

test('only first 512 raw UTF16 characters count, with surrogate backoff and full raw body hashes', () => {
  const h = compile(fixture());
  assert.equal(match(h, witness('Koala', 'x'.repeat(512) + ' koala')).status, 'no-evidence');
  assert.equal(match(h, witness('Koala', ' '.repeat(508) + 'koala')).status, 'no-evidence');
  assert.equal(match(h, witness('Koala', ' '.repeat(507) + 'koala')).status, 'evidence-candidate');
  assert.equal(match(h, witness('Koala', ' '.repeat(507) + 'koalaverse')).status, 'no-evidence');
  assert.equal(match(h, witness('Koala', ' '.repeat(507) + 'koala\u0301')).status, 'no-evidence');
  assert.equal(match(h, witness('Koala', ' '.repeat(507) + 'koala!')).status, 'evidence-candidate');
  assert.equal(match(h, witness('Koala', ' '.repeat(511) + '😀 koala')).status, 'no-evidence');
  const a = match(h, witness('Koala', 'koala ' + 'x'.repeat(600))), b = match(h, witness('Koala', 'koala ' + 'y'.repeat(600)));
  assert.equal(a.status, b.status); assert.notEqual(a.bodyHash, b.bodyHash); assert.notEqual(a.evidenceHash, b.evidenceHash);
});

test('incidental, lists, URLs and code WITH exact title can cue: external semantic negative gate is mandatory', () => {
  const h = compile(fixture());
  for (const body of ['This software review mentions a koala mascot only incidentally.', '- koala\n- dolphin\n- other animals',
    'Example URL: https://example.invalid/koala', 'Code example: `const mascot = "koala";`']) {
    const d = match(h, witness('Koala', body));
    assert.equal(d.status, 'evidence-candidate'); assert.equal(d.semanticGateRequired, true);
    assert.equal(d.assignmentAuthority, false); assert.equal(d.evidenceStrength, 'title-and-opening-token-cue');
    assert.equal(match(h, witness('Software review', body)).status, 'no-evidence');
  }
});

test('missing evidence never guesses; malformed strings, controls, languages and builder mismatch reject', () => {
  const h = compile(fixture());
  for (const w of [witness('', 'koala'), witness('Koala', ''), witness('Koala', 'This text lacks the reviewed subject cue.')]) {
    assert.equal(match(h, w).status, 'no-evidence');
  }
  for (const value of ['koala\u0000', 'koala\u200b', '\u202ekoala', 'koala\ud800', 'koala\udc00']) {
    assert.throws(() => match(h, witness(value, 'koala'))); assert.throws(() => match(h, witness('Koala', value)));
  }
  for (const value of [undefined, 'EN', 'en-US', 'it', '']) assert.throws(() => match(h, { ...witness(), language: value }));
  for (const value of [undefined, 'b'.repeat(64), 'A'.repeat(64), '']) assert.throws(() => match(h, { ...witness(), builderHash: value }));
  assert.throws(() => match(h, witness('x'.repeat(1025)))); assert.throws(() => match(h, witness('Koala', 'x'.repeat(4097))));
});

test('identity binds copied review provenance, revision, builder and definitions; raw hashes are exact', () => {
  const a = fixture(), h = compile(a), original = describe(h), d = match(h, witness());
  a.entries[0].capturedTitles[0] = 'changed'; a.entries[0].bodyAliases[0] = 'changed'; a.entries[0].reviewer = 'changed'; a.revision = 'changed';
  assert.deepEqual(match(h, witness()), d); assert.deepEqual(describe(h), original);
  for (const change of [x => { x.revision = 'review-2'; }, x => { x.builderHash = 'b'.repeat(64); },
    x => { x.entries[0].reviewer = 'other-reviewer'; }, x => { x.entries[0].provenance = 'other-evidence'; }]) {
    const b = fixture(); change(b); assert.notEqual(describe(compile(b)).semanticIdentityHash, original.semanticIdentityHash);
  }
  const reordered = fixture(); reordered.entries.reverse(); reordered.entries.at(-1).capturedTitles.reverse();
  assert.deepEqual(describe(compile(reordered)), original);
  const normalized = match(h, witness('KOALA', 'koala')), lowercase = match(h, witness('koala', 'koala'));
  assert.equal(normalized.status, lowercase.status); assert.notEqual(normalized.titleHash, lowercase.titleHash);
  assert.ok(Object.isFrozen(original)); assert.throws(() => d.candidateEntityIds.push('forged'));
});

test('exact records, dense bounded lists, duplicate normalized aliases and entity invariants are enforced', () => {
  for (const change of [a => { a.extra = true; }, a => { a.schema = 'future'; }, a => { a.entries = []; },
    a => { a.entries[0].capturedTitles = ['Koala', 'ＫＯＡＬＡ']; }, a => { a.entries[0].bodyAliases = [' ']; },
    a => { a.entries[0].provenance = ''; }, a => { a.entries[0].capturedTitles = Array(9).fill('x'); },
    a => { a.entries[0].bodyAliases = Array(1); }, a => { a.entries.push(structuredClone(a.entries[0])); },
    a => { a.entries[0].ownerDepth = 2; }, a => { a.entries = Array(129).fill(a.entries[0]); }]) {
    const a = fixture(); change(a); assert.throws(() => compile(a));
  }
  const h = compile(fixture()); assert.throws(() => match(h, { ...witness(), titleHash: sha('x') }));
  assert.throws(() => compile(fixture(), {})); assert.throws(() => describe(h, {})); assert.throws(() => match(h, witness(), {}));
  assert.throws(() => describe({})); assert.throws(() => match({}, witness())); assert.equal(SUBJECT_ALIAS_LIMITS.openingBodyUnits, 512);
});

test('proxy/accessor/coercion traps never run, including nested inventory and vector-free witnesses', () => {
  let calls = 0;
  const proxy = new Proxy({}, { ownKeys() { calls++; throw Error('trap'); }, getPrototypeOf() { calls++; throw Error('trap'); } });
  assert.throws(() => compile(proxy)); const h = compile(fixture()); assert.throws(() => match(h, proxy));
  const a = fixture(); Object.defineProperty(a.entries[0], 'capturedTitles', { enumerable: true, get() { calls++; return ['Koala']; } });
  assert.throws(() => compile(a)); const b = fixture(); b.entries = new Proxy([], { get() { calls++; throw Error('trap'); } });
  assert.throws(() => compile(b)); const c = fixture(); Object.defineProperty(c.entries[0].bodyAliases, '0', { enumerable: true, get() { calls++; return 'Koala'; } });
  assert.throws(() => compile(c)); const w = witness(); Object.defineProperty(w, 'body', { enumerable: true, get() { calls++; return 'koala'; } });
  assert.throws(() => match(h, w));
  assert.throws(() => match(h, { ...witness(), title: { toString() { calls++; return 'Koala'; } } }));
  assert.equal(calls, 0);
});

test('aggregate title and body-alias caps cannot be bypassed through many bounded entries', () => {
  for (const field of ['capturedTitles', 'bodyAliases']) {
    const a = fixture();
    a.entries = Array.from({ length: 65 }, (_, i) => {
      const e = entry(`entity-${i}`, 'node', [`Subject ${i}`], [`subject ${i}`]);
      e[field] = Array.from({ length: 8 }, (_, j) => `Subject ${i} variation ${j}`);
      return e;
    });
    assert.throws(() => compile(a));
    a.entries.pop(); assert.equal(describe(compile(a))[field === 'capturedTitles' ? 'titleCount' : 'bodyAliasCount'], 512);
  }
});
