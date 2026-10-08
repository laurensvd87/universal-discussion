import test from 'node:test';
import assert from 'node:assert/strict';
import { E5_DIMENSIONS, FUSED_DIMENSIONS, FUSED_SCHEMA, MAX_TEXT_CHARACTERS,
  encodeFusedTopic, trainFusedTopicEncoder } from './fused.js';

function e5(seed) {
  const values = new Float64Array(E5_DIMENSIONS);
  values[seed % E5_DIMENSIONS] = 1;
  return values;
}

const head = { schema: FUSED_SCHEMA, dimensions: FUSED_DIMENSIONS,
  sparseShare: 0.45, titleWeight: 2 };

test('single-document inference is deterministic, unit length, bounded, and viewpoint independent', () => {
  const input = { title: 'Council votes for the harbour bridge reopening',
    body: 'Critics question the harbour bridge reopening. The council should check the foundations.' };
  const vector = encodeFusedTopic(input, e5(2), head);
  assert.equal(vector.length, 896);
  assert.deepEqual(vector, encodeFusedTopic(input, e5(2), head));
  assert.ok(Math.abs(Math.hypot(...vector) - 1) < 1e-6);
  const huge = { ...input, body: `${input.body}${' extra words'.repeat(1000)}` };
  const bounded = { ...input, body: huge.body.slice(0, MAX_TEXT_CHARACTERS - input.title.length) };
  assert.deepEqual(encodeFusedTopic(huge, e5(2), head), encodeFusedTopic(bounded, e5(2), head));
  const anotherStance = { ...input, body: 'Supporters welcome the harbour bridge reopening. The council should check the foundations.' };
  assert.notDeepEqual(vector, encodeFusedTopic(anotherStance, e5(2), head));
});

test('Unicode scripts produce vectors without retaining a vocabulary', () => {
  const a = encodeFusedTopic({ title: 'Москва мост', body: 'Новый мост открыт рядом с рекой.' }, e5(1), head);
  const b = encodeFusedTopic({ title: '東京の橋', body: '新しい橋の開通に市民が反応した。' }, e5(1), head);
  assert.equal(a.length, FUSED_DIMENSIONS);
  assert.equal(b.length, FUSED_DIMENSIONS);
  assert.notDeepEqual(a, b);
});

test('training selects a fixed candidate using disjoint families and is deterministic', () => {
  const makeFamily = family => ['bridge', 'school'].flatMap((topic, t) =>
    ['report', 'supportive', 'critical', 'contested'].map((viewpoint, i) => ({
      id: `${family}-${topic}-${viewpoint}`, family, topicLabel: `${family}:${topic}`, viewpoint,
      title: `${family} ${topic} decision`, body: `${family} ${topic} decision receives ${viewpoint} reaction.`,
      seed: t * 4 + i,
    })));
  const training = makeFamily('harbour');
  const validation = makeFamily('valley');
  const vectors = new Map([...training, ...validation].map(document => [document.id, e5(document.seed)]));
  const first = trainFusedTopicEncoder(training, vectors, validation, vectors);
  const second = trainFusedTopicEncoder(training, vectors, validation, vectors);
  assert.deepEqual(first, second);
  assert.ok(first.candidateCount <= 13);
  assert.ok(first.sparseShare >= 0 && first.sparseShare <= 0.6);
  assert.equal(first.training.total, training.length);
  assert.equal(first.training.hardFamily.total, training.length);
  assert.ok(first.training.correct <= first.training.hardFamily.correct,
    'nearest negative across all topics can only be at least as challenging');
  assert.throws(() => trainFusedTopicEncoder(training, vectors, training, vectors), /disjoint/);
});

test('invalid vectors, text, and heads fail closed', () => {
  const doc = { title: 'Bridge decision', body: 'Bridge was reopened.' };
  assert.throws(() => encodeFusedTopic(doc, new Float64Array(384), head), /normalized/);
  assert.throws(() => encodeFusedTopic({ ...doc, body: '' }, e5(1), head), /empty/);
  assert.throws(() => encodeFusedTopic(doc, e5(1), { ...head, sparseShare: NaN }), /head/);
});
