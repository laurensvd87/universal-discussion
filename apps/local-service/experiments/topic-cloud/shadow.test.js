import test from 'node:test';
import assert from 'node:assert/strict';
import { neighbors, selectInsights, evaluate, validate } from './shadow.js';
import { documents, grades, duplicateFlood, unrelatedGrowth } from './fixtures.js';

test('opposing views of the same subject are close without a stance input', () => {
  const result = neighbors('toll-query', documents);
  assert.ok(result.find(row => row.id === 'toll-support'));
  assert.ok(result.find(row => row.id === 'toll-oppose'));
  assert.ok(result.every(row => Number.isFinite(row.score)));
  assert.ok(result.find(row => row.id === 'toll-oppose').score > result.find(row => row.id === 'harbor-bridge').score);
});

test('same actor different development and months-apart product versions remain graded neighbors, not merges', () => {
  const toll = neighbors('toll-query', documents);
  assert.ok(toll.find(row => row.id === 'harbor-bridge'));
  assert.ok(toll.find(row => row.id === 'harbor-bridge').score < toll.find(row => row.id === 'toll-support').score);
  const phone = neighbors('phone-release', documents);
  assert.ok(phone.find(row => row.id === 'phone-update'));
  assert.ok(phone.find(row => row.id === 'phone-eight'));
  assert.ok(phone.every(row => !('topicId' in row) && !('membership' in row)));
});

test('a multi-subject page overlaps two anchored neighborhoods without transitive closure', () => {
  const toll = neighbors('toll-query', documents);
  const bus = neighbors('bus-only', documents);
  assert.ok(toll.some(row => row.id === 'toll-bus'));
  assert.ok(bus.some(row => row.id === 'toll-bus'));
  assert.ok(!toll.some(row => row.id === 'bus-only' && row.score > 0.5));
  assert.ok(!bus.some(row => row.id === 'toll-query' && row.score > 0.5));
});

test('duplicates cannot flood the candidate budget or all four insight slots', () => {
  const corpus = [...documents, ...duplicateFlood];
  const candidateIds = neighbors('toll-query', corpus, { vectorLimit: 5, lexicalLimit: 5 }).map(row => row.id);
  assert.ok(candidateIds.filter(id => id.startsWith('copy-')).length <= 1);
  assert.ok(candidateIds.includes('toll-oppose'));
  const selected = selectInsights('toll-query', corpus).map(row => row.id);
  assert.ok(selected.length <= 4);
  assert.ok(selected.includes('toll-oppose'));
  assert.ok(selected.filter(id => id.startsWith('copy-')).length <= 1);
});

test('language is not a hard exclusion; a vector can retrieve a cross-language page', () => {
  assert.ok(neighbors('toll-query', documents).some(row => row.id === 'toll-de'));
});

test('results and insight choice are invariant to catalog arrival order and deterministic at ties', () => {
  const corpus = [...documents, ...duplicateFlood];
  const orders = [corpus, [...corpus].reverse(), [...corpus.filter((_, i) => i % 2), ...corpus.filter((_, i) => !(i % 2))]];
  assert.deepEqual(orders.map(order => neighbors('toll-query', order)), [neighbors('toll-query', corpus), neighbors('toll-query', corpus), neighbors('toll-query', corpus)]);
  assert.deepEqual(orders.map(order => selectInsights('toll-query', order)), [selectInsights('toll-query', corpus), selectInsights('toll-query', corpus), selectInsights('toll-query', corpus)]);
});

test('more than 100 stored synthetic nodes still yields bounded per-query edges', () => {
  const corpus = [...documents, ...unrelatedGrowth];
  assert.ok(corpus.length > 100);
  assert.equal(validate(corpus), corpus);
  const result = neighbors('toll-query', corpus);
  assert.ok(result.length <= 12);
  assert.ok(result.some(row => row.id === 'toll-oppose'));
});

test('fixture truth can disagree with vector/title similarity', () => {
  const result = neighbors('toll-query', documents);
  const falseFriend = result.find(row => row.id === 'weak-false-friend');
  assert.ok(falseFriend);
  assert.equal(grades[falseFriend.id], 0);
  assert.ok(falseFriend.score > result.find(row => row.id === 'toll-oppose').score);
  const metrics = evaluate('toll-query', documents, grades, result);
  assert.ok(metrics.ndcg < 1);
  assert.equal(metrics.falseJoins, null); // No membership is assigned by this experiment.
});

test('inaccessible suggestions are excluded and fewer than four useful pages may be returned', () => {
  const tiny = [documents[0], { ...documents[1] }, { ...documents[2], accessible: false }];
  assert.deepEqual(selectInsights('toll-query', tiny).map(row => row.id), ['toll-support']);
});
