import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EvalError, safeDiagnostic, parseCorpus, selectEventDisjoint, inspectCorpus,
  diagnoseRetrieval, scorePartition, matcherInputs, evaluate } from './core.js';

// Fictional event copy is embedded in test code. No real dataset or articles.
const event = (description, category, titles, extra = {}) => ({
  date: '2030-01-01', description, category, ...extra,
  news: titles.map((title, i) => ({ lang_abbr: i ? 'fr' : 'en', title,
    article: `Fictional report about ${title}. No actual publisher or person.` })) });

test('bounded schema and stable event-disjoint fallback', () => {
  const rows = [event('Blue comet announcement', 'science', ['Comet rises', 'Comète monte']),
    event('Green comet announcement', 'science', ['Comet falls']),
    event('Clock announcement', 'culture', ['Clock rings'])];
  const a = parseCorpus(Buffer.from(JSON.stringify(rows)));
  const b = parseCorpus(Buffer.from(JSON.stringify([...rows].reverse())));
  const splitsA = new Map(a.documents.map(d => [d.eventKey, d.split]));
  assert.deepEqual(new Map(b.documents.map(d => [d.eventKey, d.split])), splitsA);
  assert.equal(a.familyGold, false);
  assert.equal(a.viewpointGold, false);
  const selectedA = selectEventDisjoint(a.documents, 2);
  const selectedB = selectEventDisjoint(b.documents, 2);
  assert.deepEqual(new Set(selectedA.documents.map(d => d.eventKey)),
    new Set(selectedB.documents.map(d => d.eventKey)));
  assert.equal(selectedA.documents.length + selectedA.unscoredArticles, 4);
  assert.equal(selectedA.documents.filter(d => d.eventKey === a.documents[0].eventKey).length % 2, 0);
  assert.throws(() => parseCorpus(Buffer.from(JSON.stringify(rows)), { maxArticles: 3 }));
  assert.throws(() => parseCorpus(Buffer.from(JSON.stringify([event('bad', 'x', ['x'])])), { maxBytes: 2 }));
  assert.throws(() => parseCorpus(Buffer.from(JSON.stringify([event('bad', 'x', ['x']), event('bad', 'x', ['y'])]))));
});

test('labels and text never enter matcher; full partition and slice metrics', () => {
  const { documents } = parseCorpus(Buffer.from(JSON.stringify([
    event('Copper ferry launch', 'transport', ['Ferry opens', 'Bac ouvre']),
    event('Copper ferry strike', 'transport', ['Ferry closes']),
    event('Museum opens', 'culture', ['Museum opens'])])));
  const vectors = new Map(documents.map(d => [d.id, Float32Array.from({ length: 384 }, (_, i) => i === 0 ? 1 : 0)]));
  const inputs = matcherInputs(documents, vectors);
  assert.deepEqual(Object.keys(inputs[0]), ['id', 'embedding']);
  const result = evaluate(documents, vectors, rows => [rows.slice(0, 3).map(d => d.id),
    ...rows.slice(3).map(d => [d.id])].filter(g => g.length));
  assert.equal(result.tp, 1);
  assert.equal(result.fp, 2);
  assert.equal(result.hardFalseJoins, 2);
  assert.equal(result.crossLanguageJoined, 1);
  assert.equal(result.goldSingletons, 2);
  assert.equal(result.orderStable, false);
  assert.throws(() => scorePartition(documents, [['d0']]));
});

test('inspect returns aggregate schema and counts without corpus fields', () => {
  const corpus = parseCorpus(Buffer.from(JSON.stringify([
    event('Fictional lantern launch', 'culture', ['Lantern opens', 'Lanterne ouvre']),
    event('Fictional clock launch', 'culture', ['Clock opens'])])));
  const report = inspectCorpus(corpus, selectEventDisjoint(corpus.documents, 2));
  assert.equal(report.mode, 'inspect');
  assert.equal(report.modelLoaded, false);
  assert.equal(report.events, 2);
  assert.equal(report.articles, 3);
  assert.deepEqual(report.eventSize, { min: 1, max: 2 });
  assert.deepEqual(report.languages, { en: 2, fr: 1 });
  assert.equal(report.scoredArticles + report.unscoredArticles, 3);
  const output = JSON.stringify(report);
  for (const forbidden of ['Fictional lantern', 'Lantern opens', 'Fictional clock', 'Clock opens', 'culture'])
    assert.equal(output.includes(forbidden), false);
});

test('schema field codes and diagnostics never disclose rejected values', () => {
  const base = event('Secret fictional event', 'culture', ['Private fictional title']);
  const codeFor = row => {
    try { parseCorpus(Buffer.from(JSON.stringify([row]))); }
    catch (error) { return safeDiagnostic(error); }
    assert.fail('Expected schema rejection');
  };
  assert.deepEqual(codeFor({ ...base, date: 2030 }), { phase: 'schema', code: 'EVENT_DATE_TYPE' });
  assert.deepEqual(codeFor({ ...base, news: 'Secret article' }),
    { phase: 'schema', code: 'EVENT_NEWS_ARRAY_TYPE' });
  assert.deepEqual(codeFor({ ...base, news: [{ ...base.news[0], article: null }] }),
    { phase: 'schema', code: 'ARTICLE_BODY_TYPE' });
  assert.deepEqual(codeFor({ ...base, news: [{ ...base.news[0], lang_abbr: 'secret code' }] }),
    { phase: 'schema', code: 'ARTICLE_LANGUAGE_FORMAT' });
  assert.deepEqual(safeDiagnostic(new Error('C:\\private\\secret article')),
    { phase: 'internal', code: 'UNCLASSIFIED_FAILURE' });
  assert.deepEqual(safeDiagnostic(new EvalError('path', 'PRIVATE_PATH_SCOPE')),
    { phase: 'path', code: 'PRIVATE_PATH_SCOPE' });
});

test('strict JSONL and JSON array yield equivalent validated events', () => {
  const rows = [event('Fictional river opening', 'travel', ['River opens', 'Rivière ouvre']),
    event('Fictional bridge closing', 'travel', ['Bridge closes'])];
  const array = parseCorpus(Buffer.from(JSON.stringify(rows)));
  const jsonl = parseCorpus(Buffer.from(`${rows.map(row => JSON.stringify(row)).join('\n')}\n`));
  assert.equal(array.format, 'json-array');
  assert.equal(jsonl.format, 'jsonl');
  assert.deepEqual(jsonl.documents.map(d => [d.eventKey, d.lang, d.split]),
    array.documents.map(d => [d.eventKey, d.lang, d.split]));
  assert.equal(inspectCorpus(jsonl, selectEventDisjoint(jsonl.documents)).schema.shape, 'jsonl');
  const diagnostic = bytes => {
    try { parseCorpus(Buffer.from(bytes)); } catch (error) { return safeDiagnostic(error); }
    assert.fail('Expected parse rejection');
  };
  assert.deepEqual(diagnostic(`${JSON.stringify(rows[0])}\n\n${JSON.stringify(rows[1])}`),
    { phase: 'parse', code: 'JSONL_LINE_BOUND' });
  assert.deepEqual(diagnostic(`${JSON.stringify(rows[0])}\n{private broken text}`),
    { phase: 'parse', code: 'JSONL_SYNTAX' });
  assert.deepEqual(diagnostic('[{"private":broken}]'),
    { phase: 'parse', code: 'JSON_SYNTAX' });
});

test('retrieval diagnostics report ranks, quantiles and conflicting duplicates only', () => {
  const sameCopy = { lang_abbr: 'en', title: 'Fictional copied title', article: 'Fictional copied lead.' };
  const corpus = parseCorpus(Buffer.from(JSON.stringify([
    { date: '2030-01-01', description: 'Fictional launch', category: 'transport',
      news: [sameCopy, { lang_abbr: 'fr', title: 'Lancement fictif', article: 'Rapport fictif.' }] },
    { date: '2030-01-02', description: 'Fictional revision', category: 'transport',
      news: [sameCopy] },
  ])));
  const vector = (x, y) => Float32Array.from({ length: 384 }, (_, i) => i === 0 ? x : i === 1 ? y : 0);
  const vectors = new Map([['d0', vector(1, 0)], ['d1', vector(.8, .6)], ['d2', vector(.95, -.3122499)]]);
  const report = diagnoseRetrieval(corpus.documents, vectors);
  assert.equal(report.selectedArticles, 3);
  assert.deepEqual(report.languages, { en: 2, fr: 1 });
  assert.deepEqual(report.nearestTrueEvent.allCandidates,
    { eligibleQueries: 2, rank1: 1, top3: 2, top10: 2, top25: 2 });
  assert.deepEqual(report.nearestTrueEvent.crossLanguageCandidatesOnly,
    { eligibleQueries: 2, rank1: 2, top3: 2, top10: 2, top25: 2 });
  assert.equal(report.cosine.sameEvent.pairs, 1);
  assert.equal(report.cosine.sameCategoryDifferentEvent.pairs, 2);
  assert.deepEqual(report.exactDuplicatePairs, { sameEvent: 0, conflictingEventLabels: 1 });
  const output = JSON.stringify(report);
  for (const forbidden of ['Fictional', 'Lancement', 'Rapport', 'transport', '2030-01'])
    assert.equal(output.includes(forbidden), false);
});
