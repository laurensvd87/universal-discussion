// Offline JRC story benchmark. Private row values are never returned in reports.
import { createHash } from 'node:crypto';

const HEADER = ['guid', 'georsscountry', 'entity_list', 'pubdate', 'language',
  'link', 'title', 'LABEL', 'LABEL_description'];
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_ROWS = 10000;
const MAX_CELL = 100000;
const hash = value => createHash('sha256').update(value).digest('hex');
const pairCount = n => n * (n - 1) / 2;
const fail = (phase, code) => { throw new BenchmarkError(phase, code); };

export class BenchmarkError extends Error {
  constructor(phase, code) { super(code); this.phase = phase; this.code = code; }
}
export const safeDiagnostic = error => error instanceof BenchmarkError
  ? { phase: error.phase, code: error.code }
  : { phase: 'internal', code: 'UNCLASSIFIED_FAILURE' };

export function requireScoreSplit(args) {
  if (!Array.isArray(args) || args.length !== 2 || args[0] !== '--split' ||
      !['train', 'validation', 'test'].includes(args[1]))
    fail('arguments', 'SPLIT_REQUIRED');
  return args[1];
}

export function parseQuotedCsv(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_BYTES)
    fail('input', 'INPUT_SIZE');
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail('parse', 'UTF8_INVALID'); }
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);
  const rows = [];
  let row = [], field = '', quoted = false, closed = false, atStart = true;
  const append = char => {
    field += char;
    if (field.length > MAX_CELL) fail('parse', 'CELL_BOUND');
  };
  const endField = () => { row.push(field); field = ''; closed = false; atStart = true; };
  const endRow = () => {
    endField();
    if (row.length !== HEADER.length) fail('schema', 'COLUMN_COUNT');
    rows.push(row);
    if (rows.length > MAX_ROWS + 1) fail('parse', 'ROW_BOUND');
    row = [];
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { append('"'); i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else append(char);
    } else if (closed) {
      if (char === ',') endField();
      else if (char === '\n' || char === '\r') {
        endRow();
        if (char === '\r' && source[i + 1] === '\n') i++;
      } else fail('parse', 'CSV_QUOTE_FORMAT');
    } else if (char === '"') {
      if (!atStart) fail('parse', 'CSV_QUOTE_FORMAT');
      quoted = true;
      atStart = false;
    } else if (char === ',') endField();
    else if (char === '\n' || char === '\r') {
      endRow();
      if (char === '\r' && source[i + 1] === '\n') i++;
    } else { append(char); atStart = false; }
  }
  if (quoted) fail('parse', 'CSV_UNTERMINATED_QUOTE');
  if (field || row.length || closed || !atStart) endRow();
  if (rows.length < 2 || rows[0].some((value, index) => value !== HEADER[index]))
    fail('schema', 'HEADER_MISMATCH');
  return { rows: rows.slice(1), inputSha256: hash(bytes) };
}

function sourceHost(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.hostname.toLowerCase() : null;
  } catch { return null; }
}

export function prepareCorpus(bytes, expectedSha256 = null) {
  if (expectedSha256 && (!Buffer.isBuffer(bytes) || hash(bytes) !== expectedSha256))
    fail('input', 'HASH_MISMATCH');
  const parsed = parseQuotedCsv(bytes);
  const documents = [], ids = new Set(), clusters = new Map(), sources = new Set(), languages = new Set();
  let missingSource = 0, missingLanguage = 0;
  for (const cells of parsed.rows) {
    const [guid, , , , language, link, title, cluster] = cells;
    if (!guid.trim() || guid.length > 200 || ids.has(guid)) fail('schema', 'GUID_INVALID');
    ids.add(guid);
    if (!title.trim() || title.length > 1000) fail('schema', 'TITLE_INVALID');
    if (!cluster.trim() || cluster.length > 200) fail('schema', 'CLUSTER_INVALID');
    const source = sourceHost(link);
    if (!source) missingSource++; else sources.add(source);
    if (!language.trim()) missingLanguage++; else languages.add(language.trim());
    const doc = { id: `d${documents.length}`, title: title.normalize('NFKC').replace(/\s+/gu, ' ').trim(),
      cluster, source, language: language.trim() || null };
    documents.push(doc);
    const members = clusters.get(cluster) ?? [];
    members.push(doc);
    clusters.set(cluster, members);
  }
  if (!documents.length) fail('schema', 'EMPTY_CORPUS');
  return { documents, clusters, inputSha256: parsed.inputSha256,
    sourceCount: sources.size, languageCount: languages.size, missingSource, missingLanguage };
}

export function selectWholeClusters(corpus, maxScored = 1200) {
  if (!Number.isInteger(maxScored) || maxScored < 1 || maxScored > 1200)
    throw new TypeError('Invalid compute budget');
  const all = [...corpus.clusters];
  const largest = [...all].sort((a, b) => b[1].length - a[1].length ||
    hash(`select\0${a[0]}`).localeCompare(hash(`select\0${b[0]}`)))[0];
  const ordered = [largest, ...all.filter(item => item !== largest).sort((a, b) =>
    hash(`select\0${a[0]}`).localeCompare(hash(`select\0${b[0]}`)))];
  const selected = [];
  for (const [cluster, members] of ordered)
    if (selected.length + members.length <= maxScored) selected.push(...members);
  const selectedGroups = new Map();
  for (const doc of selected) {
    const members = selectedGroups.get(doc.cluster) ?? [];
    members.push(doc);
    selectedGroups.set(doc.cluster, members);
  }
  const groups = [...selectedGroups].sort((a, b) => b[1].length - a[1].length ||
    hash(`split-order\0${a[0]}`).localeCompare(hash(`split-order\0${b[0]}`)));
  const splits = { train: [], validation: [], test: [] };
  const names = ['train', 'validation', 'test'];
  const share = { train: 0.6, validation: 0.2, test: 0.2 };
  const counts = { train: 0, validation: 0, test: 0 };
  const labels = { train: 0, validation: 0, test: 0 };
  let processedArticles = 0, processedLabels = 0;
  for (const [, members] of groups) {
    processedArticles += members.length;
    processedLabels++;
    let best = null;
    for (const name of names) {
      let cost = 0;
      for (const other of names) {
        const articles = counts[other] + (other === name ? members.length : 0);
        const clusterCount = labels[other] + (other === name ? 1 : 0);
        cost += ((articles - processedArticles * share[other]) /
          Math.max(1, selected.length * share[other])) ** 2;
        cost += 0.2 * ((clusterCount - processedLabels * share[other]) /
          Math.max(1, groups.length * share[other])) ** 2;
      }
      if (!best || cost < best.cost - 1e-12) best = { name, cost };
    }
    splits[best.name].push(...members);
    counts[best.name] += members.length;
    labels[best.name]++;
  }
  return { selected, splits, unscoredArticles: corpus.documents.length - selected.length,
    unscoredClusters: corpus.clusters.size - new Set(selected.map(doc => doc.cluster)).size };
}

export function inspect(corpus, selection) {
  const sizes = [...corpus.clusters.values()].map(members => members.length);
  const selectedSizes = new Map();
  for (const doc of selection.selected)
    selectedSizes.set(doc.cluster, (selectedSizes.get(doc.cluster) ?? 0) + 1);
  let crossHostTruePairs = 0;
  for (const members of corpus.clusters.values()) {
    const known = members.filter(doc => doc.source);
    const bySource = new Map();
    for (const doc of known) bySource.set(doc.source, (bySource.get(doc.source) ?? 0) + 1);
    crossHostTruePairs += pairCount(known.length) -
      [...bySource.values()].reduce((sum, n) => sum + pairCount(n), 0);
  }
  return { inputSha256: corpus.inputSha256, articles: corpus.documents.length,
    clusters: corpus.clusters.size, sourceDomains: corpus.sourceCount,
    languages: corpus.languageCount, missingSource: corpus.missingSource,
    missingLanguage: corpus.missingLanguage, clusterSize: { min: Math.min(...sizes), max: Math.max(...sizes) },
    crossHostTruePairs, selectedArticles: selection.selected.length,
    selectedClusters: selectedSizes.size,
    selectedClusterSize: { max: selectedSizes.size ? Math.max(...selectedSizes.values()) : 0 },
    largestClusterIncluded: [...selectedSizes.values()].includes(Math.max(...sizes)),
    unscoredArticles: selection.unscoredArticles, unscoredClusters: selection.unscoredClusters,
    splitArticles: Object.fromEntries(Object.entries(selection.splits).map(([name, rows]) => [name, rows.length])),
    splitClusters: Object.fromEntries(Object.entries(selection.splits).map(([name, rows]) =>
      [name, new Set(rows.map(doc => doc.cluster)).size])) };
}

const titleTokens = title => new Set(title.toLocaleLowerCase().match(/(?:[\p{L}]{2,}|[\p{N}]+)/gu) ?? []);
const lexical = (a, b) => {
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common++;
  return common / union.size;
};
const cosine = (a, b) => {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
};
const addTop = (list, score, positive) => {
  list.push({ score, positive });
  list.sort((a, b) => b.score - a.score);
  if (list.length > 3) list.pop();
};

function makePairSlice(length) {
  return { pairs: { true: 0, false: 0 }, e5: { tp: 0, fp: 0 },
    e5Loose: { tp: 0, fp: 0 }, lexicalHalf: { tp: 0, fp: 0 },
    eligible: new Uint8Array(length), topE5: Array.from({ length }, () => []),
    topLex: Array.from({ length }, () => []) };
}
function addPair(slice, i, j, positive, dense, sparse) {
  slice.pairs[positive ? 'true' : 'false']++;
  if (positive) { slice.eligible[i] = 1; slice.eligible[j] = 1; }
  if (dense >= 0.94) slice.e5[positive ? 'tp' : 'fp']++;
  if (dense >= 0.90) slice.e5Loose[positive ? 'tp' : 'fp']++;
  if (sparse >= 0.50) slice.lexicalHalf[positive ? 'tp' : 'fp']++;
  addTop(slice.topE5[i], dense, positive); addTop(slice.topE5[j], dense, positive);
  addTop(slice.topLex[i], sparse, positive); addTop(slice.topLex[j], sparse, positive);
}
const sliceReport = slice => ({ crossHostPairs: slice.pairs,
  e5Cosine094: slice.e5, e5Cosine090Diagnostic: slice.e5Loose,
  titleJaccard050: slice.lexicalHalf,
  topThree: { eligible: slice.eligible.reduce((sum, flag) => sum + flag, 0),
    e5: slice.topE5.filter(list => list.some(item => item.positive)).length,
    lexical: slice.topLex.filter(list => list.some(item => item.positive)).length } });

function componentSet(length) {
  const parent = Int32Array.from({ length }, (_, i) => i);
  const rank = new Uint8Array(length);
  const root = i => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  return { root, join(a, b) {
    a = root(a); b = root(b);
    if (a === b) return;
    if (rank[a] < rank[b]) [a, b] = [b, a];
    parent[b] = a;
    if (rank[a] === rank[b]) rank[a]++;
  } };
}
function componentReport(documents, graph, goldSizes) {
  const groups = new Map();
  for (let i = 0; i < documents.length; i++) {
    const root = graph.root(i);
    const group = groups.get(root) ?? new Map();
    const label = documents[i].cluster;
    group.set(label, (group.get(label) ?? 0) + 1);
    groups.set(root, group);
  }
  let mixedGroups = 0, completeLabels = 0, groupedTruePairs = 0, groupedFalsePairs = 0;
  for (const labels of groups.values()) {
    const size = [...labels.values()].reduce((sum, count) => sum + count, 0);
    const truePairs = [...labels.values()].reduce((sum, count) => sum + pairCount(count), 0);
    groupedTruePairs += truePairs;
    groupedFalsePairs += pairCount(size) - truePairs;
    if (labels.size > 1) mixedGroups++;
    if (labels.size === 1) {
      const [label, count] = labels.entries().next().value;
      if (count === goldSizes.get(label)) completeLabels++;
    }
  }
  return { groups: groups.size, mixedGroups, completeLabels,
    goldLabels: goldSizes.size, groupedTruePairs, groupedFalsePairs };
}

export function evaluateSplit(documents, vectors) {
  const tokens = documents.map(doc => titleTokens(doc.title));
  const normalizedTitles = documents.map(doc => doc.title.normalize('NFKC')
    .toLocaleLowerCase().replace(/\s+/gu, ' ').trim());
  const goldSizes = new Map();
  for (const doc of documents) goldSizes.set(doc.cluster, (goldSizes.get(doc.cluster) ?? 0) + 1);
  let largest = null;
  for (const [label, count] of goldSizes) if (!largest || count > largest.count)
    largest = { label, count };
  const views = documents.map(doc => {
    const vector = vectors.get(doc.id);
    if (!vector || vector.length !== 384) throw new TypeError('Missing vector');
    const norm = Math.hypot(...vector);
    if (!Number.isFinite(norm) || norm < 1e-9) throw new TypeError('Invalid vector');
    return Float64Array.from(vector, value => value / norm);
  });
  const all = makePairSlice(documents.length);
  const differentLanguage = makePairSlice(documents.length);
  const nonIdenticalTitle = makePairSlice(documents.length);
  const withoutLargestLabel = makePairSlice(documents.length);
  const graphs = { e5Cosine094: componentSet(documents.length),
    e5Cosine090Diagnostic: componentSet(documents.length),
    titleJaccard050: componentSet(documents.length) };
  for (let i = 0; i < documents.length; i++) for (let j = i + 1; j < documents.length; j++) {
    const a = documents[i], b = documents[j];
    if (!a.source || !b.source || a.source === b.source) continue;
    const positive = a.cluster === b.cluster;
    const dense = cosine(views[i], views[j]), sparse = lexical(tokens[i], tokens[j]);
    addPair(all, i, j, positive, dense, sparse);
    if (a.language && b.language && a.language !== b.language)
      addPair(differentLanguage, i, j, positive, dense, sparse);
    if (normalizedTitles[i] !== normalizedTitles[j])
      addPair(nonIdenticalTitle, i, j, positive, dense, sparse);
    if (a.cluster !== largest.label && b.cluster !== largest.label)
      addPair(withoutLargestLabel, i, j, positive, dense, sparse);
    if (dense >= 0.94) graphs.e5Cosine094.join(i, j);
    if (dense >= 0.90) graphs.e5Cosine090Diagnostic.join(i, j);
    if (sparse >= 0.50) graphs.titleJaccard050.join(i, j);
  }
  return { articles: documents.length, clusters: new Set(documents.map(doc => doc.cluster)).size,
    ...sliceReport(all),
    diagnosticSlices: { differentLanguage: sliceReport(differentLanguage),
      nonIdenticalTitle: sliceReport(nonIdenticalTitle),
      withoutLargestLabel: { excludedArticles: largest.count, ...sliceReport(withoutLargestLabel) } },
    components: Object.fromEntries(Object.entries(graphs).map(([name, graph]) =>
      [name, componentReport(documents, graph, goldSizes)])) };
}
