// Frozen v3 holdout adapter and aggregate-only diagnostics. Gold is evaluation-only.
import { createHash } from 'node:crypto';
import { triangleOnly } from '../offline-pair-verifier-v5/core.js';
import { cosine } from './core.js';

const LANGUAGES = ['en', 'nl', 'de', 'fr', 'es'];
const LANGUAGE_SET = new Set(LANGUAGES);
const fail = code => { throw new TypeError(code); };
export const PINNED = Object.freeze({
  trainSha256: '6710E9EE4FD2A09E569FA60B624F599B2138A5A389C04C486CF714BDF985C632',
  holdoutSha256: '86FD3D5626A2C59ED0DDFF46AC6BB2386EC6A8E9FF163F8C5E95451C21BBBE2C',
  modelSha256: 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193',
  learnedCutoff: 0.8690268344580456,
  rawCutoff: 0.9216038494934216,
});
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();

export function partitionTrain(train) {
  const names = [...new Set(train.map(doc => doc.categories[0]))].sort((a, b) => {
    const left = sha256(Buffer.from(a)), right = sha256(Buffer.from(b));
    return left < right ? -1 : left > right ? 1 : 0;
  });
  if (names.length !== 8) fail('FAMILY_COUNT');
  const fitNames = new Set(names.slice(0, 6));
  const fit = train.filter(doc => fitNames.has(doc.categories[0]));
  const calibration = train.filter(doc => !fitNames.has(doc.categories[0]));
  if (fit.length !== 120 || calibration.length !== 40 ||
      new Set(fit.map(doc => doc.eventKey)).size !== 12 ||
      new Set(calibration.map(doc => doc.eventKey)).size !== 4)
    fail('FAMILY_SPLIT');
  return { fit, calibration };
}

export function assertFrozenCalibration(learned, raw, modelSha) {
  if (modelSha !== PINNED.modelSha256 ||
      !Number.isFinite(learned) || !Number.isFinite(raw) ||
      Math.abs(learned - PINNED.learnedCutoff) > 1e-10 ||
      Math.abs(raw - PINNED.rawCutoff) > 1e-10) fail('FROZEN_CALIBRATION');
  return true;
}

export async function afterFrozenCalibration(learned, raw, modelSha, readHoldout) {
  assertFrozenCalibration(learned, raw, modelSha);
  if (typeof readHoldout !== 'function') fail('HOLDOUT_READER');
  return readHoldout();
}

export function validateV3Holdout(rows, train) {
  if (!Array.isArray(rows) || rows.length !== 60) fail('HOLDOUT_COUNT');
  const trainIds = new Set(train.map(doc => doc.id));
  const trainEvents = new Set(train.map(doc => doc.eventKey));
  const trainFamilies = new Set(train.map(doc => doc.categories[0]));
  const ids = new Set(), events = new Map(), families = new Map();
  for (const row of rows) {
    const lang = typeof row?.id === 'string' ? /^m3-(en|nl|de|fr|es)-/u.exec(row.id)?.[1] : null;
    if (!row || Object.keys(row).sort().join(',') !==
        'body,family,id,split,title,topicLabel,viewpoint' ||
        !LANGUAGE_SET.has(lang) || ids.has(row.id) || trainIds.has(row.id) ||
        typeof row.family !== 'string' || !row.family || trainFamilies.has(row.family) ||
        typeof row.topicLabel !== 'string' || !row.topicLabel || trainEvents.has(row.topicLabel) ||
        typeof row.viewpoint !== 'string' || !row.viewpoint ||
        row.split !== 'multilingual-challenge-v3' ||
        typeof row.title !== 'string' || !row.title.trim() ||
        typeof row.body !== 'string' || !row.body.trim()) fail('HOLDOUT_SCHEMA');
    ids.add(row.id);
    const members = events.get(row.topicLabel) ?? [];
    members.push({ ...row, lang }); events.set(row.topicLabel, members);
    const familyEvents = families.get(row.family) ?? new Set();
    familyEvents.add(row.topicLabel); families.set(row.family, familyEvents);
  }
  if (events.size !== 15 || families.size !== 5 ||
      [...families.values()].some(items => items.size !== 3)) fail('HOLDOUT_STRUCTURE');
  for (const members of events.values()) {
    if (members.length !== 4 || new Set(members.map(row => row.family)).size !== 1 ||
        new Set(members.map(row => row.lang)).size < 3 ||
        new Set(members.map(row => row.viewpoint)).size !== 4)
      fail('HOLDOUT_STRUCTURE');
  }
  return rows.map(row => ({ id: row.id, eventKey: row.topicLabel,
    categories: [row.family], lang: /^m3-(en|nl|de|fr|es)-/u.exec(row.id)[1],
    title: row.title, lead: row.body.slice(0, 384) }));
}

const choose2 = count => count * (count - 1) / 2;
const ratio = (numerator, denominator) => denominator ? numerator / denominator : null;

export function scoreV3(documents, vectors, threshold) {
  const { researchScreen: ignored, ...policy } = triangleOnly(documents, vectors, cosine, threshold);
  const n = documents.length;
  const neighbors = Array.from({ length: n }, () => new Set());
  const gated = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (cosine(vectors.get(documents[i].id), vectors.get(documents[j].id)) >= threshold) {
      gated.push([i, j]); neighbors[i].add(j); neighbors[j].add(i);
    }
  }
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const root = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const language = Object.fromEntries(LANGUAGES.map(lang => [lang,
    { eligibleTruePairs: 0, retainedTrueEdges: 0 }]));
  let trueEdges = 0, falseEdges = 0;
  for (const [i, j] of gated) {
    const left = neighbors[i], right = neighbors[j];
    let supported = false;
    for (const k of left) if (right.has(k)) { supported = true; break; }
    if (!supported) continue;
    if (documents[i].eventKey === documents[j].eventKey) {
      trueEdges++;
      for (const lang of new Set([documents[i].lang, documents[j].lang]))
        language[lang].retainedTrueEdges++;
    } else falseEdges++;
    parent[root(j)] = root(i);
  }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++)
    if (documents[i].eventKey === documents[j].eventKey)
      for (const lang of new Set([documents[i].lang, documents[j].lang]))
        language[lang].eligibleTruePairs++;
  if (trueEdges !== policy.edgeMetrics.trueEdges || falseEdges !== policy.edgeMetrics.falseEdges)
    fail('DIAGNOSTIC_MISMATCH');
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const members = groups.get(root(i)) ?? [];
    members.push(i); groups.set(root(i), members);
  }
  let pureGroups = 0, singletonGroups = 0, groupedTruePairs = 0, groupedFalsePairs = 0;
  for (const members of groups.values()) {
    const labels = new Map();
    for (const i of members) labels.set(documents[i].eventKey,
      (labels.get(documents[i].eventKey) ?? 0) + 1);
    if (labels.size === 1) pureGroups++;
    if (members.length === 1) singletonGroups++;
    const truePairs = [...labels.values()].reduce((sum, count) => sum + choose2(count), 0);
    groupedTruePairs += truePairs;
    groupedFalsePairs += choose2(members.length) - truePairs;
  }
  if (groups.size !== policy.components.groups ||
      groupedTruePairs !== policy.components.groupedTruePairs ||
      groupedFalsePairs !== policy.components.groupedFalsePairs) fail('DIAGNOSTIC_MISMATCH');
  const d = policy.denominators, e = policy.edgeMetrics, c = policy.components;
  if (d.articles !== 60 || d.events !== 15 || d.families !== 5 ||
      d.truePairs !== 90 || d.falsePairs !== 1680 || d.hardFalsePairs !== 240)
    fail('HOLDOUT_DENOMINATORS');
  return { ...policy,
    pairAdmission: { tp: e.trueEdges, fp: e.falseEdges,
      fn: d.truePairs - e.trueEdges, tn: d.falsePairs - e.falseEdges,
      precision: ratio(e.trueEdges, e.trueEdges + e.falseEdges),
      recall: ratio(e.trueEdges, d.truePairs) },
    groupedPairs: { tp: c.groupedTruePairs, fp: c.groupedFalsePairs,
      fn: d.truePairs - c.groupedTruePairs, tn: d.falsePairs - c.groupedFalsePairs,
      precision: ratio(c.groupedTruePairs, c.groupedTruePairs + c.groupedFalsePairs),
      recall: ratio(c.groupedTruePairs, d.truePairs) },
    partition: { pureGroups, singletonGroups, mixedGroups: c.mixedGroups,
      exactGoldPartition: c.completeEvents === d.events && c.mixedGroups === 0 &&
        c.groups === d.events,
      completeEvents: c.completeEvents, crossEventFalseJoinedPairs: c.groupedFalsePairs },
    perLanguageIncidentTruePairRecall: Object.fromEntries(LANGUAGES.map(lang => [lang,
      { ...language[lang], recall: ratio(language[lang].retainedTrueEdges,
        language[lang].eligibleTruePairs) }])) };
}

export function holdoutScreen(policy) {
  const d = policy.denominators, e = policy.edgeMetrics, c = policy.components;
  return { requiredFalseRetainedEdges: 0, requiredMixedGroups: 0,
    requiredTrueRetainedEdges: 30, requiredCrossLanguageTrueEdgeRecall: 0.25,
    requiredCompleteEvents: 5,
    met: d.truePairs === 90 && d.events === 15 && e.falseEdges === 0 &&
      c.mixedGroups === 0 && e.trueEdges >= 30 &&
      e.crossLanguageTrueEdges * 4 >= d.crossLanguageTruePairs &&
      c.completeEvents >= 5 };
}
