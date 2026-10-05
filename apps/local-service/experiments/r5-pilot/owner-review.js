import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeEvidence } from './evidence.js';
import { pilotUrl } from './capture.js';
import { MODEL_ID } from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';
import { CANONICAL_JSON_DIGEST_ALGORITHM, canonicalJsonSha256 } from '../../../../spikes/topic-resolution/evaluation/canonical-json.js';

const DEFAULT_DIRECTORY = fileURLToPath(new URL('../../../../spikes/topic-resolution/review/work/r5-pilot/', import.meta.url));
const DEFAULT_WORK = path.dirname(DEFAULT_DIRECTORY);
const SNAPSHOT_DIRECTORY = 'r5-owner-review';
const SNAPSHOT_FILE = 'task.json';
const SHA = /^[a-f0-9]{64}$/u;
const CANONICAL_SHA = /^sha256:[a-f0-9]{64}$/u;
const UUID_FILE = /^[0-9a-f-]{36}\.json$/u;
const sha = value => createHash('sha256').update(value).digest('hex');
const sameKeys = (object, keys) => object && Object.getPrototypeOf(object) === Object.prototype &&
  Reflect.ownKeys(object).length === keys.length && Reflect.ownKeys(object).every(key => keys.includes(key));
const recordKeys = ['schema', 'url', 'title', 'publicationValue', 'publicationPrecision', 'language', 'publisher',
  'accessedAt', 'rightsEvidenceUrl', 'evidence', 'evidenceSha256', 'extractorVersion', 'modelId', 'inputSha256', 'vector'];
const rejectionKeys = ['schema', 'url', 'evidence', 'evidenceSha256', 'accessedAt'];
const inventoryKeys = ['schema', 'count', 'sha256', 'updatedAt'];
const escapeMarkdown = value => value.replace(/[\\`*_{}\[\]()#+.!|>~-]/gu, '\\$&');

function assertSource(record) {
  if (!sameKeys(record, recordKeys) || record.schema !== 'r5-pilot-source/v1' ||
      pilotUrl(record.url) !== record.url || typeof record.title !== 'string' ||
      !record.title.trim() || record.title.length > 200 || /[\r\n\t]/u.test(record.title) ||
      record.language !== 'en' || typeof record.publisher !== 'string' || !record.publisher.trim() ||
      !['day', 'instant'].includes(record.publicationPrecision) ||
      typeof record.publicationValue !== 'string' ||
      (record.publicationPrecision === 'day' ? !/^20\d\d-[01]\d-[0-3]\d$/u.test(record.publicationValue) :
        Number.isNaN(Date.parse(record.publicationValue))) ||
      record.modelId !== MODEL_ID ||
      !['main-text-prefix/v1', 'article-container-prefix/v1'].includes(record.extractorVersion) ||
      !SHA.test(record.inputSha256) || !SHA.test(record.evidenceSha256) ||
      !Array.isArray(record.vector) || record.vector.length !== 384 ||
      record.vector.some(value => !Number.isFinite(value)) ||
      record.rightsEvidenceUrl !== record.evidence?.rightsEvidenceUrl)
    throw new Error('Invalid accepted pilot Source');
  const evidence = makeEvidence(record.evidence);
  if (evidence.sha256 !== record.evidenceSha256 || evidence.record.sourceUrl !== record.url ||
      evidence.record.disposition !== 'accepted') throw new Error('Pilot Source evidence mismatch');
  return record;
}

function assertRejection(record) {
  if (!sameKeys(record, rejectionKeys) || record.schema !== 'r5-pilot-rejection/v1' ||
      pilotUrl(record.url) !== record.url || !SHA.test(record.evidenceSha256))
    throw new Error('Invalid pilot rejection');
  const evidence = makeEvidence(record.evidence);
  if (evidence.sha256 !== record.evidenceSha256 || evidence.record.sourceUrl !== record.url ||
      evidence.record.disposition !== 'rejected') throw new Error('Pilot rejection evidence mismatch');
  return record;
}

export function prepareOwnerReview(entries, inventory) {
  if (!Array.isArray(entries) || entries.length < 2 || entries.length > 24 ||
      !sameKeys(inventory, inventoryKeys) || inventory.schema !== 'r5-pilot-inventory/v1' ||
      !Number.isInteger(inventory.count) || inventory.count !== entries.length || !SHA.test(inventory.sha256))
    throw new Error('Invalid pilot inventory');
  const files = new Set(), urls = new Set();
  const accepted = entries.map(entry => {
    if (!sameKeys(entry, ['filename', 'bytes']) || !UUID_FILE.test(entry.filename) ||
        files.has(entry.filename) || typeof entry.bytes !== 'string' ||
        Buffer.byteLength(entry.bytes) > 131072) throw new Error('Invalid pilot Source file');
    files.add(entry.filename);
    const parsed = JSON.parse(entry.bytes);
    const record = parsed?.schema === 'r5-pilot-rejection/v1' ? assertRejection(parsed) : assertSource(parsed);
    if (urls.has(record.url)) throw new Error('Duplicate pilot Source URL');
    urls.add(record.url);
    return { filename: entry.filename, record, sha256: sha(entry.bytes) };
  }).sort((a, b) => a.filename.localeCompare(b.filename));
  const actualInventoryDigest = sha(JSON.stringify(accepted.map(({ filename, sha256 }) =>
    ({ id: filename.slice(0, -5), sha256 }))));
  if (actualInventoryDigest !== inventory.sha256) throw new Error('Pilot inventory digest mismatch');
  const sources = accepted.filter(({ record }) => record.schema === 'r5-pilot-source/v1').map(({ record, sha256 }, index) => ({
    id: `source-${String(index + 1).padStart(3, '0')}`, url: record.url, title: record.title,
    publicationValue: record.publicationValue, publicationPrecision: record.publicationPrecision,
    sourceSha256: sha256,
  }));
  if (sources.length < 2) throw new Error('At least two accepted pilot Sources required');
  const candidates = [];
  for (let a = 0; a < sources.length; a++) for (let b = a + 1; b < sources.length; b++) {
    const sourceAId = sources[a].id, sourceBId = sources[b].id;
    candidates.push({ sourceAId, sourceBId, rank: sha(`${inventory.sha256}:${sourceAId}:${sourceBId}`) });
  }
  candidates.sort((a, b) => a.rank.localeCompare(b.rank) || a.sourceAId.localeCompare(b.sourceAId) ||
    a.sourceBId.localeCompare(b.sourceBId));
  const pairs = candidates.slice(0, 30).map(({ sourceAId, sourceBId }, index) => ({
    id: `review-item-${String(index + 1).padStart(3, '0')}`, sourceAId, sourceBId,
  }));
  return { schema: 'r5-owner-exploratory-task/v1', inventorySha256: inventory.sha256, sources, pairs };
}

export function renderOwnerReview(task) {
  assertTask(task);
  const sources = new Map(task.sources.map(source => [source.id, source]));
  const lines = [
    '# Local R5 pilot review', '',
    'A Topic is one time-bounded, independently reportable atomic factual development.',
    'Choose same-topic only if both Sources report substantially the same action, occurrence, decision, result or disclosure.',
    'The 72-hour window is a review presumption, not proof. Shared titles, entities, keywords or publication times are insufficient.',
    'Syndication and rewrites can remain in one Topic; a material correction, outcome or continuation starts another.',
    'For each pair choose same-topic, different-topic or uncertain. Use uncertain when these details are insufficient.',
    'This is an exploratory owner review; some scores were visible before task preparation.', '',
  ];
  for (const pair of task.pairs) {
    const a = sources.get(pair.sourceAId), b = sources.get(pair.sourceBId);
    if (!a || !b) throw new Error('Invalid pair Source reference');
    lines.push(`## ${pair.id}`, '',
      `A: ${escapeMarkdown(a.title)} (${a.publicationValue}${a.publicationPrecision === 'day' ? ', date only' : ''})`,
      a.url, '',
      `B: ${escapeMarkdown(b.title)} (${b.publicationValue}${b.publicationPrecision === 'day' ? ', date only' : ''})`,
      b.url, '',
      'Label: ', 'Rationale: ', '');
  }
  return lines.join('\n');
}

function assertTask(task) {
  if (!sameKeys(task, ['schema', 'inventorySha256', 'sources', 'pairs']) ||
      task.schema !== 'r5-owner-exploratory-task/v1' || !SHA.test(task.inventorySha256) ||
      !Array.isArray(task.sources) || task.sources.length < 2 || task.sources.length > 24 ||
      !Array.isArray(task.pairs) || task.pairs.length < 1 || task.pairs.length > 30)
    throw new Error('Invalid owner task');
  const ids = new Set();
  for (const source of task.sources) {
    if (!sameKeys(source, ['id', 'url', 'title', 'publicationValue', 'publicationPrecision', 'sourceSha256']) ||
        !/^source-[0-9]{3}$/u.test(source.id) || ids.has(source.id) ||
        pilotUrl(source.url) !== source.url || typeof source.title !== 'string' ||
        !source.title.trim() || source.title.length > 200 || /[\r\n\t]/u.test(source.title) ||
        !['day', 'instant'].includes(source.publicationPrecision) ||
        typeof source.publicationValue !== 'string' || !SHA.test(source.sourceSha256))
      throw new Error('Invalid owner task Source');
    ids.add(source.id);
  }
  const pairIds = new Set(), combinations = new Set();
  for (const pair of task.pairs) {
    if (!sameKeys(pair, ['id', 'sourceAId', 'sourceBId']) ||
        !/^review-item-[0-9]{3}$/u.test(pair.id) || pairIds.has(pair.id) ||
        !ids.has(pair.sourceAId) || !ids.has(pair.sourceBId) || pair.sourceAId >= pair.sourceBId ||
        combinations.has(`${pair.sourceAId}:${pair.sourceBId}`)) throw new Error('Invalid owner task pair');
    pairIds.add(pair.id);
    combinations.add(`${pair.sourceAId}:${pair.sourceBId}`);
  }
}

async function checkedWork(work) {
  const resolved = path.resolve(work);
  const info = await lstat(resolved);
  if (!info.isDirectory() || info.isSymbolicLink() || path.resolve(await realpath(resolved)) !== resolved)
    throw new Error('Review workspace unavailable');
  const ignoreFile = path.join(resolved, '.gitignore');
  const ignoreInfo = await lstat(ignoreFile);
  if (!ignoreInfo.isFile() || ignoreInfo.isSymbolicLink() || ignoreInfo.size > 4096 ||
      !(await readFile(ignoreFile, 'utf8')).replace(/\r\n/gu, '\n').startsWith('*\n!.gitignore'))
    throw new Error('Review workspace is not ignored');
  return resolved;
}

// The sibling directory is create-only. A failed partial preparation requires
// explicit operator inspection; it is never silently regenerated or overwritten.
export async function freezeOwnerReview(task, work = DEFAULT_WORK) {
  assertTask(task);
  const root = await checkedWork(work);
  const directory = path.join(root, SNAPSHOT_DIRECTORY);
  await mkdir(directory);
  const snapshot = { schema: 'r5-owner-exploratory-snapshot/v1',
    digestAlgorithm: CANONICAL_JSON_DIGEST_ALGORITHM,
    taskDigest: canonicalJsonSha256(task), task };
  await writeFile(path.join(directory, SNAPSHOT_FILE), JSON.stringify(snapshot, null, 2), { flag: 'wx' });
  return true;
}

export async function loadFrozenOwnerReview(work = DEFAULT_WORK) {
  const root = await checkedWork(work);
  const directory = path.join(root, SNAPSHOT_DIRECTORY), info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || path.resolve(await realpath(directory)) !== directory)
    throw new Error('Frozen owner review unavailable');
  const filename = path.join(directory, SNAPSHOT_FILE), file = await lstat(filename);
  if (!file.isFile() || file.isSymbolicLink() || file.size > 131072)
    throw new Error('Invalid frozen owner review');
  const snapshot = JSON.parse(await readFile(filename, 'utf8'));
  if (!sameKeys(snapshot, ['schema', 'digestAlgorithm', 'taskDigest', 'task']) ||
      snapshot.schema !== 'r5-owner-exploratory-snapshot/v1' ||
      snapshot.digestAlgorithm !== CANONICAL_JSON_DIGEST_ALGORITHM || !CANONICAL_SHA.test(snapshot.taskDigest) ||
      canonicalJsonSha256(snapshot.task) !== snapshot.taskDigest)
    throw new Error('Frozen owner review digest mismatch');
  assertTask(snapshot.task);
  return snapshot.task;
}

export async function loadOwnerReview(directory = DEFAULT_DIRECTORY) {
  const root = path.resolve(directory);
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink() || path.resolve(await realpath(root)) !== root)
    throw new Error('Pilot directory unavailable');
  const filenames = await readdir(root);
  if (filenames.some(name => name !== 'inventory.json' && name !== '.lock' && !UUID_FILE.test(name)) ||
      filenames.includes('.lock')) throw new Error('Unexpected or locked pilot directory');
  const entries = [];
  for (const filename of filenames.filter(name => UUID_FILE.test(name))) {
    const full = path.join(root, filename), item = await lstat(full);
    if (!item.isFile() || item.isSymbolicLink() || item.size > 131072) throw new Error('Invalid pilot Source file');
    entries.push({ filename, bytes: await readFile(full, 'utf8') });
  }
  const inventoryFile = path.join(root, 'inventory.json'), inventoryInfo = await lstat(inventoryFile);
  if (!inventoryInfo.isFile() || inventoryInfo.isSymbolicLink() || inventoryInfo.size > 4096)
    throw new Error('Invalid pilot inventory file');
  return prepareOwnerReview(entries, JSON.parse(await readFile(inventoryFile, 'utf8')));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === 'prepare') {
    loadOwnerReview().then(freezeOwnerReview).then(() => process.stdout.write('Frozen local owner task prepared.\n'),
      () => { process.stderr.write('Preparation refused; check local records or existing snapshot.\n'); process.exitCode = 1; });
  } else if (args.length === 0 || (args.length === 1 && args[0] === 'view')) {
    loadFrozenOwnerReview().then(task => process.stdout.write(renderOwnerReview(task)),
      () => { process.stderr.write('Frozen owner task unavailable; run prepare once or inspect the snapshot.\n'); process.exitCode = 1; });
  } else {
    process.stderr.write('Usage: node owner-review.js prepare|view\n');
    process.exitCode = 1;
  }
}
