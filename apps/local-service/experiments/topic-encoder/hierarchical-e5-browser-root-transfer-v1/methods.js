// Descriptive ADR148 arithmetic only. No IO, model, capture or runtime authority.
import assert from 'node:assert/strict';
import { types } from 'node:util';

const HEX = /^[a-f0-9]{64}$/u;
function record(value, keys) {
  assert.ok(value && typeof value === 'object' && !types.isProxy(value) &&
    Object.getPrototypeOf(value) === Object.prototype);
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...keys].sort());
  return Object.fromEntries(keys.map(key => {
    const d = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(d?.enumerable && Object.hasOwn(d, 'value'));
    return [key, d.value];
  }));
}
function dense(value, length) {
  assert.ok(Array.isArray(value) && !types.isProxy(value) &&
    Object.getPrototypeOf(value) === Array.prototype && value.length === length);
  assert.equal(Reflect.ownKeys(value).length, length + 1);
  return Array.from({ length }, (_, index) => {
    const d = Object.getOwnPropertyDescriptor(value, String(index));
    assert.ok(d?.enumerable && Object.hasOwn(d, 'value'));
    return d.value;
  });
}
function text(value) {
  assert.ok(typeof value === 'string' && value.length > 0 && value.length <= 253 &&
    value.trim() === value && value.isWellFormed() && !/[\u0000-\u001f\u007f]/u.test(value));
  return value;
}
function frozen(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

/** Caller binds these declarations to actual frozen evidence elsewhere.
 * No supplied hash, label or prediction authenticates a capture or model here.
 * There is no static prediction argument and no fabricated static observation.
 */
export function assessBrowserRootTransfer(input) {
  const data = record(input, ['cases', 'predictions']);
  const ids = new Set(), groups = new Set(), roots = new Map();
  const cases = dense(data.cases, 32).map(value => {
    const row = record(value, ['id', 'groupId', 'rootId', 'language', 'host']);
    for (const item of Object.values(row)) text(item);
    assert.ok(!ids.has(row.id) && !groups.has(row.groupId));
    ids.add(row.id); groups.add(row.groupId);
    roots.set(row.rootId, (roots.get(row.rootId) ?? 0) + 1);
    return row;
  });
  assert.equal(roots.size, 16);
  assert.ok([...roots.values()].every(count => count === 2));
  const predictions = dense(data.predictions, 32).map((value, index) => {
    const row = record(value, ['id', 'inputAvailable', 'inputIdentity', 'selectedRootId', 'unavailableReason']);
    assert.equal(row.id, cases[index].id);
    assert.equal(typeof row.inputAvailable, 'boolean');
    assert.equal(typeof row.inputIdentity, 'string'); assert.match(row.inputIdentity, HEX);
    assert.ok(row.selectedRootId === null || roots.has(row.selectedRootId));
    if (row.inputAvailable) assert.equal(row.unavailableReason, null);
    else {
      assert.equal(row.selectedRootId, null, 'Unavailable input cannot be rescued');
      text(row.unavailableReason);
    }
    return row;
  });
  const indices = cases.map((_, index) => index);
  const counts = subset => {
    const assigned = subset.filter(index => predictions[index].selectedRootId !== null);
    const correct = assigned.filter(index => predictions[index].selectedRootId === cases[index].rootId).length;
    return { total: subset.length, available: subset.filter(index => predictions[index].inputAvailable).length,
      assigned: assigned.length, correct, wrong: assigned.length - correct, unresolved: subset.length - assigned.length };
  };
  const by = field => Object.fromEntries([...new Set(cases.map(row => row[field]))].sort().map(key =>
    [key, counts(indices.filter(index => cases[index][field] === key))]));
  const total = counts(indices), byRoot = by('rootId');
  const unavailableReasons = Object.fromEntries([...new Set(predictions.filter(row => !row.inputAvailable)
    .map(row => row.unavailableReason))].sort().map(reason =>
    [reason, predictions.filter(row => !row.inputAvailable && row.unavailableReason === reason).length]));
  const passed = total.assigned >= 24 && total.wrong === 0 &&
    Object.values(byRoot).every(row => row.assigned >= 1);
  return frozen({
    schema: 'browser-root-transfer-assessment/v1', distinctArticleGroups: 32,
    evaluatedProducers: ['browser-current'], unexercisedCompileProfiles: ['current-static'],
    statisticalIndependenceClaim: false, staticAssessed: false, crawlerTransferAssessed: false,
    browser: { ...total, byRoot, byLanguage: by('language'), byHost: by('host'), unavailableReasons,
      conditionalOnAvailable: { denominator: total.available, assigned: total.assigned, correct: total.correct,
        wrong: total.wrong, unresolved: total.available - total.assigned,
        scope: 'descriptive-condition-on-available-not-population-quality' },
      feasibilityGate: { minimumAccepted: 24, maximumWrong: 0, minimumAcceptedPerRoot: 1, passed } },
    feasibilityPassed: passed, unavailableIncludedInDenominator: true,
    conditionalAvailabilityIsPopulationQuality: false, childPredictionsEvaluated: false,
    unknownRootsTested: false, ordinaryDynamicBrowserProducerValidated: false,
    productionValidated: false, assignmentAuthority: false,
  });
}
