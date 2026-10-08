import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('./holdout.jsonl', import.meta.url));
const text = readFileSync(path, 'utf8');
const lines = text.trimEnd().split(/\r?\n/);
const records = lines.map((line, index) => {
  try {
    return JSON.parse(line);
  } catch (error) {
    throw new Error(`Invalid JSON on line ${index + 1}: ${error.message}`);
  }
});

const fields = ['id', 'family', 'topicLabel', 'viewpoint', 'split', 'title', 'body'];
assert.equal(records.length, 48, 'expected 48 articles');
for (const [index, record] of records.entries()) {
  assert.deepEqual(Object.keys(record).sort(), [...fields].sort(), `line ${index + 1} fields`);
  assert.equal(record.split, 'multilingual-challenge-v2', `line ${index + 1} split`);
  assert.ok(record.body.length >= 250 && record.body.length <= 600, `line ${index + 1} body length ${record.body.length}`);
  assert.match(record.id, /^m2-(en|nl|de|fr|es)-\d{2}$/, `line ${index + 1} language-coded id`);
  for (const field of fields) assert.ok(typeof record[field] === 'string' && record[field].length > 0, `line ${index + 1} ${field}`);
}

for (const field of ['id', 'title', 'body']) {
  assert.equal(new Set(records.map(record => record[field])).size, records.length, `${field} values must be unique`);
}

const families = new Map();
for (const record of records) {
  const topics = families.get(record.family) ?? new Map();
  const members = topics.get(record.topicLabel) ?? [];
  members.push(record);
  topics.set(record.topicLabel, members);
  families.set(record.family, topics);
}
assert.equal(families.size, 6, 'expected six broad families');
for (const [family, topics] of families) {
  assert.equal(topics.size, 2, `${family} should have two developments`);
  for (const [topic, members] of topics) {
    assert.equal(members.length, 4, `${family}/${topic} should have four articles`);
    assert.equal(new Set(members.map(record => record.viewpoint)).size, 4, `${family}/${topic} should have distinct viewpoints`);
    const languages = members.map(record => record.id.split('-')[1]);
    assert.equal(new Set(languages).size, 3, `${family}/${topic} should use three languages`);
    assert.equal(languages.filter(language => language === 'en').length, 2, `${family}/${topic} should have two English articles`);
    assert.ok(languages.includes('nl') || languages.includes('de') || languages.includes('fr') || languages.includes('es'), `${family}/${topic} non-English coverage`);
    assert.ok(languages.filter(language => language !== 'en').length >= 2, `${family}/${topic} needs at least two non-English articles`);
  }
}

console.log('multilingual-holdout-v2 integrity: 48 records, 6 families, 12 developments; no matcher loaded.');
