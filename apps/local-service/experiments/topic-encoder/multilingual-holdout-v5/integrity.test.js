import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const bytes = readFileSync(new URL('./holdout.jsonl', import.meta.url));
const digest = createHash('sha256').update(bytes).digest('hex');
const EXPECTED_SHA256 = '618c0f470f62a7f2904cfeba43012f540c199f700b9032a5145de75bde8da604';
const languages = ['de', 'en', 'es', 'fr', 'nl'];
const viewpoints = ['consumer_public', 'critical', 'neutral', 'skeptical', 'supportive'];
const fields = ['body', 'family', 'id', 'split', 'title', 'topicLabel', 'viewpoint'];

test('frozen synthetic holdout has intact exact-event groups and broad perspective coverage', () => {
  assert.equal(digest, EXPECTED_SHA256);
  const rows = bytes.toString('utf8').trimEnd().split(/\r?\n/u).map(JSON.parse);
  assert.equal(rows.length, 50);
  assert.equal(new Set(rows.map(row => row.id)).size, 50);
  assert.equal(new Set(rows.map(row => row.title)).size, 50);
  assert.equal(new Set(rows.map(row => row.body)).size, 50);
  const families = new Map(), topics = new Map();
  const cells = new Map();
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), fields);
    assert.match(row.id, /^v5-\d{2}-(?:en|nl|de|fr|es)$/u);
    assert.equal(row.split, 'holdout');
    for (const field of ['family', 'topicLabel', 'title', 'body'])
      assert.ok(typeof row[field] === 'string' && row[field].trim());
    assert.ok(viewpoints.includes(row.viewpoint));
    const words = row.body.trim().split(/\s+/u).length;
    assert.ok(words >= 45 && words <= 75);
    const lang = row.id.split('-').at(-1);
    const cell = `${lang}:${row.viewpoint}`;
    cells.set(cell, (cells.get(cell) ?? 0) + 1);
    if (!families.has(row.family)) families.set(row.family, new Set());
    families.get(row.family).add(row.topicLabel);
    if (!topics.has(row.topicLabel)) topics.set(row.topicLabel, []);
    topics.get(row.topicLabel).push(row);
  }
  assert.equal(families.size, 5);
  assert.equal(topics.size, 10);
  for (const topicLabels of families.values()) assert.equal(topicLabels.size, 2);
  for (const group of topics.values()) {
    assert.equal(group.length, 5);
    assert.equal(new Set(group.map(row => row.family)).size, 1);
    assert.deepEqual(group.map(row => row.id.split('-').at(-1)).sort(), languages);
    assert.deepEqual(group.map(row => row.viewpoint).sort(), viewpoints);
  }
  // Every language/viewpoint combination occurs, but the corpus is not
  // perfectly counterbalanced; README records that limitation explicitly.
  assert.equal(cells.size, 25);
  for (const count of cells.values()) assert.ok(count >= 1 && count <= 4);
});
