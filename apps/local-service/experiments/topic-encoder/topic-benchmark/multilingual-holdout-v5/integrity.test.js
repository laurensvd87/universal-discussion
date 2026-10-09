import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const bytes = fs.readFileSync(path.join(dir, 'holdout.jsonl'));
const expectedSha256 = '1B8D086DC5CEE9CB4CBFC31636CC690055CB7E99CBA699738BA1A8C3EE096450';
const actualSha256 = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
assert.equal(actualSha256, expectedSha256, 'holdout bytes changed after freeze');

const text = bytes.toString('utf8');
assert.ok(text.endsWith('\n'), 'JSONL must end with a newline');
const lines = text.trimEnd().split(/\r?\n/);
const rows = lines.map((line, index) => {
  try {
    return JSON.parse(line);
  } catch (error) {
    assert.fail(`line ${index + 1} is invalid JSON: ${error.message}`);
  }
});

const keys = ['body', 'family', 'id', 'split', 'title', 'topicLabel', 'viewpoint'];
const baseLabels = {
  bq01: 'bracken-quay', bq02: 'bracken-quay', bq03: 'bracken-quay', bq04: 'bracken-quay',
  lc01: 'luma-commons', lc02: 'luma-commons', lc03: 'luma-commons', lc04: 'luma-commons',
  vo01: 'veyra-orchard', vo02: 'veyra-orchard', vo03: 'veyra-orchard', vo04: 'veyra-orchard',
  sr01: 'serein-relay', sr02: 'serein-relay', sr03: 'serein-relay', sr04: 'serein-relay',
  ob01: 'orla-basin', ob02: 'orla-basin', ob03: 'orla-basin', ob04: 'orla-basin',
};
const singletonLabels = {
  'bq05-singleton': 'bracken-quay',
  'lc05-singleton': 'luma-commons',
  'vo05-singleton': 'veyra-orchard',
  'sr05-singleton': 'serein-relay',
  'ob05-singleton': 'orla-basin',
};
const families = new Set(Object.values(baseLabels));
const languages = ['en', 'nl', 'de', 'fr', 'es'];
const languageCounts = Object.fromEntries(languages.map(language => [language, 0]));
const familyCounts = new Map();
const eventReports = new Map();
const seenIds = new Set();
const seenSequences = new Set();

assert.equal(rows.length, 105, 'expected 100 event reports and five singleton reports');
for (const row of rows) {
  assert.deepEqual(Object.keys(row).sort(), keys, `unexpected keys at ${row.id}`);
  assert.equal(row.split, 'multilingual-challenge-v5', `wrong split at ${row.id}`);
  const match = /^m5-(en|nl|de|fr|es)-(\d{3})$/.exec(row.id);
  assert.ok(match, `invalid ID ${row.id}`);
  assert.ok(!seenIds.has(row.id), `duplicate ID ${row.id}`);
  seenIds.add(row.id);
  const [, language, sequence] = match;
  languageCounts[language] += 1;
  assert.ok(!seenSequences.has(sequence), `duplicate sequence ${sequence}`);
  seenSequences.add(sequence);

  const expectedFamily = baseLabels[row.topicLabel] ?? singletonLabels[row.topicLabel];
  assert.ok(expectedFamily, `unexpected gold label ${row.topicLabel}`);
  assert.equal(row.family, expectedFamily, `family mismatch at ${row.id}`);
  assert.ok(row.title.trim().length >= 20, `title shorter than 20 characters at ${row.id}`);
  assert.ok(row.body.trim().length >= 220, `body shorter than 220 characters at ${row.id}`);
  assert.ok(row.body.trim().length <= 650, `body longer than 650 characters at ${row.id}`);
  assert.ok(row.viewpoint.trim().length > 0, `missing stakeholder perspective at ${row.id}`);
  assert.ok(families.has(row.family), `unexpected family ${row.family}`);
  familyCounts.set(row.family, (familyCounts.get(row.family) || 0) + 1);
  if (!eventReports.has(row.topicLabel)) eventReports.set(row.topicLabel, []);
  eventReports.get(row.topicLabel).push({ language, viewpoint: row.viewpoint });
}

assert.deepEqual([...seenSequences].sort(), Array.from({ length: 105 }, (_, i) => String(i + 1).padStart(3, '0')),
  'IDs must cover sequences 001 through 105 exactly once');
assert.deepEqual(languageCounts, { en: 21, nl: 21, de: 21, fr: 21, es: 21 }, 'language counts must be exactly balanced');
assert.equal(familyCounts.size, 5, 'expected exactly five families');
for (const family of families) assert.equal(familyCounts.get(family), 21, `expected 21 reports for ${family}`);
assert.equal(eventReports.size, 25, 'expected 20 matched developments and five singleton developments');
for (const label of Object.keys(baseLabels)) {
  const reports = eventReports.get(label) || [];
  assert.equal(reports.length, 5, `${label} must have five reports`);
  assert.deepEqual(reports.map(report => report.language).sort(), [...languages].sort(), `${label} must have one report per language`);
  assert.equal(new Set(reports.map(report => report.viewpoint)).size, 5, `${label} must have five distinct stakeholder perspectives`);
}
for (const label of Object.keys(singletonLabels)) {
  const reports = eventReports.get(label) || [];
  assert.equal(reports.length, 1, `${label} must be a singleton gold event`);
}
assert.deepEqual(
  Object.fromEntries(Object.keys(singletonLabels).map(label => [label, eventReports.get(label)[0].language])),
  { 'bq05-singleton': 'en', 'lc05-singleton': 'nl', 'vo05-singleton': 'de', 'sr05-singleton': 'fr', 'ob05-singleton': 'es' },
  'singleton languages must rotate evenly'
);

console.log(`v5 integrity passed: ${rows.length} reports; SHA-256 ${actualSha256}`);
