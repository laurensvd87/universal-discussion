import '../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_DIMENSIONS, projectTopicVector, trainTopicHead } from './model.js';

function example(family, topic, viewpoint) {
  const raw = new Float64Array(INPUT_DIMENSIONS);
  raw[0] = topic === 'one' ? 0.7 : -0.7;
  raw[1] = viewpoint === 'for' ? 0.9 : -0.9;
  raw[2 + 'abc'.indexOf(family)] = 0.7;
  const norm = Math.hypot(...raw);
  return Float64Array.from(raw, value => value / norm);
}
function sample(families) {
  const documents = [], vectors = new Map();
  for (const family of families) for (const topic of ['one', 'two'])
    for (const viewpoint of ['for', 'against']) {
      const id = `${family}-${topic}-${viewpoint}`;
      documents.push({ id, family, topicLabel: `${family}-${topic}`, viewpoint });
      vectors.set(id, example(family, topic, viewpoint));
    }
  return { documents, vectors };
}
function dot(a, b) { return a.reduce((sum, value, k) => sum + value * b[k], 0); }

test('residual head is deterministic, normalized and improves an unseen family triplet', () => {
  const training = sample(['a', 'b']);
  const validation = sample(['c']);
  const first = trainTopicHead(training.documents, training.vectors,
    validation.documents, validation.vectors, { epochs: 60, patience: 10 });
  const second = trainTopicHead(training.documents, training.vectors,
    validation.documents, validation.vectors, { epochs: 60, patience: 10 });
  assert.deepEqual([...first.factors], [...second.factors]);
  assert.equal(first.trainingTriplets, 16);
  assert.ok(first.bestEpoch > 0);
  assert.ok(first.validationLoss < first.identityValidationLoss);
  const a = validation.vectors.get('c-one-for');
  const p = validation.vectors.get('c-one-against');
  const n = validation.vectors.get('c-two-for');
  const baselineMargin = dot(a, p) - dot(a, n);
  const newMargin = dot(projectTopicVector(a, first), projectTopicVector(p, first)) -
    dot(projectTopicVector(a, first), projectTopicVector(n, first));
  assert.ok(newMargin > baselineMargin);
  assert.ok(Math.abs(dot(projectTopicVector(a, first), projectTopicVector(a, first)) - 1) < 1e-10);
});

test('family leakage, bad vectors and invalid heads fail closed', () => {
  const training = sample(['a']);
  assert.throws(() => trainTopicHead(training.documents, training.vectors,
    training.documents, training.vectors), /disjoint/);
  const validation = sample(['c']);
  validation.vectors.set('c-one-for', new Float64Array(INPUT_DIMENSIONS));
  assert.throws(() => trainTopicHead(training.documents, training.vectors,
    validation.documents, validation.vectors), /Invalid validation document/);
  assert.throws(() => projectTopicVector(new Float64Array(INPUT_DIMENSIONS), {}), /Invalid/);
});

test('dense training balances the triplet cap across every family', () => {
  const dense = families => {
    const documents = [], vectors = new Map();
    for (const family of families) for (let topic = 0; topic < 4; topic++)
      for (let viewpoint = 0; viewpoint < 4; viewpoint++) {
        const id = `${family}-${topic}-${viewpoint}`;
        const raw = new Float64Array(INPUT_DIMENSIONS);
        raw[topic] = 0.8;
        raw[20 + viewpoint] = 0.5;
        raw[40 + family] = 0.4;
        const norm = Math.hypot(...raw);
        documents.push({ id, family: `family-${family}`, topicLabel: `${family}-${topic}`,
          viewpoint: `view-${viewpoint}` });
        vectors.set(id, Float64Array.from(raw, value => value / norm));
      }
    return { documents, vectors };
  };
  const training = dense(Array.from({ length: 12 }, (_, i) => i));
  const validation = dense([12]);
  const head = trainTopicHead(training.documents, training.vectors,
    validation.documents, validation.vectors, { epochs: 1, patience: 1 });
  assert.equal(head.trainingDocuments, 192);
  assert.equal(head.trainingTriplets, 4096);
  assert.equal(head.validationTriplets, 576);
});

test('training time budget aborts instead of returning a partial head', () => {
  const training = sample(['a', 'b']);
  const validation = sample(['c']);
  let ticks = 0;
  assert.throws(() => trainTopicHead(training.documents, training.vectors,
    validation.documents, validation.vectors,
    { epochs: 5, patience: 2, maxTrainingMs: 1, clock: () => ticks++ }),
  /exceeded time budget/);
  assert.throws(() => trainTopicHead(training.documents, training.vectors,
    validation.documents, validation.vectors, { epochs: 121, patience: 2 }),
  /Invalid training options/);
});
