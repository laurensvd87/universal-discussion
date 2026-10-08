import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSources } from '../topic-benchmark/benchmark.js';
import { COSINE_FLOOR, LEAD_CHARACTERS, facet, focusDocument, hardConflict,
  pairEvidence, partitionByEvidence, trainIdf, trainZeroFalseCutoff } from './core.js';
import { loadTrainValidation } from './corpus.js';

const vector = angle => [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];
const sample = (id, title, body, topicLabel, family) =>
  ({ id, title, body, topicLabel, family, viewpoint: 'report' });

test('focus input has a fixed lead bound and never contains labels', () => {
  const doc = sample('a', 'Example tariff decision', 'X'.repeat(LEAD_CHARACTERS + 100),
    'secret-gold-topic', 'secret-gold-family');
  const focus = focusDocument(doc);
  assert.deepEqual(Object.keys(focus).sort(), ['body', 'id', 'title']);
  assert.equal(focus.body.length, LEAD_CHARACTERS);
  assert.equal(JSON.stringify(focus).includes('secret-gold'), false);
});

test('generic product and action conflicts are explicit and title scoped', () => {
  const a = facet(sample('a', 'Atlas 4 recall announced', 'A battery issue led to the review.', 'a', 'a'));
  const b = facet(sample('b', 'Atlas 5 update paused', 'A patch may resolve a camera fault.', 'b', 'b'));
  assert.equal(hardConflict(a, b), 'product-version');
  const c = facet(sample('c', 'Atlas 4 recall urged', 'Atlas 5 is discussed as background.', 'a', 'a'));
  assert.equal(hardConflict(a, c), null);
});

test('complete link refuses transitive chaining across an unsupported pair', () => {
  const docs = [
    sample('a', 'River gate closure', 'The river is rising.', 'one', 'entity'),
    sample('b', 'River gate closure debated', 'The same gate is discussed.', 'one', 'entity'),
    sample('c', 'Gate contract tender', 'Separate maintenance bids.', 'two', 'entity'),
  ];
  const vectors = new Map([['a', vector(0)], ['b', vector(0.2)], ['c', vector(0.4)]]);
  const facets = new Map(docs.map(doc => [doc.id, facet(doc)]));
  const evidence = pairEvidence(makeSources(docs, vectors), vectors, facets, trainIdf(facets));
  const groups = partitionByEvidence(makeSources(docs, vectors), evidence,
    pair => pair.focus >= COSINE_FLOOR && !pair.conflict);
  assert.deepEqual(groups.map(group => [...group].sort()).sort((x, y) => x[0].localeCompare(y[0])),
    [['a', 'b'], ['c']]);
});

test('train-only lexical cutoff exceeds all eligible negative pair overlaps', () => {
  const docs = [
    sample('a', 'River gate closure', 'Crest reaches riverside homes.', 'gate-closure', 'town'),
    sample('b', 'River gate shutdown', 'Crest threatens riverside homes.', 'gate-closure', 'town'),
    sample('c', 'River gate budget', 'Maintenance proposal has supporters.', 'gate-budget', 'town'),
  ];
  const vectors = new Map(docs.map((doc, i) => [doc.id, vector(i * 0.1)]));
  const facets = new Map(docs.map(doc => [doc.id, facet(doc)]));
  const evidence = pairEvidence(makeSources(docs, vectors), vectors, facets, trainIdf(facets));
  const selected = trainZeroFalseCutoff(docs, evidence);
  assert.equal(selected.eligiblePositive, 1);
  assert.ok(selected.cutoff > selected.maximumNegative);
});

test('only pinned Luna training and validation files are loaded', async () => {
  const splits = await loadTrainValidation();
  assert.deepEqual(Object.keys(splits), ['train', 'validation']);
  assert.equal(splits.train.length, 80);
  assert.equal(splits.validation.length, 20);
  const positive = splits.validation.find(row => row.family === 'aurora_imaging');
  assert.ok(positive);
});
