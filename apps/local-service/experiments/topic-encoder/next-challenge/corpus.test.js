import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { documents } from './corpus.js';

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const FROZEN_SHA256 = 'b120406f1405b0f2ed5e70ce667d733ce384206df51d9fb2cc49e89a825314e9';

test('next challenge corpus is frozen and structurally complete', () => {
  assert.equal(digest(documents), FROZEN_SHA256);
  assert.equal(Object.isFrozen(documents), true);
  assert.equal(documents.length, 95);

  for (const document of documents) {
    assert.deepEqual(Object.keys(document).sort(), ['body', 'family', 'id', 'title', 'topicLabel', 'viewpoint']);
    assert.equal(Object.isFrozen(document), true);
    assert.match(document.id, /^next-challenge-\d{3}$/);
    assert.match(document.family, /^[a-z]+(?:-[a-z]+)*$/);
    assert.match(document.topicLabel, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.match(document.viewpoint, /^(supports|opposes|neutral)$/);
    assert.ok(document.title.length > 12);
    assert.ok(document.body.length > 35);
  }
});

test('each family contains two opposed precise subjects and one no-match singleton', () => {
  const byFamily = new Map();
  for (const document of documents) {
    const group = byFamily.get(document.family) ?? [];
    group.push(document);
    byFamily.set(document.family, group);
  }

  assert.ok(byFamily.size >= 15 && byFamily.size <= 20);
  for (const family of byFamily.values()) {
    assert.equal(family.length, 5);
    const labels = new Map();
    for (const document of family) {
      const group = labels.get(document.topicLabel) ?? [];
      group.push(document);
      labels.set(document.topicLabel, group);
    }
    assert.equal(labels.size, 3);
    const pairs = [...labels.values()].filter((group) => group.length === 2);
    const singletons = [...labels.values()].filter((group) => group.length === 1);
    assert.equal(pairs.length, 2);
    assert.equal(singletons.length, 1);
    for (const pair of pairs) {
      assert.deepEqual(new Set(pair.map((document) => document.viewpoint)), new Set(['supports', 'opposes']));
    }
    assert.equal(singletons[0][0].viewpoint, 'neutral');
  }
});
