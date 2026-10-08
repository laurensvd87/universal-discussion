import '../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregatePilotScores } from './pilot-shadow.js';
import { INPUT_DIMENSIONS, RANK, SCHEMA } from './model.js';

function fixture() {
  const sources = Array.from({ length: 6 }, (_, index) => ({
    id: `source-${String(index + 1).padStart(3, '0')}`,
    title: `Private metadata sentinel ${index}`, url: `https://invalid.test/${index}`,
  }));
  const vectors = new Map(sources.map((source, index) => {
    const vector = new Float64Array(INPUT_DIMENSIONS);
    vector[index === 1 ? 0 : index] = 1;
    return [source.id, vector];
  }));
  const pairs = [];
  for (let left = 0; left < sources.length; left++)
    for (let right = left + 1; right < sources.length; right++)
      pairs.push({ id: `review-item-${String(pairs.length + 1).padStart(3, '0')}`,
        sourceAId: sources[left].id, sourceBId: sources[right].id });
  const classes = pairs.map((pair, index) => ({ pairId: pair.id,
    class: index === 0 ? 'same-atomic-development' :
      index < 5 ? 'related-distinct-development' : 'unrelated' }));
  const head = { schema: SCHEMA, dimensions: INPUT_DIMENSIONS, rank: RANK,
    factors: new Float64Array(INPUT_DIMENSIONS * RANK) };
  return { task: { sources, pairs }, review: { classes }, vectors, head };
}

test('shadow emits only aggregate counts and never source metadata or per-pair decisions', () => {
  const { task, review, vectors, head } = fixture();
  const output = aggregatePilotScores(task, review, vectors, head, 0.9, 0.9);
  assert.equal(output.sourceCount, 6);
  assert.equal(output.pairCount, 15);
  assert.deepEqual(output.classes['same-atomic-development'], {
    pairs: 1, existingFloor: 1, rawValidationGate: 1, learnedValidationGate: 1,
    rawTop1Nominations: 2, learnedTop1Nominations: 2,
  });
  assert.equal(output.classes.unrelated.pairs, 10);
  const rendered = JSON.stringify(output);
  assert.doesNotMatch(rendered, /Private metadata sentinel|invalid\.test|source-001|review-item-001|vector|title|url/iu);
});

test('shadow rejects incomplete or duplicate review classes', () => {
  const input = fixture();
  input.review.classes[14] = input.review.classes[0];
  assert.throws(() => aggregatePilotScores(input.task, input.review, input.vectors,
    input.head, 0.9, 0.9), /Incomplete pilot review/u);
});
