import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const rows = (await readFile(join(here, 'holdout.jsonl'), 'utf8'))
  .trimEnd()
  .split(/\r?\n/)
  .map((line) => JSON.parse(line));

assert.equal(rows.length, 24);
const required = ['id', 'family', 'topicLabel', 'viewpoint', 'split', 'title', 'body'];
const ids = new Set();
const titles = new Set();
const bodies = new Set();
const families = new Map();
const topics = new Map();

for (const row of rows) {
  assert.deepEqual(Object.keys(row).sort(), [...required].sort());
  for (const key of required) assert.equal(typeof row[key], 'string', `${key} must be a string`);
  assert.equal(row.split, 'multilingual-challenge');
  assert.ok(row.body.length >= 250 && row.body.length <= 600, `${row.id} body has ${row.body.length} chars`);
  assert.ok(!ids.has(row.id), `duplicate id ${row.id}`);
  assert.ok(!titles.has(row.title), `duplicate title ${row.title}`);
  assert.ok(!bodies.has(row.body), `duplicate body ${row.id}`);
  ids.add(row.id);
  titles.add(row.title);
  bodies.add(row.body);
  families.set(row.family, (families.get(row.family) ?? 0) + 1);
  topics.set(row.topicLabel, (topics.get(row.topicLabel) ?? 0) + 1);
}

assert.equal(families.size, 4);
assert.ok([...families.values()].every((count) => count === 6));
assert.equal(topics.size, 8);
assert.ok([...topics.values()].every((count) => count === 3));
for (const family of families.keys()) {
  const familyTopics = new Set(rows.filter((row) => row.family === family).map((row) => row.topicLabel));
  assert.equal(familyTopics.size, 2, `${family} must contain two adjacent developments`);
}

console.log('Integrity OK: 24 records, 4 families, 8 developments, unique text, body lengths 250–600.');
