import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyStoredHierarchyExperiment } from './verify.js';

const read = name => readFile(new URL(name, import.meta.url));
test('public stored evidence verifies without accessing local coefficients, model assets or vectors', async () => {
  const names = [];
  const result = await verifyStoredHierarchyExperiment({ readInput: name => { names.push(name);return read(name); } });
  assert.equal(result.status, 'verified');assert.equal(result.sourceHashesChecked, 11);
  assert.equal(result.localEvidenceVerified, false);assert.equal(result.productionReady, false);
  assert.deepEqual(result.failedReleaseChecks, ['enoughIndependentLeafDecisions', 'observedLeafPrecisionPass', 'intervalLowerBoundPass']);
  assert.ok(names.every(name => !name.includes('/data/') && !name.includes('.assets') && !name.startsWith('output/')));
});

test('source or descriptor drift fails rather than silently producing another experiment', async () => {
  for (const target of ['run.js', '../../../src/domain/hierarchical-e5-matcher.js', 'freeze.json', 'protocol.json']) {
    await assert.rejects(verifyStoredHierarchyExperiment({ readInput: async name => {
      const bytes = await read(name);
      if (name !== target) return bytes;
      if (target === 'freeze.json') {
        const value = JSON.parse(bytes);value.rowCount++;return Buffer.from(JSON.stringify(value));
      }
      return Buffer.concat([bytes, Buffer.from(' drift')]);
    } }));
  }
});

test('changed stored results or receipt fail verification, without reclassification', async () => {
  for (const target of ['measured-results.json', 'execution-receipt.json']) {
    await assert.rejects(verifyStoredHierarchyExperiment({ readInput: async name => {
      const bytes = await read(name);
      if (name !== target) return bytes;
      const value = JSON.parse(bytes);
      if (target === 'execution-receipt.json') value.productionReady = true;
      else value.productionReady = true;
      return Buffer.from(JSON.stringify(value));
    } }));
  }
});

test('untrusted source paths cannot expand the fixed read allowlist', async () => {
  const reads = [];
  await assert.rejects(verifyStoredHierarchyExperiment({ readInput: async name => {
    reads.push(name);const bytes = await read(name);
    if (name !== 'freeze.json') return bytes;
    const value = JSON.parse(bytes);value.sourceHashes['../../../data/accounts.sqlite'] = 'a'.repeat(64);
    return Buffer.from(JSON.stringify(value));
  } }));
  assert.deepEqual(reads, ['freeze.json']);
});

test('receipt timing must preserve the exact stored binary64 measurement', async () => {
  await assert.rejects(verifyStoredHierarchyExperiment({ readInput: async name => {
    const bytes = await read(name);
    if (name !== 'execution-receipt.json') return bytes;
    const value = JSON.parse(bytes);value.encodingLoopElapsedMs = 6029.222100000001;
    return Buffer.from(JSON.stringify(value));
  } }), /Stored encoding timing changed/u);
});
