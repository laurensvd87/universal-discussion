import test from 'node:test';
import assert from 'node:assert/strict';
import { selectFreshEvents, compareRelativeCoverage } from './core.js';

const rows = Array.from({ length: 370 }, (_, event) =>
  Array.from({ length: event < 56 || event >= 96 && event < 163 ? 12 : 13 }, (_, article) => ({
    id: `d${event}_${article}`, eventKey: `event:${event}`, familyKey: `event:${event}`,
    duplicateKey: `fiction:${event}:${article}`,
  }))).flat();
// Match only the required aggregate cardinalities; fictional row content.
const all = [...rows.slice(0, 1192), ...rows.slice(1192, 4687)];
const prior = all.slice(0, 1192);
const preliminary = all.filter(row => {
  const event = Number(row.eventKey.slice(6));
  return event >= 96 && event < 110 || event >= 163 && event < 173;
});

test('relative screen preserves safety veto', () => {
  const raw = { admission: { falseEdges: 0 }, coverage: { grouped: {
    articlesInPureNonSingletonGroups: 2, truePairs: 1, falsePairs: 0, articlesInMixedGroups: 0 } } };
  const candidate = structuredClone(raw);
  candidate.coverage.grouped.articlesInPureNonSingletonGroups = 4;
  assert.equal(compareRelativeCoverage(raw, candidate).researchCandidateWins, true);
  candidate.coverage.grouped.falsePairs = 1;
  assert.equal(compareRelativeCoverage(raw, candidate).researchCandidateWins, false);
});

test('selection rejects invented or partially prior groups', () => {
  assert.throws(() => selectFreshEvents([], [], []), /PREVIOUS_SELECTION_MISMATCH/);
  assert.equal(preliminary.length, 298);
  const selected = selectFreshEvents(all, prior, preliminary);
  assert.ok(selected.documents.length <= 300 && selected.documents.length >= 200);
  assert.ok(selected.availableArticles < 3495);
  assert.ok(selected.documents.every(row => !prior.includes(row) && !preliminary.includes(row)));
  assert.deepEqual(selected.documents.map(row => row.id),
    selectFreshEvents(all, prior, preliminary).documents.map(row => row.id));
  const collided = all.map(row => ({ ...row }));
  collided.at(-1).duplicateKey = prior[0].duplicateKey;
  const withCollision = selectFreshEvents(collided, prior, preliminary);
  assert.ok(withCollision.documents.every(row => row.eventKey !== collided.at(-1).eventKey));
  assert.throws(() => selectFreshEvents(all, [all[0], ...prior.slice(1)]
    .map((row, i) => i === 5 ? all[1192] : row), preliminary), /REMAINDER_MISMATCH/);
});
