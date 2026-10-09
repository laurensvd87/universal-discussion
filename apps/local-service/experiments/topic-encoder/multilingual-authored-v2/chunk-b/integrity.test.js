import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const directory = import.meta.dirname;
const bytes = readFileSync(path.join(directory, 'records.jsonl'));
const digest = createHash('sha256').update(bytes).digest('hex');
assert.equal(digest, '2762da5ce908a2e67092958beaf3f6cd4f56515aa29d61962aa7c3f870ca2908');

const text = bytes.toString('utf8');
assert.ok(text.endsWith('\n'), 'JSONL must end with a newline');
const records = text.trimEnd().split('\n').map((line, index) => {
  let record;
  assert.doesNotThrow(() => { record = JSON.parse(line); }, `invalid JSON on line ${index + 1}`);
  assert.deepEqual(Object.keys(record).sort(), ['body', 'eventKey', 'family', 'id', 'lang', 'title', 'viewpoint']);
  assert.ok(record.title.length >= 20, `${record.id}: title too short`);
  assert.ok(record.body.length >= 220, `${record.id}: body too short`);
  assert.match(record.id, /^B0[1-6]-E[1-3]-0[1-6]$/);
  assert.equal(record.family, record.eventKey.slice(0, 3));
  assert.match(record.lang, /^(en|nl|de|fr|es)$/);
  return record;
});

assert.equal(records.length, 108);
assert.equal(new Set(records.map(record => record.id)).size, 108);
const events = new Map();
for (const record of records) {
  const group = events.get(record.eventKey) ?? [];
  group.push(record);
  events.set(record.eventKey, group);
}
assert.equal(events.size, 18);
const repeatedLanguageCounts = new Map(['en', 'nl', 'de', 'fr', 'es'].map(lang => [lang, 0]));
for (const [eventKey, group] of events) {
  assert.equal(group.length, 6, `${eventKey}: expected six reports`);
  assert.equal(new Set(group.map(record => record.lang)).size, 5, `${eventKey}: expected all five languages with one repeat`);
  const languageCounts = new Map();
  for (const record of group) languageCounts.set(record.lang, (languageCounts.get(record.lang) ?? 0) + 1);
  const repeatedLanguage = [...languageCounts].find(([, count]) => count === 2)?.[0];
  assert.ok(repeatedLanguage, `${eventKey}: expected exactly one repeated language`);
  repeatedLanguageCounts.set(repeatedLanguage, repeatedLanguageCounts.get(repeatedLanguage) + 1);
  assert.equal(new Set(group.map(record => record.viewpoint)).size, 6, `${eventKey}: viewpoints must vary`);
}
const repeatCounts = [...repeatedLanguageCounts.values()];
assert.ok(Math.max(...repeatCounts) - Math.min(...repeatCounts) <= 1, 'repeated language must be balanced across events');

for (const role of ['local journalist', 'budget watcher', 'skeptical columnist']) {
  const byLanguage = new Map(['en', 'nl', 'de', 'fr', 'es'].map(lang => [lang,
    records.filter(record => record.viewpoint === role && record.lang === lang).length]));
  const counts = [...byLanguage.values()];
  assert.ok(counts.every(count => count >= 2), `${role}: recurring role must appear across all languages`);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 3, `${role}: role distribution is too concentrated by language`);
}

console.log(`Integrity passed: ${records.length} records, ${events.size} events, SHA-256 ${digest}`);
