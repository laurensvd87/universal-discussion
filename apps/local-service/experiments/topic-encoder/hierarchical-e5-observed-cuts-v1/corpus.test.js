import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CORPUS, CORPUS_COUNTS, CORPUS_NOTES } from './corpus.js';
import { TAXONOMY } from '../hierarchical-e5-paired-v1/taxonomy.js';
// Closed C inputs are imported ONLY for string/identifier collision checks.
// No classifier, model, results, frozen policy or evaluation code is imported.
import { CORPUS as CLOSED_C_CORPUS } from '../hierarchical-e5-broad-heads-v1/corpus.js';

const digest = value => createHash('sha256').update(value).digest('hex');
const normalized = value => value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/gu, ' ').trim();
const words = value => value.trim().split(/\s+/u).length;
const languages = ['en', 'de', 'fr', 'es', 'nl'];
const nodes = new Map(TAXONOMY.nodes.map(node => [node.id, node]));
const internal = new Set(TAXONOMY.nodes.map(node => node.parentId).filter(id => id !== null));

test('fresh policy corpus has exact347rows and three/two scenarios for each approved node', () => {
  assert.equal(CORPUS.length, 347);
  assert.deepEqual(CORPUS_COUNTS, { calibration: 205, test: 142 });
  assert.equal(CORPUS_NOTES.modelRetraining, false);
  assert.equal(CORPUS_NOTES.classifierOutputsUsed, false);
  assert.equal(CORPUS_NOTES.productionValidated, false);
  assert.equal(CORPUS_NOTES.independentWebValidation, false);
  assert.equal(CORPUS_NOTES.semanticFamilyIndependenceDemonstrated, false);
  assert.equal(TAXONOMY.nodes.length, 63);
  for (const [split, count] of Object.entries(CORPUS_COUNTS)) {
    assert.equal(CORPUS.filter(row => row.split === split).length, count);
    assert.equal(CORPUS.filter(row => row.split === split && row.expectedTopicId === null).length, 16);
    for (const id of nodes.keys()) {
      assert.equal(CORPUS.filter(row => row.split === split && row.expectedTopicId === id).length, CORPUS_NOTES.perNode[split]);
    }
  }
});

test('title/body hashes and scenario identifiers are unique within newset and disjoint from closed C', () => {
  for (const field of ['title', 'body', 'id', 'groupId']) {
    const previous = new Set(CLOSED_C_CORPUS.map(row => digest(row[field])));
    const current = new Set();
    for (const row of CORPUS) {
      const hash = digest(row[field]);
      assert.ok(!previous.has(hash), `Closed C collision in ${field}: ${row.id}`);
      assert.ok(!current.has(hash), `New corpus collision in ${field}: ${row.id}`);
      current.add(hash);
    }
    assert.equal(current.size, CORPUS.length);
  }
  for (const field of ['title', 'body']) {
    const previous = new Set(CLOSED_C_CORPUS.map(row => digest(normalized(row[field]))));
    const current = new Set();
    for (const row of CORPUS) {
      const hash = digest(normalized(row[field]));
      assert.ok(!previous.has(hash), `Normalized closed collision: ${row.id}`);
      assert.ok(!current.has(hash), `Normalized new collision: ${row.id}`);
      current.add(hash);
    }
  }
});

test('all literal fields obey paired schemas and metadata/word bounds across five balanced languages', () => {
  const groupSplits = new Map();
  for (const row of CORPUS) {
    assert.deepEqual(Object.keys(row).sort(), ['id', 'groupId', 'split', 'language', 'caseType', 'title', 'body', 'expectedTopicId', 'provenance'].sort());
    assert.match(row.id, /^oc1_(calibration|test)_\d{3}$/u);
    assert.equal(row.provenance, 'synthetic-authored');
    assert.ok(Object.isFrozen(row)); assert.equal(Object.getPrototypeOf(row), Object.prototype);
    assert.ok(languages.includes(row.language));
    assert.ok(words(row.title) >= 3 && words(row.title) <= 12, row.id);
    assert.ok(words(row.body) >= 30 && words(row.body) <= 60, row.id);
    assert.ok(row.title.length <= 512 && row.body.length <= 4096);
    assert.equal(row.title, row.title.trim()); assert.equal(row.body, row.body.trim());
    assert.ok(!groupSplits.has(row.groupId)); groupSplits.set(row.groupId, row.split);
    assert.ok(row.expectedTopicId === null || nodes.has(row.expectedTopicId));
  }
  for (const split of Object.keys(CORPUS_COUNTS)) {
    const counts = languages.map(language => CORPUS.filter(row => row.split === split && row.language === language).length);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `${split}: ${counts}`);
  }
  assert.ok(Object.isFrozen(CORPUS));
});

test('stopping and stress labels use observed evidence, including truly ambiguous single-path nulls', () => {
  const types = new Set(CORPUS.map(row => row.caseType));
  for (const expected of ['generic-title', 'misleading-title', 'title-only-evidence', 'incidental-brand',
    'unknown-child', 'mixed-siblings', 'root-conflict', 'insufficient-capture']) assert.ok(types.has(expected));
  for (const row of CORPUS) {
    if (['parent-generic', 'unknown-child', 'mixed-siblings'].includes(row.caseType)) assert.ok(internal.has(row.expectedTopicId));
    if (row.expectedTopicId === null) assert.ok(['insufficient-capture', 'root-conflict'].includes(row.caseType));
    else assert.ok(!['insufficient-capture', 'root-conflict'].includes(row.caseType));
    let node = nodes.get(row.expectedTopicId), depth = 0;
    while (node) { depth++; assert.ok(depth <= 5); node = nodes.get(node.parentId); }
  }
  for (const split of Object.keys(CORPUS_COUNTS)) {
    assert.ok(CORPUS.some(row => row.split === split && row.caseType === 'title-only-evidence'));
    assert.ok(CORPUS.some(row => row.split === split && row.caseType === 'root-conflict'));
  }
  const stress = new Set(['generic-title', 'misleading-title', 'title-only-evidence', 'incidental-brand',
    'incidental-mention', 'unknown-child', 'mixed-siblings', 'root-conflict', 'insufficient-capture']);
  assert.ok(CORPUS.filter(row => stress.has(row.caseType)).length >= Math.ceil(CORPUS.length / 4));
  assert.ok(CORPUS.some(row => row.expectedTopicId === 'software' && row.body.startsWith('A software utility called Pasta')));
  assert.ok(CORPUS.some(row => row.expectedTopicId === 'vehicles' && row.title.startsWith('Koala')));
});
