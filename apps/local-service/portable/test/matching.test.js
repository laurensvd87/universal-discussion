import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { fixtureVector } from '../src/fixture.js';

test('exact pgvector cosine reference respects metadata and never changes canonical membership', async (t) => {
  const c = await setup(t);
  const make = (id, vector, patch = {}) => ({ id, url: `https://${id}.example/article`, title: 'Synthetic', topicId: c.ids.otherTopic, discussionId: c.ids.otherDiscussion, vector, model: 'synthetic-e5-384-v1', extractor: 'synthetic-v1', public: true, ...patch });
  await c.repository.seedSynthetic({ sources: [make('orthogonal', fixtureVector(0,1)), make('different-model', fixtureVector(), { model: 'other' }), make('different-extractor', fixtureVector(), { extractor: 'other' }), make('private-source', fixtureVector(), { public: false })] });
  const result = await c.repository.findRelated({ sourceId: c.ids.source });
  assert.deepEqual(result.items.map((r) => r.id), [c.ids.relatedSource, c.ids.sameTopicSource, 'orthogonal']);
  assert.ok(Math.abs(result.items[0].similarity - 0.8) < 1e-6);
  assert.ok(Math.abs(result.items[1].similarity - 0.6) < 1e-6);
  assert.ok(Math.abs(result.items[2].similarity) < 1e-6);
  assert.equal(result.items[0].topicId, c.ids.otherTopic);
  assert.deepEqual(Object.keys(result.items[0]).sort(), ['discussionId','id','similarity','title','topicId','url']);
  assert.equal((await c.repository.resolveSource({ url: 'https://transport.example/article' })).topicId, c.ids.topic);
});
