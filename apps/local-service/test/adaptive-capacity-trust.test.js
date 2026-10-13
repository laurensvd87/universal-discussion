import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { planAdaptiveTopics, ADAPTIVE_TOPIC_POLICY } from '../src/domain/adaptive-topics.js';
import { createIncrementalAdaptiveTopicPlanner } from '../src/domain/incremental-adaptive-topics.js';
import { priorPlanAdaptiveTopics } from './fixtures/adaptive-topics-prior.js';

const source = (id, values) => {
  const norm = Math.hypot(...values);
  return { id, title: `Synthetic ${id}`, url: `https://example.org/articles/${id}`,
    provenance: 'owner-local-page-embedding/v1', extractorVersion: 'main-text-prefix/v1',
    embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1',
      values: [...values.map(value => value / norm), ...Array(384 - values.length).fill(0)] } };
};
const link = (sourceId, topicId, method = 'learned-provisional') => ({ sourceId, topicId, method });
function blocks(count = 120) {
  return Array.from({ length: count }, (_, index) => {
    const values = Array(384).fill(0); values[Math.floor(index / 5) % 30] = Math.sqrt(.97);
    values[30 + index % 150] = Math.sqrt(.03);
    return source(`source-${String(index).padStart(4, '0')}`, values);
  });
}
function exact(input, planner = planAdaptiveTopics) {
  const before = structuredClone(input), expected = priorPlanAdaptiveTopics(input);
  assert.deepEqual(planner(input), expected, 'complete partitions, pins, sticky retention and decisions must equal the frozen policy');
  assert.deepEqual(input, before, 'matching preparation cannot mutate retained Source/link inputs');
  return expected;
}

test('Trust: optimized canonical capacity keeps exact constants, boundary arithmetic, duplicate support and manual competition', () => {
  assert.deepEqual(ADAPTIVE_TOPIC_POLICY, { version: 'adaptive-supported-partitions/v1', floor: .90, tight: .94,
    competingMargin: .04, duplicateSimilarity: .995, minimumSupport: 2 });
  for (const boundary of [.86, .90, .94, .995]) for (const offset of [-1e-12, 0, 1e-12]) {
    const score = boundary + offset;
    const a = source('a', [1, 0]), b = source('b', [score, Math.sqrt(1 - score ** 2)]),
      c = source('c', [1 + score, Math.sqrt(1 - score ** 2)]);
    for (const pins of [false, true]) {
      const input = { sources: [a, b, c, { ...a, id: 'duplicate' }],
        sourceLinks: pins ? [link('a', 'topic-a', 'manual-confirmed'), link('b', 'topic-b', 'manual-confirmed')] : [],
        previousPartitions: [{ sourceIds: ['a', 'duplicate'], pinnedTopicId: pins ? 'topic-a' : null, retainTight: true }] };
      exact(input); exact({ ...input, sources: [...input.sources].reverse(), sourceLinks: [...input.sourceLinks].reverse() });
    }
  }
});

test('Trust: larger mixed evidence agrees with frozen complete-link including cross-component manual containers', t => {
  const sources = blocks();
  sources.push({ ...sources[0], id: 'duplicate-visit' });
  const sourceLinks = sources.map((entry, index) => link(entry.id, `topic-${Math.floor(index / 5)}`));
  // Manual destinations can connect otherwise unrelated geometric components.
  sourceLinks[0] = link(sources[0].id, 'manual-container', 'manual-confirmed');
  sourceLinks[35] = link(sources[35].id, 'manual-container', 'manual-confirmed');
  sourceLinks[120] = link('duplicate-visit', 'manual-container', 'manual-confirmed');
  const input = { generation: 'synthetic-capacity-generation', sources, sourceLinks,
    previousPartitions: [{ sourceIds: sources.slice(5, 10).map(entry => entry.id), pinnedTopicId: null, retainTight: true }] };
  const start = performance.now(); const expected = exact(input);
  const incremental = createIncrementalAdaptiveTopicPlanner();
  assert.deepEqual(incremental(input), expected); assert.deepEqual(incremental(input), expected);
  const changed = structuredClone(input); changed.sources[17] = source(changed.sources[17].id, [0, 0, 1]);
  exact(changed, incremental);
  t.diagnostic(`121 Sources, full frozen/optimized/incremental equality in ${(performance.now() - start).toFixed(1)}ms; original ten-second budget retained`);
});

test('Trust: optional evidence-cache exhaustion falls back to exact canonical matching, never a partial or approximate result', () => {
  const sources = blocks(35), input = { generation: 'fallback-generation', sources,
    sourceLinks: sources.map(entry => link(entry.id, 'current-topic')), previousPartitions: [] };
  const fallback = createIncrementalAdaptiveTopicPlanner({ graphBytes: 0, resultBytes: 0 });
  exact(input, fallback);
  const changed = structuredClone(input); changed.sourceLinks[0].method = 'manual-confirmed';
  exact(changed, fallback);
});

test('Trust: canonical CPU capacity fails closed without extending its deadline or mutating accepted inputs', t => {
  const input = { sources: blocks(120), sourceLinks: [] }, before = structuredClone(input);
  for (const planner of [priorPlanAdaptiveTopics, planAdaptiveTopics]) {
    let calls = 0; const clock = t.mock.method(performance, 'now', () => ++calls === 1 ? 0 : 10001);
    try {
      assert.throws(() => planner(input), error => error.code === 'capacity');
      assert.deepEqual(input, before);
    } finally { clock.mock.restore(); }
  }
  for (const workBudgetMs of [0, -1, 10001, NaN, Infinity])
    assert.throws(() => planAdaptiveTopics(input, { workBudgetMs }), TypeError);
});
