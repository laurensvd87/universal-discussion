import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MAX_PAIRS = 250;
export const RETENTION_DAYS = 30;
const MAX_TEXT_BYTES = 100_000;
const MAX_ITEMS = 500;
const DAY_MS = 86_400_000;
const ROOT = fs.realpathSync(path.resolve(import.meta.dirname, '../../../../..'));
const idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function fail(code) { throw new Error(code); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value, keys) {
  if (!object(value) || Object.keys(value).some(key => !keys.includes(key)) ||
      keys.some(key => !(key in value))) fail('INVALID_SCHEMA');
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('INVALID_DATE');
  return Date.parse(value);
}
function nonempty(value, max = 300) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) fail('INVALID_FIELD');
}
function sourceKind(url) {
  if (typeof url !== 'string' || url.length > 2048) fail('INVALID_URL');
  let parsed;
  try { parsed = new URL(url); } catch { fail('INVALID_URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port ||
      parsed.search || parsed.hash || parsed.pathname === '/') fail('INVALID_URL');
  const host = parsed.hostname.toLowerCase();
  if (host === 'commission.europa.eu' || host === 'www.consilium.europa.eu' ||
      host === 'consilium.europa.eu' || host === 'www.europarl.europa.eu' ||
      host === 'europarl.europa.eu') return 'eu_institution';
  if (host === 'globalvoices.org' || /^[a-z]{2,3}\.globalvoices\.org$/.test(host)) return 'global_voices';
  if (host === 'en.wikinews.org' || /^[a-z]{2,3}\.wikinews\.org$/.test(host)) return 'wikinews';
  fail('SOURCE_OUT_OF_SCOPE');
}
function httpsEvidence(url) {
  let parsed;
  try { parsed = new URL(url); } catch { fail('INVALID_EVIDENCE_URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || parsed.search || parsed.port)
    fail('INVALID_EVIDENCE_URL');
}
function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
export function privateRoot(directory) {
  if (!path.isAbsolute(directory)) fail('PRIVATE_DIR_NOT_ABSOLUTE');
  const root = fs.realpathSync(directory);
  if (!fs.statSync(root).isDirectory() || inside(ROOT, root) || inside(root, ROOT)) fail('PRIVATE_DIR_UNSAFE');
  return root;
}
function checkedFile(root, relative) {
  if (typeof relative !== 'string' || !/^raw\/[a-z0-9][a-z0-9_-]{0,63}\.txt$/.test(relative)) fail('INVALID_TEXT_PATH');
  const raw = path.join(root, 'raw');
  if (!fs.lstatSync(raw).isDirectory()) fail('TEXT_PATH_UNSAFE');
  const file = path.resolve(root, relative);
  const real = fs.realpathSync(file);
  if (!inside(raw, real) || !fs.lstatSync(file).isFile()) fail('TEXT_PATH_UNSAFE');
  return file;
}
function hash(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function sameFile(a, b) { return a.isFile() && b.isFile() && a.dev === b.dev && a.ino === b.ino; }
function boundedRead(file, limit, unsafeCode) {
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.size > limit) fail(unsafeCode);
  const fd = fs.openSync(file, 'r');
  try {
    const opened = fs.fstatSync(fd);
    if (!sameFile(before, opened) || opened.size > limit) fail(unsafeCode);
    const chunks = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(Math.min(16_384, limit + 1 - total));
      const count = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (!count) break;
      total += count;
      if (total > limit) fail(unsafeCode);
      chunks.push(chunk.subarray(0, count));
    }
    const after = fs.fstatSync(fd);
    if (!sameFile(opened, after) || after.size > limit ||
        !sameFile(after, fs.lstatSync(file))) fail(unsafeCode);
    return Buffer.concat(chunks, total);
  } finally { fs.closeSync(fd); }
}
function readText(root, relative) {
  const file = checkedFile(root, relative);
  const bytes = boundedRead(file, MAX_TEXT_BYTES, 'INVALID_TEXT');
  if (checkedFile(root, relative) !== file) fail('TEXT_PATH_UNSAFE');
  return bytes;
}
function readManifest(root, manifestFile) {
  const expected = path.join(root, 'manifest.json');
  if (path.resolve(manifestFile) !== expected || fs.realpathSync(manifestFile) !== expected ||
      !fs.lstatSync(expected).isFile()) fail('MANIFEST_PATH_UNSAFE');
  const bytes = boundedRead(expected, 500_000, 'INVALID_SIZE');
  if (fs.realpathSync(expected) !== expected) fail('MANIFEST_PATH_UNSAFE');
  return bytes;
}

export function validate(manifest, root, now = Date.now()) {
  exactKeys(manifest, ['version', 'createdAt', 'items', 'pairs']);
  if (manifest.version !== 1 || !Array.isArray(manifest.items) || !Array.isArray(manifest.pairs) ||
      manifest.items.length > MAX_ITEMS || manifest.pairs.length > MAX_PAIRS) fail('INVALID_SIZE');
  const created = date(manifest.createdAt);
  if (created > now || now >= created + RETENTION_DAYS * DAY_MS) fail('RETENTION_EXPIRED');
  const ids = new Set();
  const urls = new Set();
  const files = new Set();
  const kinds = { eu_institution: 0, global_voices: 0, wikinews: 0 };
  for (const item of manifest.items) {
    exactKeys(item, ['id', 'url', 'publisher', 'language', 'publishedAt', 'capturedAt', 'textFile', 'sha256', 'rights']);
    if (!idPattern.test(item.id) || ids.has(item.id) || urls.has(item.url)) fail('DUPLICATE_ITEM');
    ids.add(item.id); urls.add(item.url);
    const kind = sourceKind(item.url); kinds[kind]++;
    nonempty(item.publisher, 120);
    if (typeof item.language !== 'string' || !/^[a-z]{2,3}$/.test(item.language)) fail('INVALID_LANGUAGE');
    const published = date(item.publishedAt);
    const captured = date(item.capturedAt);
    if (published > captured || captured < created || captured > now || captured >= created + RETENTION_DAYS * DAY_MS)
      fail('INVALID_CAPTURE_TIME');
    if (item.textFile !== `raw/${item.id}.txt` || files.has(item.textFile)) fail('INVALID_TEXT_PATH');
    files.add(item.textFile);
    if (typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) fail('INVALID_HASH');
    exactKeys(item.rights, ['noticeUrl', 'license', 'pageOwner', 'attribution', 'reviewer', 'reviewedAt',
      'localResearchAllowed', 'collectionAllowed', 'thirdPartyMaterialExcluded']);
    httpsEvidence(item.rights.noticeUrl);
    for (const key of ['license', 'pageOwner', 'attribution', 'reviewer']) nonempty(item.rights[key], 500);
    const reviewed = date(item.rights.reviewedAt);
    if (reviewed > captured || reviewed < created || reviewed > now) fail('INVALID_RIGHTS_REVIEW');
    for (const key of ['localResearchAllowed', 'collectionAllowed', 'thirdPartyMaterialExcluded'])
      if (item.rights[key] !== true) fail('RIGHTS_NOT_CLEARED');
    const bytes = readText(root, item.textFile);
    let utf8 = true;
    try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { utf8 = false; }
    if (bytes.length < 50 || bytes.length > MAX_TEXT_BYTES || bytes.includes(0) || !utf8 || hash(bytes) !== item.sha256)
      fail('INVALID_TEXT');
  }
  const pairKeys = new Set();
  const pairedIds = new Set();
  const labels = { same: 0, different: 0, uncertain: 0 };
  for (const pair of manifest.pairs) {
    exactKeys(pair, ['left', 'right', 'label', 'evidence', 'reviewer', 'reviewedAt']);
    if (!ids.has(pair.left) || !ids.has(pair.right) || pair.left === pair.right) fail('INVALID_PAIR');
    const key = [pair.left, pair.right].sort().join('|');
    if (pairKeys.has(key)) fail('DUPLICATE_PAIR');
    pairKeys.add(key);
    pairedIds.add(pair.left); pairedIds.add(pair.right);
    if (!(pair.label in labels)) fail('INVALID_LABEL');
    labels[pair.label]++;
    nonempty(pair.evidence, 1000); nonempty(pair.reviewer, 120);
    const reviewed = date(pair.reviewedAt);
    if (reviewed < created || reviewed > now) fail('INVALID_PAIR_REVIEW');
  }
  if (pairedIds.size !== ids.size) fail('UNPAIRED_ITEM');
  return { items: ids.size, pairs: pairKeys.size, labels, kinds,
    expiresAt: new Date(created + RETENTION_DAYS * DAY_MS).toISOString() };
}

export function inspect(directory, manifestFile, now = Date.now()) {
  const root = privateRoot(directory);
  const bytes = readManifest(root, manifestFile);
  const manifest = JSON.parse(bytes.toString('utf8'));
  return { ...validate(manifest, root, now), manifestSha256: hash(bytes) };
}

// In-process handoff only. The CLI never serializes this return value.
export function loadLocalCorpus(directory, manifestFile, now = Date.now()) {
  const summary = inspect(directory, manifestFile, now);
  const root = privateRoot(directory);
  const bytes = readManifest(root, manifestFile);
  if (hash(bytes) !== summary.manifestSha256) fail('CORPUS_CHANGED');
  const manifest = JSON.parse(bytes.toString('utf8'));
  const items = manifest.items.map(item => {
    const content = readText(root, item.textFile);
    if (hash(content) !== item.sha256) fail('CORPUS_CHANGED');
    return { ...item, text: content.toString('utf8') };
  });
  return { summary, items, pairs: manifest.pairs };
}
