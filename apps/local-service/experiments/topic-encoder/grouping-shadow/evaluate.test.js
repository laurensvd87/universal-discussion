import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { compare, fixtures, titleCue } from './evaluate.js';

test('title cue resolves opposed framing without reading evaluation labels', () => {
  const { twoViews } = fixtures();
  assert.equal(titleCue(twoViews[0].title), titleCue(twoViews[1].title));
  assert.equal(compare(twoViews).metrics.titleCueCompleteLink90.tp, 1);
});

test('a larger same-event catalog defeats global margin', () => {
  const result = compare(fixtures().crowd).metrics;
  assert.ok(result.current.tp < result.completeLink90.tp);
  assert.equal(result.completeLink90.fn, 0);
});

test('a third stronger neighbor defeats the true pair and tempts vector-only joining', () => {
  const { strongerWrongNeighbor } = fixtures();
  const result = compare(strongerWrongNeighbor).metrics;
  assert.ok(Math.abs(strongerWrongNeighbor[0].embedding.values.reduce((n, x, i) =>
    n + x * strongerWrongNeighbor[1].embedding.values[i], 0) - 0.90963) < 1e-10);
  assert.equal(result.current.tp, 0);
  assert.equal(result.completeLink90.fp, 1);
  assert.equal(result.titleCueCompleteLink90.tp, 1);
  assert.equal(result.titleCueCompleteLink90.fp, 0);
});

test('three views of one event suppress the global margin without a wrong event', () => {
  const result = compare(fixtures().threeSameEvent).metrics;
  assert.equal(result.current.tp, 0);
  assert.equal(result.completeLink90.tp, 3);
});

test('a nearby distinct development exposes the vector-only false-join tradeoff', () => {
  const result = compare(fixtures().adjacent).metrics;
  assert.ok(result.completeLink90.fp > 0);
  assert.equal(result.titleCueCompleteLink90.fp, 0);
  assert.equal(result.titleCueCompleteLink90.fn, 0);
});

test('results do not depend on input order', () => {
  const pages = fixtures().adjacent;
  assert.deepEqual(compare(pages).metrics, compare([...pages].reverse()).metrics);
});
