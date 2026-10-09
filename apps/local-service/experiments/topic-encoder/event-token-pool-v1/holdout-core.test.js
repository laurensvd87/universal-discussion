import test from 'node:test';
import assert from 'node:assert/strict';
import { PINNED, partitionTrain, assertFrozenCalibration, afterFrozenCalibration, validateV3Holdout,
  scoreV3, holdoutScreen } from './holdout-core.js';

const DIM = 384;
function fictionalHoldout() {
  const rows = [];
  let index = 0;
  const langs = ['en', 'nl', 'de', 'fr'];
  for (let family = 0; family < 5; family++) for (let event = 0; event < 3; event++)
    for (let view = 0; view < 4; view++) rows.push({
      id: `m3-${langs[view]}-${String(++index).padStart(3, '0')}`,
      family: `fictional-family-${family}`, topicLabel: `fictional-event-${family}-${event}`,
      viewpoint: `fictional-view-${view}`, split: 'multilingual-challenge-v3',
      title: `Fictional event ${family} ${event} report ${view}`,
      body: 'Entirely fictional test body.' });
  return rows;
}
const trainStub = () => Array.from({ length: 8 }, (_, family) =>
  Array.from({ length: 2 }, (_, event) => Array.from({ length: 10 }, (_, i) => ({
    id: `train-${family}-${event}-${i}`, eventKey: `train-event-${family}-${event}`,
    categories: [`train-family-${family}`] })))).flat(2);
const basis = index => {
  const vector = new Float64Array(DIM);
  vector[index] = 1;
  return vector;
};

test('six fit families and two calibration families remain whole and disjoint', () => {
  const train = trainStub();
  const { fit, calibration } = partitionTrain(train);
  assert.equal(fit.length, 120);
  assert.equal(calibration.length, 40);
  assert.equal(new Set(fit.map(row => row.eventKey)).size, 12);
  assert.equal(new Set(calibration.map(row => row.eventKey)).size, 4);
  assert.equal(new Set(fit.map(row => row.categories[0])).size, 6);
  assert.equal(new Set(calibration.map(row => row.categories[0])).size, 2);
  assert.ok(fit.every(row => !calibration.some(other =>
    other.eventKey === row.eventKey || other.categories[0] === row.categories[0])));
});

test('holdout cannot be opened after reconstructed calibration drifts', async () => {
  assert.equal(assertFrozenCalibration(PINNED.learnedCutoff, PINNED.rawCutoff,
    PINNED.modelSha256), true);
  assert.throws(() => assertFrozenCalibration(PINNED.learnedCutoff + 1e-8,
    PINNED.rawCutoff, PINNED.modelSha256), /FROZEN_CALIBRATION/u);
  assert.throws(() => assertFrozenCalibration(PINNED.learnedCutoff,
    PINNED.rawCutoff, 'wrong'), /FROZEN_CALIBRATION/u);
  let opens = 0;
  const fakeRead = () => { opens++; return 'fictional'; };
  await assert.rejects(afterFrozenCalibration(PINNED.learnedCutoff + 1e-8,
    PINNED.rawCutoff, PINNED.modelSha256, fakeRead), /FROZEN_CALIBRATION/u);
  assert.equal(opens, 0);
  assert.equal(await afterFrozenCalibration(PINNED.learnedCutoff, PINNED.rawCutoff,
    PINNED.modelSha256, fakeRead), 'fictional');
  assert.equal(opens, 1);
});

test('fictional v3 structure rejects overlap and malformed partition', () => {
  const rows = fictionalHoldout(), train = trainStub();
  const documents = validateV3Holdout(rows, train);
  assert.equal(documents.length, 60);
  assert.equal(documents[0].lang, 'en');
  assert.equal(documents[0].lead, rows[0].body);
  assert.throws(() => validateV3Holdout(rows.slice(1), train), /HOLDOUT_COUNT/u);
  assert.throws(() => validateV3Holdout(rows.map((row, i) => i === 0 ?
    { ...row, topicLabel: train[0].eventKey } : row), train), /HOLDOUT_SCHEMA/u);
  assert.throws(() => validateV3Holdout(rows.map((row, i) => i === 0 ?
    { ...row, split: 'validation' } : row), train), /HOLDOUT_SCHEMA/u);
});

test('fictional perfect triangle components have exact partition and aggregate pair metrics', () => {
  const documents = validateV3Holdout(fictionalHoldout(), trainStub());
  const events = [...new Set(documents.map(doc => doc.eventKey))];
  const vectors = new Map(documents.map(doc => [doc.id, basis(events.indexOf(doc.eventKey))]));
  const result = scoreV3(documents, vectors, 0.9);
  assert.deepEqual(result.pairAdmission, { tp: 90, fp: 0, fn: 0, tn: 1680,
    precision: 1, recall: 1 });
  assert.equal(result.denominators.hardFalsePairs, 240);
  assert.equal(result.denominators.crossLanguageTruePairs, 90);
  assert.equal(result.components.completeEvents, 15);
  assert.equal(result.partition.exactGoldPartition, true);
  assert.equal(result.partition.singletonGroups, 0);
  assert.equal(result.partition.crossEventFalseJoinedPairs, 0);
  assert.equal(result.perLanguageIncidentTruePairRecall.en.recall, 1);
  assert.equal(holdoutScreen(result).met, true);
});

test('cross-language denominator follows the frozen labels when one language repeats', () => {
  const rows = fictionalHoldout();
  rows[3] = { ...rows[3], id: rows[3].id.replace('fr', 'en') };
  const documents = validateV3Holdout(rows, trainStub());
  const events = [...new Set(documents.map(doc => doc.eventKey))];
  const vectors = new Map(documents.map(doc => [doc.id, basis(events.indexOf(doc.eventKey))]));
  const result = scoreV3(documents, vectors, 0.9);
  assert.equal(result.denominators.truePairs, 90);
  assert.equal(result.denominators.crossLanguageTruePairs, 89);
  assert.equal(result.edgeMetrics.crossLanguageTrueEdges, 89);
  assert.equal(result.perLanguageIncidentTruePairRecall.en.eligibleTruePairs, 47);
  assert.equal(holdoutScreen(result).met, true);
});

test('fictional adjacent-event collapse is counted as false edges and mixed groups', () => {
  const documents = validateV3Holdout(fictionalHoldout(), trainStub());
  const events = [...new Set(documents.map(doc => doc.eventKey))];
  const vectors = new Map(documents.map(doc => [doc.id,
    basis(Math.floor(events.indexOf(doc.eventKey) / 3) * 3)]));
  const result = scoreV3(documents, vectors, 0.9);
  assert.equal(result.edgeMetrics.falseEdges, 240);
  assert.equal(result.edgeMetrics.hardFalseEdges, 240);
  assert.equal(result.components.mixedGroups, 5);
  assert.equal(result.partition.crossEventFalseJoinedPairs, 240);
  assert.equal(holdoutScreen(result).met, false);
});
