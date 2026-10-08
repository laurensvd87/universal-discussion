import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const languages = ['en', 'nl', 'de', 'fr', 'es'];
const expectedKeys = ['body', 'family', 'id', 'split', 'title', 'topicLabel', 'viewpoint'];
const digests = {
  'train-part-1.jsonl': '94A14A36B016795B504E22BE9C5C3E1AADB372BDD6D013B9B791E09AC5D81254',
  'train-part-2.jsonl': '7240A9848CEE76A2857A737740E4F280F9A9CD7C15D1B38689C9246FF2160DB6',
  'validation.jsonl': 'EF9F405DF2F8C98054E4F5B465F4FEC3D06287D537E9A08BE3455CE36D35DB99',
};
const expectedSplit = (file) => file === 'validation.jsonl' ? 'validation' : 'train';
const ids = new Set(), titles = new Set(), bodies = new Set(), splitByFamily = new Map();
const rowsByFamily = new Map();

for (const [file, expectedDigest] of Object.entries(digests)) {
  const bytes = readFileSync(join(directory, file));
  assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(), expectedDigest, `${file} digest`);
  const rows = bytes.toString('utf8').trimEnd().split(/\r?\n/).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`${file}:${index + 1}: ${error.message}`); }
  });
  assert.equal(rows.length, 60, `${file}: record count`);
  const fileFamilies = new Set();
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), expectedKeys, `${row.id}: schema`);
    assert.equal(row.split, expectedSplit(file));
    assert.ok(languages.includes(row.id.split('-')[1]), `${row.id}: language`);
    for (const [value, set] of [[row.id, ids], [row.title, titles], [row.body, bodies]]) {
      assert.equal(typeof value, 'string'); assert.ok(value.length > 0); assert.ok(!set.has(value), `duplicate value: ${row.id}`); set.add(value);
    }
    assert.ok(Array.from(row.body).length >= 120 && Array.from(row.body).length <= 400, `${row.id}: body length`);
    const priorSplit = splitByFamily.get(row.family);
    if (priorSplit) assert.equal(priorSplit, row.split, `${row.family}: split isolation`);
    splitByFamily.set(row.family, row.split);
    fileFamilies.add(row.family);
    if (!rowsByFamily.has(row.family)) rowsByFamily.set(row.family, new Map());
    const topics = rowsByFamily.get(row.family);
    if (!topics.has(row.topicLabel)) topics.set(row.topicLabel, []);
    topics.get(row.topicLabel).push(row);
  }
  assert.equal(fileFamilies.size, 4, `${file}: family count`);
}

assert.equal(ids.size, 180);
assert.equal(rowsByFamily.size, 12);
for (const [family, topics] of rowsByFamily) {
  assert.equal(topics.size, 3, `${family}: development count`);
  for (const [label, articles] of topics) {
    assert.equal(articles.length, 5, `${family}/${label}: record count`);
    assert.deepEqual(articles.map(row => row.id.split('-')[1]).sort(), [...languages].sort());
    assert.ok(new Set(articles.map(row => row.viewpoint)).size >= 4, `${family}/${label}: viewpoint coverage`);
  }
}
console.log('Multilingual synthetic training v2 integrity passed: 180 articles, 36 developments, 12 family-isolated groups, five languages.');
