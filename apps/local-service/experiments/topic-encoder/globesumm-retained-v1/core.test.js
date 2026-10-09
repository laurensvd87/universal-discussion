import assert from 'node:assert/strict';
import { test } from 'node:test';
import { titleLexicon, makeEvidence, score, group, assess, selectRule } from './core.js';
import { parseCorpus, selectEventDisjoint } from '../real-event-eval/core.js';

const row = (id, eventKey, category, title) => ({ id, eventKey, category, title });
const vectors = new Map();
function vector(angle) {
  const out = new Float64Array(384);
  out[0] = Math.cos(angle);
  out[1] = Math.sin(angle);
  return out;
}

test('title and vector evidence ignores gold labels', () => {
  const rows = [row('a', 'event1', 'x', 'Bridge Route 7 changes'),
    row('b', 'event1', 'x', 'Route 7 bridge changes'),
    row('c', 'event2', 'x', 'Bridge Route 9 changes')];
  vectors.set('a', vector(0)); vectors.set('b', vector(0.1)); vectors.set('c', vector(0.15));
  const lexicon = titleLexicon(rows);
  const first = makeEvidence(rows, vectors, lexicon);
  const relabeled = makeEvidence(rows.map(item => ({ ...item, eventKey: 'altered', category: 'altered' })), vectors, lexicon);
  assert.deepEqual(first.pairs, relabeled.pairs);
  assert.ok(first.pairs.find(pair => pair.i === 0 && pair.j === 2).conflict);
});

test('supported graph can grow beyond a fixed member count', () => {
  const rows = Array.from({ length: 32 }, (_, i) => row(`p${String(i).padStart(2, '0')}`, 'one', 'x', 'Luma coolant launch'));
  for (const item of rows) vectors.set(item.id, vector(0));
  const evidence = makeEvidence(rows, vectors, titleLexicon(rows));
  const rule = { titleWeight: 0.04, supportWeight: 0.04, cutoff: 0.9, strongPair: 0.95 };
  const groups = group(evidence, rule);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].length, 32);
  assert.equal(assess(evidence, groups, rule).exactEvents, 1);
});

test('train selection and scoring are deterministic on fictional labels', () => {
  const rows = [row('x1', 'one', 'x', 'North battery leak'), row('x2', 'one', 'x', 'Battery leak North'),
    row('y1', 'two', 'x', 'North battery fee'), row('y2', 'two', 'x', 'Battery fee North')];
  rows.forEach((item, i) => vectors.set(item.id, vector(i < 2 ? i * 0.05 : 0.7 + (i - 2) * 0.05)));
  const evidence = makeEvidence(rows, vectors, titleLexicon(rows));
  assert.deepEqual(selectRule(evidence), selectRule(evidence));
  assert.ok(score(evidence.pairs[0], { titleWeight: 0.04, supportWeight: 0.04 }) > 0);
});

test('longer body parsing preserves split and duplicate identity', () => {
  const fictional = [{ date: '2030-01-01', description: 'fictional event', category: 'fiction',
    news: [{ lang_abbr: 'en', title: 'Imaginary bridge inspection',
      article: `A fictional bridge is inspected. ${'More invented context. '.repeat(45)}` }] }];
  const bytes = Buffer.from(`${JSON.stringify(fictional[0])}\n`, 'utf8');
  const short = parseCorpus(bytes);
  const long = parseCorpus(bytes, { leadCharacters: 4096 });
  assert.ok(long.documents[0].lead.length > short.documents[0].lead.length);
  assert.equal(short.documents[0].duplicateKey, long.documents[0].duplicateKey);
  assert.equal(short.documents[0].split, long.documents[0].split);
  assert.deepEqual(selectEventDisjoint(short.documents).documents.map(row => row.id),
    selectEventDisjoint(long.documents).documents.map(row => row.id));
});
