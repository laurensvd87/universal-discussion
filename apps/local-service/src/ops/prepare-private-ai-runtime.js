// Fixed schema17 derivative only. Import is inert; inspect never writes.
// No database, model, credential, process or hierarchy activation authority.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { constants, copyFileSync, existsSync, fstatSync, fsyncSync, linkSync, lstatSync,
  mkdirSync, openSync, closeSync, readFileSync, readSync, realpathSync, readdirSync,
  statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { derivePrivateAiHotfixSource, PRIVATE_AI_HOTFIX_BASE as BASE } from './private-ai-hotfix-source.js';

const ROOT = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const DATA = path.join(ROOT, 'apps/local-service/data');
const LEAF = 'hierarchy-release-20261030-private-ai';
const OLD = path.join(DATA, BASE.snapshot), NEXT = path.join(DATA, LEAF);
const MANIFEST = path.join(DATA, `postgres-${LEAF}-manifest.json`);
const OLD_OPERATOR = 'apps/local-service/src/ops/postgres-runtime-operator.js';
const OPERATOR = 'apps/local-service/src/ops/private-ai-runtime-operator.js';
const OPERATOR_SHA = 'aa66de6838632c6e9545adb57aad0f8f22f654389541c843327e97b07b1682fb';
const MiB = 1024 * 1024, GiB = 1024 * MiB;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function require(value) { if (!value) throw new Error('Private AI preparation refused'); }
function samePath(a, b) { return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); }
function directory(name) {
  const info = lstatSync(name);
  require(info.isDirectory() && !info.isSymbolicLink() && samePath(realpathSync.native(name), name));
}
function target(root, relative) {
  require(typeof relative === 'string' && /^[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)*$/u.test(relative) &&
    relative.split('/').every(part => part !== '.' && part !== '..'));
  const result = path.join(root, ...relative.split('/'));
  require(path.relative(root, result) === relative.split('/').join(path.sep));
  return result;
}
function digest(name, relative) {
  const before = lstatSync(name);
  require(before.isFile() && !before.isSymbolicLink() && before.size <= 128 * MiB &&
    samePath(realpathSync.native(name), name));
  const fd = openSync(name, constants.O_RDONLY), chunk = Buffer.alloc(64 * 1024);
  try {
    const opened = fstatSync(fd), hash = createHash('sha256'); let count, bytes = 0;
    require(opened.dev === before.dev && opened.ino === before.ino && opened.size === before.size);
    while ((count = readSync(fd, chunk, 0, chunk.length, bytes)) > 0) {
      bytes += count; require(bytes <= before.size); hash.update(chunk.subarray(0, count));
    }
    for (const after of [fstatSync(fd), lstatSync(name)]) require(after.isFile() && !after.isSymbolicLink() &&
      ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(key => after[key] === opened[key]));
    require(bytes === opened.size);
    return { path: relative, bytes, sha256: hash.digest('hex') };
  } finally { closeSync(fd); chunk.fill(0); }
}
function equalRecord(actual, expected) { require(JSON.stringify(actual) === JSON.stringify(expected)); }
function rootDigest(files, externalFiles) {
  const hash = createHash('sha256');
  for (const [domain, rows] of [['snapshot', files], ['external', externalFiles]])
    for (const row of rows) hash.update(`${domain}\0${row.path}\0${row.bytes}\0${row.sha256}\n`);
  return hash.digest('hex');
}
function readManifest() {
  const name = path.join(DATA, `postgres-${BASE.snapshot}-manifest.json`), info = lstatSync(name);
  require(info.isFile() && !info.isSymbolicLink() && info.size < 2 * MiB && samePath(realpathSync.native(name), name));
  const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(name)));
  require(result.schema === 'murmingle-postgresql-runtime-snapshot/v2' && result.snapshot === BASE.snapshot &&
    result.rootSha256 === BASE.rootSha256 && result.totalBytes === BASE.totalBytes &&
    Array.isArray(result.files) && result.files.length === BASE.files && Array.isArray(result.externalFiles) &&
    result.externalFiles.length <= 2000);
  for (const rows of [result.files, result.externalFiles]) {
    let previous = '';
    for (const row of rows) {
      require(Object.keys(row).sort().join(',') === 'bytes,path,sha256' && row.path > previous &&
        Number.isSafeInteger(row.bytes) && row.bytes >= 0 && row.bytes <= 128 * MiB && /^[a-f0-9]{64}$/u.test(row.sha256));
      target(ROOT, row.path); previous = row.path;
    }
  }
  require(rootDigest(result.files, result.externalFiles) === BASE.rootSha256 &&
    result.files.reduce((sum, row) => sum + row.bytes, 0) === BASE.totalBytes);
  return result;
}
function inventory(root) {
  const names = [];
  function visit(name, relative = '') {
    directory(name);
    for (const entry of readdirSync(name, { withFileTypes: true })) {
      require(!entry.isSymbolicLink());
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(target(root, child), child);
      else { require(entry.isFile() && names.length < 5000); names.push(child); }
    }
  }
  visit(root); return names.sort();
}
function preflight(operator, expectedRoot) {
  const text = execFileSync(process.execPath, ['--max-old-space-size=64', target(ROOT, operator), 'preflight'],
    { cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 8192 });
  const result = JSON.parse(text);
  require(result.verified === true && result.rootSha256 === expectedRoot && result.files === BASE.files);
}

export function privateAiPreparationAdmission(freeBytes, allocationBytes) {
  return Number.isSafeInteger(freeBytes) && Number.isSafeInteger(allocationBytes) &&
    allocationBytes > 0 && allocationBytes <= 16 * MiB && freeBytes >= 4 * GiB + allocationBytes;
}
export function inspectPrivateAiPreparation() {
  for (const name of [ROOT, DATA, OLD]) directory(name);
  require(!existsSync(NEXT) && !existsSync(MANIFEST));
  const manifest = readManifest();
  equalRecord(digest(target(ROOT, OLD_OPERATOR), OLD_OPERATOR), manifest.externalFiles.find(row => row.path === OLD_OPERATOR));
  require(manifest.externalFiles.find(row => row.path === OLD_OPERATOR).sha256 === OPERATOR_SHA);
  preflight(OLD_OPERATOR, BASE.rootSha256);
  require(JSON.stringify(inventory(OLD)) === JSON.stringify(manifest.files.map(row => row.path)));
  const patches = new Map();
  for (const file of Object.keys(BASE.patches)) {
    const record = manifest.files.find(row => row.path === file), name = target(OLD, file);
    require(record && record.sha256 === BASE.patches[file]); equalRecord(digest(name, file), record);
    const patch = derivePrivateAiHotfixSource(file, readFileSync(name));
    execFileSync(process.execPath, ['--max-old-space-size=64', '--check', '--input-type=module'],
      { input: patch.bytes, windowsHide: true, timeout: 5000, maxBuffer: 8192 });
    patches.set(file, patch);
  }
  const assets = manifest.files.filter(row => row.path.startsWith('spikes/topic-resolution/browser/embedding/.assets/'));
  require(assets.length === 10 && assets.reduce((sum, row) => sum + row.bytes, 0) === 149832250);
  const assetPaths = new Set(assets.map(row => row.path));
  const allocationBytes = manifest.files.filter(row => !assetPaths.has(row.path)).reduce((sum, row) => sum +
    (patches.get(row.path)?.bytes.length ?? row.bytes), 0) + 2 * MiB;
  require(allocationBytes <= 16 * MiB);
  const disk = statfsSync(DATA, { bigint: true }), freeBytes = Number(disk.bavail * disk.bsize);
  return { manifest, patches, assetPaths, allocationBytes, freeBytes,
    admitted: privateAiPreparationAdmission(freeBytes, allocationBytes) };
}
export function preparePrivateAiRuntime() {
  const plan = inspectPrivateAiPreparation();
  require(plan.admitted); // No directory or partial output exists before admission.
  const externalFiles = plan.manifest.externalFiles.map(row => row.path === OLD_OPERATOR ? digest(target(ROOT, OPERATOR), OPERATOR) : row)
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  for (const row of externalFiles) equalRecord(digest(target(ROOT, row.path), row.path), row);
  mkdirSync(NEXT); const files = [];
  for (const old of plan.manifest.files) {
    const source = target(OLD, old.path), destination = target(NEXT, old.path), patch = plan.patches.get(old.path);
    equalRecord(digest(source, old.path), old);
    mkdirSync(path.dirname(destination), { recursive: true });
    if (patch) writeFileSync(destination, patch.bytes, { flag: 'wx' });
    else if (plan.assetPaths.has(old.path)) linkSync(source, destination);
    else copyFileSync(source, destination, constants.COPYFILE_EXCL);
    const expected = patch ? { path: old.path, bytes: patch.bytes.length, sha256: patch.sha256 } : old;
    const actual = digest(destination, old.path); equalRecord(actual, expected); files.push(actual);
  }
  const result = { schema: plan.manifest.schema, createdAt: new Date().toISOString(), snapshot: LEAF,
    totalBytes: files.reduce((sum, row) => sum + row.bytes, 0), rootSha256: rootDigest(files, externalFiles), files, externalFiles };
  require(JSON.stringify(inventory(NEXT)) === JSON.stringify(files.map(row => row.path)));
  preflight(OLD_OPERATOR, BASE.rootSha256); // Old source and all externals remain authentic.
  for (const row of externalFiles) equalRecord(digest(target(ROOT, row.path), row.path), row);
  const fd = openSync(MANIFEST, 'wx');
  try { writeFileSync(fd, `${JSON.stringify(result, null, 2)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
  preflight(OPERATOR, result.rootSha256);
  return { prepared: true, rootSha256: result.rootSha256, files: files.length, patchedFiles: plan.patches.size,
    totalBytes: result.totalBytes, encoderHardlinks: plan.assetPaths.size, allocationBudgetBytes: plan.allocationBytes };
}
if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    require(process.argv.length === 3 && ['inspect', 'prepare'].includes(process.argv[2]));
    if (process.argv[2] === 'prepare') console.log(JSON.stringify(preparePrivateAiRuntime()));
    else {
      const { allocationBytes, freeBytes, admitted, patches } = inspectPrivateAiPreparation();
      console.log(JSON.stringify({ sourceVerified: true, writes: false, allocationBytes, freeBytes, admitted,
        patches: [...patches.values()].map(({ path, baseSha256, sha256, bytes }) => ({ path, baseSha256, sha256, bytes: bytes.length })) }));
    }
  } catch { console.error('Private AI runtime preparation refused; existing services are unchanged.'); process.exitCode = 1; }
}
