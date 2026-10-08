import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const languages = ['en', 'nl', 'de', 'fr', 'es'];
const expectedKeys = ['body', 'family', 'id', 'split', 'title', 'topicLabel', 'viewpoint'];
const frozenDigests = {
  'train.jsonl': '008FF6C9D3B93D6B6A8CF08B1579A4A6C11CF010C97963F02AA5B276D6E03C8B',
  'validation.jsonl': 'FBD3B22A7C4942B7689D6AC8663A5836B861D7AB5991D65C4BBA65ED38086B53',
};
const allIds = new Set();
const allTitles = new Set();
const allBodies = new Set();
const familySplits = new Map();
const rowsBySplit = new Map();

for (const split of ['train', 'validation']) {
  const fileName = `${split}.jsonl`;
  const bytes = readFileSync(join(directory, fileName));
  assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(), frozenDigests[fileName], `${fileName} digest`);
  const rows = bytes.toString('utf8').trimEnd().split(/\r?\n/).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${fileName}:${index + 1}: ${error.message}`);
    }
  });
  rowsBySplit.set(split, rows);

  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), expectedKeys, `${row.id}: exact schema`);
    assert.equal(row.split, split, `${row.id}: split`);
    const idLanguage = row.id.split('-')[1];
    assert.ok(languages.includes(idLanguage), `${row.id}: language code`);
    for (const [name, value, set] of [
      ['id', row.id, allIds],
      ['title', row.title, allTitles],
      ['body', row.body, allBodies],
    ]) {
      assert.equal(typeof value, 'string');
      assert.ok(value.length > 0, `${row.id}: empty ${name}`);
      assert.ok(!set.has(value), `${row.id}: duplicate ${name}`);
      set.add(value);
    }
    assert.ok(Array.from(row.body).length >= 250 && Array.from(row.body).length <= 600, `${row.id}: body length`);

    const previousSplit = familySplits.get(row.family);
    if (previousSplit !== undefined) assert.equal(previousSplit, split, `${row.family}: family crosses splits`);
    familySplits.set(row.family, split);
  }
}

function checkSplit(split, expectedFamilyCount, expectedRows) {
  const rows = rowsBySplit.get(split);
  assert.equal(rows.length, expectedRows, `${split}: row count`);
  const families = new Map();
  const languageCounts = Object.fromEntries(languages.map((language) => [language, 0]));
  for (const row of rows) {
    languageCounts[row.id.split('-')[1]] += 1;
    if (!families.has(row.family)) families.set(row.family, new Map());
    const topics = families.get(row.family);
    if (!topics.has(row.topicLabel)) topics.set(row.topicLabel, []);
    topics.get(row.topicLabel).push(row);
  }
  assert.equal(families.size, expectedFamilyCount, `${split}: broad family count`);
  for (const count of Object.values(languageCounts)) assert.equal(count, expectedRows / languages.length, `${split}: per-language count`);
  for (const [family, topics] of families) {
    assert.equal(topics.size, 2, `${split}/${family}: must cover two adjacent developments`);
    for (const [topicLabel, topicRows] of topics) {
      assert.equal(topicRows.length, languages.length, `${split}/${family}/${topicLabel}: article count`);
      assert.deepEqual(topicRows.map((row) => row.id.split('-')[1]).sort(), [...languages].sort(), `${split}/${family}/${topicLabel}: languages`);
      assert.ok(new Set(topicRows.map((row) => row.viewpoint)).size >= 2, `${split}/${family}/${topicLabel}: viewpoint diversity`);
    }
  }
}

checkSplit('train', 8, 80);
checkSplit('validation', 4, 40);
assert.equal(allIds.size, 120);
console.log('Multilingual synthetic train corpus integrity passed: 120 articles, 24 developments, 12 family-isolated entity groups, five languages.');
