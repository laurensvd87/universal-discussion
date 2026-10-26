import assert from 'node:assert/strict';
import test from 'node:test';
import { CORPUS } from './corpus.js';
import { TAXONOMY } from './taxonomy.js';

test('synthetic hierarchy fixture has bounded bodies and disjoint balanced families', () => {
  assert.equal(CORPUS.length, 144);
  assert.equal(new Set(CORPUS.map(row => row.id)).size, CORPUS.length);
  assert.equal(new Set(CORPUS.map(row => row.text)).size, CORPUS.length);
  const groupSplits = new Map();
  const ids = new Set(TAXONOMY.nodes.map(node => node.id));
  for (const row of CORPUS) {
    assert.ok(row.text.length > 50 && row.text.length <= 4096);
    assert.ok(row.expectedTopicId === null || ids.has(row.expectedTopicId));
    assert.equal(row.provenance, 'synthetic-authored');
    assert.ok(Object.isFrozen(row));
    assert.ok(row.permittedSecondaryTopicIds.every(id => ids.has(id)));
    const previous = groupSplits.get(row.groupId);
    assert.ok(previous === undefined || previous === row.split, `family crosses split: ${row.groupId}`);
    groupSplits.set(row.groupId, row.split);
  }
  for (const split of ['prototype', 'development', 'calibration', 'test']) {
    const rows = CORPUS.filter(row => row.split === split);
    assert.equal(rows.length, 36);
    for (const language of ['en', 'de', 'nl']) assert.equal(rows.filter(row => row.language === language).length, 12);
  }
});

test('prototype evidence is direct, independently supported and excludes all evaluation rows', () => {
  const rows = new Map(CORPUS.map(row => [row.id, row]));
  const nodes = TAXONOMY.nodes;
  for (const exemplar of TAXONOMY.exemplarRows) {
    const row = rows.get(exemplar.rowId);
    assert.equal(row.split, 'prototype');
    assert.equal(row.groupId, exemplar.groupId);
    if (exemplar.kind === 'outside') {
      assert.equal(row.expectedTopicId, null);
      assert.equal(nodes.find(node => node.id === exemplar.nodeId).parentId, null);
    } else {
      assert.equal(exemplar.nodeId, row.expectedTopicId);
      const internal = nodes.some(node => node.parentId === exemplar.nodeId);
      assert.equal(exemplar.kind, internal ? 'stop' : 'positive');
    }
  }
  for (const node of nodes) {
    const kind = nodes.some(child => child.parentId === node.id) ? 'stop' : 'positive';
    const groups = new Set(TAXONOMY.exemplarRows.filter(row => row.nodeId === node.id && row.kind === kind).map(row => row.groupId));
    assert.ok(groups.size >= 2, `${node.id} lacks independent support`);
  }
  assert.ok(CORPUS.some(row => row.split === 'test' && row.caseType === 'unknown-child' && row.text.includes('Cyberpunk')));
  assert.ok(!CORPUS.some(row => row.split === 'prototype' && row.text.includes('Cyberpunk')));
  assert.equal(CORPUS.filter(row => row.caseType === 'input-failure').length, 2);
});
