import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJsonSha256 } from '../../../../spikes/topic-resolution/evaluation/canonical-json.js';
import { ADAPTIVE_TOPIC_POLICY, planAdaptiveTopics } from '../../src/domain/adaptive-topics.js';
import { loadFrozenOwnerReview, prepareOwnerReview } from './owner-review.js';
import { pairDiagnostics, SHADOW_POLICY, topKVectorPairs } from './shadow-match.js';

const RECORD_DIRECTORY = fileURLToPath(new URL('../../../../spikes/topic-resolution/review/work/r5-pilot/', import.meta.url));
const RECORD_NAME = /^[0-9a-f-]{36}\.json$/u;

export async function compareFrozenPilot() {
  if (ADAPTIVE_TOPIC_POLICY.floor !== SHADOW_POLICY.vectorFloor)
    throw new Error('Baseline floor changed; shadow comparison needs review');
  const frozen = await loadFrozenOwnerReview();
  const directory = RECORD_DIRECTORY;
  const directoryInfo = await lstat(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() ||
      path.resolve(await realpath(directory)) !== path.resolve(directory))
    throw new Error('Pilot directory unavailable');
  const names = await readdir(directory);
  if (names.includes('.lock') || names.some(name => name !== 'inventory.json' && !RECORD_NAME.test(name)))
    throw new Error('Unexpected pilot record');
  const entries = [];
  const byDigest = new Map();
  for (const name of names.filter(name => RECORD_NAME.test(name))) {
    const filename = path.join(directory, name), stat = await lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 131072) throw new Error('Invalid pilot record');
    const bytes = await readFile(filename);
    entries.push({ filename: name, bytes: bytes.toString('utf8') });
    byDigest.set(createHash('sha256').update(bytes).digest('hex'), JSON.parse(bytes.toString('utf8')));
  }
  const inventoryFile = path.join(directory, 'inventory.json');
  const inventoryStat = await lstat(inventoryFile);
  if (!inventoryStat.isFile() || inventoryStat.isSymbolicLink() || inventoryStat.size > 4096)
    throw new Error('Invalid pilot inventory');
  const current = prepareOwnerReview(entries, JSON.parse(await readFile(inventoryFile, 'utf8')));
  if (canonicalJsonSha256(frozen) !== canonicalJsonSha256(current) ||
      frozen.sources.length !== 6 || frozen.pairs.length !== 15)
    throw new Error('Frozen six-Source task mismatch');
  const sources = new Map(frozen.sources.map(source => {
    const record = byDigest.get(source.sourceSha256);
    if (!record || record.schema !== 'r5-pilot-source/v1' || record.url !== source.url ||
        record.title !== source.title || record.publicationValue !== source.publicationValue ||
        record.publicationPrecision !== source.publicationPrecision)
      throw new Error('Frozen Source mismatch');
    const norm = Math.hypot(...record.vector);
    return [source.id, { ...source, extractorVersion: record.extractorVersion,
      vector: record.vector.map(value => value / norm) }];
  }));
  const planned = planAdaptiveTopics({
    sources: [...sources.values()].map(source => ({ id: source.id, url: source.url,
      provenance: 'owner-local-page-embedding/v1', extractorVersion: source.extractorVersion,
      embedding: { modelId: 'e5-small-q8-browser-main-prefix-v1', values: source.vector } })),
    sourceLinks: [],
  });
  const partition = new Map(planned.partitions.flatMap((part, index) =>
    part.sourceIds.map(id => [id, index])));
  const topK = new Map(topKVectorPairs([...sources.values()]).map(item => [item.pairKey, item]));
  const pairs = frozen.pairs.map(pair => {
    const diagnostics = pairDiagnostics(sources.get(pair.sourceAId), sources.get(pair.sourceBId));
    const nomination = topK.get(`${pair.sourceAId}:${pair.sourceBId}`);
    return { pairId: pair.id, sourceAId: pair.sourceAId, sourceBId: pair.sourceBId,
      ...diagnostics, topKCandidate: Boolean(nomination), topKBestRank: nomination?.bestRank ?? null,
      topKNominations: nomination?.nominations ?? 0,
      baselineSamePartition: partition.get(pair.sourceAId) === partition.get(pair.sourceBId) };
  });
  return { policy: SHADOW_POLICY, baselinePolicyVersion: planned.policyVersion,
    sourceCount: sources.size, pairCount: pairs.length,
    counts: { baselineFloor: pairs.filter(pair => pair.vectorCandidate).length,
      baselineSamePartition: pairs.filter(pair => pair.baselineSamePartition).length,
      shadowCandidates: pairs.filter(pair => pair.shadowCandidate).length,
      lexicalOnly: pairs.filter(pair => pair.lexicalCandidate && !pair.vectorCandidate).length,
      topKCandidates: pairs.filter(pair => pair.topKCandidate).length,
      topKBelowFloor: pairs.filter(pair => pair.topKCandidate && !pair.vectorCandidate).length },
    pairs };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  compareFrozenPilot().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`),
    () => { process.stderr.write('Shadow comparison unavailable; inspect frozen task and local inventory.\n');
      process.exitCode = 1; });
}
