// Experimental metadata/arithmetic only. No model, corpus, capture or IO imports.
import assert from 'node:assert/strict';
import { types } from 'node:util';

export const CURRENT_WEIGHT_ORDER = Object.freeze([.5, .75, .25]);
const HEX = /^[a-f0-9]{64}$/u;
function record(value, keys) {
  assert.ok(value && typeof value === 'object' && !types.isProxy(value) &&
    Object.getPrototypeOf(value) === Object.prototype);
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...keys].sort());
  return Object.fromEntries(keys.map(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'));
    return [key, descriptor.value];
  }));
}
function dense(value, count) {
  assert.ok(Array.isArray(value) && !types.isProxy(value) &&
    Object.getPrototypeOf(value) === Array.prototype && value.length === count);
  assert.equal(Reflect.ownKeys(value).length, count + 1);
  return Array.from({ length: count }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    assert.ok(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'));
    return descriptor.value;
  });
}
function text(value) {
  assert.ok(typeof value === 'string' && value.length > 0 && value.length <= 253 &&
    value.trim() === value && value.isWellFormed() && !/[\u0000-\u001f\u007f]/u.test(value));
  return value;
}
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Index only; no caller object is adopted and no old final outcome is consulted. */
export function selectCurrentCandidate(input) {
  const candidates = dense(input, 3).map((value, index) => {
    const candidate = record(value, ['bodyWeight', 'acceptedCorrect', 'rawCorrect']);
    assert.equal(candidate.bodyWeight, CURRENT_WEIGHT_ORDER[index]);
    for (const key of ['acceptedCorrect', 'rawCorrect'])
      assert.ok(Number.isSafeInteger(candidate[key]) && candidate[key] >= 0 && candidate[key] <= 48);
    assert.ok(candidate.acceptedCorrect <= candidate.rawCorrect);
    assert.ok(candidate.acceptedCorrect === 0 || candidate.acceptedCorrect >= 20);
    return candidate;
  });
  let selected = 0;
  for (let index = 1; index < candidates.length; index++) {
    const challenger = candidates[index], incumbent = candidates[selected];
    if (challenger.acceptedCorrect > incumbent.acceptedCorrect ||
      challenger.acceptedCorrect === incumbent.acceptedCorrect && challenger.rawCorrect > incumbent.rawCorrect)
      selected = index;
  }
  return selected;
}

/** Conservative max128 TRAIN bound; actual work must be recorded separately. */
export function currentTransferWorkPreflight() {
  const n = 128, d = 384, heads = 16, calibration = 48, articles = 32, producers = 2;
  const perFit = 4*n*d + d + n*(n+1)/2*d + n + n*(n+1)*(n-1)/6 + n*(n+1)/2 +
    heads*(9*n + n + 1 + 2*n*n + 2*n*d + 4*d + 16);
  const result = {
    trainingWork: Math.ceil(3 * perFit),
    fusionCoordinateVisits: (3*(n+calibration) + articles*producers)*d*8,
    calibrationCoordinateProducts: 3*calibration*heads*d,
    finalCoordinateProducts: articles*producers*heads*d,
    rankWork: 3*(calibration*heads*4 + calibration*calibration*4 + calibration*64 + 256) +
      3*calibration*heads*4 + articles*producers*heads*8,
    maximumFinalEncoderCalls: articles*producers*2,
    scope: 'algorithmic-upper-bounds-not-walltime-all-CPU-or-native-instructions',
  };
  assert.ok(result.trainingWork <= 20_000_000);
  assert.ok(result.fusionCoordinateVisits <= 2_000_000);
  assert.ok(result.calibrationCoordinateProducts + result.finalCoordinateProducts <= 2_000_000);
  assert.ok(result.rankWork <= 100_000);
  return deepFreeze(result);
}

function casesFor(input) {
  const ids = new Set(), groups = new Set(), roots = new Map();
  const cases = dense(input, 32).map(value => {
    const row = record(value, ['id', 'groupId', 'rootId', 'language', 'host']);
    for (const value of Object.values(row)) text(value);
    assert.ok(!ids.has(row.id) && !groups.has(row.groupId));
    ids.add(row.id); groups.add(row.groupId);
    roots.set(row.rootId, (roots.get(row.rootId) ?? 0) + 1);
    return row;
  });
  assert.equal(roots.size, 16); assert.ok([...roots.values()].every(count => count === 2));
  return { cases, roots: new Set(roots.keys()) };
}
function predictionsFor(input, cases, roots) {
  return dense(input, 32).map((value, index) => {
    const row = record(value, ['id', 'inputAvailable', 'inputIdentity', 'selectedRootId']);
    assert.equal(row.id, cases[index].id);
    assert.equal(typeof row.inputAvailable, 'boolean');
    assert.equal(typeof row.inputIdentity, 'string'); assert.match(row.inputIdentity, HEX);
    assert.ok(row.selectedRootId === null || roots.has(row.selectedRootId));
    if (!row.inputAvailable) assert.equal(row.selectedRootId, null, 'Unavailable input cannot be rescued');
    return row;
  });
}
function counts(cases, predictions, indices) {
  const assigned = indices.filter(index => predictions[index].selectedRootId !== null);
  const correct = assigned.filter(index => predictions[index].selectedRootId === cases[index].rootId).length;
  return {
    total: indices.length,
    available: indices.filter(index => predictions[index].inputAvailable).length,
    assigned: assigned.length,
    correct,
    wrong: assigned.length - correct,
    unresolved: indices.length - assigned.length,
  };
}
function producerAssessment(cases, predictions) {
  const indices = cases.map((_, index) => index), result = counts(cases, predictions, indices);
  const by = field => Object.fromEntries([...new Set(cases.map(row => row[field]))].sort().map(key => [
    key, counts(cases, predictions, indices.filter(index => cases[index][field] === key)),
  ]));
  const byRoot = by('rootId');
  return {
    ...result, byRoot, byLanguage: by('language'), byHost: by('host'),
    conditionalOnAvailable: {
      denominator: result.available, assigned: result.assigned, correct: result.correct,
      wrong: result.wrong, unresolved: result.available - result.assigned,
      scope: 'descriptive-condition-on-available-not-population-quality',
    },
    feasibilityGate: {
      minimumAccepted: 24, maximumWrong: 0, minimumAcceptedPerRoot: 1,
      passed: result.assigned >= 24 && result.wrong === 0 &&
        Object.values(byRoot).every(row => row.assigned >= 1),
    },
  };
}

/** Descriptive arithmetic, NOT a scorer or capture/Source attestation.
 * Input identities are bound elsewhere to exact saved producer evidence.
 * Missing inputs remain unresolved in each producer's full32 denominator.
 */
export function assessCurrentProducerTransfer(input) {
  const data = record(input, ['cases', 'staticPredictions', 'browserPredictions']);
  const { cases, roots } = casesFor(data.cases);
  const staticRows = predictionsFor(data.staticPredictions, cases, roots);
  const browserRows = predictionsFor(data.browserPredictions, cases, roots);
  const staticAssessment = producerAssessment(cases, staticRows);
  const browserAssessment = producerAssessment(cases, browserRows);
  const paired = { totalArticles: 32, bothAvailable: 0, bothAccepted: 0,
    sameAcceptedRoot: 0, differentAcceptedRoots: 0, oneAccepted: 0, neitherAccepted: 0 };
  for (let index = 0; index < 32; index++) {
    const a = staticRows[index], b = browserRows[index];
    if (a.inputAvailable && b.inputAvailable) paired.bothAvailable++;
    if (a.selectedRootId !== null && b.selectedRootId !== null) {
      paired.bothAccepted++;
      paired[a.selectedRootId === b.selectedRootId ? 'sameAcceptedRoot' : 'differentAcceptedRoots']++;
    } else if (a.selectedRootId !== null || b.selectedRootId !== null) paired.oneAccepted++;
    else paired.neitherAccepted++;
  }
  return deepFreeze({
    schema: 'current-producer-root-transfer-assessment/v1',
    distinctArticleGroups: 32, statisticalIndependenceClaim: false,
    static: staticAssessment, browser: browserAssessment, paired,
    feasibilityPassed: staticAssessment.feasibilityGate.passed && browserAssessment.feasibilityGate.passed,
    pairedViewsAreIndependentArticles: false, unavailableIncludedInDenominator: true,
    conditionalAvailabilityIsPopulationQuality: false, childPredictionsEvaluated: false,
    unknownRootsTested: false, productionValidated: false, assignmentAuthority: false,
  });
}
