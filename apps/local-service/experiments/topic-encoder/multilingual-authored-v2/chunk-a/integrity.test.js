import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const corpusPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'records.jsonl');
const bytes = fs.readFileSync(corpusPath);
const rows = bytes.toString('utf8').trimEnd().split('\n').map((line) => JSON.parse(line));
const expectedKeys = ['id', 'family', 'eventKey', 'lang', 'viewpoint', 'title', 'body'];
const expectedDigest = '6B0F5199F8C4A5B31C3A10B9B2D46DDD98763287C57C5281C135B79CFB0AF81B';
const repeatedLanguage = { A01: 'en', A02: 'nl', A03: 'de', A04: 'fr', A05: 'es', A06: 'en' };
const readme = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'README.md'), 'utf8');

test('records.jsonl has the pinned exact SHA-256', () => {
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(), expectedDigest);
});

test('corpus has exactly 108 records and the required row schema', () => {
  assert.equal(rows.length, 108);
  assert.ok(rows.every((row) => JSON.stringify(Object.keys(row)) === JSON.stringify(expectedKeys)));
  assert.equal(new Set(rows.map((row) => row.id)).size, 108);
  for (const row of rows) {
    assert.match(row.id, /^A0[1-6]-E[1-3]-r[1-9]$/);
    assert.match(row.eventKey, /^A0[1-6]-E[1-3]$/);
    assert.equal(row.family, row.eventKey.slice(0, 3));
    assert.ok(['en', 'nl', 'de', 'fr', 'es'].includes(row.lang));
    assert.ok(row.title.length >= 20, `${row.id} title is too short`);
    assert.ok(row.body.length >= 220, `${row.id} body is too short`);
  }
});

test('each event has six varied reports and the rotating language mix', () => {
  const events = new Map();
  for (const row of rows) events.set(row.eventKey, [...(events.get(row.eventKey) ?? []), row]);
  assert.equal(events.size, 18);
  for (const [eventKey, reports] of events) {
    const family = eventKey.slice(0, 3);
    assert.equal(reports.length, 6, `${eventKey} report count`);
    assert.equal(new Set(reports.map((row) => row.viewpoint)).size, 6, `${eventKey} viewpoints`);
    const languageCounts = new Map();
    for (const row of reports) languageCounts.set(row.lang, (languageCounts.get(row.lang) ?? 0) + 1);
    assert.equal(languageCounts.size, 5, `${eventKey} language coverage`);
    assert.deepEqual([...languageCounts.entries()].filter(([, count]) => count === 2).map(([lang]) => lang), [repeatedLanguage[family]]);
    assert.ok([...languageCounts.values()].every((count) => count === 1 || count === 2));
  }
});

test('relation ledger classifies all three event pairs in every family', () => {
  assert.ok(readme.includes('Pair labels are non-transitive and may overlap'));
  assert.ok(readme.includes('not gold Topic clusters'));
  assert.ok(readme.includes('Directly relevant pages'));
  assert.ok(readme.includes('Distinct adjacent incidents'));
  for (let family = 1; family <= 6; family += 1) {
    const prefix = `A${String(family).padStart(2, '0')}`;
    for (const [left, right] of [['E1', 'E2'], ['E1', 'E3'], ['E2', 'E3']]) {
      assert.ok(readme.includes(`${prefix}-${left} / ${prefix}-${right}`), `${prefix} ${left}/${right} relation missing`);
    }
  }
});
