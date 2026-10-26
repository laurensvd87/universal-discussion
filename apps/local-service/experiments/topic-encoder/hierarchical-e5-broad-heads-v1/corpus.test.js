import test from 'node:test';
import assert from 'node:assert/strict';
import { CORPUS, CORPUS_COUNTS, CORPUS_NOTES } from './corpus.js';
import { TAXONOMY } from '../hierarchical-e5-paired-v1/taxonomy.js';

const words = value => value.trim().split(/\s+/u).length;
const languages = ['en', 'de', 'fr', 'es', 'nl'];
const nodeMap = new Map(TAXONOMY.nodes.map(node => [node.id, node]));
const internal = new Set(TAXONOMY.nodes.map(node => node.parentId).filter(id => id !== null));
const fields = ['id', 'groupId', 'split', 'language', 'caseType', 'title', 'body', 'expectedTopicId', 'provenance'].sort();

test('reduced corpus reports exact agreed counts and independently authored split families', () => {
  assert.equal(CORPUS.length, 457);
  assert.deepEqual(CORPUS_COUNTS, { training: 130, development: 67, calibration: 193, test: 67 });
  assert.equal(CORPUS_NOTES.originalRequestedRows, 1038);
  assert.equal(CORPUS_NOTES.authoredRows, 457);
  assert.equal(CORPUS_NOTES.productionValidated, false);
  assert.equal(CORPUS_NOTES.independentWebValidation, false);
  const ids = new Set(), groups = new Map();
  for (const row of CORPUS) {
    assert.ok(!ids.has(row.id)); ids.add(row.id);
    assert.ok(!groups.has(row.groupId)); groups.set(row.groupId, row.split);
    assert.match(row.id, /^bh1_(training|development|calibration|test)_\d{3}$/u);
    assert.ok(Object.hasOwn(CORPUS_COUNTS, row.split));
    assert.deepEqual(Object.keys(row).sort(), fields);
    assert.equal(row.provenance, 'synthetic-authored');
    assert.ok(Object.isFrozen(row));
  }
  for (const [split, count] of Object.entries(CORPUS_COUNTS)) {
    const rows = CORPUS.filter(row => row.split === split);
    assert.equal(rows.length, count);
    assert.equal(rows.filter(row => row.expectedTopicId === null).length, 4);
    assert.equal(rows.length - 4, TAXONOMY.nodes.length * CORPUS_NOTES.perNode[split]);
  }
  assert.equal(groups.size, 457); assert.ok(Object.isFrozen(CORPUS));
});

test('every literal title and body is distinct, bounded and nonempty in an approved language', () => {
  assert.equal(new Set(CORPUS.map(row => row.title)).size, CORPUS.length);
  assert.equal(new Set(CORPUS.map(row => row.body)).size, CORPUS.length);
  assert.equal(new Set(CORPUS.map(row => row.body.toLocaleLowerCase('en').replace(/\s+/gu, ' ').trim())).size, CORPUS.length);
  for (const row of CORPUS) {
    assert.ok(languages.includes(row.language));
    assert.ok(words(row.title) >= 3 && words(row.title) <= 12, `${row.id} title words`);
    assert.ok(words(row.body) >= 30 && words(row.body) <= 60, `${row.id} body words`);
    assert.ok(row.title.length <= 512 && row.body.length <= 4096);
    assert.equal(row.title.trim(), row.title); assert.equal(row.body.trim(), row.body);
  }
  for (const split of Object.keys(CORPUS_COUNTS)) {
    const counts = languages.map(language => CORPUS.filter(row => row.split === split && row.language === language).length);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `${split}: ${counts}`);
  }
});

test('each taxonomy node has the declared positive support and valid approved ancestry', () => {
  assert.equal(TAXONOMY.nodes.length, 63);
  for (const row of CORPUS) {
    assert.ok(row.expectedTopicId === null || nodeMap.has(row.expectedTopicId));
    let node = row.expectedTopicId === null ? undefined : nodeMap.get(row.expectedTopicId);
    const seen = new Set();
    while (node) {
      assert.ok(!seen.has(node.id)); seen.add(node.id);
      assert.ok(node.parentId === null || nodeMap.has(node.parentId));
      node = nodeMap.get(node.parentId);
    }
    assert.ok(seen.size <= 5);
    if (['parent-generic', 'mixed-siblings', 'unknown-child'].includes(row.caseType)) assert.ok(internal.has(row.expectedTopicId));
    if (row.caseType === 'insufficient-capture') assert.equal(row.expectedTopicId, null);
  }
  for (const node of TAXONOMY.nodes) for (const split of Object.keys(CORPUS_COUNTS)) {
    const rows = CORPUS.filter(row => row.expectedTopicId === node.id && row.split === split);
    assert.equal(rows.length, CORPUS_NOTES.perNode[split]);
    assert.equal(new Set(rows.map(row => row.groupId)).size, rows.length);
  }
});

test('stress cases contain visible-field traps rather than invented missing targets', () => {
  const stress = new Set(['generic-title', 'misleading-title', 'mixed-siblings', 'unknown-child',
    'incidental-mention', 'incidental-brand', 'tyre-advertising', 'title-only-evidence', 'insufficient-capture']);
  assert.ok(CORPUS.filter(row => stress.has(row.caseType)).length >= Math.ceil(CORPUS.length / 4));
  for (const split of Object.keys(CORPUS_COUNTS)) assert.ok(CORPUS.some(row => row.split === split && row.caseType === 'title-only-evidence'));
  const koalaSoftware = CORPUS.find(row => row.expectedTopicId === 'software' && row.body.startsWith('Koala is'));
  assert.ok(koalaSoftware); assert.equal(koalaSoftware.caseType, 'incidental-brand');
  const gtaUtility = CORPUS.find(row => row.expectedTopicId === 'software' && row.body.includes('utility named GTA'));
  assert.ok(gtaUtility); assert.equal(gtaUtility.caseType, 'incidental-brand');
  const dolphinVehicle = CORPUS.find(row => row.expectedTopicId === 'vehicles' && row.body.includes('product name Dolphin'));
  assert.ok(dolphinVehicle);
  assert.ok(CORPUS.some(row => row.expectedTopicId === 'mathematics' && row.title.includes('Grand Theft Auto')));
  for (const row of CORPUS.filter(row => row.expectedTopicId === null)) assert.equal(row.caseType, 'insufficient-capture');
});
