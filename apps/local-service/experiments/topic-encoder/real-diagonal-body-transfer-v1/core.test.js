import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBodyTransferEvents, assertAlignedCorpus } from './core.js';
import { topicInput } from '../e5-infer.js';

const all = Array.from({ length: 370 }, (_, event) =>
  Array.from({ length: event < 56 || event >= 96 && event < 163 ||
    event >= 173 && event < 180 ? 12 : event === 369 ? 20 : 13 }, (_, article) => ({
    id: `d${event}_${article}`, eventKey: `event:${event}`,
    duplicateKey: `fiction:${event}:${article}`,
  }))).flat();
const prior = all.slice(0, 1192);
const preliminary = all.filter(row => {
  const event = Number(row.eventKey.slice(6));
  return event >= 96 && event < 110 || event >= 163 && event < 173;
});
const fresh = all.filter(row => Number(row.eventKey.slice(6)) >= 173 &&
  Number(row.eventKey.slice(6)) < 196);

test('fictional whole-event selection is deterministic and excludes all exposed keys', () => {
  assert.equal(all.length, 4687);
  assert.equal(preliminary.length, 298);
  assert.equal(fresh.length, 292);
  const result = selectBodyTransferEvents(all, prior, preliminary, fresh);
  assert.ok(result.documents.length >= 250 && result.documents.length <= 300);
  assert.deepEqual(result.documents.map(row => row.id),
    selectBodyTransferEvents(all, prior, preliminary, fresh).documents.map(row => row.id));
  const exposed = new Set([...prior, ...preliminary, ...fresh].map(row => row.eventKey));
  assert.ok(result.documents.every(row => !exposed.has(row.eventKey)));
  const collided = all.map(row => ({ ...row }));
  collided.at(-1).duplicateKey = fresh[0].duplicateKey;
  const remap = rows => rows.map(row => collided[all.indexOf(row)]);
  const changed = selectBodyTransferEvents(collided,
    remap(prior), remap(preliminary), remap(fresh));
  assert.ok(changed.documents.every(row => row.eventKey !== collided.at(-1).eventKey));
  assert.throws(() => selectBodyTransferEvents(all, prior, preliminary, fresh.slice(1)),
    /PREVIOUS_SELECTION_MISMATCH/);
});

test('alignment rejects any changed identity or short input prefix', () => {
  const short = Array.from({ length: 4687 }, (_, i) => ({ id: `d${i}`, eventKey: `e${i}`,
    duplicateKey: `k${i}`, title: 'title', lang: 'en', category: 'c', split: 'train', lead: 'abc' }));
  const body = short.map(row => ({ ...row, lead: 'abcdef' }));
  assert.equal(assertAlignedCorpus(short, body), true);
  body[17].lead = 'different';
  assert.throws(() => assertAlignedCorpus(short, body), /CORPUS_ALIGNMENT/);
});

test('body surrogate omits title and obeys the live 4096-character input bound', () => {
  const body = 'Article text '.repeat(400);
  const input = topicInput({ title: 'A separate headline', body }, 'body');
  assert.equal(input.length, 4096);
  assert.ok(input.startsWith('Article text'));
  assert.ok(!input.includes('A separate headline'));
});
