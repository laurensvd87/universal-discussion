import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireHierarchyDetailRows } from '../harness/run-hierarchy-detail-quality.js';

test('failed case output preserves current outcome and every unattempted subject without retrying capture', async () => {
  const probes = Array.from({ length: 4 }, (_, index) => ({ id: `case-${index}`, groupId: `game-${index}`,
    url: `https://en.wikipedia.org/wiki/Game_${index}`, split: 'training', member: index < 2, rootId: 'games' }));
  const rows = [], pins = [], captured = [], persisted = [];
  const result = await acquireHierarchyDetailRows(probes, {}, null, rows, pins, {
    createCapture: () => ({ capture: async id => { captured.push(id); return {
      id, url: probes.find(probe => probe.id === id).url, status: 'unavailable', reason: 'document-invalid' }; },
      snapshot: () => ({ attempted: captured.length }) }),
    createEmbedder: async () => { throw new Error('unavailable pages must not initialize E5'); },
    persist: async (_folder, name, row) => {
      persisted.push({ name, id: row.id });
      if (row.id === 'case-0' || row.id === 'case-2') throw new Error('simulated output failure');
      return { file: name, bytes: 1, sha256: 'a'.repeat(64) };
    },
    progress: () => { throw new Error('case output failed before progress'); },
  });
  assert.equal(result.failure, 'acquisition-or-persistence');
  assert.deepEqual(captured, ['case-0']);
  assert.deepEqual(rows.map(row => [row.id, row.evaluationStatus, row.attempted]), [
    ['case-0', 'capture-unavailable', true], ['case-1', 'not-attempted', false],
    ['case-2', 'not-attempted', false], ['case-3', 'not-attempted', false],
  ]);
  assert.deepEqual(persisted.map(row => row.id), probes.map(probe => probe.id));
  assert.deepEqual(pins.map(pin => pin.file), ['case-1.json', 'case-3.json']);
  assert.deepEqual(result.capture, { attempted: 1 });
});

test('an encoder failure remains primary when saving its failed observation also fails', async () => {
  const probes = ['first', 'later'].map(id => ({ id, groupId: id, url: `https://en.wikipedia.org/wiki/${id}`,
    split: 'training', member: true, rootId: 'games' }));
  const rows = [], pins = [], calls = [];
  const result = await acquireHierarchyDetailRows(probes, {}, null, rows, pins, {
    createCapture: () => ({ capture: async id => { calls.push(id); return { id, url: probes[0].url,
      status: 'available', title: 'Example game', text: 'Public game description. '.repeat(10), sourceInputHash: 'b'.repeat(64) }; },
      snapshot: () => ({ attempted: calls.length }) }),
    createEmbedder: async () => { throw new Error('simulated E5 initialization failure'); },
    persist: async (_folder, name, row) => {
      if (row.id === 'first') throw new Error('simulated output failure');
      return { file: name, bytes: 1, sha256: 'a'.repeat(64) };
    }, progress: () => {},
  });
  assert.equal(result.failure, 'encoder-initialization');
  assert.deepEqual(calls, ['first']);
  assert.equal(rows[0].failureStage, 'encoder-initialization');
  assert.equal(rows[0].captureStatus, 'available');
  assert.equal(rows[0].sourceVersion, 'b'.repeat(64));
  assert.equal(rows[1].evaluationStatus, 'not-attempted');
  assert.equal(pins.length, 1);
});
