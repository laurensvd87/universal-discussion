import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { evaluateMatcher } from '../topic-benchmark/benchmark.js';
import { loadTrainValidation } from '../topic-focus-shadow/corpus.js';
import { facet, focusDocument, trainIdf } from '../topic-focus-shadow/core.js';
import { matchEventV5 } from './matcher.js';

if (process.argv.length !== 2) throw new Error('No arguments accepted');
const splits = await loadTrainValidation();
const FROZEN = { multiTrain: '008ff6c9d3b93d6b6a8cf08b1579a4a6c11cf010c97963f02aa5b276d6e03c8b',
  multiValidation: 'fbd3b22a7c4942b7689d6ac8663a5836b861d7ab5991d65c4bba65ed38086b53' };
const multi = {};
for (const [name, file] of [['multiTrain', 'train.jsonl'],
  ['multiValidation', 'validation.jsonl']]) {
  const bytes = await readFile(new URL(`../multilingual-train-v1/${file}`, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== FROZEN[name])
    throw new Error(`Multilingual ${name} hash mismatch`);
  multi[name] = bytes.toString('utf8').trim().split(/\r?\n/u).map(JSON.parse);
}
const docs = [...splits.train, ...splits.validation, ...multi.multiTrain, ...multi.multiValidation];
const { vectors, assets, elapsedMs } = await embedDocuments(docs.map(focusDocument), 'title-lead');
const facets = new Map(docs.map(doc => [doc.id, facet(doc)]));
const idf = trainIdf(new Map([...splits.train, ...multi.multiTrain]
  .map(doc => [doc.id, facets.get(doc.id)])));
const results = {};
function retrieval(rows) {
  const dot = (a, b) => vectors.get(a.id).reduce((sum, value, index) =>
    sum + value * vectors.get(b.id)[index], 0);
  let anyTop3 = 0, anyTop5 = 0, eligible = 0;
  let trueMutualTop3 = 0, adjacentMutualTop3 = 0;
  const commonNeighborBins = Object.fromEntries([0, 1, 2, 3].map(n => [n,
    { true: 0, adjacent: 0, other: 0 }]));
  const commonOneScores = { true: [], adjacent: [], other: [] };
  const trueScores = [], adjacentScores = [];
  const rankedById = new Map();
  for (const row of rows) {
    const ranked = rows.filter(other => other.id !== row.id)
      .map(other => ({ other, score: dot(row, other) }))
      .sort((a, b) => b.score - a.score || a.other.id.localeCompare(b.other.id));
    rankedById.set(row.id, ranked);
    if (ranked.some(item => item.other.topicLabel === row.topicLabel)) eligible++;
    if (ranked.slice(0, 3).some(item => item.other.topicLabel === row.topicLabel)) anyTop3++;
    if (ranked.slice(0, 5).some(item => item.other.topicLabel === row.topicLabel)) anyTop5++;
  }
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const mutual = rankedById.get(rows[i].id).slice(0, 3)
      .some(item => item.other.id === rows[j].id) &&
      rankedById.get(rows[j].id).slice(0, 3)
      .some(item => item.other.id === rows[i].id);
    if (mutual) {
      const left = new Set(rankedById.get(rows[i].id).slice(0, 3)
        .map(item => item.other.id));
      const common = rankedById.get(rows[j].id).slice(0, 3)
        .filter(item => left.has(item.other.id)).length;
      const label = rows[i].topicLabel === rows[j].topicLabel ? 'true'
        : rows[i].family === rows[j].family ? 'adjacent' : 'other';
      commonNeighborBins[common][label]++;
      if (common === 1) commonOneScores[label].push(dot(rows[i], rows[j]));
    }
    if (rows[i].topicLabel === rows[j].topicLabel) {
      trueScores.push(dot(rows[i], rows[j]));
      if (mutual) trueMutualTop3++;
    } else if (rows[i].family === rows[j].family) {
      adjacentScores.push(dot(rows[i], rows[j]));
      if (mutual) adjacentMutualTop3++;
    }
  }
  const range = values => ({ count: values.length, min: Math.min(...values),
    median: [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)],
    max: Math.max(...values) });
  return { queriesWithPartner: eligible, anyTrueTop3: anyTop3, anyTrueTop5: anyTop5,
    trueMutualTop3, adjacentMutualTop3, commonNeighborBins,
    commonOneScores: Object.fromEntries(Object.entries(commonOneScores)
      .map(([label, values]) => [label, values.length ? range(values) : null])),
    trueSimilarity: range(trueScores), adjacentSimilarity: range(adjacentScores) };
}
for (const [name, rows] of Object.entries({ ...splits, ...multi })) {
  const measured = await evaluateMatcher(rows, vectors,
    sources => matchEventV5(sources, facets, idf).partitions);
  const raw = matchEventV5(rows.map(doc => ({ id: doc.id, title: doc.title,
    embedding: { values: Array.from(vectors.get(doc.id)) } })), facets, idf);
  const byId = new Map(rows.map(doc => [doc.id, doc]));
  const mixed = raw.partitions.filter(group =>
    new Set(group.map(id => byId.get(id).topicLabel)).size > 1)
    .map(group => ({ size: group.length,
      topicLabels: [...new Set(group.map(id => byId.get(id).topicLabel))],
      titles: group.map(id => byId.get(id).title) }));
  let crossLanguageJoined = 0, crossLanguageTotal = 0;
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    if (a.topicLabel !== b.topicLabel ||
        a.id.match(/-(en|nl|de|fr|es)-/u)?.[1] ===
          b.id.match(/-(en|nl|de|fr|es)-/u)?.[1]) continue;
    crossLanguageTotal++;
    if (raw.partitions.some(group => group.includes(a.id) && group.includes(b.id)))
      crossLanguageJoined++;
  }
  results[name] = { score: measured.score, order: measured.order,
    medianMatchingMs: measured.timingMs.median, mixed,
    retrieval: name.startsWith('multi') ? retrieval(rows) : undefined,
    crossLanguage: name.startsWith('multi') ? { joined: crossLanguageJoined,
      total: crossLanguageTotal } : undefined };
}
process.stdout.write(`${JSON.stringify({ modelSha256: assets.modelSha256,
  embeddingMs: elapsedMs, results }, null, 2)}\n`);
