import assert from 'node:assert/strict';
import test from 'node:test';
import { explainPair, score } from './hybrid.js';

const vector = [0.8, 0.6];
const pair = (a, b) => explainPair(a, vector, b, vector);

test('opposing opinions about one subject retain common topic words', () => {
  const support = { title: 'Atlas bridge design deserves support', body: 'The Atlas bridge design allows pedestrians across the river.' };
  const critique = { title: 'Why the Atlas bridge design is a mistake', body: 'Critics dispute the Atlas bridge design for pedestrians crossing the river.' };
  const result = pair(support, critique);
  assert.ok(result.titleOverlap > 0);
  assert.deepEqual(result.conflicts, { version: false, eventMonth: false, direction: false, eventTransition: false });
  assert.ok(result.score > result.cosine);
  assert.equal(score(support, vector, critique, vector), score(critique, vector, support, vector));
});

test('different product versions and events have bounded conflict deductions', () => {
  const v2 = { title: 'Cedar Slate 2 battery review' };
  const v3 = { title: 'Cedar Slate 3 battery review' };
  assert.equal(pair(v2, v3).conflicts.version, true);
  assert.ok(pair(v2, v3).score < pair(v2, v2).score);
  const may = { title: 'May Riverstone bridge vote' };
  const july = { title: 'July Riverstone bridge vote' };
  assert.equal(pair(may, july).conflicts.eventMonth, true);
  assert.equal(pair({ title: 'August analysis of the May Riverstone bridge vote' }, may).conflicts.eventMonth, false);
  assert.equal(pair({ title: 'Route 7 closure' }, { title: 'Route 7 reopening' }).conflicts.eventTransition, true);
});

test('a reversed acquisition is separate while sentiment is irrelevant', () => {
  const forward = { title: 'Atlas buying Lyra opens opportunities' };
  const reverse = { title: 'Lyra buying Atlas is a mistake' };
  assert.equal(pair(forward, reverse).conflicts.direction, true);
  assert.equal(pair(forward, { title: 'Atlas buying Lyra is a mistake' }).conflicts.direction, false);
});

test('missing cues abstain and bounded input rejects malformed vectors', () => {
  const a = { title: 'Short headline' }, b = { title: 'Other headline' };
  const result = pair(a, b);
  assert.ok(Number.isFinite(result.score));
  assert.deepEqual(result.conflicts, { version: false, eventMonth: false, direction: false, eventTransition: false });
  assert.throws(() => score(a, [1, NaN], b, [1, 0]), /Invalid vector/);
  assert.throws(() => score(a, [0, 0], b, [1, 0]), /Zero vector/);
  assert.throws(() => score({ title: 10 }, vector, b, vector), /Document text/);
});
