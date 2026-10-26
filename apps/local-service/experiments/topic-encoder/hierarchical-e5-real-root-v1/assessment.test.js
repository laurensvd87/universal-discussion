import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRootOnlyPredictions as assess } from './assessment.js';

const hash = 'a'.repeat(64);
function fixture() {
  return { nodes: [
    { id: 'r', parentId: null }, { id: 'a', parentId: 'r' }, { id: 'deep', parentId: 'a' },
    { id: 'b', parentId: 'r' }, { id: 's', parentId: null },
  ], cases: [{ id: 'one', entityGroup: 'entity-one', language: 'en', expectedRootId: 'r', specificityPath: null }],
  predictions: [{ id: 'one', sourceInputHash: hash, selectedPath: ['r', 'a', 'deep'] }] };
}
test('root-only children are UNSCORED, not implicitly correct or negative', () => {
  const report = assess(fixture());
  assert.equal(report.assigned, 1); assert.equal(report.correctRoot, 1);
  assert.equal(report.coverage, 1); assert.equal(report.precision, 1);
  assert.equal(report.specificity.unscored, 1); assert.equal(report.specificity.annotated, 0);
  assert.equal(report.outcomes[0].specificityOutcome, 'unscored');
  assert.equal(report.childCorrectnessInferred, false); assert.equal(report.hasAssignmentAuthority, false);
  assert.equal(report.productionValidated, false); assert.equal(report.statisticalGateApplied, false);
});
test('verified deepest path and genuine safe fallback are distinguished', () => {
  for (const [selectedPath, expected] of [[['r', 'a'], 'exactSupportedPath'], [['r'], 'safeBroaderPrefix'],
    [['r', 'a', 'deep'], 'overSpecific'], [['r', 'b'], 'wrongSibling'], [['s'], 'wrongBranch'], [[], 'unresolved']]) {
    const input = fixture(); input.cases[0].specificityPath = ['r', 'a']; input.predictions[0].selectedPath = selectedPath;
    const report = assess(input);
    assert.equal(report.specificity[expected], 1); assert.equal(report.specificity.annotated, 1);
    assert.equal(report.outcomes[0].specificityOutcome, expected);
    assert.equal(report.correctRoot, selectedPath.length && selectedPath[0] === 'r' ? 1 : 0);
  }
});
test('primary root metrics and groupings include abstention and wrong-root assignments', () => {
  const input = fixture();
  input.cases.push({ id: 'two', entityGroup: 'entity-two', language: 'de', expectedRootId: 's', specificityPath: null },
    { id: 'three', entityGroup: 'entity-three', language: 'de', expectedRootId: 'r', specificityPath: null });
  input.predictions.push({ id: 'three', sourceInputHash: hash, selectedPath: [] },
    { id: 'two', sourceInputHash: hash, selectedPath: ['r', 'b'] });
  const report = assess(input);
  assert.equal(report.assigned, 2); assert.equal(report.correctRoot, 1); assert.equal(report.wrongRoot, 1);
  assert.equal(report.unresolved, 1); assert.equal(report.coverage, 2 / 3); assert.equal(report.precision, 0.5);
  assert.equal(report.byLanguage.de.precision, 0); assert.equal(report.byRoot.r.coverage, 0.5);
  assert.equal(report.byRoot.s.wrongRoot, 1);
});
test('zero accepted and zero cases have safe null precision', () => {
  const input = fixture(); input.predictions[0].selectedPath = [];
  assert.equal(assess(input).precision, null); assert.equal(assess(input).coverage, 0);
  input.cases = []; input.predictions = [];
  assert.equal(assess(input).coverage, null); assert.equal(assess(input).precision, null);
});
test('malformed, skipped, non-root and unknown paths fail', () => {
  for (const bad of [['a'], ['r', 'deep'], ['r', 'a', 'b'], ['r', 'unknown'], ['s', 'r'], ['r', 'r']]) {
    const input = fixture(); input.predictions[0].selectedPath = bad; assert.throws(() => assess(input), TypeError);
  }
  const input = fixture(); input.cases[0].specificityPath = ['s']; assert.throws(() => assess(input), /anchor root mismatch/);
  input.cases[0].specificityPath = []; assert.throws(() => assess(input), TypeError);
  input.cases[0].specificityPath = null; input.cases[0].expectedRootId = 'a'; assert.throws(() => assess(input), /known root/);
});
test('duplicate entity families, duplicate IDs and leaked unmatched predictions fail', () => {
  for (const change of [input => input.cases.push({ ...input.cases[0] }),
    input => input.cases.push({ ...input.cases[0], id: 'two' }),
    input => input.predictions.push({ ...input.predictions[0] }),
    input => { input.predictions[0].id = 'leaked'; }, input => { input.predictions = []; }]) {
    const input = fixture(); change(input); assert.throws(() => assess(input), TypeError);
  }
});
test('strict field, primitive, hash, plain-array, arity and capacity contracts', () => {
  assert.throws(() => assess(), TypeError); assert.throws(() => assess(fixture(), {}), TypeError);
  for (const change of [input => { input.extra = true; }, input => { input.nodes[0].label = 'unwanted'; },
    input => { input.cases[0].id = { toString() { throw Error('never'); } }; },
    input => { input.predictions[0].sourceInputHash = 'A'.repeat(64); },
    input => { input.cases[0].language = 'invalid language'; },
    input => { input.predictions[0].selectedPath = new Array(2); },
    input => { input.predictions[0].selectedPath.extra = true; },
    input => { input.nodes = new Array(129); }, input => { input.cases = new Array(513); },
    input => { input.predictions = new Array(513); }]) {
    const input = fixture(); change(input); assert.throws(() => assess(input), TypeError);
  }
});
test('taxonomy cycles, duplicate IDs, unknown parents and excessive depth fail', () => {
  for (const change of [input => input.nodes.push({ id: 'r', parentId: null }),
    input => { input.nodes[0].parentId = 'deep'; }, input => { input.nodes[0].parentId = 'missing'; },
    input => { let parentId = 'deep'; for (let i = 0; i < 6; i++) { const id = `more-${i}`; input.nodes.push({ id, parentId }); parentId = id; } }]) {
    const input = fixture(); change(input); assert.throws(() => assess(input), TypeError);
  }
});
test('accessors and hostile proxies are rejected without callbacks or traps', () => {
  let calls = 0;
  const hostile = () => new Proxy({}, { get() { calls++; throw Error('trap'); }, ownKeys() { calls++; throw Error('trap'); },
    getPrototypeOf() { calls++; throw Error('trap'); }, getOwnPropertyDescriptor() { calls++; throw Error('trap'); } });
  assert.throws(() => assess(hostile()), TypeError);
  for (const change of [input => { input.cases = hostile(); }, input => { input.cases[0] = hostile(); },
    input => { input.predictions[0].selectedPath = hostile(); }, input => { input.nodes[0] = hostile(); },
    input => { Object.defineProperty(input.cases[0], 'language', { enumerable: true, get() { calls++; return 'en'; } }); },
    input => { Object.defineProperty(input.predictions, '0', { enumerable: true, get() { calls++; return {}; } }); }]) {
    const input = fixture(); change(input); assert.throws(() => assess(input), TypeError);
  }
  assert.equal(calls, 0);
});
test('outputs are detached deeply frozen and metadata hashes bind inputs', () => {
  const input = fixture(), report = assess(input), originalHash = report.metadataHashes.predictionsSha256;
  assert.deepEqual(report, assess(input));
  input.predictions[0].selectedPath.pop(); input.nodes[0].id = 'mutated';
  assert.deepEqual(report.outcomes[0].selectedPath, ['r', 'a', 'deep']);
  assert(Object.isFrozen(report)); assert(Object.isFrozen(report.outcomes[0].selectedPath));
  assert(Object.isFrozen(report.byLanguage.en));
  assert.throws(() => report.outcomes[0].selectedPath.push('bad'), TypeError);
  const fresh = fixture(); fresh.predictions[0].selectedPath = ['r'];
  assert.notEqual(assess(fresh).metadataHashes.predictionsSha256, originalHash);
  assert.match(report.metadataHashes.casesSha256, /^[a-f0-9]{64}$/u);
});
