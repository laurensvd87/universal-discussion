import test from 'node:test';
import assert from 'node:assert/strict';
import { assessBrowserRootTransfer } from './methods.js';
import { assessCurrentProducerTransfer } from '../hierarchical-e5-current-producer-transfer-v1/methods.js';

const H = 'a'.repeat(64);
function fixture() {
  const cases = Array.from({ length: 32 }, (_, i) => ({ id: `c${i}`, groupId: `g${i}`,
    rootId: `r${Math.floor(i / 2)}`, language: i % 2 ? 'de' : 'en', host: `h${i % 4}.test` }));
  return { cases, predictions: cases.map(row => ({ id: row.id, inputAvailable: true,
    inputIdentity: H, selectedRootId: row.rootId, unavailableReason: null })) };
}
function unavailable(row, reason = 'article-http-refused') {
  Object.assign(row, { inputAvailable: false, selectedRootId: null, unavailableReason: reason });
}

test('browser-only arithmetic preserves full32 and never manufactures static evidence', () => {
  const result = assessBrowserRootTransfer(fixture());
  assert.equal(result.browser.total, 32); assert.equal(result.browser.correct, 32);
  assert.equal(result.feasibilityPassed, true); assert.equal(result.staticAssessed, false);
  assert.deepEqual(result.evaluatedProducers, ['browser-current']);
  assert.deepEqual(result.unexercisedCompileProfiles, ['current-static']);
  for (const key of ['statisticalIndependenceClaim', 'crawlerTransferAssessed', 'childPredictionsEvaluated',
    'unknownRootsTested', 'ordinaryDynamicBrowserProducerValidated', 'productionValidated', 'assignmentAuthority'])
    assert.equal(result[key], false);
});

test('24 accepted is inclusive;23 cannot pass, and conditional correctness cannot replace coverage', () => {
  const input = fixture();
  for (let i = 1; i < 16; i += 2) unavailable(input.predictions[i]);
  let result = assessBrowserRootTransfer(input);
  assert.equal(result.browser.assigned, 24); assert.equal(result.browser.total, 32);
  assert.equal(result.feasibilityPassed, true);
  unavailable(input.predictions[17], 'origin-policy-http-refused');
  result = assessBrowserRootTransfer(input);
  assert.equal(result.browser.assigned, 23); assert.equal(result.browser.correct, 23);
  assert.equal(result.browser.wrong, 0); assert.equal(result.feasibilityPassed, false);
  assert.deepEqual(result.browser.unavailableReasons, { 'article-http-refused': 8, 'origin-policy-http-refused': 1 });
  assert.deepEqual(result.browser.conditionalOnAvailable, { denominator: 23, assigned: 23, correct: 23,
    wrong: 0, unresolved: 0, scope: 'descriptive-condition-on-available-not-population-quality' });
});

test('one fully unassigned root or one accepted wrong root fails independently of coverage', () => {
  const missing = fixture(); missing.predictions[0].selectedRootId = null; missing.predictions[1].selectedRootId = null;
  let result = assessBrowserRootTransfer(missing);
  assert.equal(result.browser.assigned, 30); assert.equal(result.feasibilityPassed, false);
  const wrong = fixture(); wrong.predictions[0].selectedRootId = 'r1'; result = assessBrowserRootTransfer(wrong);
  assert.equal(result.browser.wrong, 1); assert.equal(result.feasibilityPassed, false);
});

test('unavailable rows stay unresolved, cannot supply a root, and need their own reason', () => {
  const input = fixture(); unavailable(input.predictions[0]);
  assert.equal(assessBrowserRootTransfer(input).browser.unresolved, 1);
  input.predictions[0].selectedRootId = 'r0'; assert.throws(() => assessBrowserRootTransfer(input));
  input.predictions[0].selectedRootId = null; input.predictions[0].unavailableReason = null;
  assert.throws(() => assessBrowserRootTransfer(input));
  const other = fixture(); other.predictions[0].unavailableReason = 'refused';
  assert.throws(() => assessBrowserRootTransfer(other));
});

test('new browser counts exactly match the old arithmetic on invented observations only', () => {
  const input = fixture(); unavailable(input.predictions[1]); input.predictions[4].selectedRootId = null;
  input.predictions[6].selectedRootId = 'r4';
  const oldRows = input.predictions.map(({ unavailableReason, ...row }) => row);
  const old = assessCurrentProducerTransfer({ cases: input.cases,
    staticPredictions: oldRows.map(row => ({ ...row })), browserPredictions: oldRows });
  const next = assessBrowserRootTransfer(input).browser, { unavailableReasons, ...comparable } = next;
  assert.deepEqual(comparable, old.browser);
  assert.equal(Object.values(next.byLanguage).reduce((sum, row) => sum + row.total, 0), 32);
  assert.equal(Object.values(next.byHost).reduce((sum, row) => sum + row.total, 0), 32);
});

test('exact schemas/order/group/root/hash checks prevent exclusions or hidden authority fields', () => {
  for (const change of [a => { a.cases[1].id = a.cases[0].id; },
    a => { a.cases[1].groupId = a.cases[0].groupId; }, a => { a.cases[0].rootId = 'new'; },
    a => a.predictions.reverse(), a => { delete a.predictions[0]; },
    a => { a.predictions[0].selectedRootId = 'unreviewed'; }, a => { a.predictions[0].inputIdentity = 'invalid'; },
    a => { a.predictions[0].nativeAuthority = true; }, a => { a.cases.pop(); },
    a => { a.cases[0].host = 'bad\n'; }, a => { a.predictions[0].inputAvailable = 1; }]) {
    const input = fixture(); change(input); assert.throws(() => assessBrowserRootTransfer(input));
  }
});

test('hostile proxies/getters cannot execute during boundary validation', () => {
  let calls = 0;
  const bad = new Proxy({}, { ownKeys() { calls++; throw Error(); }, getPrototypeOf() { calls++; throw Error(); } });
  assert.throws(() => assessBrowserRootTransfer(bad));
  const input = fixture(); Object.defineProperty(input.predictions[0], 'selectedRootId', {
    enumerable: true, get() { calls++; throw Error(); } });
  assert.throws(() => assessBrowserRootTransfer(input)); assert.equal(calls, 0);
});

test('output is independently frozen and later input mutation changes no saved arithmetic', () => {
  const input = fixture(), result = assessBrowserRootTransfer(input);
  input.cases[0].rootId = 'changed'; input.predictions[0].selectedRootId = null;
  assert.equal(result.browser.correct, 32); assert.ok(Object.isFrozen(result.browser.byRoot.r0));
  assert.ok(Object.isFrozen(result.evaluatedProducers)); assert.throws(() => { result.browser.total = 1; });
});
