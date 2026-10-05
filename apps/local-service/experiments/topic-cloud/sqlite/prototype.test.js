import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DB_NAME, openSyntheticCloud } from './prototype.js';

function withDatabase(run) {
  const directory = mkdtempSync(join(tmpdir(), 'topic-cloud-synthetic-'));
  const databasePath = join(directory, DB_NAME);
  let cloud;
  try {
    cloud = openSyntheticCloud(databasePath, { create: true });
    return run(cloud, databasePath, () => {
      cloud.close();
      cloud = openSyntheticCloud(databasePath);
      return cloud;
    });
  } finally {
    cloud?.close();
    // Delete only this test's explicitly named file, then its empty directory.
    // Never recursively remove an OS-temp directory whose contents changed.
    if (existsSync(databasePath)) unlinkSync(databasePath);
    rmdirSync(directory);
  }
}

function source(cloud, n) {
  cloud.addSource({ id: `s${String(n).padStart(3, '0')}`, url: `https://example.test/${n}`, title: `Synthetic ${n}`, createdOrder: n });
}

test('persists 140 normalized Sources and vectors across reopen, with bounded pages and neighbors', () => {
  withDatabase((cloud, _path, reopen) => {
    cloud.transaction(() => {
      for (let n = 0; n < 140; n++) {
        source(cloud, n);
        cloud.addVector({ sourceId: `s${String(n).padStart(3, '0')}`, modelStamp: 'synthetic-v1', values: [1, n / 140], updatedOrder: n });
      }
      for (let n = 1; n < 140; n++) cloud.putEdge({ a: 's000', b: `s${String(n).padStart(3, '0')}`, score: 1 - n / 140, scorerStamp: 'fixture-v1' });
    });
    assert.deepEqual(cloud.counts(), { sources: 140, vectors: 140, scored_edges: 139, discussions: 0, contributions: 0 });
    assert.deepEqual(cloud.neighbors('s000', 3).map(row => row.source_id), ['s001', 's002', 's003']);
    assert.equal(cloud.sourcePage(99, 50).length, 40);
    cloud = reopen();
    assert.equal(cloud.counts().sources, 140);
    assert.equal(cloud.neighbors('s000', 2).length, 2);
    assert.equal(cloud.integrity(), 'ok');
  });
});

test('edge edits preserve discussion, root, nested reply, and source origins', () => {
  withDatabase(cloud => {
    [0, 1, 2].forEach(n => source(cloud, n));
    cloud.addDiscussion({ id: 'd1', anchorSourceId: 's000', focusLabel: 'Synthetic focus', createdOrder: 10 });
    cloud.addRoot({ id: 'r1', discussionId: 'd1', originSourceId: 's000', body: 'Root', createdOrder: 11 });
    cloud.addReply({ id: 'p1', parentId: 'r1', discussionId: 'd1', originSourceId: 's001', body: 'Reply', createdOrder: 12 });
    cloud.addReply({ id: 'p2', parentId: 'p1', discussionId: 'd1', body: 'Nested reply', createdOrder: 13 });
    const before = cloud.discussion('d1');
    cloud.putEdge({ a: 's000', b: 's001', score: 0.9, scorerStamp: 'v1' });
    cloud.putEdge({ a: 's002', b: 's000', score: 0.95, scorerStamp: 'v2' });
    cloud.putEdge({ a: 's001', b: 's000', score: 0.2, scorerStamp: 'v3' });
    cloud.removeEdge('s000', 's002');
    assert.deepEqual(cloud.discussion('d1'), before);
    assert.equal(before.contributions[2].root_id, 'r1');
    assert.equal(before.contributions[1].origin_source_id, 's001');
  });
});

test('constraint failure rolls back whole batch and rejects cross-discussion reply', () => {
  withDatabase(cloud => {
    source(cloud, 0);
    source(cloud, 1);
    assert.throws(() => cloud.transaction(() => {
      source(cloud, 2);
      cloud.putEdge({ a: 's000', b: 'missing', score: 0.7, scorerStamp: 'fixture' });
    }));
    assert.equal(cloud.counts().sources, 2);
    assert.equal(cloud.counts().scored_edges, 0);
    assert.throws(() => cloud.putEdge({ a: 's000', b: 's000', score: 0.8, scorerStamp: 'fixture' }));
    assert.throws(() => cloud.putEdge({ a: 's000', b: 's001', score: 1.1, scorerStamp: 'fixture' }));
    cloud.addDiscussion({ id: 'd1', anchorSourceId: 's000', focusLabel: 'One', createdOrder: 3 });
    cloud.addDiscussion({ id: 'd2', anchorSourceId: 's001', focusLabel: 'Two', createdOrder: 4 });
    cloud.addRoot({ id: 'r1', discussionId: 'd1', body: 'Root', createdOrder: 5 });
    assert.throws(() => cloud.addReply({ id: 'p1', parentId: 'r1', discussionId: 'd2', body: 'Wrong target', createdOrder: 6 }));
    assert.equal(cloud.counts().contributions, 1);
    assert.equal(cloud.integrity(), 'ok');
  });
});

test('refuses an existing database and paths outside a marked temporary directory', () => {
  withDatabase((_cloud, databasePath) => {
    assert.throws(() => openSyntheticCloud(databasePath, { create: true }), /already exists/);
    assert.throws(() => openSyntheticCloud(join(tmpdir(), 'owner.sqlite'), { create: true }), /synthetic/);
  });
});
