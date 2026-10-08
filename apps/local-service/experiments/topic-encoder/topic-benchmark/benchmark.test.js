import test from 'node:test';
import assert from 'node:assert/strict';
import { currentMatcher, evaluateGrowth, evaluateMatcher, makeSources } from './benchmark.js';
import { fixtureInputs, observedShape, sameEventCrowd } from './fixtures.js';
import { normalizedPartition, scorePartition } from './metrics.js';
import { loadLuna } from './corpora.js';
import { planAdaptiveTopics } from '../../../src/domain/adaptive-topics.js';

test('labels and article text never enter the matcher source records', () => {
  const { documents, vectors } = fixtureInputs(observedShape());
  const sources = makeSources(documents, vectors);
  assert.deepEqual(sources.map(source => Object.keys(source).sort()),
    Array.from({ length: 3 }, () => ['embedding', 'extractorVersion', 'id', 'provenance', 'title', 'url']));
  for (const source of sources) {
    assert.equal(source.family, undefined);
    assert.equal(source.topicLabel, undefined);
    assert.equal(source.body, undefined);
    assert.equal(source.viewpoint, undefined);
    assert.equal(source.provenance, 'owner-local-page-embedding/v1');
    assert.equal(source.extractorVersion, 'main-text-prefix/v1');
    assert.equal(source.embedding.modelId, 'e5-small-q8-browser-main-prefix-v1');
    assert.ok(Math.abs(Math.hypot(...source.embedding.values) - 1) < 1e-6);
  }
  assert.deepEqual(currentMatcher(sources), planAdaptiveTopics({ sources, sourceLinks: [] }).partitions);
});

test('partition scorer counts transitive false joins, splits and unmatched abstentions', () => {
  const rows = [
    { id: 'a', family: 'one', topicLabel: 'event-a', viewpoint: 'for' },
    { id: 'b', family: 'one', topicLabel: 'event-a', viewpoint: 'against' },
    { id: 'c', family: 'one', topicLabel: 'event-b', viewpoint: 'report' },
    { id: 'd', family: 'two', topicLabel: 'event-c', viewpoint: 'report' },
  ];
  const result = scorePartition(rows, [['a', 'b', 'c'], ['d']]);
  assert.deepEqual(result.pairs, { tp: 1, fp: 2, fn: 0, tn: 3, precision: 1 / 3, recall: 1 });
  assert.equal(result.sameEntityFalseJoins, 2);
  assert.deepEqual(result.noMatch, { abstained: 1, total: 2 });
  assert.deepEqual(result.opposingView, { joined: 1, total: 1 });
  assert.equal(result.components.pure, 1);
  assert.throws(() => normalizedPartition(rows, [['a', 'b'], ['c']]), /cover/);
});

test('observed-shape fixture has the intended pairwise geometry', () => {
  const { documents, vectors } = fixtureInputs(observedShape());
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  assert.ok(Math.abs(dot(vectors.get(documents[0].id), vectors.get(documents[1].id)) - 0.90963) < 1e-10);
  assert.ok(Math.abs(dot(vectors.get(documents[1].id), vectors.get(documents[2].id)) - 0.91400) < 1e-10);
});

test('current planner baseline exposes crowd failure and insertion order result', async () => {
  const { documents, vectors } = fixtureInputs(sameEventCrowd(7));
  const result = await evaluateMatcher(documents, vectors, currentMatcher);
  assert.equal(result.score.pairs.tp, 0);
  assert.equal(result.score.pairs.fn, 21);
  assert.equal(result.order.identical, true);
  assert.equal(result.vectorAudit.sameAboveFloor, 21);
  assert.equal(result.vectorAudit.sameTotal, 21);
  const growth = await evaluateGrowth(sameEventCrowd(7), currentMatcher);
  assert.equal(growth.final.score.pairs.tp, 0);
  assert.equal(growth.history.length, 6);
});

test('frozen Luna inventory is intact and whole families stay isolated', async () => {
  const splits = await loadLuna();
  assert.deepEqual(Object.fromEntries(Object.entries(splits).map(([name, rows]) => [name, rows.length])),
    { train: 80, validation: 20, test: 20, challenge: 56 });
});
