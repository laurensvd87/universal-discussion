import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pilotUrl, validatePilotMetadata } from './capture.js';
import { MODEL_ID } from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';
import { makeEvidence } from './evidence.js';

const work = fileURLToPath(new URL('../../../../spikes/topic-resolution/review/work/', import.meta.url));
const ACCEPTED = ['schema', 'url', 'title', 'publicationValue', 'publicationPrecision', 'language', 'publisher', 'accessedAt',
  'rightsEvidenceUrl', 'evidence', 'evidenceSha256', 'extractorVersion', 'modelId', 'inputSha256', 'vector'];
const REJECTED = ['schema', 'url', 'evidence', 'evidenceSha256', 'accessedAt'];
const sha = value => createHash('sha256').update(value, 'utf8').digest('hex');
function exact(record, fields) {
  return record && Object.getPrototypeOf(record) === Object.prototype &&
    Reflect.ownKeys(record).length === fields.length &&
    Reflect.ownKeys(record).every(key => fields.includes(key));
}
function validateRecord(record) {
  const accepted = record?.schema === 'r5-pilot-source/v1';
  if (!['r5-pilot-source/v1', 'r5-pilot-rejection/v1'].includes(record?.schema) ||
      !exact(record, accepted ? ACCEPTED : REJECTED) || pilotUrl(record.url) !== record.url ||
      typeof record.accessedAt !== 'string' || Number.isNaN(Date.parse(record.accessedAt)))
    throw new TypeError('Invalid pilot record');
  const evidence = makeEvidence(record.evidence);
  if (evidence.record.sourceUrl !== record.url || evidence.sha256 !== record.evidenceSha256 ||
      evidence.record.disposition !== (accepted ? 'accepted' : 'rejected')) throw new TypeError('Invalid evidence record');
  if (accepted && (typeof record.title !== 'string' || record.title.length > 200 ||
      !['day', 'instant'].includes(record.publicationPrecision) || typeof record.publicationValue !== 'string' ||
      record.language !== 'en' || record.modelId !== MODEL_ID ||
      !['main-text-prefix/v1', 'article-container-prefix/v1'].includes(record.extractorVersion) ||
      typeof record.inputSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(record.inputSha256) ||
      !Array.isArray(record.vector) || record.vector.length !== 384 ||
      record.vector.some(value => !Number.isFinite(value)))) throw new TypeError('Invalid source record');
  if (accepted) validatePilotMetadata({ requestedUrl: record.url, publicationValue: record.publicationValue,
    publicationPrecision: record.publicationPrecision, publisher: record.publisher,
    rightsEvidenceUrl: record.rightsEvidenceUrl });
  return record;
}
async function workspace(base = work) {
  const resolved = path.resolve(base);
  if (resolved.toLowerCase() !== path.resolve(work).toLowerCase() &&
      !resolved.toLowerCase().startsWith(`${path.resolve(work).toLowerCase()}${path.sep}`))
    throw new Error('Output outside review workspace');
  const info = await lstat(resolved);
  if (!info.isDirectory() || info.isSymbolicLink() ||
      path.resolve(await realpath(resolved)).toLowerCase() !== resolved.toLowerCase())
    throw new Error('Review workspace unavailable');
  const ignore = await readFile(path.join(resolved, '.gitignore'), 'utf8');
  if (!ignore.replace(/\r\n/gu, '\n').startsWith('*\n!.gitignore')) throw new Error('Review workspace is not ignored');
  return path.join(resolved, 'r5-pilot');
}
async function scan(directory) {
  let info;
  try { info = await lstat(directory); }
  catch (error) { if (error.code === 'ENOENT') return { rows: [], digest: sha('[]') }; throw error; }
  if (!info.isDirectory() || info.isSymbolicLink() ||
      path.resolve(await realpath(directory)).toLowerCase() !== path.resolve(directory).toLowerCase())
    throw new Error('Pilot output directory unavailable');
  const rows = [], urls = new Set();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'inventory.json' || entry.name === '.lock') continue;
    if (!entry.isFile() || !/^[0-9a-f-]{36}\.json$/u.test(entry.name)) throw new Error('Unexpected pilot output entry');
    const filename = path.join(directory, entry.name);
    const file = await lstat(filename);
    if (!file.isFile() || file.isSymbolicLink() || file.size > 131072) throw new Error('Invalid pilot output file');
    const bytes = await readFile(filename, 'utf8');
    const row = validateRecord(JSON.parse(bytes));
    if (row.sourceId !== undefined || urls.has(row.url)) throw new Error('Duplicate or invalid pilot record');
    urls.add(row.url);
    rows.push({ id: entry.name.slice(0, -5), url: row.url, sha256: sha(bytes) });
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  return { rows, digest: sha(JSON.stringify(rows.map(({ id, sha256 }) => ({ id, sha256 })))) };
}

export async function checkPilotCapacity(url, base = work) {
  const current = await scan(await workspace(base));
  if (current.rows.length >= 24 || current.rows.some(row => row.url === pilotUrl(url)))
    throw new Error('Pilot capacity or duplicate URL');
  return true;
}

// The destination is fixed. A directory lock serializes count/dedup checks;
// files are create-only, and the inventory digest records every saved item.
export async function savePilotRecord(record, base = work) {
  validateRecord(record);
  const directory = await workspace(base);
  try { await mkdir(directory); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const lock = path.join(directory, '.lock');
  await mkdir(lock);
  let temporary;
  try {
    const before = await scan(directory);
    if (before.rows.length >= 24 || before.rows.some(row => row.url === record.url))
      throw new Error('Pilot capacity or duplicate URL');
    const id = randomUUID();
    await writeFile(path.join(directory, `${id}.json`), JSON.stringify(record, null, 2), { flag: 'wx' });
    const after = await scan(directory);
    const inventory = { schema: 'r5-pilot-inventory/v1', count: after.rows.length,
      sha256: after.digest, updatedAt: new Date().toISOString() };
    temporary = path.join(directory, `${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(inventory, null, 2), { flag: 'wx' });
    await rename(temporary, path.join(directory, 'inventory.json'));
    temporary = undefined;
    return true;
  } finally {
    if (temporary) await unlink(temporary).catch(() => {});
    await rmdir(lock);
  }
}
