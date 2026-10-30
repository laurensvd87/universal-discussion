import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createPostgresRuntimeOperatorForTest, describePostgresRuntimePackaging,
  POSTGRES_RUNTIME_POOL_BUDGET } from '../src/ops/private-ai-runtime-operator.js';
import { privateAiPreparationAdmission } from '../src/ops/prepare-private-ai-runtime.js';

test('API-only operator differs from the held original only in namespace, own hash entry and allowed operations', () => {
  const original = readFileSync(new URL('../src/ops/postgres-runtime-operator.js', import.meta.url), 'utf8');
  assert.equal(createHash('sha256').update(original).digest('hex'), 'aa66de6838632c6e9545adb57aad0f8f22f654389541c843327e97b07b1682fb');
  const derived = readFileSync(new URL('../src/ops/private-ai-runtime-operator.js', import.meta.url), 'utf8');
  const originalOperations = original.match(/const OPERATIONS = Object\.freeze\(\[[\s\S]*?\]\);/u)?.[0];
  assert.ok(originalOperations);
  assert.equal(derived.replaceAll('20261030-private-ai', '20261029-nature-heads')
    .replace('apps/local-service/src/ops/private-ai-runtime-operator.js', 'apps/local-service/src/ops/postgres-runtime-operator.js')
    .replace('const OPERATIONS = Object.freeze(["preflight", "status", "service"]);', originalOperations), original);
  const layout = describePostgresRuntimePackaging();
  assert.equal(layout.snapshotLeaf, 'hierarchy-release-20261030-private-ai');
  assert.equal(layout.encoderFiles.length, 10); assert.equal(POSTGRES_RUNTIME_POOL_BUDGET.permanentMaximum, 42);
  assert.ok(!layout.requiredFiles.some(name => name.includes('/018-')));
});

test('no preparation, database migration, worker, crawler or owner write can be selected', async () => {
  const calls = [], operator = createPostgresRuntimeOperatorForTest({
    verifyRuntimeSnapshot: () => { calls.push('verify'); return { rootSha256: 'a'.repeat(64) }; },
    writeStderr: () => {}, writeStdout: () => {},
  });
  for (const args of [[], ['prepare-runtime'], ['seal-runtime'], ['worker'], ['crawler'], ['dashboard'],
    ['install-hierarchy'], ['set-hierarchy-policy'], ['adopt-legacy-roots'], ['service', 'extra']])
    assert.equal(await operator.run(args), 2);
  assert.deepEqual(calls, []); assert.equal(await operator.run(['preflight']), 0); assert.deepEqual(calls, ['verify']);
});

test('small source preparation preserves the original four-GiB free reserve and refuses before allocation', () => {
  const GiB = 1024 ** 3, MiB = 1024 ** 2;
  assert.equal(privateAiPreparationAdmission(4 * GiB, 16 * MiB), false);
  assert.equal(privateAiPreparationAdmission(4 * GiB + 16 * MiB - 1, 16 * MiB), false);
  assert.equal(privateAiPreparationAdmission(4 * GiB + 16 * MiB, 16 * MiB), true);
  for (const allocation of [-1, 0, 16 * MiB + 1, NaN, Infinity])
    assert.equal(privateAiPreparationAdmission(12 * GiB, allocation), false);
});

test('API starts with the same schema17 configuration and drains its application before both existing pools', async () => {
  const calls = [], pools = [], prefix = 'apps/local-service/src/';
  const modules = new Map([
    [prefix + 'startup.js', { async startLocalApplication(options) {
      assert.equal(options.hierarchicalTopics, true);
      assert.equal(options.canonicalDatabase, pools[0]); assert.equal(options.urlSelectionDatabase, pools[1]);
      assert.equal(options.canonicalDatabaseOwned, false); assert.equal(options.urlSelectionDatabaseOwned, false);
      assert.equal(Object.hasOwn(options, 'ingestionWorkerDatabase'), false);
      return { async close() { calls.push('application-close'); } };
    } }],
    [prefix + 'ai/existing-protected-refresh-store.js', { createExistingProtectedRefreshStore() { assert.fail('No credential read in composition test'); } }],
    [prefix + 'ai/voice-request-trace-log.js', { createVoiceRequestTraceLog: () => null }],
  ]);
  const operator = createPostgresRuntimeOperatorForTest({
    verifyRuntimeSnapshot: () => { calls.push('verified'); return {}; },
    async openRoleDatabase(role, limit, name) {
      calls.push([role, limit, name]); const pool = { async close() { calls.push('close-' + name); } }; pools.push(pool); return pool;
    },
    async loadSnapshot(name) { assert.ok(modules.has(name), name); return modules.get(name); },
    loadBackup: async () => ({ cleanupExpiredPostgresBackups: async () => {} }),
    readTopicConfiguration: async () => ({}), readPairingOrigin: () => 'chrome-extension://' + 'a'.repeat(32),
    setInterval: () => 1, clearInterval: () => {}, waitForShutdown: async close => close(),
    writeStdout: () => {}, writeStderr: () => assert.fail('Service composition failed'),
  });
  assert.equal(await operator.run(['service']), 0);
  assert.deepEqual(calls, ['verified', ['murmingle_app', 32, 'murmingle-api'],
    ['murmingle_app', 4, 'murmingle-url-projection'], 'application-close',
    'close-murmingle-url-projection', 'close-murmingle-api']);
});
