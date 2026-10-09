import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'holdout.jsonl');
const bytes = readFileSync(file);
const expectedSha256 = '032EAA490D0AE6B9067EC479BE4A80B563229606F83CE0F43A1BC9EFD4098AEB';
const actualSha256 = createHash('sha256').update(bytes).digest('hex').toUpperCase();
assert.equal(actualSha256, expectedSha256, 'frozen UTF-8 corpus digest');

const lines = bytes.toString('utf8').trimEnd().split('\n');
const rows = lines.map((line, index) => {
  const row = JSON.parse(line);
  assert.deepEqual(Object.keys(row), ['id', 'family', 'topicLabel', 'viewpoint', 'split', 'title', 'body'], `schema at line ${index + 1}`);
  return row;
});
assert.equal(rows.length, 60);

const languages = ['en', 'nl', 'de', 'fr', 'es'];
const viewpoints = ['supportive', 'critical', 'neutral', 'skeptical', 'consumer'];
const unique = (field) => {
  const values = rows.map(row => row[field]);
  assert.equal(new Set(values).size, values.length, `unique ${field}`);
};
for (const field of ['id', 'title', 'body']) unique(field);

const families = new Map();
const topics = new Map();
const matrix = new Map(languages.map(lang => [lang, new Map(viewpoints.map(view => [view, 0]))]));
for (const row of rows) {
  assert.equal(row.split, 'holdout');
  for (const field of ['id', 'family', 'topicLabel', 'title', 'body']) {
    assert.equal(typeof row[field], 'string', `${row.id} ${field} type`);
    assert.ok(row[field].trim(), `${row.id} ${field} populated`);
  }
  const lang = row.id.match(/-(en|nl|de|fr|es)$/)?.[1];
  assert.ok(lang, `${row.id} language suffix`);
  assert.ok(viewpoints.includes(row.viewpoint), `${row.id} known viewpoint`);
  const words = row.body.trim().split(/\s+/u).length;
  assert.ok(words >= 45 && words <= 85, `${row.id} body has ${words} words`);
  matrix.get(lang).set(row.viewpoint, matrix.get(lang).get(row.viewpoint) + 1);
  if (!families.has(row.family)) families.set(row.family, new Set());
  families.get(row.family).add(row.topicLabel);
  if (!topics.has(row.topicLabel)) topics.set(row.topicLabel, []);
  topics.get(row.topicLabel).push({ ...row, lang });
}
assert.equal(families.size, 3);
assert.equal(topics.size, 12);
for (const [family, labels] of families) assert.equal(labels.size, 4, `${family} topics`);
for (const [label, reports] of topics) {
  assert.equal(reports.length, 5, `${label} reports`);
  assert.deepEqual(new Set(reports.map(r => r.lang)), new Set(languages), `${label} languages`);
  assert.deepEqual(new Set(reports.map(r => r.viewpoint)), new Set(viewpoints), `${label} viewpoints`);
  assert.equal(new Set(reports.map(r => r.family)).size, 1, `${label} family`);
}
for (const [language, views] of matrix) {
  for (const [viewpoint, count] of views) {
    assert.ok(count >= 2 && count <= 3, `${language}/${viewpoint} occurs ${count} times`);
  }
}
console.log(`PASS: ${rows.length} reports; 3 families; 12 topics; SHA-256 ${actualSha256}`);
