import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateScopeAllowed } from '../synthetic-to-globesumm-v1/scope.js';
import { EvalError, parseCorpus, selectEventDisjoint } from '../real-event-eval/core.js';
import { fitDiagonal, normalizeVectors, transform } from '../real-diagonal-adapter-v1/core.js';
import { prepareGraph, calibrate, admit, evaluate, denominators } from '../local-contrast-gate-v1/core.js';
import { coverageForGraph } from '../real-diagonal-adapter-v1/coverage.js';
import { cosine } from '../event-token-pool-v1/core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const CORPUS = path.resolve(HERE, '../multilingual-authored-v2');
const EXPECTED = Object.freeze({
  a: '6B0F5199F8C4A5B31C3A10B9B2D46DDD98763287C57C5281C135B79CFB0AF81B',
  b: '2762DA5CE908A2E67092958BEAF3F6CD4F56515AA29D61962AA7C3F870CA2908',
  real: '8C296A8D1B0F344AD477C2541ACBF010F220D1695F63EBCE35700BF5C4CF392D',
  model: 'F80102D3F2A1229F387D3C81909990D8945513E347B0EAB049F7DE3C6F98C193',
});
const REAL_SIZE = 14_972_999;
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const fail = (phase, code) => { throw new EvalError(phase, code); };

export function validateOwnedRows(a, b) {
  if (a.length !== 108 || b.length !== 108) fail('owned', 'COUNT');
  const ids = new Set(), families = new Set(), events = new Set();
  for (const [name, rows] of [['a', a], ['b', b]]) {
    const localFamilies = new Set(), localEvents = new Map();
    for (const row of rows) {
      if (!row || Object.keys(row).sort().join() !==
        'body,eventKey,family,id,lang,title,viewpoint' ||
        ![row.id, row.family, row.eventKey, row.lang, row.title, row.body, row.viewpoint]
          .every(value => typeof value === 'string' && value.trim()) ||
        !['de', 'en', 'es', 'fr', 'nl'].includes(row.lang) || ids.has(row.id))
        fail('owned', 'SCHEMA');
      ids.add(row.id); localFamilies.add(row.family);
      const reports = localEvents.get(row.eventKey) ?? [];
      reports.push(row); localEvents.set(row.eventKey, reports);
    }
    if (localFamilies.size !== 6 || localEvents.size !== 18 ||
        [...localFamilies].some(key => families.has(key)) ||
        [...localEvents].some(([key, rows]) => events.has(key) || rows.length !== 6 ||
          new Set(rows.map(row => row.family)).size !== 1 ||
          new Set(rows.map(row => row.lang)).size !== 5))
      fail('owned', 'PARTITION');
    for (const key of localFamilies) families.add(key);
    for (const key of localEvents.keys()) events.add(key);
  }
  return { a: a.length, b: b.length, families: families.size, events: events.size };
}

export async function loadOwned() {
  const result = {};
  for (const chunk of ['a', 'b']) {
    const bytes = await readFile(path.join(CORPUS, `chunk-${chunk}`, 'records.jsonl'));
    if (sha(bytes) !== EXPECTED[chunk]) fail('owned', 'DIGEST');
    if (!bytes.toString('utf8').endsWith('\n')) fail('owned', 'LINES');
    try { result[chunk] = bytes.toString('utf8').trimEnd().split(/\r?\n/u).map(JSON.parse); }
    catch { fail('owned', 'JSON'); }
  }
  const counts = validateOwnedRows(result.a, result.b);
  return { ...result, counts };
}

export async function loadPrivate(privateDir, input) {
  if (!path.isAbsolute(privateDir) || !path.isAbsolute(input)) fail('path', 'ABSOLUTE');
  let directory, file, repository, directoryInfo, fileInfo;
  try {
    [directoryInfo, fileInfo, directory, file, repository] = await Promise.all([
      lstat(privateDir), lstat(input), realpath(privateDir), realpath(input), realpath(ROOT),
    ]);
  } catch { fail('path', 'ACCESS'); }
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() ||
      !fileInfo.isFile() || fileInfo.isSymbolicLink() ||
      !privateScopeAllowed(repository, directory, file)) fail('path', 'SCOPE');
  if (fileInfo.size !== REAL_SIZE) fail('input', 'SIZE');
  let bytes;
  try { bytes = await readFile(input); } catch { fail('input', 'READ'); }
  if (bytes.length !== REAL_SIZE || sha(bytes) !== EXPECTED.real) fail('input', 'DIGEST');
  return bytes;
}

export function selectedValidation(bytes) {
  const corpus = parseCorpus(bytes);
  if (corpus.inputSha256.toUpperCase() !== EXPECTED.real) fail('input', 'DIGEST');
  const selection = selectEventDisjoint(corpus.documents);
  const train = selection.documents.filter(row => row.split === 'train');
  const validation = selection.documents.filter(row => row.split === 'validation');
  const test = selection.documents.filter(row => row.split === 'test');
  if (selection.documents.length !== 1192 || train.length !== 749 ||
      validation.length !== 150 || test.length !== 293 ||
      new Set(validation.map(row => row.eventKey)).size !== 13)
    fail('selection', 'SPLIT');
  return { validation, selectedTestCount: test.length,
    unselectedCount: selection.unscoredArticles };
}

export function relativeCoverageBetter(base, candidate) {
  const b = base.grouped, c = candidate.grouped;
  const better = c.truePairs >= b.truePairs &&
    c.articlesInPureNonSingletonGroups >= b.articlesInPureNonSingletonGroups &&
    (c.truePairs > b.truePairs ||
      c.articlesInPureNonSingletonGroups > b.articlesInPureNonSingletonGroups);
  const noWorse = candidate.direct.falseEdges <= base.direct.falseEdges &&
    c.falsePairs <= b.falsePairs &&
    c.articlesInMixedGroups <= b.articlesInMixedGroups;
  return better && noWorse;
}

export function scoreMethods(a, b, validation, vectors, parameters) {
  const allIds = [...a, ...b, ...validation].map(row => row.id);
  if (allIds.some(id => typeof id !== 'string' || !id) ||
      new Set(allIds).size !== allIds.length) fail('selection', 'ID_COLLISION');
  const calibrationRows = b.map(row => ({ ...row, categories: [row.family] }));
  const validationRows = validation.map(row => ({ ...row, categories: [row.category] }));
  const methods = {};
  for (const [name, source] of [
    ['raw-E5', normalizeVectors([...b, ...validation], vectors)],
    ['owned-diagonal', transform([...b, ...validation], vectors, parameters)],
  ]) {
    const calibrationGraph = prepareGraph(calibrationRows, source, cosine);
    const setting = calibrate(calibrationGraph)['double-support'];
    const graph = prepareGraph(validationRows, source, cosine);
    const gold = denominators(graph);
    if (gold.articles !== 150 || gold.events !== 13 || gold.truePairs !== 803 ||
        gold.falsePairs !== 10372) fail('selection', 'DENOMINATORS');
    const edges = admit(graph, 'double-support', setting);
    const admission = evaluate(graph, edges);
    const coverage = coverageForGraph(graph, edges, admission);
    methods[name] = { calibration: setting, admission, coverage };
  }
  const base = methods['raw-E5'].coverage;
  const candidate = methods['owned-diagonal'].coverage;
  return { methods, relativeCoverageImprovementWithNoObservedFalseIncrease:
      relativeCoverageBetter(base, candidate),
    routeChurnComparedWithLive: 'unavailable-without-live-root-ledger' };
}

export const protocol = Object.freeze({ expected: EXPECTED, realSize: REAL_SIZE });
