import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCorpus, selectWholeEvents, inspect, evaluate } from './core.js';

const article = (pageid, lang, title, text, categories = ['transport']) => ({
  pageid, lang, title, text, categories, date: null, type: 'article',
  url: `https://${lang}.wikinews.org/wiki/example`,
});
const fixture = [
  article('event-a', 'en', 'City opens a new bridge', ['The bridge opened today.']),
  article('event-a', 'de', 'Stadt eroeffnet neue Bruecke', ['Die Bruecke wurde heute eroeffnet.']),
  article('event-b', 'en', 'City delays its rail line', ['The rail line was delayed.']),
  article('event-b', 'fr', 'La ville reporte la ligne', ['La ligne est reportée.']),
];
const bytes = Buffer.from(`${fixture.map(row => JSON.stringify(row)).join('\n')}\n`);
const unit = index => {
  const vector = new Float32Array(384);
  vector[index] = 1;
  return vector;
};

test('whole-event budget never truncates an event and splits are event-disjoint', () => {
  const corpus = prepareCorpus(bytes);
  const chosen = selectWholeEvents(corpus.documents, 3);
  assert.equal(chosen.documents.length, 2);
  assert.equal(chosen.selectedEvents, 1);
  assert.equal(chosen.unscoredArticles, 2);
  const full = selectWholeEvents(corpus.documents, 4);
  assert.equal(full.selectedEvents, 2);
  for (const key of new Set(full.documents.map(doc => doc.eventKey)))
    assert.equal(new Set(full.documents.filter(doc => doc.eventKey === key).map(doc => doc.split)).size, 1);
  const report = inspect(corpus, full);
  assert.equal(report.scoredArticles, 4);
  assert.equal(report.modelLoaded, false);
  assert.ok(!JSON.stringify(report).includes('bridge'));
});

test('offline complete-link baseline separates a hard category negative', () => {
  const docs = selectWholeEvents(prepareCorpus(bytes).documents, 4).documents;
  const vectors = new Map(docs.map(doc => [doc.id, unit(doc.eventKey === 'event-a' ? 0 : 1)]));
  const result = evaluate(docs, vectors);
  assert.equal(result.goldEvents, 2);
  assert.equal(result.predictedGroups, 2);
  assert.equal(result.trueJoined, 2);
  assert.equal(result.falseJoined, 0);
  assert.equal(result.crossLanguageJoined, 2);
  assert.equal(result.hardFalseTotal, 4);
  assert.equal(result.hardFalseJoined, 0);
  assert.equal(result.nearestTrueEvent.rank1, 4);
});

test('empty text is excluded while preserving eligible event groups', () => {
  const input = Buffer.from(`${[...fixture, article('event-c', 'en', 'Untitled body', [])]
    .map(row => JSON.stringify(row)).join('\n')}\n`);
  const corpus = prepareCorpus(input);
  assert.equal(corpus.missingText, 1);
  assert.equal(corpus.documents.length, 4);
  assert.equal(corpus.totalEvents, 3);
});

test('invalid vectors fail with fixed error code', () => {
  const docs = selectWholeEvents(prepareCorpus(bytes).documents, 4).documents;
  assert.throws(() => evaluate(docs, new Map()), { code: 'VECTOR' });
});
