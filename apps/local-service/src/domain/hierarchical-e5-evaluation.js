// Offline development fitting and locked-split assessment. Never runtime authority.
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { compileHierarchyArtifact, scoreHierarchy, classifyHierarchy } from './hierarchical-e5-matcher.js';

export const HIERARCHY_RULE_GRID = Object.freeze({
  minimumSimilarities: Object.freeze([0.75, 0.80, 0.85, 0.90, 0.95]),
  margins: Object.freeze([0, 0.01, 0.03, 0.06]),
  negativeMargins: Object.freeze([0, 0.02]),
  independentSupport: Object.freeze([1, 2]),
  meanSlack: 0.03,
});
const bad = () => { throw new TypeError('Invalid hierarchy evaluation input'); };
const capacity = () => { throw Object.assign(new RangeError('Hierarchy evaluation capacity exceeded'), { code: 'capacity' }); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const own = (value, key) => Object.getOwnPropertyDescriptor(value, key)?.value;
const freeze = value => {
  if (value && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
};

function copyData(input) {
  let units = 0;
  const visit = (value, depth) => {
    if (++units > 2_000_000) capacity();
    if (depth > 12) bad();
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') { if (!Number.isFinite(value)) bad(); return value; }
    if (typeof value === 'string') { if (value.length > 1024) bad(); return value; }
    if (typeof value !== 'object' || types.isProxy(value)) bad();
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) bad();
    const keys = Reflect.ownKeys(value), result = array ? [] : {};
    if (keys.length > 4097) bad();
    if (array) {
      const length = own(value, 'length');
      if (!Number.isInteger(length) || length < 0 || length > 4096 || keys.length !== length + 1) bad();
      for (let i = 0; i < length; i++) {
        const d = Object.getOwnPropertyDescriptor(value, String(i));
        if (!d?.enumerable || !Object.hasOwn(d, 'value')) bad();
        result.push(visit(d.value, depth + 1));
      }
    } else for (const key of keys) {
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) bad();
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (!d?.enumerable || !Object.hasOwn(d, 'value')) bad();
      result[key] = visit(d.value, depth + 1);
    }
    return result;
  };
  return visit(input, 0);
}
function exact(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join('|') !== [...names].sort().join('|')) bad();
  return value;
}
function text(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 160 || /[\u0000-\u001f\u007f]/u.test(value)) bad();
  return value;
}
function ancestry(artifact) {
  const nodes = new Map(artifact.nodes.map(node => [node.id, node]));
  const path = id => {
    const ids = [];
    while (id !== null) { const node = nodes.get(id); if (!node) bad(); ids.unshift(id); id = node.parentId; }
    return ids;
  };
  return { nodes, path };
}
function rows(input, split, nodes, examples) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 4096) bad();
  const ids = new Set(), groups = new Map();
  const evidenceIds = new Set(examples.map(example => example.id)), evidenceGroups = new Set(examples.map(example => example.groupId));
  for (const row of input) {
    exact(row, ['id', 'groupId', 'split', 'language', 'expectedTopicId', 'vector']);
    text(row.id); text(row.groupId); text(row.language);
    if (row.split !== split || ids.has(row.id) || evidenceIds.has(row.id) || evidenceGroups.has(row.groupId) ||
        row.expectedTopicId !== null && !nodes.has(row.expectedTopicId)) bad();
    ids.add(row.id);
    if (groups.has(row.groupId) && groups.get(row.groupId) !== row.expectedTopicId) bad();
    groups.set(row.groupId, row.expectedTopicId);
  }
  return input;
}
function witness(artifact, row) {
  return { sourceId: row.id, sourceVersion: row.split, representation: artifact.representation,
    representationHash: artifact.representationHash, vector: row.vector };
}
function rulePass(feature, rule) {
  const values = feature.positiveSimilarities;
  return values.length >= rule.minSupport && values[0] >= rule.minSimilarity &&
    values.slice(0, rule.minSupport).reduce((sum, value) => sum + value, 0) / rule.minSupport >= rule.meanSimilarity &&
    values.filter(value => value >= rule.minSimilarity).length >= rule.minSupport &&
    (feature.negativeMargin === null || feature.negativeMargin > 0 && feature.negativeMargin >= rule.minNegativeMargin) &&
    (feature.parentStopMargin === null || feature.parentStopMargin > 0 && feature.parentStopMargin >= rule.minMargin) &&
    (feature.siblingMargin === null || feature.siblingMargin > 0 && feature.siblingMargin >= rule.minMargin);
}
function gridRules(nodeId) {
  const values = [];
  for (const minSimilarity of HIERARCHY_RULE_GRID.minimumSimilarities)
    for (const minMargin of HIERARCHY_RULE_GRID.margins)
      for (const minNegativeMargin of HIERARCHY_RULE_GRID.negativeMargins)
        for (const minSupport of HIERARCHY_RULE_GRID.independentSupport)
          values.push({ nodeId, enabled: true, minSimilarity,
            meanSimilarity: minSimilarity - HIERARCHY_RULE_GRID.meanSlack, minMargin, minNegativeMargin, minSupport });
  return values;
}
const disabled = nodeId => ({ nodeId, enabled: false, minSimilarity: 1, meanSimilarity: 1,
  minMargin: 2, minNegativeMargin: 2, minSupport: 8 });

/** Fits development rows only. Calibration and final test rows cannot enter this API. */
export function fitHierarchyCandidate(input) {
  const { artifact, samples, minimumAcceptedGroups, targetPrecision } = exact(copyData(input),
    ['artifact', 'samples', 'minimumAcceptedGroups', 'targetPrecision']);
  const compiled = compileHierarchyArtifact(artifact), { nodes, path } = ancestry(artifact);
  rows(samples, 'development', nodes, artifact.examples);
  if (!Number.isInteger(minimumAcceptedGroups) || minimumAcceptedGroups < 2 || minimumAcceptedGroups > 4096 ||
      typeof targetPrecision !== 'number' || targetPrecision < 0.5 || targetPrecision > 1) bad();
  if (samples.length * nodes.size * gridRules('budget').length > 2_000_000) capacity();
  const cached = samples.map(row => ({ row, gold: new Set(row.expectedTopicId === null ? [] : path(row.expectedTopicId)),
    features: new Map(scoreHierarchy(compiled, witness(artifact, row)).features.map(feature => [feature.nodeId, feature])) }));
  const summaries = [], nodeRules = [];
  for (const node of artifact.nodes) {
    const positiveGroups = new Set(cached.filter(item => item.gold.has(node.id)).map(item => item.row.groupId));
    let best = null;
    if (positiveGroups.size >= minimumAcceptedGroups) for (const rule of gridRules(node.id)) {
      const outcomes = new Map();
      for (const item of cached) if (rulePass(item.features.get(node.id), rule)) {
        const previous = outcomes.get(item.row.groupId);
        outcomes.set(item.row.groupId, previous !== false && item.gold.has(node.id));
      }
      const accepted = outcomes.size, correct = [...outcomes.values()].filter(Boolean).length;
      if (accepted < minimumAcceptedGroups || correct / accepted < targetPrecision) continue;
      // Fixed deterministic order: coverage first, then fewer false acceptances,
      // more independent support, and stricter margins/absolute similarity.
      const rank = [correct, -(accepted - correct), rule.minSupport, rule.minMargin, rule.minNegativeMargin, rule.minSimilarity];
      if (!best || rank.some((value, i) => value !== best.rank[i] &&
          rank.slice(0, i).every((prior, j) => prior === best.rank[j]) && value > best.rank[i]))
        best = { rule, accepted, correct, rank };
    }
    nodeRules.push(best?.rule ?? disabled(node.id));
    summaries.push({ nodeId: node.id, enabled: Boolean(best), positiveGroups: positiveGroups.size,
      acceptedGroups: best?.accepted ?? 0, correctGroups: best?.correct ?? 0,
      observedPrecision: best ? best.correct / best.accepted : null });
  }
  const calibrationVersion = digest({ grid: HIERARCHY_RULE_GRID, minimumAcceptedGroups, targetPrecision,
    development: samples, nodeRules, representationHash: artifact.representationHash,
    taxonomyVersion: artifact.taxonomyVersion, evidenceVersion: artifact.evidenceVersion });
  const candidate = { ...artifact, nodeRules, calibrationStatus: 'candidate', calibrationVersion };
  compileHierarchyArtifact(candidate);
  return freeze({ artifact: candidate, artifactSha256: digest(candidate), fittingSplit: 'development',
    summaries, developmentGroupCount: new Set(samples.map(row => row.groupId)).size,
    productionValidated: false });
}

/** Assess a frozen candidate without changing any rule or its calibration identity. */
export function evaluateHierarchyCandidate(input) {
  const { artifact, samples, split } = exact(copyData(input), ['artifact', 'samples', 'split']);
  if (!['development', 'calibration', 'test'].includes(split)) bad();
  const compiled = compileHierarchyArtifact(artifact), { nodes, path } = ancestry(artifact);
  rows(samples, split, nodes, artifact.examples);
  const childParents = new Set(artifact.nodes.map(node => node.parentId).filter(Boolean));
  const outcomes = [], times = [];
  let accepted = 0, correct = 0, exactDepth = 0, broadFallback = 0, wrongBroad = 0, leafAccepted = 0, leafCorrect = 0;
  for (const row of samples) {
    const started = performance.now(), decision = classifyHierarchy(compiled, witness(artifact, row));
    times.push(performance.now() - started);
    const gold = row.expectedTopicId === null ? [] : path(row.expectedTopicId);
    const predicted = decision.primaryNodeId, valid = predicted !== null && gold.includes(predicted);
    if (predicted !== null) {
      accepted++; if (valid) correct++;
      if (!gold.length || path(predicted)[0] !== gold[0]) wrongBroad++;
      if (valid && predicted !== row.expectedTopicId) broadFallback++;
      if (!childParents.has(predicted)) { leafAccepted++; if (valid) leafCorrect++; }
    }
    if (predicted === row.expectedTopicId) exactDepth++;
    outcomes.push({ id: row.id, groupId: row.groupId, language: row.language, expectedTopicId: row.expectedTopicId,
      primaryNodeId: predicted, safeAccepted: valid, correctOutcome: predicted === row.expectedTopicId,
      goldDepth: gold.length, predictedDepth: predicted === null ? 0 : path(predicted).length,
      goldBranch: gold[0] ?? 'outside', reason: decision.reason, work: decision.work });
  }
  const acceptedGroups = new Map(), leafGroups = new Map();
  for (const row of outcomes) if (row.primaryNodeId !== null) {
    acceptedGroups.set(row.groupId, acceptedGroups.get(row.groupId) !== false && row.safeAccepted);
    if (!childParents.has(row.primaryNodeId)) leafGroups.set(row.groupId, leafGroups.get(row.groupId) !== false && row.safeAccepted);
  }
  const leafCorrectGroups = [...leafGroups.values()].filter(Boolean).length;
  const by = key => {
    const buckets = new Map();
    for (const row of outcomes) {
      const id = row[key], bucket = buckets.get(id) ?? { value: id, rows: 0, accepted: 0, safeAccepted: 0, deepestCorrect: 0 };
      bucket.rows++; if (row.primaryNodeId !== null) bucket.accepted++;
      if (row.safeAccepted) bucket.safeAccepted++;
      if (row.correctOutcome) bucket.deepestCorrect++;
      buckets.set(id, bucket);
    }
    return [...buckets.values()].map(bucket => ({ ...bucket,
      acceptedPrecision: bucket.accepted ? bucket.safeAccepted / bucket.accepted : null }));
  };
  const interval = (correctCount, count) => {
    if (!count) return null;
    const z = 1.959963984540054, z2 = z * z, p = correctCount / count;
    const center = (p + z2 / (2 * count)) / (1 + z2 / count);
    const half = z * Math.sqrt((p * (1 - p) + z2 / (4 * count)) / count) / (1 + z2 / count);
    return { method: 'Wilson-two-sided-95', lower: Math.max(0, center - half), upper: Math.min(1, center + half),
      assumption: 'independent-group-decisions-not-web-representativeness' };
  };
  times.sort((a, b) => a - b);
  const precision = accepted ? correct / accepted : null, leafPrecision = leafAccepted ? leafCorrect / leafAccepted : null;
  return freeze({ split, artifactSha256: digest(artifact), representation: artifact.representation,
    rowCount: samples.length, independentGroups: new Set(samples.map(row => row.groupId)).size,
    accepted, safeAccepted: correct, acceptedPrecision: precision, coverage: accepted / samples.length,
    correctDeepestOutcome: exactDepth, deepestOutcomeAccuracy: exactDepth / samples.length,
    broadFallback, wrongBroad, leafAccepted, leafPrecision, acceptedGroups: acceptedGroups.size,
    safeAcceptedGroups: [...acceptedGroups.values()].filter(Boolean).length,
    leafAcceptedGroups: leafGroups.size, leafCorrectGroups,
    acceptedGroupPrecision: acceptedGroups.size ? [...acceptedGroups.values()].filter(Boolean).length / acceptedGroups.size : null,
    leafGroupPrecision: leafGroups.size ? leafCorrectGroups / leafGroups.size : null,
    leafGroupPrecisionInterval95: interval(leafCorrectGroups, leafGroups.size),
    byLanguage: by('language'), byGoldDepth: by('goldDepth'), byGoldBranch: by('goldBranch'),
    gate: { productionValidated: false, minimumIndependentLeafDecisions: 150,
      enoughIndependentLeafDecisions: leafGroups.size >= 150,
      observedLeafPrecisionPass: leafGroups.size > 0 && leafCorrectGroups / leafGroups.size >= 0.98,
      intervalLowerBoundPass: (interval(leafCorrectGroups, leafGroups.size)?.lower ?? 0) >= 0.98,
      observedBroadErrorPass: wrongBroad / samples.length <= 0.01 },
    timing: { sampleCount: times.length, medianMs: times[Math.floor(times.length / 2)],
      p95Ms: times[Math.max(0, Math.ceil(times.length * 0.95) - 1)], maximumMs: times.at(-1),
      scope: 'classify-with-validation-excluding-compile-embedding-queue-database' }, outcomes });
}
