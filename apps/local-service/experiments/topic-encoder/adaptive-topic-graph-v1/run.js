// Local, aggregate-only research. Frozen corpora and packaged E5; no network.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { focusInput } from '../multilingual-projection-v2/core.js';
import { currentMatcher, makeSources } from '../topic-benchmark/benchmark.js';
import { groupDocuments, scoreGroups } from './core.js';

if (process.argv.length !== 2) throw new Error('No arguments accepted');
const files = [
  ['v1', 'train', '../multilingual-train-v1/train.jsonl', '008ff6c9d3b93d6b6a8cf08b1579a4a6c11cf010c97963f02aa5b276d6e03c8b'],
  ['v1', 'validation', '../multilingual-train-v1/validation.jsonl', 'fbd3b22a7c4942b7689d6ac8663a5836b861d7ab5991d65c4bba65ed38086b53'],
  ['v2', 'train', '../multilingual-train-v2/train-part-1.jsonl', '94a14a36b016795b504e22be9c5c3e1aadb372bdd6d013b9b791e09ac5d81254'],
  ['v2', 'train', '../multilingual-train-v2/train-part-2.jsonl', '7240a9848cee76a2857a737740e4f280f9a9cd7c15d1b38689c9246ff2160db6'],
  ['v2', 'validation', '../multilingual-train-v2/validation.jsonl', 'ef9f405df2f8c98054e4f5b465f4fec3d06287d537e9a08be3455ce36d35db99'],
];
const splits = { train: [], validation: [] };
for (const [version, split, filename, digest] of files) {
  const bytes = await readFile(new URL(filename, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== digest) throw new Error('Frozen fixture changed');
  const rows = bytes.toString('utf8').trimEnd().split(/\r?\n/u).map(JSON.parse);
  for (const row of rows) splits[split].push({ ...row, id: `${version}:${row.id}`,
    family: `${version}:${row.family}`, topicLabel: `${version}:${row.topicLabel}` });
}
for (const split of Object.values(splits)) if (new Set(split.map(row => row.family)).size !==
    (split === splits.train ? 16 : 8)) throw new Error('Unexpected split family count');
const all = [...splits.train, ...splits.validation];
const { vectors, elapsedMs, assets } = await embedDocuments(all.map(focusInput), 'title-lead');
const baseline = { method: 'complete', cutoff: 0.94 };
const candidateRules = [];
for (const minimum of [0.78, 0.82, 0.86])
  for (const cover of [0.86, 0.88, 0.90])
    for (const mean of [0.88, 0.90, 0.92])
      candidateRules.push({ method: 'supported', minimum, cover, mean });
for (const minimum of [0.78, 0.82, 0.86])
  for (const cover of [0.88])
    for (const mean of [0.88, 0.90, 0.92])
      candidateRules.push({ method: 'triangle', minimum, cover, mean, strongPair: 0.94 });
const evidenceVeto = { method: 'triangle-nearest', minimum: 0.86,
  cover: 0.88, mean: 0.88, strongPair: 0.94 };
const evalRule = (rows, rule) => scoreGroups(rows, groupDocuments(rows, vectors, rule));
const scored = candidateRules.map(rule => ({ rule, train: evalRule(splits.train, rule),
  validation: evalRule(splits.validation, rule) }));
// Development selection: eliminate any false mixed group on either slice,
// then maximize correct validation joins. Ties prefer stricter conditions.
const eligible = scored.filter(item => item.train.joinedFalse === 0 && item.validation.joinedFalse === 0)
  .sort((a, b) => b.validation.joinedTrue - a.validation.joinedTrue ||
    b.train.joinedTrue - a.train.joinedTrue ||
    b.rule.mean - a.rule.mean || b.rule.cover - a.rule.cover || b.rule.minimum - a.rule.minimum);
const selected = eligible[0] ?? null;
const currentSources = makeSources(splits.validation, vectors);
const currentPartitions = currentMatcher(currentSources).map(part => part.sourceIds);
const output = { corpus: { train: splits.train.length, validation: splits.validation.length,
    fixtureSha256: Object.fromEntries(files.map(([version, , filename, digest]) => [`${version}:${filename.split('/').at(-1)}`, digest])) },
  representation: 'packaged-E5, NFKC title plus 384-character lead',
  assets, embeddingElapsedMs: Math.round(elapsedMs),
  baseline: { train: evalRule(splits.train, baseline), validation: evalRule(splits.validation, baseline) },
  currentSnapshotValidation: scoreGroups(splits.validation, currentPartitions),
  eligibleCandidates: eligible.length, candidatesTried: scored.length,
  selected: selected && { rule: selected.rule, train: selected.train, validation: selected.validation },
  promisingDiagnostic: (() => { const rule = { method: 'triangle', minimum: 0.86, cover: 0.88, mean: 0.88, strongPair: 0.94 };
    const byVersion = version => Object.fromEntries(['train', 'validation'].map(split =>
      [split, evalRule(splits[split].filter(row => row.id.startsWith(`${version}:`)), rule)]));
    return { v1: byVersion('v1'), v2: byVersion('v2') }; })(),
  oneEvidenceVetoVariant: { rule: evidenceVeto, train: evalRule(splits.train, evidenceVeto),
    validation: evalRule(splits.validation, evidenceVeto) },
  candidateSummary: scored.map(({ rule, train, validation }) => ({ rule,
    trainTrue: train.joinedTrue, trainFalse: train.joinedFalse,
    validationTrue: validation.joinedTrue, validationFalse: validation.joinedFalse })),
  strongestRejected: scored.filter(item => item.train.joinedFalse || item.validation.joinedFalse)
    .sort((a, b) => b.validation.joinedTrue - a.validation.joinedTrue)[0] ?? null };
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
