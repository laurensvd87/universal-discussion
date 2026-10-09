import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRelativeCoverage, verifyReviewedDigests } from './core.js';

const method = (pure, pairs, falsePairs = 0, mixed = 0, falseEdges = 0,
  completeEvents = 0) => ({ admission: { falseEdges, completeEvents },
  coverage: { grouped: { articlesInPureNonSingletonGroups: pure,
    truePairs: pairs, falsePairs, articlesInMixedGroups: mixed,
    completeEvents } } });

test('partial pure reach can win with zero complete events', () => {
  assert.equal(compareRelativeCoverage(method(2, 1), method(3, 2))
    .researchCandidateWins, true);
});
test('complete events do not offset reduced reach', () => {
  assert.equal(compareRelativeCoverage(method(4, 3), method(3, 2, 0, 0, 0, 2))
    .researchCandidateWins, false);
});
test('direct and transitive false pairs and mixed exposure each veto a win', () => {
  for (const candidate of [method(5, 4, 0, 0, 1),
    method(5, 4, 1), method(5, 4, 0, 2)])
    assert.equal(compareRelativeCoverage(method(2, 1), candidate).researchCandidateWins, false);
});
test('a gain in either reach measure wins if the other does not decline', () => {
  assert.equal(compareRelativeCoverage(method(3, 1), method(3, 3)).researchCandidateWins, true);
  assert.equal(compareRelativeCoverage(method(2, 3), method(4, 3)).researchCandidateWins, true);
  assert.equal(compareRelativeCoverage(method(2, 3), method(2, 3)).researchCandidateWins, false);
  assert.equal(compareRelativeCoverage(method(2, 3), method(3, 2)).researchCandidateWins, false);
});
test('invalid aggregate is rejected', () => {
  assert.throws(() => compareRelativeCoverage(method(2, 1), method(-1, 4)), /COVERAGE_INPUT/);
});
test('reviewed hash verifier rejects changed, missing and extra files', () => {
  const digest = 'a'.repeat(64), other = 'b'.repeat(64);
  const reviewed = { 'code.js': digest, 'asset.wasm': other };
  assert.equal(verifyReviewedDigests({ ...reviewed }, reviewed), true);
  assert.throws(() => verifyReviewedDigests({ ...reviewed, 'code.js': other }, reviewed),
    /REVIEWED_DIGEST_MISMATCH/);
  assert.throws(() => verifyReviewedDigests({ 'code.js': digest }, reviewed),
    /REVIEWED_INVENTORY/);
  assert.throws(() => verifyReviewedDigests({ ...reviewed, extra: digest }, reviewed),
    /REVIEWED_INVENTORY/);
});
