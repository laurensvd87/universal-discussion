import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const CHUNKS = Object.freeze([
  ['chunk-a', 'train', 108, 6, 18, '6B0F5199F8C4A5B31C3A10B9B2D46DDD98763287C57C5281C135B79CFB0AF81B'],
  ['chunk-b', 'train', 108, 6, 18, '2762DA5CE908A2E67092958BEAF3F6CD4F56515AA29D61962AA7C3F870CA2908'],
  ['chunk-c1', 'development', 36, 2, 6, '20BAB9B116C6F32C2FB7058C3D822AF333503EC36CBCF9CBB7365E9F45BAC581'],
  ['chunk-c2', 'development', 36, 2, 6, '44AC29625DFBD86F7AF2C278EAB991E042D0E6E0FA64A92D95D3B1F7951BBF6F'],
  ['chunk-c3', 'development', 36, 2, 6, '659F2E9A27651B6577D2686F8B3849E56E6A36984471620980BCCA68B880F1FE'],
]);
const keys = ['body', 'eventKey', 'family', 'id', 'lang', 'title', 'viewpoint'];
const languages = ['de', 'en', 'es', 'fr', 'nl'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const splitRows = { train: [], development: [] };
const globalIds = new Set(), globalFamilies = new Set(), globalEvents = new Set();

for (const [name, split, count, familyCount, eventCount, expectedHash] of CHUNKS) {
  const bytes = await readFile(new URL(`./${name}/records.jsonl`, import.meta.url));
  assert.equal(sha(bytes), expectedHash, `${name} exact bytes changed`);
  const content = bytes.toString('utf8');
  assert.ok(content.endsWith('\n'), `${name} must end with newline`);
  const rows = content.trimEnd().split(/\r?\n/u).map(line => JSON.parse(line));
  assert.equal(rows.length, count, `${name} report count`);
  const families = new Set(), events = new Map();
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), keys, `${name} schema`);
    assert.equal(typeof row.id, 'string');
    assert.ok(row.id && !globalIds.has(row.id), `${name} unique ID`);
    globalIds.add(row.id);
    assert.equal(typeof row.family, 'string');
    assert.equal(typeof row.eventKey, 'string');
    assert.ok(row.family && row.eventKey);
    families.add(row.family);
    const reports = events.get(row.eventKey) ?? [];
    reports.push(row);
    events.set(row.eventKey, reports);
    assert.ok(languages.includes(row.lang), `${name} language`);
    assert.ok(typeof row.title === 'string' && row.title.trim().length >= 20);
    assert.ok(typeof row.body === 'string' && row.body.trim().length >= 220);
    assert.ok(typeof row.viewpoint === 'string' && row.viewpoint.trim());
  }
  assert.equal(families.size, familyCount, `${name} families`);
  assert.equal(events.size, eventCount, `${name} events`);
  for (const family of families) {
    assert.ok(!globalFamilies.has(family), `${name} family overlap`);
    globalFamilies.add(family);
  }
  for (const [eventKey, reports] of events) {
    assert.ok(!globalEvents.has(eventKey), `${name} event overlap`);
    globalEvents.add(eventKey);
    assert.equal(reports.length, 6, `${name} reports per event`);
    assert.equal(new Set(reports.map(row => row.family)).size, 1);
    assert.deepEqual([...new Set(reports.map(row => row.lang))].sort(), languages);
  }
  splitRows[split].push(...rows);
}

assert.equal(splitRows.train.length, 216);
assert.equal(splitRows.development.length, 108);
assert.equal(globalIds.size, 324);
assert.equal(globalFamilies.size, 18);
assert.equal(globalEvents.size, 54);
const dev = splitRows.development;
let truePairs = 0, falsePairs = 0, hardFalsePairs = 0, crossLanguageTruePairs = 0;
for (let i = 0; i < dev.length; i++) for (let j = i + 1; j < dev.length; j++) {
  const left = dev[i], right = dev[j];
  if (left.eventKey === right.eventKey) {
    truePairs++;
    if (left.lang !== right.lang) crossLanguageTruePairs++;
  } else {
    falsePairs++;
    if (left.family === right.family) hardFalsePairs++;
  }
}
assert.deepEqual({ truePairs, falsePairs, hardFalsePairs, crossLanguageTruePairs },
  { truePairs: 270, falsePairs: 5508, hardFalsePairs: 648, crossLanguageTruePairs: 252 });
process.stdout.write('authored v2 integrity OK: 324 reports; train 216/36 events; development 108/18 events; no holdout opened\n');
