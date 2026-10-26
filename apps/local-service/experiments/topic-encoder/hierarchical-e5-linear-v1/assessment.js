// Experiment reporting only. No data/runtime authority and no model fitting here.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compileHierarchyLinearHeads, scoreHierarchyLinearHeads } from '../../../src/domain/hierarchical-e5-linear-heads.js';
import { compileHierarchyHeadAssignment, classifyHierarchyHeads } from '../../../src/domain/hierarchical-e5-head-policy.js';
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => hash(JSON.stringify(value));
function paths(model) {
  const nodes = new Map(model.nodes.map(n => [n.id, n]));
  return new Map(model.nodes.map(n => {
    const path = [];let current = n;
    while (current) { path.unshift(current.id);current = nodes.get(current.parentId); }
    return [n.id, path];
  }));
}
function checkedRows(model, rows, split, forbiddenIds = [], forbiddenGroups = []) {
  assert.ok(Array.isArray(rows) && rows.length > 0 && rows.length <= 512);
  const ids = new Set(), groups = new Set(), taxonomy = paths(model);
  const blockedIds = new Set([...model.trainingIdHashes, ...forbiddenIds]);
  const blockedGroups = new Set([...model.trainingGroupHashes, ...forbiddenGroups]);
  for (const row of rows) {
    assert.equal(row.split, split);assert.ok(row.expectedTopicId === null || taxonomy.has(row.expectedTopicId));
    assert.ok(!ids.has(row.id) && !groups.has(row.groupId));ids.add(row.id);groups.add(row.groupId);
    assert.ok(!blockedIds.has(hash(row.id)) && !blockedGroups.has(hash(row.groupId)), 'Split provenance overlaps');
    assert.equal(typeof row.language, 'string');
  }
  return taxonomy;
}
const witness = (model, row) => ({ sourceId: row.id, sourceVersion: row.split,
  representation: model.representation, representationHash: model.representationHash, vector: row.vector });

/** Only development loss selects representation/lambda. No calibration/test fit. */
export function balancedDevelopmentLoss(model, rows) {
  const compiled = compileHierarchyLinearHeads(model), ancestry = checkedRows(model, rows, 'development');
  const buckets = new Map(model.nodes.map(n => [n.id, { positive: [], negative: [] }]));
  for (const row of rows) {
    const positive = row.expectedTopicId === null ? [] : ancestry.get(row.expectedTopicId);
    const packet = scoreHierarchyLinearHeads(compiled, witness(model, row));
    for (const feature of packet.scores) {
      const yes = positive.includes(feature.nodeId), target = yes ? 1 : -1;
      buckets.get(feature.nodeId)[yes ? 'positive' : 'negative'].push((feature.score - target) ** 2);
    }
  }
  const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
  const byNode = [...buckets].map(([nodeId, b]) => ({ nodeId, positiveRows: b.positive.length,
    negativeRows: b.negative.length, loss: b.positive.length && b.negative.length
      ? (mean(b.positive) + mean(b.negative)) / 2 : mean([...b.positive, ...b.negative]) }));
  const loss = mean(byNode.map(n => n.loss));assert.ok(Number.isFinite(loss));
  return { loss, byNode, split: 'development', rows: rows.length, calibrationUsed: false, testUsed: false };
}

export function wilson95(correct, count) {
  assert.ok(Number.isInteger(correct) && Number.isInteger(count) && correct >= 0 && correct <= count);
  if (!count) return null;
  const z = 1.959963984540054, z2 = z * z, p = correct / count, denominator = 1 + z2 / count;
  const center = (p + z2 / (2 * count)) / denominator;
  const half = z * Math.sqrt((p * (1 - p) + z2 / (4 * count)) / count) / denominator;
  return { method: 'Wilson-two-sided-95', lower: Math.max(0, center - half), upper: Math.min(1, center + half),
    assumption: 'independent-group-outcomes-not-web-representativeness' };
}

/** Assess frozen whole-path decisions. Never changes model, thresholds or corpus. */
export function evaluateFrozenHeads({ model, policy, rows, developmentIdHashes, developmentGroupHashes }) {
  const compiled = compileHierarchyHeadAssignment({ model, policy });
  assert.ok(Array.isArray(developmentIdHashes) && Array.isArray(developmentGroupHashes));
  const ancestry = checkedRows(model, rows, 'test', [...policy.calibrationIdHashes, ...developmentIdHashes],
    [...policy.calibrationGroupHashes, ...developmentGroupHashes]);
  const parents = new Set(model.nodes.map(n => n.parentId).filter(n => n !== null)), outcomes = [], times = [];
  let accepted = 0, safe = 0, leafAccepted = 0, leafCorrect = 0, broadFallback = 0, wrongBroad = 0, wrongSameBranch = 0, overSpecific = 0, exact = 0;
  for (const row of rows) {
    const started = performance.now(), decision = classifyHierarchyHeads(compiled, witness(model, row));
    times.push(performance.now() - started);
    const predicted = decision.primaryNodeId, gold = row.expectedTopicId === null ? [] : ancestry.get(row.expectedTopicId);
    const valid = predicted !== null && gold.includes(predicted), leaf = predicted !== null && !parents.has(predicted);
    if (predicted !== null) {
      accepted++;if (valid) safe++;
      if (!gold.length || ancestry.get(predicted)[0] !== gold[0]) wrongBroad++;
      else if (!valid) {
        wrongSameBranch++;
        if (ancestry.get(predicted).includes(row.expectedTopicId)) overSpecific++;
      }
      if (valid && predicted !== row.expectedTopicId) broadFallback++;
      if (leaf) { leafAccepted++;if (valid) leafCorrect++; }
    }
    if (predicted === row.expectedTopicId) exact++;
    outcomes.push({ id: row.id, groupId: row.groupId, language: row.language, expectedTopicId: row.expectedTopicId,
      primaryNodeId: predicted, safeAccepted: valid, exactOutcome: predicted === row.expectedTopicId,
      goldDepth: gold.length, goldBranch: gold[0] ?? 'outside', reason: decision.reason, work: decision.work });
  }
  const by = key => [...new Set(outcomes.map(r => r[key]))].map(value => {
    const slice = outcomes.filter(r => r[key] === value), assigned = slice.filter(r => r.primaryNodeId !== null);
    return { value, rows: slice.length, accepted: assigned.length, safeAccepted: assigned.filter(r => r.safeAccepted).length,
      deepestCorrect: slice.filter(r => r.exactOutcome).length };
  });
  times.sort((a, b) => a - b);
  const leafInterval = wilson95(leafCorrect, leafAccepted), broadInterval = wilson95(wrongBroad, rows.length);
  return { split: 'test', modelArtifactHash: digest(model), policyHash: policy.policyHash,
    rowCount: rows.length, independentGroups: rows.length, accepted, safeAccepted: safe,
    acceptedPrecision: accepted ? safe / accepted : null, coverage: accepted / rows.length,
    leafAccepted, leafCorrect, leafPrecision: leafAccepted ? leafCorrect / leafAccepted : null,
    leafPrecisionInterval95: leafInterval, wrongBroad, observedBroadError: wrongBroad / rows.length,
    broadErrorInterval95: broadInterval, wrongSameBranch, overSpecificSameBranch: overSpecific,
    wrongSiblingOrCousin: wrongSameBranch - overSpecific, broadFallback,
    correctDeepestOutcome: exact, deepestOutcomeAccuracy: exact / rows.length,
    byLanguage: by('language'), byGoldDepth: by('goldDepth'), byGoldBranch: by('goldBranch'), outcomes,
    gate: { productionValidated: false, representativeWebValidation: false,
      minimumUsefulCoveragePass: accepted / rows.length >= 0.6,
      minimumSpecificCoveragePass: leafAccepted / rows.length >= 0.3,
      enoughIndependentLeafDecisions: leafAccepted >= 150, observedLeafPrecisionPass: leafAccepted > 0 && leafCorrect / leafAccepted >= 0.98,
      leafIntervalLowerBoundPass: (leafInterval?.lower ?? 0) >= 0.98,
      observedBroadErrorPass: wrongBroad / rows.length <= 0.01, broadIntervalUpperBoundPass: broadInterval.upper <= 0.01 },
    timing: { medianMs: times[Math.floor(times.length / 2)], p95Ms: times[Math.ceil(times.length * 0.95) - 1],
      maximumMs: times.at(-1), scope: 'whole-path-classifier-with-validation-excluding-compile-embedding-queue-database' } };
}
