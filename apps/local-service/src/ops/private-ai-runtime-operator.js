// Tracked owner-local hierarchy runtime operator. Import is inert.
// This source contains no credential, pairing token or owner content.
//
// Runtime code is loaded from a sealed checked-source snapshot. The only
// operator/backup entrypoints, fixed owner model files and PostgreSQL/DPAPI
// bridges outside it are also hashed, including the installed dependency tree.
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync, constants, copyFileSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, renameSync,
  readFileSync, readdirSync, realpathSync, readSync, unlinkSync, writeSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const localServiceRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const repositoryRoot = path.resolve(localServiceRoot, "..", "..");
const dataDir = path.join(localServiceRoot, "data");
const snapshotRoot = path.join(dataDir, "hierarchy-release-20261030-private-ai");
const manifestPath = path.join(dataDir, "postgres-hierarchy-release-20261030-private-ai-manifest.json");
const databasePath = path.join(dataDir, "demo.sqlite");
const pairingPath = path.join(dataDir, "pairing.json");
const accountDatabasePath = path.join(dataDir, "accounts.sqlite");
const crawlerStatePath = path.join(dataDir, "topic-crawler.sqlite");
const crawlerTokenPath = path.join(dataDir, "pairing-recovery", "pairing-token.txt");
const growthPath = path.join(dataDir, "topic-growth-v2.sqlite");
const ridgePath = path.join(dataDir, "ridge1-topic-adapter-v1.json");
const adapterPath = path.join(dataDir, "diagonal-adapter-v1.json");
const bodyPath = path.join(dataDir, "body-topic-metric-v1.json");
const assetRoot = path.join(snapshotRoot, "spikes", "topic-resolution", "browser", "embedding", ".assets");

const SNAPSHOT_SCHEMA = "murmingle-postgresql-runtime-snapshot/v2";
const SNAPSHOT_LEAF = "hierarchy-release-20261030-private-ai";
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_SNAPSHOT_FILES = 5_000;
const MAX_SNAPSHOT_BYTES = 512 * 1024 * 1024;
const LOOPBACK_HOST = "127.0.0.1";
const POSTGRES_PORT = 55_432;
const POSTGRES_DATABASE = "murmingle_canonical";
const ROLES = Object.freeze({
  service: "murmingle_app",
  dashboard: "murmingle_app",
  crawler: "murmingle_crawler_submitter",
  worker: "murmingle_ingest_worker",
  status: "murmingle_owner",
});
const EXTERNAL_FILES = Object.freeze([
  "apps/local-service/src/ops/private-ai-runtime-operator.js",
  "apps/local-service/src/ops/postgres-backup-operator.js",
  // These import.meta-based data roots must run from their tracked original
  // locations, never via loadSnapshot. Authentication does not start a backup.
  "apps/local-service/src/ops/local-state-backup-operator.js",
  "apps/local-service/src/ops/windows-local-state-read-lease.js",
  "apps/local-service/src/ops/quiesced-state-backup.js",
  "apps/local-service/src/ops/windows-console-drain.py",
  "apps/local-service/data/ridge1-topic-adapter-v1.json",
  "apps/local-service/data/diagonal-adapter-v1.json",
  "apps/local-service/data/body-topic-metric-v1.json",
  "apps/local-service/src/ops/windows-backup-protection.js",
  "apps/local-service/portable/src/database.js",
  "apps/local-service/portable/src/windows-dpapi-password.js",
  "apps/local-service/portable/package.json",
  "apps/local-service/portable/package-lock.json",
]);
const REQUIRED_EXTERNAL_FILES = Object.freeze([...EXTERNAL_FILES,
  "apps/local-service/portable/node_modules/pg/package.json"]);
const REQUIRED_SNAPSHOT_FILES = Object.freeze([
  "apps/local-service/src/startup.js",
  "apps/local-service/src/http/request-handler.js",
  "apps/local-service/src/accounts/account-lifecycle.js",
  "apps/local-service/src/private/private-service.js",
  "apps/local-service/src/ai/chatgpt-runtime.js",
  "apps/local-service/src/application/create-postgres-canonical-service.js",
  "apps/local-service/src/application/postgres-interactive-ingestion.js",
  "apps/local-service/src/application/postgres-ingestion-worker-loop.js",
  "apps/local-service/src/application/owner-topic-configuration.js",
  "apps/local-service/src/domain/fixed-reference-topic-integration.js",
  "apps/local-service/src/crawler/crawl-state.js",
  "apps/local-service/src/crawler/local-ingest-client.js",
  "apps/local-service/src/crawler/packaged-e5.js",
  "apps/local-service/src/crawler/postgres-ingest-client.js",
  "apps/local-service/src/ops/crawl-cli.js",
  "apps/local-service/src/ops/postgres-runtime-status.js",
  "apps/local-service/portable/canonical-v4/ingestion-repository.js",
  "apps/local-service/portable/canonical-v4/index.js",
  "apps/local-service/portable/canonical-v4/lifecycle-repository.js",
  "apps/local-service/portable/canonical-v4/migrations/001-canonical-v4.sql",
  "apps/local-service/portable/canonical-v4/migrations/002-runtime-core.sql",
  "apps/local-service/portable/canonical-v4/migrations/003-execute-only-command-boundary.sql",
  "apps/local-service/portable/canonical-v4/migrations/004-ingestion-foundation.sql",
  "apps/local-service/portable/canonical-v4/migrations/005-ingestion-apply-and-lifecycle.sql",
  "apps/local-service/portable/canonical-v4/migrations/006-lifecycle-command-boundary.sql",
  "apps/local-service/portable/canonical-v4/migrations/007-exact-ridge-scan-single-pass.sql",
  "apps/local-service/portable/canonical-v4/migrations/008-independent-new-ingestion-admission.sql",
  "apps/local-service/portable/canonical-v4/migrations/009-fail-fast-new-ingestion-locks.sql",
  "apps/local-service/portable/canonical-v4/read-facade.js",
  "apps/local-service/portable/canonical-v4/runtime-repository.js",
  "apps/local-service/src/application/installed-hierarchy-runtime.js",
  "apps/local-service/src/application/installed-hierarchy-matcher.js",
  "apps/local-service/src/application/hierarchy-worker-resources.js",
  "apps/local-service/src/application/stored-hierarchy-coordinator.js",
  "apps/local-service/portable/canonical-v4/hierarchy-installation.js",
  "apps/local-service/portable/canonical-v4/semantic-owner-maintenance.js",
  ...[
    "010-semantic-hierarchy.sql", "011-semantic-discussion-feeds.sql", "012-semantic-stored-source-preparation.sql",
    "013-semantic-public-topic-metadata.sql", "014-semantic-source-containers.sql", "015-semantic-reply-witness.sql",
    "016-semantic-insight-reply.sql", "017-semantic-dashboard-counts.sql",
  ].map(name => `apps/local-service/portable/canonical-v4/migrations/${name}`),
  ...["root-model.json", "root-policy.json", "input-definition.json", "gta-detail.json", "animals-detail.json", "koalas-detail.json"]
    .map(name => `apps/local-service/assets/hierarchy/${name}`),
  "spikes/topic-resolution/browser/embedding/.assets/config.json",
  "spikes/topic-resolution/browser/embedding/.assets/manifest.json",
  "spikes/topic-resolution/browser/embedding/.assets/model.onnx",
  "spikes/topic-resolution/browser/embedding/.assets/ort-wasm-simd-threaded.mjs",
  "spikes/topic-resolution/browser/embedding/.assets/ort-wasm-simd-threaded.wasm",
  "spikes/topic-resolution/browser/embedding/.assets/ort.wasm.min.mjs",
  "spikes/topic-resolution/browser/embedding/.assets/special_tokens_map.json",
  "spikes/topic-resolution/browser/embedding/.assets/tokenizer.json",
  "spikes/topic-resolution/browser/embedding/.assets/tokenizers.mjs",
  "spikes/topic-resolution/browser/embedding/.assets/tokenizer_config.json",
  "apps/topic-dashboard/src/cli.js",
  "apps/topic-dashboard/src/data/postgres-catalog.js",
]);

function operatorFailure() {
  return new Error("PostgreSQL runtime operator failed");
}

function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function samePath(left, right) {
  const a = path.resolve(left), b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function checkedDirectory(filename) {
  const resolved = path.resolve(filename), info = lstatSync(resolved);
  if (!info.isDirectory() || info.isSymbolicLink() || !samePath(realpathSync.native(resolved), resolved))
    throw operatorFailure();
  return resolved;
}

function checkedFile(filename, { minimum = 1, maximum = 128 * 1024 * 1024 } = {}) {
  const resolved = path.resolve(filename), info = lstatSync(resolved);
  if (!info.isFile() || info.isSymbolicLink() || info.size < minimum || info.size > maximum ||
      !samePath(realpathSync.native(resolved), resolved)) throw operatorFailure();
  return { filename: resolved, info };
}

function boundedRead(filename, options) {
  const checked = checkedFile(filename, options), descriptor = openSync(checked.filename, constants.O_RDONLY);
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.size !== checked.info.size) throw operatorFailure();
    const bytes = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (!count) break;
      offset += count;
    }
    const final = fstatSync(descriptor);
    if (offset !== bytes.length || final.size !== opened.size || final.mtimeMs !== opened.mtimeMs ||
        final.ctimeMs !== opened.ctimeMs) { bytes.fill(0); throw operatorFailure(); }
    return bytes;
  } finally { closeSync(descriptor); }
}

function digestFile(filename, relativePath) {
  const checked = checkedFile(filename, { minimum: 0 });
  const descriptor = openSync(checked.filename, constants.O_RDONLY), chunk = Buffer.alloc(64 * 1024);
  try {
    const opened = fstatSync(descriptor), digest = createHash("sha256");
    if (opened.dev !== checked.info.dev || opened.ino !== checked.info.ino || opened.size !== checked.info.size) throw operatorFailure();
    let offset = 0, count;
    while ((count = readSync(descriptor, chunk, 0, chunk.length, offset)) > 0) {
      offset += count; if (offset > opened.size) throw operatorFailure(); digest.update(chunk.subarray(0, count));
    }
    const after = fstatSync(descriptor), named = checkedFile(filename, { minimum: 0 }).info;
    if (offset !== opened.size || [after, named].some(info => info.dev !== opened.dev || info.ino !== opened.ino ||
        info.size !== opened.size || info.mtimeMs !== opened.mtimeMs || info.ctimeMs !== opened.ctimeMs)) throw operatorFailure();
    return Object.freeze({ path: relativePath.replaceAll("\\", "/"), bytes: offset, sha256: digest.digest("hex") });
  } finally { chunk.fill(0); closeSync(descriptor); }
}

function collectSnapshotFiles() {
  checkedDirectory(snapshotRoot);
  const records = [];
  let totalBytes = 0;
  function visit(directory, relativeDirectory = "") {
    if (records.length > MAX_SNAPSHOT_FILES) throw operatorFailure();
    const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw operatorFailure();
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target, relative);
      else if (entry.isFile()) {
        const record = digestFile(target, relative);
        totalBytes += record.bytes;
        if (records.length >= MAX_SNAPSHOT_FILES || totalBytes > MAX_SNAPSHOT_BYTES) throw operatorFailure();
        records.push(record);
      } else throw operatorFailure();
    }
  }
  visit(snapshotRoot);
  records.sort((a, b) => compareText(a.path, b.path));
  const paths = new Set(records.map(record => record.path));
  if (REQUIRED_SNAPSHOT_FILES.some(filename => !paths.has(filename))) throw operatorFailure();
  return { files: records, totalBytes };
}

function collectExternalFiles() {
  const records = EXTERNAL_FILES.map(relative => digestFile(path.join(repositoryRoot, ...relative.split("/")), relative));
  const dependencyRoot = checkedDirectory(path.join(localServiceRoot, "portable", "node_modules"));
  let dependencyBytes = 0;
  function visit(directory) {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw operatorFailure();
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) {
        const relative = path.relative(repositoryRoot, target).replaceAll("\\", "/");
        const record = digestFile(target, relative);
        dependencyBytes += record.bytes;
        if (records.length >= 2_000 || dependencyBytes > 128 * 1024 * 1024) throw operatorFailure();
        records.push(record);
      } else throw operatorFailure();
    }
  }
  visit(dependencyRoot);
  return records.sort((a, b) => compareText(a.path, b.path));
}

function rootDigest(files, externalFiles) {
  const digest = createHash("sha256");
  for (const record of files) digest.update(`snapshot\0${record.path}\0${record.bytes}\0${record.sha256}\n`, "utf8");
  for (const record of externalFiles) digest.update(`external\0${record.path}\0${record.bytes}\0${record.sha256}\n`, "utf8");
  return digest.digest("hex");
}

function currentSnapshot(createdAt = new Date().toISOString()) {
  const { files, totalBytes } = collectSnapshotFiles(), externalFiles = collectExternalFiles();
  return Object.freeze({
    schema: SNAPSHOT_SCHEMA,
    createdAt,
    snapshot: SNAPSHOT_LEAF,
    totalBytes,
    rootSha256: rootDigest(files, externalFiles),
    files,
    externalFiles,
  });
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}

function validRecord(value) {
  return exactKeys(value, ["path", "bytes", "sha256"]) && typeof value.path === "string" &&
    value.path.length > 0 && !value.path.includes("\\") && !value.path.startsWith("/") &&
    !value.path.split("/").includes("..") && Number.isSafeInteger(value.bytes) && value.bytes >= 0 &&
    /^[a-f0-9]{64}$/u.test(value.sha256);
}

function readManifest() {
  const bytes = boundedRead(manifestPath, { minimum: 128, maximum: MAX_MANIFEST_BYTES });
  let value;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw operatorFailure(); }
  finally { bytes.fill(0); }
  if (!exactKeys(value, ["schema", "createdAt", "snapshot", "totalBytes", "rootSha256", "files", "externalFiles"]) ||
      value.schema !== SNAPSHOT_SCHEMA || value.snapshot !== SNAPSHOT_LEAF ||
      typeof value.createdAt !== "string" || new Date(value.createdAt).toISOString() !== value.createdAt ||
      !Number.isSafeInteger(value.totalBytes) || value.totalBytes < 1 || value.totalBytes > MAX_SNAPSHOT_BYTES ||
      !/^[a-f0-9]{64}$/u.test(value.rootSha256) || !Array.isArray(value.files) || !Array.isArray(value.externalFiles) ||
      value.files.length < REQUIRED_SNAPSHOT_FILES.length || value.files.length > MAX_SNAPSHOT_FILES ||
      value.files.some(record => !validRecord(record)) || value.externalFiles.length < REQUIRED_EXTERNAL_FILES.length ||
      value.externalFiles.length > 2_000 || value.externalFiles.some(record => !validRecord(record)) ||
      REQUIRED_EXTERNAL_FILES.some(required => !value.externalFiles.some(record => record.path === required)))
    throw operatorFailure();
  return value;
}

const TRACKED_SOURCE_MARKERS = Object.freeze(Object.fromEntries(Object.entries({
    "apps/local-service/src/http/request-handler.js": ["service.coherentSnapshotReads === true",
      "transportContext?.leaseAuthenticatedModels", "await ai.create(input, actorId,"],
    "apps/local-service/src/accounts/account-lifecycle.js": ["const mapResult =", "service.withdrawAccountContributions(actorId)"],
    "apps/local-service/src/private/private-service.js": ["const anchorValue = publicService.insightAnchor", "const complete = source =>"],
    "apps/local-service/src/ai/chatgpt-runtime.js": ["const mapResult =", "includeRelatedSources",
      'agentName: "Murmingle"', "semanticPublication"],
    "apps/local-service/portable/canonical-v4/read-facade.js": ["includeRelatedSources ? await scoped.relatedSources"],
    "spikes/topic-resolution/browser/core/insight-context.js": ["const nominated = related === null ? []"],
    "apps/local-service/src/startup.js": ["createPostgresCanonicalService", "canonicalDatabaseOwned = false", "hierarchicalTopics"],
    "apps/local-service/src/application/hierarchy-worker-resources.js": ["verifyInstalledHierarchyWorkerReadiness", "hierarchy17"],
  }).map(([name, markers]) => [name, Object.freeze(markers)])));

function verifyTrackedSourceMarkers() {
  for (const [relative, markers] of Object.entries(TRACKED_SOURCE_MARKERS)) {
    const bytes = boundedRead(path.join(snapshotRoot, ...relative.split("/")), { minimum: 32, maximum: 2 * 1024 * 1024 });
    try {
      const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (markers.some(marker => !source.includes(marker))) throw operatorFailure();
    } catch { throw operatorFailure(); }
    finally { bytes.fill(0); }
  }
}

function verifyRuntimeSnapshot() {
  const manifest = readManifest(), current = currentSnapshot(manifest.createdAt);
  if (JSON.stringify(current) !== JSON.stringify(manifest)) throw operatorFailure();
  const packageBytes = boundedRead(path.join(localServiceRoot, "portable", "node_modules", "pg", "package.json"),
    { minimum: 32, maximum: 64 * 1024 });
  try {
    const pkg = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(packageBytes));
    if (pkg?.name !== "pg" || pkg?.version !== "8.23.1") throw operatorFailure();
  } catch { throw operatorFailure(); }
  finally { packageBytes.fill(0); }
  verifyTrackedSourceMarkers();
  return Object.freeze({ rootSha256: manifest.rootSha256, files: manifest.files.length,
    totalBytes: manifest.totalBytes });
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const count = writeSync(descriptor, bytes, offset, bytes.length - offset);
    if (count <= 0) throw operatorFailure();
    offset += count;
  }
}

function sealRuntimeSnapshot() {
  if (lstatExists(manifestPath)) throw operatorFailure();
  verifyTrackedSourceMarkers();
  const manifest = currentSnapshot(), bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  if (bytes.length > MAX_MANIFEST_BYTES) { bytes.fill(0); throw operatorFailure(); }
  const temporary = `${manifestPath}.${randomUUID()}.partial`;
  let descriptor;
  try {
    descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    writeAll(descriptor, bytes); fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined;
    linkSync(temporary, manifestPath); unlinkSync(temporary);
    return Object.freeze({ rootSha256: manifest.rootSha256, files: manifest.files.length,
      totalBytes: manifest.totalBytes, sealed: true });
  } catch { try { unlinkSync(temporary); } catch {} throw operatorFailure(); }
  finally { if (descriptor !== undefined) try { closeSync(descriptor); } catch {}; bytes.fill(0); }
}

function lstatExists(filename) {
  try { lstatSync(filename); return true; }
  catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

function snapshotUrl(relative) {
  if (!REQUIRED_SNAPSHOT_FILES.includes(relative) && relative.includes("..")) throw operatorFailure();
  const target = path.resolve(snapshotRoot, ...relative.split("/"));
  if (!samePath(path.dirname(target), path.dirname(path.join(snapshotRoot, ...relative.split("/")))))
    throw operatorFailure();
  return pathToFileURL(target).href;
}

async function openRoleDatabase(role, maximum, applicationName) {
  if (!Object.values(ROLES).includes(role) || !Number.isInteger(maximum) || maximum < 1 || maximum > 32 ||
      typeof applicationName !== "string" || !/^murmingle-[a-z-]+$/u.test(applicationName)) throw operatorFailure();
  const [{ createPgDatabase }, { createWindowsDpapiPasswordProvider }] = await Promise.all([
    import(pathToFileURL(path.join(localServiceRoot, "portable", "src", "database.js")).href),
    import(pathToFileURL(path.join(localServiceRoot, "portable", "src", "windows-dpapi-password.js")).href),
  ]);
  // The clear value exists only in this process's memory. Recover it once per
  // component rather than launching one DPAPI helper for every pool socket.
  const password = await createWindowsDpapiPasswordProvider({ role })();
  const database = await createPgDatabase({ config: {
    host: LOOPBACK_HOST,
    port: POSTGRES_PORT,
    database: POSTGRES_DATABASE,
    user: role,
    password,
    ssl: false,
    max: maximum,
    application_name: applicationName,
    // The authenticated exact-URL recovery pool is an isolated bulkhead. Its
    // acquisition budget matches the already bounded 30-second projection
    // lease; every other role/pool retains the ordinary five-second bound.
    connectionTimeoutMillis: applicationName === "murmingle-url-projection" ? 30_000 : 5_000,
    idleTimeoutMillis: 30_000,
  } });
  try {
    const { rows } = await database.query(`SELECT current_database() AS database,current_user AS role,
      host(inet_server_addr()) AS address,inet_server_port() AS port`);
    if (rows.length !== 1 || rows[0].database !== POSTGRES_DATABASE || rows[0].role !== role ||
        rows[0].address !== LOOPBACK_HOST || Number(rows[0].port) !== POSTGRES_PORT) throw operatorFailure();
    return database;
  } catch (error) { await database.close().catch(() => {}); throw error; }
}

function readPairingOrigin() {
  const bytes = boundedRead(pairingPath, { minimum: 32, maximum: 8 * 1024 });
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!exactKeys(value, ["version", "state", "origin", "verifier"]) || value.version !== 1 ||
        value.state !== "active" || typeof value.verifier !== "string" ||
        typeof value.origin !== "string" || !/^chrome-extension:\/\/[a-p]{32}$/u.test(value.origin)) throw operatorFailure();
    return value.origin;
  } catch { throw operatorFailure(); }
  finally { bytes.fill(0); }
}

function readCrawlerToken() {
  const bytes = boundedRead(crawlerTokenPath, { minimum: 43, maximum: 128 });
  try {
    const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!/^[A-Za-z0-9_-]{43}(?:\r?\n)?$/u.test(value)) throw operatorFailure();
    return value.replace(/\r?\n$/u, "");
  } finally { bytes.fill(0); }
}

async function readTopicConfiguration() {
  const { readInstalledOwnerTopicConfiguration } = await import(snapshotUrl(
    "apps/local-service/src/application/owner-topic-configuration.js"));
  const result = readInstalledOwnerTopicConfiguration({ ridgePath, adapterPath, bodyPath });
  if (result.alternateAdapter !== null || result.alternateBodyMetric !== null || result.alternateRidgeAdapter === null)
    throw operatorFailure();
  return result;
}

async function waitForShutdown(close) {
  let closing = false;
  await new Promise(resolve => {
    const handlers = new Map();
    const shutdown = async signal => {
      if (closing) return;
      closing = true;
      for (const [name, handler] of handlers) process.removeListener(name, handler);
      if (signal === "SIGINT") process.exitCode = 130;
      else if (signal === "SIGTERM") process.exitCode = 143;
      try { await close(); } catch { process.exitCode = 1; }
      resolve();
    };
    for (const signal of ["SIGINT", "SIGTERM", ...(process.platform === "win32" ? ["SIGBREAK"] : [])]) {
      const handler = () => shutdown(signal);
      handlers.set(signal, handler); process.once(signal, handler);
    }
  });
}

function startDashboardWatcher({ readRevision, generate, initialRevision, onError }) {
  let stopped = false, timer = null, inFlight = Promise.resolve(), revision = initialRevision, lastError = null;
  const schedule = delay => {
    if (!stopped) timer = setTimeout(() => { inFlight = tick(); }, delay);
  };
  const tick = async () => {
    timer = null;
    try {
      const current = await readRevision();
      if (current !== revision) { await generate(); revision = current; }
      lastError = null;
    } catch {
      if (lastError === null) onError();
      lastError = "failed";
    } finally { schedule(1_000); }
  };
  schedule(0);
  return Object.freeze({ async close() {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    await inFlight;
  } });
}

const SOURCE_PREFIXES = Object.freeze([
  "apps/local-service/src/", "apps/local-service/portable/canonical-v4/", "apps/local-service/portable/src/",
  "apps/local-service/assets/hierarchy/", "apps/local-service/experiments/", "apps/topic-dashboard/",
  "spikes/topic-resolution/browser/", "spikes/topic-resolution/experiments/",
]);
const SOURCE_FILES = Object.freeze([
  "apps/local-service/package.json", "apps/local-service/portable/package.json",
  "apps/local-service/portable/package-lock.json", "spikes/topic-resolution/package.json",
]);
const ASSET_FILES = Object.freeze(REQUIRED_SNAPSHOT_FILES.filter(name => name.includes("/embedding/.assets/")));
export const POSTGRES_RUNTIME_POOL_BUDGET = Object.freeze({ api: 32, exactUrl: 4, worker: 2, crawler: 2, dashboard: 2,
  permanentMaximum: 42, statusOwner: 1, installationOwner: 1 });
const OPERATIONS = Object.freeze(["preflight", "status", "service"]);
export function describePostgresRuntimePackaging() {
  return Object.freeze({ sourcePrefixes: SOURCE_PREFIXES, sourceFiles: SOURCE_FILES,
    snapshotLeaf: SNAPSHOT_LEAF, manifestFilename: path.basename(manifestPath), externalFiles: REQUIRED_EXTERNAL_FILES,
    requiredFiles: REQUIRED_SNAPSHOT_FILES, encoderFiles: ASSET_FILES, sourceMarkers: TRACKED_SOURCE_MARKERS,
    maximumFiles: MAX_SNAPSHOT_FILES, maximumBytes: MAX_SNAPSHOT_BYTES, maximumManifestBytes: MAX_MANIFEST_BYTES });
}

function git(args) {
  return execFileSync("git", ["-C", repositoryRoot, ...args], { windowsHide: true, shell: false,
    timeout: 10_000, maxBuffer: 2 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}
function sourcePath(value) {
  return typeof value === "string" && !value.includes("\\") && !value.includes(":") &&
    !value.startsWith("/") && value.split("/").every(part => part && part !== "." && part !== "..") &&
    (SOURCE_FILES.includes(value) || SOURCE_PREFIXES.some(prefix => value.startsWith(prefix)));
}

// Explicit owner preparation only. It copies committed source paths and the
// fixed downloaded encoder assets; data, account stores and crawler state are
// never candidates. Failed preparations are retained for inspection, not reused.
async function prepareRuntimeSnapshot() {
  checkedDirectory(dataDir);
  if (lstatExists(snapshotRoot) || lstatExists(manifestPath)) throw operatorFailure();
  const selectors = [...SOURCE_PREFIXES, ...SOURCE_FILES];
  git(["diff", "--quiet", "HEAD", "--", ...selectors]);
  const listed = new TextDecoder("utf-8", { fatal: true }).decode(git(["ls-files", "-z", "--", ...selectors]));
  const names = listed.split("\0"); if (names.pop() !== "" || names.some(name => !sourcePath(name))) throw operatorFailure();
  const { loadInstalledHierarchyMatcher } = await import(pathToFileURL(path.join(localServiceRoot,
    "src", "application", "installed-hierarchy-matcher.js")).href);
  await loadInstalledHierarchyMatcher(); // Verifies fixed numeric/identity metadata, no encoder.
  const manifestBytes = boundedRead(path.join(repositoryRoot, "spikes/topic-resolution/browser/embedding/.assets/manifest.json"),
    { minimum: 1716, maximum: 1716 });
  let encoderManifest;
  try {
    if (createHash("sha256").update(manifestBytes).digest("hex") !==
        "5766e675660a8fbe74842a69b670a84ce5f9eb457b77032337e4a69d6180b984") throw operatorFailure();
    encoderManifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
  } finally { manifestBytes.fill(0); }
  const expectedAssets = new Map(encoderManifest.assets.map(record => [
    `spikes/topic-resolution/browser/embedding/.assets/${record.filename}`, record]));
  if (expectedAssets.size !== 9 || ASSET_FILES.some(name => !name.endsWith("/manifest.json") && !expectedAssets.has(name)))
    throw operatorFailure();
  const files = [...new Set([...names, ...ASSET_FILES])].sort(compareText);
  if (files.length > MAX_SNAPSHOT_FILES || REQUIRED_SNAPSHOT_FILES.some(name => !files.includes(name))) throw operatorFailure();
  const records = files.map(name => digestFile(path.join(repositoryRoot, ...name.split("/")), name));
  const bytes = records.reduce((sum, record) => sum + record.bytes, 0);
  if (bytes > MAX_SNAPSHOT_BYTES) throw operatorFailure();
  for (const record of records) {
    const expected = expectedAssets.get(record.path);
    if (expected && (record.bytes !== expected.bytes || record.sha256 !== expected.sha256)) throw operatorFailure();
  }
  const partial = `${snapshotRoot}.preparing-${randomUUID()}`;
  if (path.dirname(partial) !== dataDir || path.dirname(snapshotRoot) !== dataDir) throw operatorFailure();
  mkdirSync(partial, { mode: 0o700 }); checkedDirectory(partial);
  for (const record of records) {
    const destination = path.join(partial, ...record.path.split("/"));
    if (!destination.startsWith(`${partial}${path.sep}`)) throw operatorFailure();
    mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 }); checkedDirectory(path.dirname(destination));
    copyFileSync(path.join(repositoryRoot, ...record.path.split("/")), destination, constants.COPYFILE_EXCL);
    if (JSON.stringify(digestFile(destination, record.path)) !== JSON.stringify(record)) throw operatorFailure();
  }
  git(["diff", "--quiet", "HEAD", "--", ...selectors]);
  // Both resolved absolute directory targets are checked inside the fixed data
  // root before this directory move. Existing snapshots are never replaced.
  checkedDirectory(dataDir); checkedDirectory(partial);
  if (lstatExists(snapshotRoot) || path.dirname(path.resolve(partial)) !== dataDir ||
      path.dirname(path.resolve(snapshotRoot)) !== dataDir) throw operatorFailure();
  renameSync(partial, snapshotRoot);
  return Object.freeze({ prepared: true, sealed: false, files: records.length, totalBytes: bytes });
}

export function parseHierarchyInstallInput(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > 131072) throw operatorFailure();
  const value = JSON.parse(text);
  if (!exactKeys(value, ["expectedHeadRevision", "expectedPolicyRevision", "policy"]) ||
      ![value.expectedHeadRevision, value.expectedPolicyRevision].every(n => Number.isSafeInteger(n) && n >= 0 && n < Number.MAX_SAFE_INTEGER) ||
      !exactKeys(value.policy, ["defaultMaxDepth", "overrides"]) || !Number.isInteger(value.policy.defaultMaxDepth) ||
      value.policy.defaultMaxDepth < 1 || value.policy.defaultMaxDepth > 8 || !Array.isArray(value.policy.overrides) ||
      value.policy.overrides.length > 512 || value.policy.overrides.some(rule =>
        !exactKeys(rule, ["nodeId", "maxDepth"]) || typeof rule.nodeId !== "string" || !rule.nodeId.length ||
        rule.nodeId.length > 160 || !Number.isInteger(rule.maxDepth) || rule.maxDepth < 1 || rule.maxDepth > 8)) throw operatorFailure();
  return value;
}
function readBoundedInput(parse) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, complete = false;
    const finish = error => {
      if (complete) return; complete = true; clearTimeout(timer);
      process.stdin.removeListener("data", data); process.stdin.removeListener("end", end); process.stdin.removeListener("error", failure);
      process.stdin.pause();
      try { if (error) throw error; resolve(parse(Buffer.concat(chunks, size).toString("utf8"))); }
      catch { reject(operatorFailure()); }
      finally { for (const chunk of chunks) chunk.fill(0); }
    };
    const data = chunk => {
      if (!Buffer.isBuffer(chunk) || size + chunk.length > 131072) { finish(operatorFailure()); return; }
      chunks.push(Buffer.from(chunk)); size += chunk.length;
    };
    const end = () => finish(), failure = () => finish(operatorFailure());
    const timer = setTimeout(() => finish(operatorFailure()), 5_000);
    process.stdin.on("data", data); process.stdin.once("end", end); process.stdin.once("error", failure);
    process.stdin.resume();
  });
}
function readInstallInput() { return readBoundedInput(parseHierarchyInstallInput); }
function readOwnerInput() { return readBoundedInput(text => JSON.parse(text)); }
async function closeAll(resources) {
  let failed = false, primary;
  for (const resource of resources) try { await resource?.close(); }
  catch (error) { if (!failed) { failed = true; primary = error; } }
  if (failed) throw primary;
}

async function usingDatabase(database, work) {
  let result, failed = false, primary;
  try { result = await work(); } catch (error) { failed = true; primary = error; }
  try { await database.close(); } catch (error) { if (!failed) { failed = true; primary = error; } }
  if (failed) throw primary;
  return result;
}

async function runService(p) {
  const database = await p.openRoleDatabase(ROLES.service, POSTGRES_RUNTIME_POOL_BUDGET.api, "murmingle-api");
  let urlDatabase, application, retentionTimer = null, retentionPending = Promise.resolve();
  try {
    urlDatabase = await p.openRoleDatabase(ROLES.service, POSTGRES_RUNTIME_POOL_BUDGET.exactUrl, "murmingle-url-projection");
    const [{ startLocalApplication }, { createExistingProtectedRefreshStore }, { createVoiceRequestTraceLog },
      { cleanupExpiredPostgresBackups }] = await Promise.all([
      p.loadSnapshot("apps/local-service/src/startup.js"), p.loadSnapshot("apps/local-service/src/ai/existing-protected-refresh-store.js"),
      p.loadSnapshot("apps/local-service/src/ai/voice-request-trace-log.js"), p.loadBackup(),
    ]);
    const cleanExpired = () => {
      retentionPending = retentionPending.then(() => cleanupExpiredPostgresBackups()).catch(() => p.writeStderr("PostgreSQL backup retention delayed.\n"));
      return retentionPending;
    };
    await cleanExpired(); retentionTimer = p.setInterval(cleanExpired, 60 * 60 * 1000);
    const topicConfiguration = await p.readTopicConfiguration(), origin = p.readPairingOrigin();
    let voiceRequestTraceLog = null; try { voiceRequestTraceLog = createVoiceRequestTraceLog(); } catch {}
    application = await startLocalApplication({
      config: { host: LOOPBACK_HOST, port: 4174, origin, capability: "durable-pairing-verifier-only-placeholder" },
      databasePath, canonicalDatabase: database, canonicalDatabaseOwned: false,
      urlSelectionDatabase: urlDatabase, urlSelectionDatabaseOwned: false, ...topicConfiguration,
      hierarchicalTopics: true, pairingPath, readOnlyPairingCompatibility: true,
      nextId: prefix => `${prefix}-${randomUUID()}`, now: () => new Date().toISOString(),
      accountsEnabled: true, accountDatabasePath, chatgptFetchImpl: globalThis.fetch.bind(globalThis),
      chatgptRefreshStore: createExistingProtectedRefreshStore,
      insightTrace: trace => { try { p.writeStdout(`INSIGHT_TRACE ${JSON.stringify(trace)}\n`); } catch {} },
      insightDebug: null, insightRequestTrace: voiceRequestTraceLog ? trace => voiceRequestTraceLog.write(trace) : null,
    });
    p.writeStdout("PostgreSQL hierarchy service listening at http://127.0.0.1:4174\n");
  } catch (error) {
    if (retentionTimer !== null) p.clearInterval(retentionTimer);
    await retentionPending.catch(() => {}); try { await closeAll([application, urlDatabase, database]); } catch {} throw error;
  }
  await p.waitForShutdown(async () => {
    if (retentionTimer !== null) p.clearInterval(retentionTimer);
    await retentionPending.catch(() => {}); await closeAll([application, urlDatabase, database]);
  });
}
async function runWorker(p) {
  const database = await p.openRoleDatabase(ROLES.worker, POSTGRES_RUNTIME_POOL_BUDGET.worker, "murmingle-ingest-worker-timed");
  let runtime;
  try {
    const [{ openInstalledHierarchyRuntime }, { createInstalledFixedReferenceMatcher }] = await Promise.all([
      p.loadSnapshot("apps/local-service/src/application/installed-hierarchy-runtime.js"),
      p.loadSnapshot("apps/local-service/src/domain/fixed-reference-topic-integration.js"),
    ]);
    const configuration = await p.readTopicConfiguration();
    runtime = await openInstalledHierarchyRuntime({ database,
      referenceMatcher: createInstalledFixedReferenceMatcher(configuration.alternateRidgeAdapter),
      nextId: prefix => `${prefix}-${randomUUID()}`, now: () => new Date().toISOString(),
      workerOptions: { onProgress: value => {
        try { p.writeStdout(`Worker timing: outcome=${value.outcome} claimMs=${value.claimMs} prepareMs=${value.prepareMs} applyMs=${value.applyMs} totalMs=${value.totalMs} capped=${value.capped}.\n`); } catch {}
      } },
    });
    p.writeStdout("PostgreSQL hierarchy worker and stored-page preparation ready.\n");
  } catch (error) { try { await closeAll([runtime, database]); } catch {} throw error; }
  const keepAlive = p.setInterval(() => {}, 60_000);
  await p.waitForShutdown(async () => { p.clearInterval(keepAlive); await closeAll([runtime, database]); });
}
async function runDashboard(p) {
  const database = await p.openRoleDatabase(ROLES.dashboard, POSTGRES_RUNTIME_POOL_BUDGET.dashboard, "murmingle-dashboard");
  let watcher, growthSampler;
  try {
    const [{ createPostgresDashboardSource }, dashboard] = await Promise.all([
      p.loadSnapshot("apps/topic-dashboard/src/data/postgres-catalog.js"), p.loadSnapshot("apps/topic-dashboard/src/cli.js"),
    ]);
    const source = createPostgresDashboardSource({ database, schemaProfile: "hierarchy17" });
    const options = { source, growthPath };
    const initialRevision = await dashboard.readPostgresDashboardRefreshKey(source, { growthPath });
    const result = await dashboard.generatePostgresDashboard(options);
    growthSampler = dashboard.startPostgresDashboardGrowthSampler({ source, growthPath,
      onOutcome: value => { if (value.outcome === "failed") p.writeStderr("Dashboard growth sampling delayed.\n"); } });
    watcher = p.startDashboardWatcher({ initialRevision,
      readRevision: () => dashboard.readPostgresDashboardRefreshKey(source, { growthPath }),
      generate: () => dashboard.generatePostgresDashboardSnapshot({ ...options, outputPath: result.outputPath }),
      onError: () => p.writeStderr("Dashboard refresh delayed.\n"),
    });
    p.writeStdout(`PostgreSQL hierarchy dashboard ready: ${result.counts.learnedSources} captured pages.\n${result.outputPath}\n`);
  } catch (error) { try { await closeAll([watcher, growthSampler, database]); } catch {} throw error; }
  await p.waitForShutdown(() => closeAll([watcher, growthSampler, database]));
}
async function runCrawler(p) {
  const database = await p.openRoleDatabase(ROLES.crawler, POSTGRES_RUNTIME_POOL_BUDGET.crawler, "murmingle-crawler");
  return usingDatabase(database, async () => {
    const [{ runCrawlerCli }, { createCrawlState }, { createLocalIngestClient }, { createPostgresCrawlerClient },
      { createPackagedCrawlerEmbedder }, { createCanonicalV4IngestionRepository }] = await Promise.all([
      p.loadSnapshot("apps/local-service/src/ops/crawl-cli.js"), p.loadSnapshot("apps/local-service/src/crawler/crawl-state.js"),
      p.loadSnapshot("apps/local-service/src/crawler/local-ingest-client.js"), p.loadSnapshot("apps/local-service/src/crawler/postgres-ingest-client.js"),
      p.loadSnapshot("apps/local-service/src/crawler/packaged-e5.js"), p.loadSnapshot("apps/local-service/portable/canonical-v4/ingestion-repository.js"),
    ]);
    const repository = createCanonicalV4IngestionRepository({ database, schemaProfile: "hierarchy17",
      nextId: prefix => `${prefix}-${randomUUID()}`, now: () => new Date().toISOString() });
    await repository.health();
    await runCrawlerCli({ args: ["--apply", "--token-stdin"], tokenReader: async () => p.readCrawlerToken(),
      clientFactory: async token => {
        const client = createPostgresCrawlerClient({ readClient: createLocalIngestClient({ token, useSourceUrlPages: true }), ingestionRepository: repository });
        return Object.freeze({ version: client.version, knownSourceUrls: client.knownSourceUrls, ingest: client.ingest, close: async () => {} });
      }, embedderFactory: () => createPackagedCrawlerEmbedder({ assetRoot }),
      stateFactory: () => createCrawlState({ filename: crawlerStatePath }),
    });
  });
}
async function runStatus(p) {
  const database = await p.openRoleDatabase(ROLES.status, 1, "murmingle-status");
  return usingDatabase(database, async () => {
    const [{ collectPostgresRuntimeStatus }, { readRelatedCatalogCapacityLimits }, { createPostgresDashboardSource },
      { createCanonicalV4IngestionRepository }] = await Promise.all([
      p.loadSnapshot("apps/local-service/src/ops/postgres-runtime-status.js"), p.loadSnapshot("apps/local-service/portable/canonical-v4/related-catalog-index.js"),
      p.loadSnapshot("apps/topic-dashboard/src/data/postgres-catalog.js"), p.loadSnapshot("apps/local-service/portable/canonical-v4/ingestion-repository.js"),
    ]);
    const health = await createCanonicalV4IngestionRepository({ database, schemaProfile: "hierarchy17" }).health();
    const value = await collectPostgresRuntimeStatus({ database, capacityLimits: readRelatedCatalogCapacityLimits() });
    const summary = await createPostgresDashboardSource({ database, schemaProfile: "hierarchy17" }).readHierarchySummary();
    p.writeStdout(`${JSON.stringify({ ...value, schemaVersion: health.schemaVersion,
      semantic: summary.semantic, legacyContainers: summary.legacyContainers, poolBudget: POSTGRES_RUNTIME_POOL_BUDGET })}\n`);
    return value.status === "available" ? 0 : 1;
  });
}
async function runInstallation(p) {
  const request = await p.readInstallInput();
  const { installInstalledHierarchy } = await p.loadSnapshot("apps/local-service/portable/canonical-v4/hierarchy-installation.js");
  const database = await p.openRoleDatabase(ROLES.status, 1, "murmingle-hierarchy-installation");
  return usingDatabase(database, async () => { p.writeStdout(`${JSON.stringify(await installInstalledHierarchy({ ...request, database }))}\n`); });
}
async function runOwnerMaintenance(p, operation) {
  const request = await p.readOwnerInput();
  const { createSemanticOwnerMaintenance, readSemanticOwnerMaintenanceInput } = await p.loadSnapshot(
    "apps/local-service/portable/canonical-v4/semantic-owner-maintenance.js");
  const input = readSemanticOwnerMaintenanceInput(operation, request);
  const database = await p.openRoleDatabase(ROLES.status, 1, "murmingle-semantic-owner");
  return usingDatabase(database, async () => {
    const owner = createSemanticOwnerMaintenance({ database });
    const method = operation === "inspect-legacy-roots" ? "inspectLegacyRoots" :
      operation === "adopt-legacy-roots" ? "adoptLegacyRoots" : "setHierarchyPolicy";
    p.writeStdout(`${JSON.stringify(await owner[method](input))}\n`);
  });
}
function operations(p) {
  return Object.freeze({ async run(args) {
    const operation = Array.isArray(args) && args.length === 1 ? args[0] : null;
    if (!OPERATIONS.includes(operation)) { p.writeStderr(`Use exactly one operation: ${OPERATIONS.join(", ")}.\n`); return 2; }
    try {
      if (operation === "prepare-runtime") p.writeStdout(`${JSON.stringify(await p.prepareRuntimeSnapshot())}\n`);
      else if (operation === "seal-runtime") p.writeStdout(`${JSON.stringify(p.sealRuntimeSnapshot())}\n`);
      else {
        const verified = p.verifyRuntimeSnapshot();
        if (operation === "preflight") p.writeStdout(`${JSON.stringify({ ...verified, verified: true, poolBudget: POSTGRES_RUNTIME_POOL_BUDGET })}\n`);
        else if (operation === "install-hierarchy") await runInstallation(p);
        else if (["inspect-legacy-roots", "adopt-legacy-roots", "set-hierarchy-policy"].includes(operation)) await runOwnerMaintenance(p, operation);
        else if (operation === "service") await runService(p);
        else if (operation === "worker") await runWorker(p);
        else if (operation === "dashboard") await runDashboard(p);
        else if (operation === "crawler") await runCrawler(p);
        else return await runStatus(p);
      }
      return 0;
    } catch { p.writeStderr(`PostgreSQL ${operation} operation failed.\n`); return 1; }
  } });
}
const production = operations(Object.freeze({
  openRoleDatabase, prepareRuntimeSnapshot, sealRuntimeSnapshot, verifyRuntimeSnapshot, readTopicConfiguration,
  readPairingOrigin, readCrawlerToken, readInstallInput, readOwnerInput, waitForShutdown, startDashboardWatcher,
  loadSnapshot: name => import(snapshotUrl(name)),
  loadBackup: () => import(pathToFileURL(path.join(localServiceRoot, "src", "ops", "postgres-backup-operator.js")).href),
  writeStdout: text => process.stdout.write(text), writeStderr: text => process.stderr.write(text), setInterval, clearInterval,
}));
export function createPostgresRuntimeOperatorForTest(ports = {}) {
  const names = ["openRoleDatabase", "prepareRuntimeSnapshot", "sealRuntimeSnapshot", "verifyRuntimeSnapshot", "readTopicConfiguration",
    "readPairingOrigin", "readCrawlerToken", "readInstallInput", "readOwnerInput", "waitForShutdown", "startDashboardWatcher", "loadSnapshot", "loadBackup",
    "writeStdout", "writeStderr", "setInterval", "clearInterval"];
  if (!ports || typeof ports !== "object" || Object.keys(ports).some(key => !names.includes(key) || typeof ports[key] !== "function")) throw operatorFailure();
  return operations(Object.freeze(Object.fromEntries(names.map(name => [name, ports[name] ?? (() => { throw operatorFailure(); })]))));
}
export async function runPostgresRuntimeOperator(args) { return production.run(args); }
if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) {
  const result = await runPostgresRuntimeOperator(process.argv.slice(2));
  if (result !== 0) process.exitCode = result;
}

