import assert from 'node:assert/strict';
import test from 'node:test';
import { createRelatedSourcesPreparation, parseRelatedEmbeddingJson, prepareRelatedSources,
  rankRelatedSources } from '../browser/core/related-sources.js';

const source = (id, values, topicId = null) => ({ id, url: `https://example.org/${id}`,
  title: `Synthetic ${id}`, topicId, embedding: { modelId: 'synthetic', values } });
const invalid = error => error instanceof TypeError && error.message === 'Invalid related-source input';

test('batched preparation preserves exact ranking, all thresholds, ties, manual precedence and ownership', () => {
  const query = source('query', [1, 0]);
  const candidates = [source('strong', [.9, Math.sqrt(1 - .9 ** 2)]), source('weak', [.81, Math.sqrt(1 - .81 ** 2)]),
    source('same', [0, 1], 'manual'), source('tie', [.9, Math.sqrt(1 - .9 ** 2)]), source('query', [1, 0])];
  for (const size of [1, 2, 3, 128]) {
    const preparation = createRelatedSourcesPreparation();
    for (let offset = 0; offset < candidates.length; offset += size) preparation.append(candidates.slice(offset, offset + size));
    const prepared = preparation.finish();
    for (const limit of [0, 1, 20]) for (const minSimilarity of [-1, .8, .88, 1]) {
      const options = { limit, minSimilarity, fallbackMinSimilarity: Math.min(.8, minSimilarity) };
      assert.deepEqual(prepared.rank(query, options), rankRelatedSources(query, candidates, options));
      assert.deepEqual(prepared.rank({ ...query, topicId: 'manual' }, options),
        prepareRelatedSources(candidates).rank({ ...query, topicId: 'manual' }, options));
    }
    assert.throws(() => preparation.append([]), invalid);
    assert.throws(() => preparation.finish(), invalid);
  }
  const candidate = source('owned', [1, 0]), preparation = createRelatedSourcesPreparation();
  preparation.append([candidate]); candidate.embedding.values[0] = -1; candidate.title = 'Changed';
  assert.equal(preparation.finish().rank(query)[0].title, 'Synthetic owned');
});

test('invalid late batches poison preparation; aggregate size guard cannot be bypassed by batching', () => {
  const preparation = createRelatedSourcesPreparation();
  preparation.append([source('valid', [1, 0])]);
  assert.throws(() => preparation.append([source('bad', [0, 0])]), invalid);
  assert.throws(() => preparation.finish(), invalid);
  assert.throws(() => preparation.append([]), invalid);
  const large = { ...source('large', [1]), url: `https://example.org/${'x'.repeat(8100)}` };
  const bounded = createRelatedSourcesPreparation();
  bounded.append(Array(1100).fill(large));
  assert.throws(() => bounded.append(Array(1100).fill(large)), invalid);
  assert.throws(() => bounded.finish(), invalid);
});

test('parser-owned frozen embeddings retain exact arithmetic without trusting caller array identity', () => {
  for (const values of [[1, 0], [.8, .6], [Number.MAX_VALUE, Number.MAX_VALUE / 2],
    [Number.MIN_VALUE, Number.MIN_VALUE], [-0, 1]]) {
    // JSON's own signed-zero conversion is part of persisted JSON, not a
    // relaxed mirror comparison; binary transport separately preserves -0.
    const json = JSON.stringify({ modelId: 'synthetic', values });
    const parsed = parseRelatedEmbeddingJson(json), ordinary = JSON.parse(json);
    assert.ok(Object.isFrozen(parsed) && Object.isFrozen(parsed.values));
    assert.deepEqual(parsed, ordinary);
    assert.throws(() => { parsed.values[0] = 7; }, TypeError);
    const query = source('query', ordinary.values);
    const branded = { ...source('branded', ordinary.values), embedding: parsed };
    for (const floor of [-1, .8, .88, 1]) {
      assert.deepEqual(prepareRelatedSources([branded]).rank(query, { minSimilarity: floor }),
        prepareRelatedSources([structuredClone(branded)]).rank(query, { minSimilarity: floor }));
    }
  }
  for (const json of [null, {}, 'null', '[]', '{}', '{"modelId":"synthetic","values":[]}',
    '{"modelId":"synthetic","values":[null]}', '{"modelId":"synthetic","values":[1e999]}',
    '{"modelId":"synthetic","values":[1],"extra":true}',
    JSON.stringify({ modelId: 'synthetic', values: Array(1537).fill(1) })])
    assert.throws(() => parseRelatedEmbeddingJson(json), invalid);
});
