import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_WEIGHT_ORDER, selectCurrentCandidate, currentTransferWorkPreflight,
  assessCurrentProducerTransfer } from './methods.js';

const H = 'a'.repeat(64);
function fixture() {
  const cases = Array.from({ length: 32 }, (_, index) => ({ id: `c${index}`, groupId: `g${index}`,
    rootId: `r${Math.floor(index/2)}`, language: index%2 ? 'de' : 'en', host: `h${index%4}.test` }));
  const predictions = () => cases.map(row => ({ id: row.id, inputAvailable: true,
    inputIdentity: H, selectedRootId: row.rootId }));
  return { cases, staticPredictions: predictions(), browserPredictions: predictions() };
}
test('three declared weights select by accepted-correct, raw-correct, then fixed order', () => {
  const rows = CURRENT_WEIGHT_ORDER.map(bodyWeight => ({ bodyWeight, acceptedCorrect: 30, rawCorrect: 44 }));
  assert.equal(selectCurrentCandidate(rows), 0);
  rows[2].acceptedCorrect = 31; assert.equal(selectCurrentCandidate(rows), 2);
  rows[1].acceptedCorrect = 31; rows[1].rawCorrect = 45; assert.equal(selectCurrentCandidate(rows), 1);
  assert.throws(() => selectCurrentCandidate(rows.toReversed()));
  assert.throws(() => selectCurrentCandidate([...rows, rows[0]]));
  assert.throws(() => selectCurrentCandidate(rows.map((row, index) => index ? row : { ...row, acceptedCorrect: 19 })));
});
test('max128 work bounds keep producer count and final encoding separate from independent articles', () => {
  assert.deepEqual(currentTransferWorkPreflight(), {
    trainingWork: 17602992, fusionCoordinateVisits: 1818624,
    calibrationCoordinateProducts: 884736, finalCoordinateProducts: 393216,
    rankWork: 64256, maximumFinalEncoderCalls: 128,
    scope: 'algorithmic-upper-bounds-not-walltime-all-CPU-or-native-instructions',
  });
});
test('two producer assessments retain32 denominators, never inflate independence to64', () => {
  const input = fixture(), result = assessCurrentProducerTransfer(input);
  assert.equal(result.distinctArticleGroups, 32); assert.equal(result.statisticalIndependenceClaim, false);
  assert.equal(result.static.correct, 32); assert.equal(result.browser.correct, 32);
  assert.equal(result.feasibilityPassed, true); assert.equal(result.paired.sameAcceptedRoot, 32);
  assert.equal(result.pairedViewsAreIndependentArticles, false);
  assert.equal(result.assignmentAuthority, false); assert.equal(result.childPredictionsEvaluated, false);
});
test('unavailable input remains unresolved and cannot borrow the other producer result', () => {
  const input = fixture();
  for (let index = 0; index < 10; index++) Object.assign(input.browserPredictions[index],
    { inputAvailable: false, selectedRootId: null });
  const result = assessCurrentProducerTransfer(input);
  assert.equal(result.static.assigned, 32); assert.equal(result.browser.total, 32);
  assert.equal(result.browser.available, 22); assert.equal(result.browser.unresolved, 10);
  assert.deepEqual(result.browser.conditionalOnAvailable, { denominator: 22, assigned: 22,
    correct: 22, wrong: 0, unresolved: 0, scope: 'descriptive-condition-on-available-not-population-quality' });
  assert.equal(result.feasibilityPassed, false); assert.equal(result.paired.oneAccepted, 10);
  input.browserPredictions[0].selectedRootId = input.cases[0].rootId;
  assert.throws(() => assessCurrentProducerTransfer(input));
});
test('minimum coverage cannot hide an entirely rejected root or any wrong accepted prediction', () => {
  const missing = fixture(); missing.staticPredictions[0].selectedRootId = null;
  missing.staticPredictions[1].selectedRootId = null;
  let result = assessCurrentProducerTransfer(missing);
  assert.equal(result.static.assigned, 30); assert.equal(result.static.wrong, 0);
  assert.equal(result.static.feasibilityGate.passed, false);
  const wrong = fixture(); wrong.browserPredictions[0].selectedRootId = 'r1';
  result = assessCurrentProducerTransfer(wrong);
  assert.equal(result.browser.wrong, 1); assert.equal(result.feasibilityPassed, false);
  assert.equal(result.paired.differentAcceptedRoots, 1);
});
test('one unresolved per root preserves full accounting and can pass the24 coverage gate only when enough remain', () => {
  const input = fixture();
  for (let index = 1; index < 16; index += 2) input.browserPredictions[index].selectedRootId = null;
  const result = assessCurrentProducerTransfer(input);
  assert.equal(result.browser.assigned, 24); assert.equal(result.browser.wrong, 0);
  assert.equal(result.browser.feasibilityGate.passed, true);
  assert.equal(Object.values(result.browser.byLanguage).reduce((sum, row) => sum + row.total, 0), 32);
});
test('paired agreement does not imply correctness and unavailable-both is not accepted agreement', () => {
  const input = fixture();
  input.staticPredictions[0].selectedRootId = input.browserPredictions[0].selectedRootId = 'r1';
  Object.assign(input.staticPredictions[1], { inputAvailable: false, selectedRootId: null });
  Object.assign(input.browserPredictions[1], { inputAvailable: false, selectedRootId: null });
  const result = assessCurrentProducerTransfer(input);
  assert.equal(result.paired.sameAcceptedRoot, 31); assert.equal(result.static.wrong, 1);
  assert.equal(result.paired.neitherAccepted, 1); assert.equal(result.paired.bothAvailable, 31);
  assert.equal(result.feasibilityPassed, false);
});
test('strict schemas reject duplicate groups, wrong order, unknown roots, sparse arrays and extra fields', () => {
  for (const mutate of [a => { a.cases[1].groupId = a.cases[0].groupId; },
    a => a.browserPredictions.reverse(), a => { a.browserPredictions[0].selectedRootId = 'unreviewed'; },
    a => { delete a.staticPredictions[0]; }, a => { a.cases[0].title = 'extra'; },
    a => { a.cases[0].rootId = 'another-root'; }, a => { a.browserPredictions[0].inputIdentity = 'bad'; }]) {
    const input = fixture(); mutate(input); assert.throws(() => assessCurrentProducerTransfer(input));
  }
});
test('accessors, proxies and coercion never run and output copies survive caller mutation', () => {
  let calls = 0; const input = fixture();
  Object.defineProperty(input.cases[0], 'host', { enumerable: true, get() { calls++; return 'private'; } });
  assert.throws(() => assessCurrentProducerTransfer(input)); assert.equal(calls, 0);
  assert.throws(() => assessCurrentProducerTransfer(new Proxy(fixture(), {})));
  const ordinary = fixture(), result = assessCurrentProducerTransfer(ordinary);
  ordinary.cases[0].rootId = 'changed'; ordinary.browserPredictions[0].selectedRootId = null;
  assert.equal(result.browser.assigned, 32); assert.ok(Object.isFrozen(result.static.byRoot));
});
