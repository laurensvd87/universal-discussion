import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { corpus, splits } from './corpus.js';

const sha = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const expected = Object.freeze({
  train: ['9c5da0e9d9767ba0d7a6343ce6a8bba7ba9a3e651e02e3c27598644b77024093', 50, 10],
  validation: ['e3ccbe14bf73621f1ae1c083ac08d286eb16d619715008fcb77a06aaf6c0e423', 20, 4],
  holdout: ['0b12b1cd12a1c691796d6a3870fc8829f300998aeb3fd901ce8d229815a93336', 30, 6],
});

test('corpus is frozen before any encoder evaluation', () => {
  assert.equal(corpus.length, 100);
  for (const [name, [hash, documents, families]] of Object.entries(expected)) {
    assert.equal(splits[name].length, documents);
    assert.equal(new Set(splits[name].map(d => d.family)).size, families);
    assert.equal(sha(splits[name]), hash);
  }
});

test('families and exact texts are isolated across splits', () => {
  const seenFamilies = new Set(), seenTitles = new Set(), seenBodies = new Set(), seenIds = new Set();
  for (const [split, rows] of Object.entries(splits)) {
    const families = new Set(rows.map(d => d.family));
    for (const family of families) {
      assert.ok(!seenFamilies.has(family), `family leak: ${family}`);
      seenFamilies.add(family);
    }
    for (const row of rows) {
      assert.equal(row.split, split);
      assert.ok(!seenIds.has(row.id)); seenIds.add(row.id);
      assert.ok(!seenTitles.has(row.title)); seenTitles.add(row.title);
      assert.ok(!seenBodies.has(row.body)); seenBodies.add(row.body);
      assert.ok(row.title.length >= 20 && row.title.length <= 100);
      assert.ok(row.body.length >= 100 && row.body.length <= 500);
      assert.ok(!/https?:\/\/|@|\[ref\d+\]/i.test(row.title + row.body));
      assert.ok(Object.isFrozen(row));
    }
  }
});

test('every family has two opposite-view subjects and one unmatched article', () => {
  for (const family of new Set(corpus.map(d => d.family))) {
    const docs = corpus.filter(d => d.family === family);
    assert.equal(docs.length, 5);
    const topics = new Map();
    for (const doc of docs) {
      assert.equal(doc.topicId.split('-').slice(0, -1).join('-'), family);
      if (!topics.has(doc.topicId)) topics.set(doc.topicId, []);
      topics.get(doc.topicId).push(doc.stance);
    }
    assert.deepEqual([...topics.values()].map(v => v.length).sort(), [1, 2, 2]);
    assert.deepEqual([...topics.values()].filter(v => v.length === 2).map(v => [...v].sort()),
      [['against', 'for'], ['against', 'for']]);
    assert.deepEqual([...topics.values()].find(v => v.length === 1), ['neutral']);
  }
});
