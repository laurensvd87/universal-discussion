import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { BASELINE_SOURCE_HASHES, GOLD_FILES } from './manifest.js';

test('v2 pins frozen manifest and pure assessment source without opening gold/model inputs', async () => {
  assert.equal(Object.keys(BASELINE_SOURCE_HASHES).length, 2);
  for (const [name, expected] of Object.entries(BASELINE_SOURCE_HASHES)) {
    const bytes = await readFile(new URL(name, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected);
  }
  assert.equal(Object.keys(GOLD_FILES).length, 4); assert(Object.isFrozen(GOLD_FILES));
  assert(Object.keys(GOLD_FILES).every(name => !name.includes('adr137')));
});
test('v2 protocol retains method and fresh repaired capture namespace', async () => {
  const read = name => readFile(new URL(name, import.meta.url), 'utf8');
  const protocol = JSON.parse(await read('protocol.json'));
  assert.equal(protocol.schema, 'hierarchical-e5-real-root-experiment/v2');
  assert.deepEqual(protocol.expectedSplits, { training: 48, calibration: 48, test: 32 });
  assert.deepEqual(protocol.inputViews, ['current-static', 'wikipedia-prose-lead']);
  assert.equal(protocol.lambda, .1); assert.equal(protocol.bodyWeight, .75); assert.equal(protocol.titleWeight, .25);
  assert.equal(protocol.detailPolicyMode, 'observed');
  const runner = await read('run.js'), verifier = await read('verify.js');
  for (const source of [runner, verifier]) {
    assert(source.includes('../hierarchical-public-capture-v2/robots-deny-space-repair.js'));
    assert(source.includes('hierarchy-real-root-public-capture-result/v2'));
    assert(source.includes('hierarchy-real-root-public-capture/v2'));
    assert(source.includes('hierarchy-real-root-selection/v2'));
    assert(source.includes('hierarchy-real-root-selected-input-construction/v2'));
    assert(!source.includes('hierarchy-real-root-capture-adr136'));
    assert(!source.includes('hierarchical-public-capture-v1'));
    assert(!source.includes('hierarchy-real-root-selection/v1'));
  }
  assert(runner.includes('MURMINGLE_REAL_ROOT_V2_SUPERVISED'));
});
