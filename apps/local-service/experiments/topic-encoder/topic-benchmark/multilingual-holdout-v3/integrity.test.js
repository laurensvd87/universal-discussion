import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('./holdout.jsonl', import.meta.url));
const text = await readFile(path, 'utf8');
assert.ok(text.endsWith('\n'), 'JSONL must end with newline');
const rows = text.trimEnd().split(/\r?\n/u).map(line => JSON.parse(line));
const keys = ['id', 'family', 'topicLabel', 'viewpoint', 'split', 'title', 'body'].sort();
assert.equal(rows.length, 60);
for (const row of rows) {
  assert.deepEqual(Object.keys(row).sort(), keys);
  assert.equal(row.split, 'multilingual-challenge-v3');
  assert.match(row.id, /^m3-(en|nl|de|fr|es)-\d{3}$/u);
  assert.ok(row.title.trim().length >= 20);
  assert.ok(row.body.trim().length >= 220);
}
assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
assert.equal(new Set(rows.map(row => row.title)).size, rows.length);
assert.equal(new Set(rows.map(row => row.body)).size, rows.length);
const languages = new Map();
const families = new Map();
const events = new Map();
for (const row of rows) {
  const lang = row.id.split('-')[1];
  languages.set(lang, (languages.get(lang) ?? 0) + 1);
  families.set(row.family, (families.get(row.family) ?? new Set()).add(row.topicLabel));
  const event = events.get(row.topicLabel) ?? [];
  event.push(row);
  events.set(row.topicLabel, event);
}
assert.deepEqual([...languages.keys()].sort(), ['de', 'en', 'es', 'fr', 'nl']);
assert.equal(families.size, 5);
assert.equal(events.size, 15);
for (const labels of families.values()) assert.equal(labels.size, 3);
for (const eventRows of events.values()) {
  assert.equal(eventRows.length, 4);
  assert.equal(new Set(eventRows.map(row => row.viewpoint)).size, 4);
  assert.ok(new Set(eventRows.map(row => row.id.split('-')[1])).size >= 3);
}
assert.equal(rows.filter(row => row.id.startsWith('m3-en-')).length, 15);
process.stdout.write('multilingual holdout v3 integrity OK (60 rows, 15 events, 5 languages)\n');
