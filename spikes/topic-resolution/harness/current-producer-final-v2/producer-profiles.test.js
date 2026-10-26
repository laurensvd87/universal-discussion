import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TARGET_PRODUCER_SOURCE_KEYS, buildTargetProducerProfiles } from './producer-profiles.js';
const hashes = () => Object.fromEntries(TARGET_PRODUCER_SOURCE_KEYS.map((k, i) =>
  [k, createHash('sha256').update(String(i)).digest('hex')]));
const sha = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');

test('fixed producer recipes are distinct and reproducible without any receipt/freeze cycle', () => {
  const a = buildTargetProducerProfiles(hashes()), b = buildTargetProducerProfiles(hashes());
  assert.equal(TARGET_PRODUCER_SOURCE_KEYS.length,12);
  for(const c of a.constructions)assert.equal(Object.keys(c.sourceHashes).length,11);
  assert.ok(TARGET_PRODUCER_SOURCE_KEYS.includes('spikes/topic-resolution/harness/current-producer-final-v2/supervise.py'));
  assert.ok(TARGET_PRODUCER_SOURCE_KEYS.includes('spikes/topic-resolution/harness/current-producer-final-v2/producer-profiles.js'));
  assert.ok(TARGET_PRODUCER_SOURCE_KEYS.every(k=>!/(?:receipt|freeze|artifact-reuse)/u.test(k)));
  assert.deepEqual(a, b); assert.ok(Object.isFrozen(a));
  assert.notEqual(a.targetProfiles[0].inputConstructionHash, a.targetProfiles[1].inputConstructionHash);
  for (let i = 0; i < 2; i++) {
    const { producerProfileHash, ...body } = a.targetProfiles[i];
    assert.equal(sha(body), producerProfileHash);
    assert.equal(sha(a.constructions[i]), body.inputConstructionHash);
    assert.ok(Object.isFrozen(body.extractorVersions));
    assert.equal(a.constructions[i].sourceHashes[TARGET_PRODUCER_SOURCE_KEYS[8]], hashes()[TARGET_PRODUCER_SOURCE_KEYS[8]]);
  }
  assert.equal(a.assignmentAuthority, false);
  assert.equal(a.constructions[1].observation.producerScope, 'restricted-single-document-dom-reader/v1');
  assert.equal(a.constructions[1].observation.ordinaryDynamicBrowserProducerValidated, false);
  assert.equal(a.constructions[1].observation.inlineScriptsMayExecute, true);
  assert.ok(!JSON.stringify(a).includes('selection-receipt.json'));
});

test('each actual producer dependency is bound and irrelevant caller property order is not', () => {
  const h = hashes(), original = buildTargetProducerProfiles(h);
  assert.deepEqual(buildTargetProducerProfiles(Object.fromEntries(Object.entries(h).reverse())), original);
  for (const key of TARGET_PRODUCER_SOURCE_KEYS) {
    const changed = { ...h, [key]: 'f'.repeat(64) }, result = buildTargetProducerProfiles(changed);
    assert.notEqual(result.recipeHash, original.recipeHash);
    const affected = key.endsWith('static-capture.js') ? [0] : key.endsWith('page-content-reader.js') ? [1] : [0, 1];
    for (const i of affected) assert.notEqual(result.targetProfiles[i].inputConstructionHash,
      original.targetProfiles[i].inputConstructionHash);
  }
  h[TARGET_PRODUCER_SOURCE_KEYS[0]] = 'e'.repeat(64);
  assert.deepEqual(original, buildTargetProducerProfiles(hashes()));
});

test('unlisted, absent, malformed, accessor and proxy source claims are refused without executing code', () => {
  for (const mutate of [x => delete x[TARGET_PRODUCER_SOURCE_KEYS[0]], x => x.other = 'f'.repeat(64),
    x => x[TARGET_PRODUCER_SOURCE_KEYS[0]] = 'F'.repeat(64), x => x[TARGET_PRODUCER_SOURCE_KEYS[0]] = null]) {
    const x = hashes(); mutate(x); assert.throws(() => buildTargetProducerProfiles(x));
  }
  let calls = 0;
  const x = hashes(); Object.defineProperty(x, TARGET_PRODUCER_SOURCE_KEYS[0],
    { enumerable: true, get() { calls++; return 'f'.repeat(64); } });
  assert.throws(() => buildTargetProducerProfiles(x));
  assert.throws(() => buildTargetProducerProfiles(new Proxy({}, { ownKeys() { calls++; return []; } })));
  assert.equal(calls, 0);
});
