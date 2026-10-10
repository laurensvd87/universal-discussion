import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotTopicPlanner } from '../src/domain/alternate-topic-cache.js';

test('same committed snapshot plans once, revision and generation invalidate', () => {
  let calls = 0;
  const plan = createSnapshotTopicPlanner(state => ({ count: ++calls, revision: state.revision }));
  const first = plan({ generation: 'one', revision: 1 });
  assert.equal(plan({ generation: 'one', revision: 1 }), first);
  assert.equal(calls, 1);
  assert.equal(plan({ generation: 'one', revision: 2 }).count, 2);
  assert.equal(plan({ generation: 'two', revision: 2 }).count, 3);
});
test('failed revision does not return previous result or poison a retry', () => {
  let failed = true, calls = 0;
  const plan = createSnapshotTopicPlanner(state => {
    calls++;
    if (state.revision === 2 && failed) throw new Error('capacity');
    return { revision: state.revision };
  });
  plan({ generation: 'one', revision: 1 });
  assert.throws(() => plan({ generation: 'one', revision: 2 }), /capacity/u);
  failed = false;
  assert.equal(plan({ generation: 'one', revision: 2 }).revision, 2);
  assert.equal(calls, 3);
});
test('separate service instances and malformed versions cannot share a partition', () => {
  let calls = 0;
  const a = createSnapshotTopicPlanner(() => ++calls), b = createSnapshotTopicPlanner(() => ++calls);
  const version = { generation: 'one', revision: 0 };
  assert.equal(a(version), 1); assert.equal(b(version), 2);
  for (const state of [null, {}, { generation: '', revision: 1 }, { generation: 'x', revision: -1 }, { generation: 'x', revision: NaN }]) assert.throws(() => a(state));
  assert.throws(() => createSnapshotTopicPlanner(null));
});
