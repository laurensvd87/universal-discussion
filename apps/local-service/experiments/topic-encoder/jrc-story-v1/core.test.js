import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BenchmarkError, parseQuotedCsv, prepareCorpus, selectWholeClusters,
  inspect, evaluateSplit, requireScoreSplit } from './core.js';
import { auditCorpus } from './audit.js';

const header = ['guid', 'georsscountry', 'entity_list', 'pubdate', 'language',
  'link', 'title', 'LABEL', 'LABEL_description'];
const csvCell = value => `"${String(value).replaceAll('"', '""')}"`;
const fictionalCsv = records => Buffer.from([header, ...records].map(row =>
  row.map(csvCell).join(',')).join('\r\n') + '\r\n', 'utf8');
const record = (guid, host, title, cluster) => [guid, 'ZZ', 'Invented entity',
  '2030-01-01', 'en', `https://${host}/fiction`, title, cluster, 'fictional cluster'];

test('quoted CSV handles commas, escaped quotes, and embedded newlines', () => {
  const bytes = fictionalCsv([
    record('g1', 'paper-one.test', 'Bridge, "Cedar" opens\nafter repairs', 'event-a'),
    record('g2', 'paper-two.test', 'Cedar bridge reopens', 'event-a'),
  ]);
  const parsed = parseQuotedCsv(bytes);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0][6], 'Bridge, "Cedar" opens\nafter repairs');
  const corpus = prepareCorpus(bytes);
  assert.equal(corpus.documents.length, 2);
  assert.equal(inspect(corpus, selectWholeClusters(corpus)).crossHostTruePairs, 1);
});

test('parser rejects malformed quoted rows and wrong header with fixed codes', () => {
  assert.throws(() => parseQuotedCsv(Buffer.from(`${header.join(',')}\n"open`)),
    error => error instanceof BenchmarkError && error.code === 'CSV_UNTERMINATED_QUOTE');
  const wrong = fictionalCsv([record('g1', 'one.test', 'Fictional title', 'a')]);
  const changed = Buffer.from(wrong.toString('utf8').replace('LABEL_description', 'other_description'));
  assert.throws(() => prepareCorpus(changed),
    error => error instanceof BenchmarkError && error.code === 'HEADER_MISMATCH');
});

test('approved-file hash is rejected before malformed CSV is parsed', () => {
  assert.throws(() => prepareCorpus(Buffer.from('"unclosed'), '0'.repeat(64)),
    error => error instanceof BenchmarkError && error.code === 'HASH_MISMATCH');
});

test('selection keeps entire labels in disjoint splits under a compute budget', () => {
  const rows = [];
  for (let cluster = 0; cluster < 12; cluster++) for (let member = 0; member < 3; member++)
    rows.push(record(`g${cluster}-${member}`, `source-${member}.test`,
      `Fictional development ${cluster} report ${member}`, `event-${cluster}`));
  const corpus = prepareCorpus(fictionalCsv(rows));
  const selection = selectWholeClusters(corpus, 15);
  assert.equal(selection.selected.length, 15);
  const assignments = new Map();
  for (const [split, documents] of Object.entries(selection.splits)) for (const doc of documents) {
    assert.ok(!assignments.has(doc.cluster) || assignments.get(doc.cluster) === split);
    assignments.set(doc.cluster, split);
  }
  for (const cluster of assignments.keys())
    assert.equal(selection.selected.filter(doc => doc.cluster === cluster).length, 3);
});

test('skewed whole-label allocation keeps largest label and balances rows', () => {
  const rows = [];
  for (let cluster = 0; cluster < 31; cluster++) {
    const count = cluster === 0 ? 423 : 25;
    for (let member = 0; member < count; member++)
      rows.push(record(`s${cluster}-${member}`, `source-${member % 8}.test`,
        `Fictional development ${cluster} report ${member}`, `story-${cluster}`));
  }
  const corpus = prepareCorpus(fictionalCsv(rows));
  const selection = selectWholeClusters(corpus);
  const summary = inspect(corpus, selection);
  assert.equal(summary.selectedArticles, 1173);
  assert.equal(summary.selectedClusterSize.max, 423);
  assert.equal(summary.largestClusterIncluded, true);
  assert.equal(selection.splits.train.filter(doc => doc.cluster === 'story-0').length, 423);
  assert.ok(selection.splits.train.length >= 650 && selection.splits.train.length <= 780);
  assert.ok(selection.splits.validation.length >= 170);
  assert.ok(selection.splits.test.length >= 170);
  assert.ok(summary.splitClusters.validation >= 4 && summary.splitClusters.test >= 4);
});

test('score CLI requires an explicit split before data access', () => {
  assert.equal(requireScoreSplit(['--split', 'train']), 'train');
  assert.throws(() => requireScoreSplit([]),
    error => error instanceof BenchmarkError && error.code === 'SPLIT_REQUIRED');
  assert.throws(() => requireScoreSplit(['--split', 'all']),
    error => error instanceof BenchmarkError && error.code === 'SPLIT_REQUIRED');
});

test('cross-host metrics omit same host and keep row values out of reports', () => {
  const rows = [record('a1', 'first.test', 'Cedar bridge opens', 'a'),
    record('a2', 'second.test', 'Cedar bridge opens', 'a'),
    record('a3', 'first.test', 'Cedar bridge opens again', 'a'),
    record('b1', 'third.test', 'Orchard crates repaired', 'b')];
  const corpus = prepareCorpus(fictionalCsv(rows));
  corpus.documents[1].language = 'fr';
  corpus.documents[2].language = 'de';
  const vectors = new Map();
  for (const doc of corpus.documents) {
    const vector = new Float64Array(384);
    vector[doc.cluster === 'a' ? 0 : 1] = 1;
    vectors.set(doc.id, vector);
  }
  const report = evaluateSplit(corpus.documents, vectors);
  assert.equal(report.crossHostPairs.true, 2);
  assert.equal(report.crossHostPairs.false, 3);
  assert.equal(report.e5Cosine094.tp, 2);
  assert.equal(report.e5Cosine094.fp, 0);
  assert.equal(report.topThree.eligible, 3);
  assert.equal(report.diagnosticSlices.differentLanguage.crossHostPairs.true, 2);
  assert.equal(report.diagnosticSlices.differentLanguage.crossHostPairs.false, 2);
  assert.equal(report.diagnosticSlices.nonIdenticalTitle.crossHostPairs.true, 1);
  assert.equal(report.diagnosticSlices.withoutLargestLabel.excludedArticles, 3);
  assert.equal(report.diagnosticSlices.withoutLargestLabel.crossHostPairs.true, 0);
  assert.equal(report.components.e5Cosine094.groups, 2);
  assert.equal(report.components.e5Cosine094.mixedGroups, 0);
  assert.equal(report.components.e5Cosine094.completeLabels, 2);
  assert.equal(report.components.e5Cosine094.groupedTruePairs, 3);
  assert.equal(report.components.e5Cosine094.groupedFalsePairs, 0);
  const other = corpus.documents.find(doc => doc.cluster === 'b');
  const joinedVector = new Float64Array(384);
  joinedVector[0] = 1;
  vectors.set(other.id, joinedVector);
  const mixed = evaluateSplit(corpus.documents, vectors);
  assert.equal(mixed.components.e5Cosine094.groups, 1);
  assert.equal(mixed.components.e5Cosine094.mixedGroups, 1);
  assert.equal(mixed.components.e5Cosine094.completeLabels, 0);
  assert.equal(mixed.components.e5Cosine094.groupedFalsePairs, 3);
  const output = JSON.stringify(report);
  assert.ok(!output.includes('Cedar') && !output.includes('first.test') && !output.includes('event-'));
});

test('audit counts cross-label duplicates and near titles without examples', () => {
  const rows = [
    record('a1', 'one.test', 'Cedar bridge opens after repairs!', 'a'),
    record('a2', 'two.test', 'Unrelated local library policy', 'a'),
    record('b1', 'three.test', 'cedar bridge opens after repairs', 'b'),
    record('c1', 'four.test', 'Cedar bridge opens after repairs today', 'c'),
  ];
  rows[0][3] = '2030-01-01'; rows[1][3] = '2030-01-10';
  rows[2][3] = '2030-01-04'; rows[3][3] = '2030-01-06';
  rows[0][5] = 'https://one.test/bridge?utm_source=test#section';
  rows[2][5] = 'https://one.test/bridge';
  rows[0][8] = rows[2][8] = 'Cedar bridge opens after repairs';
  rows[1][8] = rows[0][8];
  rows[3][8] = 'Different fictional matter';
  const bytes = fictionalCsv(rows);
  const corpus = prepareCorpus(bytes);
  const selection = { selected: corpus.documents, splits: {
    train: corpus.documents.filter(doc => doc.cluster === 'a'),
    validation: corpus.documents.filter(doc => doc.cluster === 'b'),
    test: corpus.documents.filter(doc => doc.cluster === 'c') } };
  const report = auditCorpus(corpus, parseQuotedCsv(bytes).rows, selection);
  assert.equal(report.exactTitle.crossLabelPairs, 1);
  assert.equal(report.exactTitle.bySplit.trainValidation, 1);
  assert.equal(report.exactUrl.crossLabelPairs, 1);
  assert.equal(report.exactUrl.bySplit.trainValidation, 1);
  assert.equal(report.nearTitleSevenDays.crossLabelPairs, 3);
  assert.equal(report.nearTitleSevenDays.crossSplitPairs, 3);
  assert.equal(report.labelDescriptions.crossSplitHighRiskPairs, 1);
  assert.equal(report.largestLabel.articles, 2);
  assert.equal(report.largestLabel.dateSpanDays, 9);
  assert.equal(report.eventDisjointnessVerified, false);
  const output = JSON.stringify(report);
  assert.ok(!output.includes('Cedar') && !output.includes('one.test') && !output.includes('2030'));
});
