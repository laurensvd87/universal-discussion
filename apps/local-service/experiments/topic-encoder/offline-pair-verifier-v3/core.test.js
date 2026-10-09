import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePairs } from '../offline-pair-verifier-v1/core.js';
import { validatePartition, verifyIsolation } from './adapter.js';
import { agglomerativeCompleteLink, usefulnessScreen } from './core.js';

function fictionalRows(split, family) {
  const rows = [];
  for (const event of ['opening', 'delay']) for (const language of ['en', 'de', 'nl', 'fr', 'es'])
    for (const [viewpoint, viewpointStyle] of [['supports', 'local'], ['questions', 'critical']])
      rows.push({ id: `${split}-${family}-${event}-${language}-${viewpoint}`,
        split, family, development: event, topicLabel: `${family}-${event}`,
        language, viewpoint, viewpointStyle,
        title: `Fictional ${event} ${language} ${viewpoint}`,
        body: `Fictional details ${event} ${language} ${viewpoint}` });
  return rows;
}

test('adapter accepts fictional balanced train/validation without a test file', () => {
  const train = validatePartition(fictionalRows('train', 'alpha'), 'train', 20, 1);
  const validation = validatePartition(fictionalRows('validation', 'beta'), 'validation', 20, 1);
  assert.equal(verifyIsolation(train, validation), true);
  assert.equal(new Set(train.map(doc => doc.eventKey)).size, 2);
});

test('adapter rejects family leakage and missing viewpoint counterpart', () => {
  const train = validatePartition(fictionalRows('train', 'alpha'), 'train', 20, 1);
  const validation = validatePartition(fictionalRows('validation', 'alpha'), 'validation', 20, 1);
  assert.throws(() => verifyIsolation(train, validation), /SPLIT_LEAKAGE/);
  const broken = fictionalRows('train', 'alpha');
  broken[1].viewpoint = broken[0].viewpoint;
  assert.throws(() => validatePartition(broken, 'train', 20, 1), /VIEWPOINT_BALANCE/);
});

test('agglomerative complete-link is frozen and differs from first-fit without labels in scoring', () => {
  const docs = [
    { id: 'a', eventKey: 'one', lang: 'en', categories: ['family'] },
    { id: 'b', eventKey: 'two', lang: 'de', categories: ['family'] },
    { id: 'c', eventKey: 'one', lang: 'fr', categories: ['family'] },
  ];
  const vectors = new Map(docs.map((doc, i) => [doc.id, i]));
  const scores = [[1, 0.91, 0.95], [0.91, 1, 0.89], [0.95, 0.89, 1]];
  const scorer = (a, b) => scores[a][b];
  const first = evaluatePairs(docs, vectors, scorer, 0.90);
  const merge = agglomerativeCompleteLink(docs, vectors, scorer, 0.90);
  assert.equal(first.topics.joinedFalse, 1);
  assert.equal(merge.joinedTrue, 1);
  assert.equal(merge.joinedFalse, 0);
  assert.equal(merge.completeEvents, 2);
});

test('predeclared primary screen cannot be rescued by exploratory grouping', () => {
  const sample = { pair: { trueTotal: 180, falseTotal: 600, hardFalseTotal: 200,
    crossLanguageTrueTotal: 160, trueAdmitted: 60, falseAdmitted: 0,
    hardFalseAdmitted: 0, crossLanguageTrueAdmitted: 40 },
    topics: { completeEvents: 0 } };
  assert.equal(usefulnessScreen(sample).met, false);
  sample.topics.completeEvents = 1;
  assert.equal(usefulnessScreen(sample).met, true);
});
