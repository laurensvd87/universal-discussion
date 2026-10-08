// Read-only R5 shadow: synthetic training, six approved public vectors, aggregate output.
// Import the socket guard before any local experiment module can initialize.
import '../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJsonSha256 } from '../../../../spikes/topic-resolution/evaluation/canonical-json.js';
import { loadFrozenOwnerReview, loadOwnerReview } from '../r5-pilot/owner-review.js';
import { trainingCorpus, validateTrainingCorpus } from './data/train.js';
import { embedDocuments } from './e5-infer.js';
import { projectTopicVector, trainTopicHead } from './model.js';
import { zeroFalseJoinThreshold } from './benchmark-v2.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REVIEW = path.resolve(HERE, '../../../../spikes/topic-resolution/review/work/r5-owner-review');
const RECORDS = path.resolve(HERE, '../../../../spikes/topic-resolution/review/work/r5-pilot');
const RECORD_NAME = /^[0-9a-f-]{36}\.json$/u;
const EXPECTED_TRAIN = 'a64accfe78405af4508d0612aef565bd07373b1005f1688796f9fc7f5eb945d1';
const CLASSES = ['same-atomic-development', 'related-distinct-development', 'unrelated'];

async function boundedJson(filename, maximum) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum)
    throw new Error('Invalid local pilot input');
  return JSON.parse(await readFile(filename, 'utf8'));
}

function cosine(left, right) {
  if (left.length !== 384 || right.length !== 384) throw new TypeError('Invalid vector');
  let score = 0;
  for (let i = 0; i < 384; i++) score += left[i] * right[i];
  return score;
}

function normalized(vector) {
  if (!Array.isArray(vector) || vector.length !== 384 ||
      vector.some(value => !Number.isFinite(value))) throw new Error('Invalid pilot vector');
  const norm = Math.hypot(...vector);
  if (!(norm > 0)) throw new Error('Invalid pilot vector');
  return Float64Array.from(vector, value => value / norm);
}

async function frozenPilot() {
  const [task, current, review] = await Promise.all([
    loadFrozenOwnerReview(), loadOwnerReview(),
    boundedJson(path.join(REVIEW, 'assistant-content-review.json'), 131072),
  ]);
  if (canonicalJsonSha256(task) !== canonicalJsonSha256(current) ||
      task.sources.length !== 6 || task.pairs.length !== 15 ||
      review?.schema !== 'r5-assistant-content-review/v1' ||
      review.taskDigest !== canonicalJsonSha256(task) ||
      review.actor !== 'assistant-evaluation-gpt-6-sol-medium' ||
      !Array.isArray(review.classes) || review.classes.length !== task.pairs.length)
    throw new Error('Frozen pilot or assistant review mismatch');
  const expectedIds = new Set(task.pairs.map(pair => pair.id));
  const actualIds = new Set();
  for (const row of review.classes) {
    if (!row || !expectedIds.has(row.pairId) || actualIds.has(row.pairId) ||
        !CLASSES.includes(row.class)) throw new Error('Invalid assistant review class');
    actualIds.add(row.pairId);
  }
  const names = await readdir(RECORDS);
  if (names.includes('.lock') || names.some(name => name !== 'inventory.json' && !RECORD_NAME.test(name)))
    throw new Error('Invalid pilot inventory');
  const byDigest = new Map();
  for (const name of names.filter(name => RECORD_NAME.test(name))) {
    const filename = path.join(RECORDS, name);
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 131072)
      throw new Error('Invalid pilot record');
    const bytes = await readFile(filename);
    byDigest.set(createHash('sha256').update(bytes).digest('hex'), JSON.parse(bytes));
  }
  const vectors = new Map(task.sources.map(source => {
    const record = byDigest.get(source.sourceSha256);
    if (!record || record.schema !== 'r5-pilot-source/v1' || record.url !== source.url ||
        record.title !== source.title || record.publicationValue !== source.publicationValue ||
        record.publicationPrecision !== source.publicationPrecision)
      throw new Error('Frozen Source mismatch');
    return [source.id, normalized(record.vector)];
  }));
  return { task, review, vectors };
}

// This export accepts only already-verified in-memory inputs; it returns counts,
// never Source metadata, individual scores, pair decisions or vectors.
export function aggregatePilotScores(task, review, vectors, head, rawThreshold, headThreshold) {
  if (task?.sources?.length !== 6 || task?.pairs?.length !== 15 ||
      !Array.isArray(review?.classes) || review.classes.length !== 15 ||
      !(vectors instanceof Map) || vectors.size !== 6 ||
      !Number.isFinite(rawThreshold) || !Number.isFinite(headThreshold))
    throw new TypeError('Invalid aggregate input');
  const classes = new Map(review.classes.map(row => [row.pairId, row.class]));
  if (classes.size !== 15) throw new TypeError('Incomplete pilot review');
  const result = Object.fromEntries(CLASSES.map(name => [name, {
    pairs: 0, existingFloor: 0, rawValidationGate: 0, learnedValidationGate: 0,
    rawTop1Nominations: 0, learnedTop1Nominations: 0,
  }]));
  const projected = new Map(task.sources.map(source =>
    [source.id, projectTopicVector(vectors.get(source.id), head)]));
  const pairClasses = new Map();
  for (const pair of task.pairs) {
    const category = classes.get(pair.id);
    if (!Object.hasOwn(result, category)) throw new TypeError('Invalid pilot class');
    pairClasses.set(`${pair.sourceAId}:${pair.sourceBId}`, category);
    const left = vectors.get(pair.sourceAId), right = vectors.get(pair.sourceBId);
    const raw = cosine(left, right);
    const learned = cosine(projected.get(pair.sourceAId), projected.get(pair.sourceBId));
    result[category].pairs++;
    result[category].existingFloor += Number(raw >= 0.90);
    result[category].rawValidationGate += Number(raw >= rawThreshold);
    result[category].learnedValidationGate += Number(learned >= headThreshold);
  }
  if (pairClasses.size !== 15) throw new TypeError('Duplicate pilot pair');
  for (const source of task.sources) {
    const peers = task.sources.filter(other => other.id !== source.id);
    for (const [field, space] of [['rawTop1Nominations', vectors],
      ['learnedTop1Nominations', projected]]) {
      const best = peers.map(other => ({ id: other.id,
        score: cosine(space.get(source.id), space.get(other.id)) }))
        .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))[0];
      const key = [source.id, best.id].sort().join(':');
      const category = pairClasses.get(key);
      if (!Object.hasOwn(result, category)) throw new TypeError('Incomplete pilot pair matrix');
      result[category][field]++;
    }
  }
  return { schema: 'r5-topic-head-aggregate-shadow/v1',
    referenceActor: 'assistant-evaluation; exploratory, score-exposed, not human gold',
    sourceCount: 6, pairCount: 15, classes: result };
}

export async function runPilotShadow() {
  validateTrainingCorpus(trainingCorpus);
  if (createHash('sha256').update(JSON.stringify(trainingCorpus)).digest('hex') !== EXPECTED_TRAIN)
    throw new Error('Synthetic training corpus changed after freeze');
  const trainFamilies = new Set(trainingCorpus.split.training);
  const validationFamilies = new Set(trainingCorpus.split.validation);
  const training = trainingCorpus.documents.filter(doc => trainFamilies.has(doc.family));
  const validation = trainingCorpus.documents.filter(doc => validationFamilies.has(doc.family));
  const { vectors: synthetic } = await embedDocuments(trainingCorpus.documents);
  const head = trainTopicHead(training, synthetic, validation, synthetic);
  const rawThreshold = zeroFalseJoinThreshold(validation, synthetic,
    (_a, left, _b, right) => cosine(left, right)).threshold;
  const headThreshold = zeroFalseJoinThreshold(validation, synthetic,
    (_a, left, _b, right) => cosine(projectTopicVector(left, head),
      projectTopicVector(right, head))).threshold;
  const pilot = await frozenPilot();
  return aggregatePilotScores(pilot.task, pilot.review, pilot.vectors, head,
    rawThreshold, headThreshold);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) { process.stderr.write('No arguments accepted.\n'); process.exitCode = 1; }
  else runPilotShadow().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`),
    () => { process.stderr.write('Offline pilot shadow unavailable; inspect frozen inputs.\n');
      process.exitCode = 1; });
}
