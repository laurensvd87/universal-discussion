import test from 'node:test';
import assert from 'node:assert/strict';
import { CORPUS } from './corpus.js';
import { TAXONOMY } from './taxonomy.js';

const splitCounts = { training: 128, development: 64, calibration: 96, test: 96 };
const fields = ['id', 'groupId', 'split', 'language', 'text', 'expectedTopicId', 'caseType', 'provenance'].sort();

test('new literal synthetic corpus has exact split counts and balanced languages', () => {
  assert.equal(CORPUS.length, 384);
  assert.equal(new Set(CORPUS.map(row => row.id)).size, 384);
  assert.equal(new Set(CORPUS.map(row => row.text)).size, 384);
  assert.ok(Object.isFrozen(CORPUS));
  for (const [split, count] of Object.entries(splitCounts)) {
    const rows = CORPUS.filter(row => row.split === split);
    assert.equal(rows.length, count);
    const languageCounts = ['en', 'de', 'nl'].map(language => rows.filter(row => row.language === language).length);
    assert.ok(Math.max(...languageCounts) - Math.min(...languageCounts) <= 1, `${split}: ${languageCounts}`);
  }
  for (const language of ['en', 'de', 'nl']) {
    assert.equal(CORPUS.filter(row => row.language === language).length, 128);
  }
});

test('plain frozen rows preserve independent scenario splits and bounded captured input', () => {
  const groupSplits = new Map();
  const ids = new Set(TAXONOMY.nodes.map(node => node.id));
  for (const row of CORPUS) {
    assert.equal(Object.getPrototypeOf(row), Object.prototype);
    assert.deepEqual(Object.keys(row).sort(), fields);
    assert.ok(/^h2_(training|development|calibration|test)_\d{3}$/u.test(row.id));
    assert.ok(Object.isFrozen(row));
    assert.equal(row.provenance, 'synthetic-authored');
    assert.equal(typeof row.groupId, 'string');
    assert.ok(row.groupId.length > 0);
    assert.ok(Object.hasOwn(splitCounts, row.split));
    assert.ok(['en', 'de', 'nl'].includes(row.language));
    assert.ok(row.text.length >= 60 && row.text.length <= 4096);
    assert.ok(row.text.split(/[.!?]+\s+|[.!?]+$/u).filter(Boolean).length >= 2);
    assert.ok(row.expectedTopicId === null || ids.has(row.expectedTopicId));
    assert.ok(!groupSplits.has(row.groupId) || groupSplits.get(row.groupId) === row.split);
    groupSplits.set(row.groupId, row.split);
  }
  assert.equal(groupSplits.size, CORPUS.length);
  assert.ok(CORPUS.filter(row => row.caseType === 'missing-input').length >= Math.ceil(0.1 * CORPUS.length));
});

test('explicit forest has valid dense nodes and labels for each branch in each split', () => {
  assert.equal(TAXONOMY.nodes.length, 15);
  const nodes = new Map(TAXONOMY.nodes.map(node => [node.id, node]));
  assert.equal(nodes.size, 15);
  assert.equal(TAXONOMY.nodes.filter(node => node.parentId === null).length, 4);
  for (const node of nodes.values()) {
    assert.ok(Object.isFrozen(node));
    assert.ok(node.label.length && node.scope.length);
    const visited = new Set();
    let current = node;
    while (current) {
      assert.ok(!visited.has(current.id));
      visited.add(current.id);
      assert.ok(current.parentId === null || nodes.has(current.parentId));
      current = current.parentId === null ? null : nodes.get(current.parentId);
    }
    for (const [split, count] of Object.entries(splitCounts)) {
      assert.equal(CORPUS.filter(row => row.split === split && row.expectedTopicId === node.id).length, count / 16);
    }
  }
});

test('central-subject policy covers stops, withheld children, acronym and advertising confounders', () => {
  const internal = new Set(TAXONOMY.nodes.filter(node => TAXONOMY.nodes.some(child => child.parentId === node.id)).map(node => node.id));
  for (const row of CORPUS) {
    if (['parent-stop', 'mixed-children', 'unknown-child'].includes(row.caseType)) assert.ok(internal.has(row.expectedTopicId));
    if (row.caseType === 'gta-acronym' || row.caseType === 'outside') assert.equal(row.expectedTopicId, null);
    if (row.caseType === 'tyre-advertising') assert.equal(row.expectedTopicId, 'vehicles');
    if (row.caseType === 'incidental-mention') assert.ok(!['gta', 'minecraft', 'koalas', 'dolphins', 'tyre-pressure'].includes(row.expectedTopicId));
  }
  for (const split of Object.keys(splitCounts)) {
    assert.ok(CORPUS.some(row => row.split === split && row.caseType === 'missing-input'));
    assert.ok(CORPUS.some(row => row.split === split && row.caseType === 'gta-acronym'));
  }
  const withheld = CORPUS.filter(row => /Cyberpunk|Red Dead Redemption/u.test(row.text));
  assert.ok(withheld.length >= 3);
  assert.ok(withheld.every(row => row.expectedTopicId === 'video-games'));
});
