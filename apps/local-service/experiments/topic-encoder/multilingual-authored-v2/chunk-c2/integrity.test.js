import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'records.jsonl');
const bytes = fs.readFileSync(file);
const digest = crypto.createHash('sha256').update(bytes).digest('hex');
const EXPECTED_SHA256 = '44ac29625dfbd86f7af2c278eab991e042d0e6e0fa64a92d95d3b1f7951bbf6f';

assert.equal(digest, EXPECTED_SHA256, 'records.jsonl bytes changed; review and repin intentionally');
const text = bytes.toString('utf8');
assert.ok(text.endsWith('\n'), 'JSONL must end with one newline');
const lines = text.slice(0, -1).split('\n');
assert.equal(lines.length, 36, 'expected 36 report rows');
assert.ok(lines.every((line) => line.length > 0), 'blank JSONL lines are not allowed');

const rows = lines.map((line, index) => {
  try {
    return JSON.parse(line);
  } catch (error) {
    assert.fail(`line ${index + 1} is not valid JSON: ${error.message}`);
  }
});

const expectedKeys = ['id', 'family', 'eventKey', 'lang', 'viewpoint', 'title', 'body'];
const expectedLanguages = {
  'C201-E1': ['en', 'nl', 'de', 'fr', 'es', 'nl'],
  'C201-E2': ['en', 'nl', 'de', 'fr', 'es', 'de'],
  'C201-E3': ['en', 'nl', 'de', 'fr', 'es', 'fr'],
  'C202-E1': ['en', 'nl', 'de', 'fr', 'es', 'es'],
  'C202-E2': ['en', 'nl', 'de', 'fr', 'es', 'en'],
  'C202-E3': ['en', 'nl', 'de', 'fr', 'es', 'nl'],
};
const languageCues = {
  en: /\b(the|and|with|while|because|nobody|during|within|our|they|were)\b/i,
  nl: /\b(de|het|een|en|van|voor|zijn|werd)\b/i,
  de: /\b(der|die|das|und|nicht|wurde|einer|für)\b/i,
  fr: /\b(le|la|les|des|une|dans|pour|aucun|avec)\b/i,
  es: /\b(el|la|los|las|una|del|para|durante|ningún|ninguna)\b/i,
};
const englishFunctionWords = /\b(the|and|with|while|because|nobody|during|within|our|they|were|staff|reached)\b/i;
const ids = new Set();

for (const row of rows) {
  assert.deepEqual(Object.keys(row), expectedKeys, `${row.id || 'row'} has an unexpected schema`);
  assert.equal(typeof row.id, 'string');
  assert.equal(typeof row.family, 'string');
  assert.equal(typeof row.eventKey, 'string');
  assert.equal(typeof row.lang, 'string');
  assert.equal(typeof row.viewpoint, 'string');
  assert.equal(typeof row.title, 'string');
  assert.equal(typeof row.body, 'string');
  assert.ok(!ids.has(row.id), `duplicate id: ${row.id}`);
  ids.add(row.id);
  assert.ok(Object.hasOwn(expectedLanguages, row.eventKey), `unexpected event: ${row.eventKey}`);
  assert.equal(row.family, row.eventKey.slice(0, 4), `${row.id} has an inconsistent family`);
  assert.ok(['en', 'nl', 'de', 'fr', 'es'].includes(row.lang), `${row.id} has an unsupported language`);
  assert.ok([...row.title].length >= 20, `${row.id} title is shorter than 20 characters`);
  const bodyLength = [...row.body].length;
  assert.ok(bodyLength >= 220 && bodyLength <= 650, `${row.id} body length ${bodyLength} is outside 220–650`);
  assert.ok(languageCues[row.lang].test(row.body), `${row.id} lacks a ${row.lang} language cue`);
  if (row.lang !== 'en') {
    assert.ok(!englishFunctionWords.test(row.body), `${row.id} contains an English function-word cue`);
  }
  assert.ok(!/\b(other event|previous incident|another event|unlike the)\b/i.test(row.body), `${row.id} compares sibling events`);
}

for (const [eventKey, expected] of Object.entries(expectedLanguages)) {
  const eventRows = rows.filter((row) => row.eventKey === eventKey);
  assert.equal(eventRows.length, 6, `${eventKey} must have six reports`);
  assert.deepEqual(eventRows.map((row) => row.lang), expected, `${eventKey} language pattern changed`);
  assert.equal(new Set(eventRows.map((row) => row.viewpoint)).size, 6, `${eventKey} viewpoints must be distinct`);
}
assert.equal(rows.filter((row) => row.family === 'C201').length, 18);
assert.equal(rows.filter((row) => row.family === 'C202').length, 18);

console.log(`C2 integrity OK: ${rows.length} rows; ${Object.keys(expectedLanguages).length} events; SHA-256 ${digest}`);
