import assert from 'node:assert/strict';
import test from 'node:test';
import { createIncrementalAdaptiveTopicPlanner } from '../src/domain/incremental-adaptive-topics.js';
import { planAdaptiveTopics } from '../src/domain/adaptive-topics.js';
import { priorPlanAdaptiveTopics } from './fixtures/adaptive-topics-prior.js';

const source = (id, coordinates, url = `https://example.org/${id}`) => {
  const values = Array(384).fill(0), norm = Math.hypot(...coordinates);
  coordinates.forEach((value, i) => { values[i] = value / norm; });
  return { id, url, title: `Synthetic ${id}`, provenance: 'owner-local-page-embedding/v1', extractorVersion: 'main-text-prefix/v1',
    embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values } };
};
const link = (id, topicId = `topic-${id}`, method = 'learned-provisional') => ({ sourceId: id, topicId, method });
const state = sources => ({ generation: 'synthetic-incremental-adaptive', sources,
  sourceLinks: sources.map(s => link(s.id)), previousPartitions: [] });
function equivalent(incremental, input) {
  const before = structuredClone(input);
  const expected = planAdaptiveTopics(input), actual = incremental(input);
  assert.deepEqual(actual, expected); assert.deepEqual(input, before);
  return actual;
}
function sparseInventory() {
  const sources = [];
  for (let cluster = 0; cluster < 8; cluster++) for (let member = 0; member < 3; member++) {
    const coords = Array(32).fill(0); coords[cluster * 3] = Math.cos(.04 * member); coords[cluster * 3 + 1] = Math.sin(.04 * member);
    sources.push(source(`c${cluster}-${member}`, coords));
  }
  return state(sources);
}

test('canonical incremental matching reuses unaffected components and ignores discussion/receipt fields', () => {
  const stats = [], incremental = createIncrementalAdaptiveTopicPlanner({ onDiagnostics: value => stats.push(value) });
  const input = sparseInventory(); equivalent(incremental, input);
  assert.equal(stats.at(-1).rebuiltComponents, 8);
  input.revision = 1; input.contributions = [{ body: 'New message, not a semantic input' }];
  input.sources[0].operationId = 'new-visit-receipt'; input.sources[0].operationDigest = 'new-visit-digest';
  equivalent(incremental, input);
  assert.equal(stats.at(-1).rebuiltComponents, 0); assert.equal(stats.at(-1).reusedComponents, 8);
  assert.equal(stats.at(-1).comparedPairs, 0);
  input.sources.push(source('c0-new', [Math.cos(.02), Math.sin(.02)])); input.sourceLinks.push(link('c0-new'));
  equivalent(incremental, input);
  assert.equal(stats.at(-1).rebuiltComponents, 1); assert.equal(stats.at(-1).reusedComponents, 7);
  assert.equal(stats.at(-1).comparedPairs, input.sources.length - 1);
});

test('updates, deletion, bridges, splits and signed-zero geometry equal the complete oracle', () => {
  const stats = [], incremental = createIncrementalAdaptiveTopicPlanner({ onDiagnostics: value => stats.push(value) });
  const input = state([source('a', [1, 0]), source('b', [Math.cos(.56), Math.sin(.56)]), source('remote', [0, 0, 1])]);
  equivalent(incremental, input);
  input.sources.push(source('bridge', [Math.cos(.28), Math.sin(.28)])); input.sourceLinks.push(link('bridge'));
  equivalent(incremental, input); assert.equal(stats.at(-1).reusedComponents, 1);
  input.sources = input.sources.filter(s => s.id !== 'bridge'); input.sourceLinks = input.sourceLinks.filter(l => l.sourceId !== 'bridge');
  equivalent(incremental, input);
  input.sources.find(s => s.id === 'b').embedding.values = source('b', [0, 0, 1]).embedding.values;
  equivalent(incremental, input);
  input.sources[0].embedding.values[2] = -0; equivalent(incremental, input);
  input.generation = 'new-generation'; equivalent(incremental, input); assert.equal(stats.at(-1).reusedComponents, 0);
});

test('manual and provisional current-Topic unions cannot be split by the dependency shortcut', () => {
  const incremental = createIncrementalAdaptiveTopicPlanner();
  const input = state([source('a', [1, 0]), source('b', [0, 1]), source('near', [Math.cos(.02), Math.sin(.02)]), source('far', [0, 0, 1])]);
  input.sourceLinks = [link('a', 'owner', 'manual-confirmed'), link('b', 'owner', 'manual-confirmed'), link('near', 'owner'), link('far')];
  equivalent(incremental, input);
  input.sourceLinks[1] = link('b', 'different-owner', 'manual-confirmed'); equivalent(incremental, input);
  input.sourceLinks = input.sourceLinks.map(l => link(l.sourceId, 'old-incoherent-topic'));
  equivalent(incremental, input);
  input.previousPartitions = [{ sourceIds: input.sources.map(s => s.id), pinnedTopicId: null, retainTight: true }];
  equivalent(incremental, input);
});

test('competing outsiders below the admission floor remain in the affected neighborhood', () => {
  const incremental = createIncrementalAdaptiveTopicPlanner();
  const input = state([source('a', [1, 0]), source('b', [.90, Math.sqrt(1 - .90 ** 2)]),
    source('outsider', [.87, 0, Math.sqrt(1 - .87 ** 2)]), source('remote', [0, 0, 0, 1])]);
  equivalent(incremental, input);
  input.sources = input.sources.filter(s => s.id !== 'outsider'); input.sourceLinks = input.sourceLinks.filter(l => l.sourceId !== 'outsider');
  equivalent(incremental, input);
});

test('supported split decisions retain exact order across disconnected components and initial Topics', () => {
  const sources = [];
  for (const [prefix, offset] of [['a', 0], ['b', 6], ['c', 12]]) {
    const v = Math.sqrt(.985), e = Math.sqrt(.015), c = .94, s = Math.sqrt(1 - c * c);
    for (const [suffix, vector] of [['1', [v, 0, e, 0]], ['4', [v, 0, -e, 0]], ['2', [v * c, v * s, 0, e]], ['3', [v * c, v * s, 0, -e]]]) {
      sources.push(source(prefix + suffix, [...Array(offset).fill(0), ...vector]));
    }
  }
  const input = state(sources); input.sourceLinks = sources.map(s => link(s.id, `old-${s.id[0]}`));
  const incremental = createIncrementalAdaptiveTopicPlanner(); equivalent(incremental, input);
  input.sources.reverse(); input.sourceLinks.reverse(); equivalent(incremental, input);
  input.sources[0].url = 'https://example.org/new-support-url'; equivalent(incremental, input);
});

test('zero/overflow caches fall back exactly, and failed preparations cannot poison the next result', () => {
  const input = sparseInventory();
  for (const options of [{ graphBytes: 0 }, { graphBytes: 1 }, { resultBytes: 0 }]) {
    const incremental = createIncrementalAdaptiveTopicPlanner(options);
    equivalent(incremental, input); equivalent(incremental, input);
  }
  let reject = false;
  const incremental = createIncrementalAdaptiveTopicPlanner({ oracle(value, limits) {
    if (reject) throw Object.assign(new Error('Synthetic failure'), { code: 'capacity' });
    return planAdaptiveTopics(value, limits);
  } });
  equivalent(incremental, input); input.sources[0].url = 'https://example.org/changed'; reject = true;
  assert.throws(() => incremental(input), error => error.code === 'capacity'); reject = false;
  equivalent(incremental, input);
});

test('deterministic incremental mutation differential preserves frozen canonical decisions and partitions', () => {
  let seed = 341;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 2 ** 32; };
  for (let run = 0; run < 16; run++) {
    const input = state([]), incremental = createIncrementalAdaptiveTopicPlanner();
    for (let step = 0; step < 16; step++) {
      if (input.sources.length && step % 5 === 4) {
        const index = Math.floor(random() * input.sources.length), id = input.sources[index].id;
        input.sources.splice(index, 1); input.sourceLinks = input.sourceLinks.filter(l => l.sourceId !== id);
      } else {
        const cluster = Math.floor(random() * 3), angle = random() * .45;
        const values = Array(8).fill(0); values[cluster * 2] = Math.cos(angle); values[cluster * 2 + 1] = Math.sin(angle);
        const id = `source-${run}-${step}`, row = source(id, values);
        input.sources.push(row); input.sourceLinks.push(link(id, random() < .4 ? `old-${cluster}` : `topic-${id}`,
          random() < .15 ? 'manual-confirmed' : 'learned-provisional'));
      }
      const result = equivalent(incremental, input);
      assert.deepEqual(result, priorPlanAdaptiveTopics(input));
      if (step % 3 === 2) input.previousPartitions = result.partitions.map(part => ({ ...part }));
    }
  }
});
