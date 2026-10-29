import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { APP_DATABASE_PATH } from "../../local-service/src/startup.js";
import { NORMALIZED_STORAGE_FORMAT, NORMALIZED_FIXED_REFERENCE_STORAGE_FORMAT } from "../../local-service/src/adapters/normalized-sqlite-repository.js";
import { ACCOUNT_STATE_SCHEMA } from "../../local-service/src/accounts/account-principal.js";
import { FIXED_REFERENCE_STATE_SCHEMA } from "../../local-service/src/domain/demo-state.js";
import { readExpectedVersion } from "../../local-service/src/domain/validation.js";
import { createCatalogGrowthStore, readCatalogGrowthCounts, readCatalogGrowthHistory, validateCatalogGrowthHistory } from "../../local-service/src/metrics/catalog-growth.js";
import { createCatalogGrowthStoreV2, readCatalogGrowthCountsV2, readCatalogGrowthHistoryV2, validateCatalogGrowthHistoryV2,
  startCatalogGrowthSamplerV2, CATALOG_GROWTH_V2_FILENAME } from "../../local-service/src/metrics/catalog-growth.js";
import { buildDashboardSnapshot, buildStatsOnlyDashboardSnapshot, buildDashboardSnapshotV2, buildStatsOnlyDashboardSnapshotV2, DashboardGraphCapacityError, loadDashboardState, MAX_GRAPH_PAGES } from "./data/catalog.js";
import { buildGroupingPreview, LOCAL_ADAPTER_PATH, LOCAL_BODY_METRIC_PATH, LOCAL_RIDGE_ADAPTER_PATH, readInstalledOwnerTopicConfiguration } from "./data/grouping-preview.js";

const webPath = fileURLToPath(new URL("../web/", import.meta.url));
export const DEFAULT_REPORT_PATH = path.join(tmpdir(), "murmingle-dashboard", "dashboard.html");
const styleTag = '<link rel="stylesheet" href="./style.css" data-dashboard-style>';
const scriptTag = '<script src="./app.js" defer data-dashboard-script></script>';
const dataTag = '<script id="dashboard-data" type="application/json"></script>';
const previewTag = '<script id="dashboard-preview-data" type="application/json"></script>';
const SNAPSHOT_FILE = "snapshot.js";
const growthTag = '<script id="dashboard-growth-data" type="application/json"></script>';
let lastGraphBundle = null;

function safeGrowth(growth) {
  if (growth === null || growth === undefined) return null;
  try { return validateCatalogGrowthHistoryV2(growth); }
  catch { /* Preserve strict legacy history without inventing new counters. */ }
  try { return validateCatalogGrowthHistory(growth); }
  catch { return null; }
}

function replaceOnce(document, needle, replacement) {
  if (document.split(needle).length !== 2) throw new Error("Dashboard template changed unexpectedly");
  return document.replace(needle, replacement);
}

export function renderDashboardDocument({ template, style, script, snapshot, preview = null, growth = null }) {
  const safeJson = serializeSnapshot(snapshot);
  let document = replaceOnce(template, styleTag, `<style>${style}</style>`);
  document = replaceOnce(document, scriptTag, `<script>${script}</script>`);
  document = replaceOnce(document, dataTag, `<script id="dashboard-data" type="application/json">${safeJson}</script>`);
  if (document.includes(previewTag)) document = replaceOnce(document, previewTag,
    `<script id="dashboard-preview-data" type="application/json">${serializeSnapshot(preview)}</script>`);
  if (document.includes(growthTag)) document = replaceOnce(document, growthTag,
    `<script id="dashboard-growth-data" type="application/json">${serializeSnapshot(safeGrowth(growth))}</script>`);
  return document;
}

function serializeSnapshot(snapshot) {
  return JSON.stringify(snapshot).replaceAll("<", "\\u003c").replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

export function renderSnapshotScript(snapshot, preview = null, growth = null) {
  return `globalThis.__topicAtlasSnapshot = ${serializeSnapshot(snapshot)};\n` +
    `globalThis.__topicAtlasPreview = ${serializeSnapshot(preview)};\n` +
    `globalThis.__topicAtlasGrowth = ${serializeSnapshot(safeGrowth(growth))};\n`;
}

function readDashboardBundle(databasePath, now, adapter, bodyMetric, ridgeAdapter, { recordInitial = false, formatVersion = 1 } = {}) {
  if (![1, 2].includes(formatVersion)) throw new TypeError('Invalid dashboard format');
  const current = formatVersion === 2;
  const readCounts = current ? readCatalogGrowthCountsV2 : readCatalogGrowthCounts;
  const buildSnapshot = current ? buildDashboardSnapshotV2 : buildDashboardSnapshot;
  const buildStats = current ? buildStatsOnlyDashboardSnapshotV2 : buildStatsOnlyDashboardSnapshot;
  const point = readCounts(databasePath, { now });
  const growthPath = path.join(path.dirname(databasePath), current ? CATALOG_GROWTH_V2_FILENAME : "topic-growth.sqlite");
  let growth = null, store;
  try {
    if (recordInitial) {
      store = (current ? createCatalogGrowthStoreV2 : createCatalogGrowthStore)(growthPath, { now });
      store.sample(point);
      growth = store.read();
    } else growth = (current ? readCatalogGrowthHistoryV2 : readCatalogGrowthHistory)(growthPath, { now });
  } catch { /* Aggregate recording failure does not disable the canonical view. */ }
  finally { try { store?.close(); } catch {} }
  if (point.learnedPages > MAX_GRAPH_PAGES) {
    return { snapshot: buildStats(point), preview: null, growth };
  }
  const keys = JSON.parse(readDashboardRefreshKey(databasePath));
  keys.pop(); // History changes do not require another vector/PCA/Topic graph.
  const graphKey = JSON.stringify([path.resolve(databasePath), formatVersion, keys,
    adapter?.manifestSha256 ?? null, bodyMetric?.manifestSha256 ?? null, ridgeAdapter?.manifestSha256 ?? null]);
  if (lastGraphBundle?.key === graphKey && lastGraphBundle.snapshot.growthSeriesId === point.seriesId) {
    return { snapshot: lastGraphBundle.snapshot, preview: lastGraphBundle.preview, growth };
  }
  const state = loadDashboardState(databasePath);
  let snapshot;
  try { snapshot = buildSnapshot(state, { now }); }
  catch (error) {
    if (!(error instanceof DashboardGraphCapacityError)) throw error;
    // Ingestion can cross the graph limit between the aggregate and graph read.
    return { snapshot: buildStats(readCounts(databasePath, { now })), preview: null, growth };
  }
  const preview = buildGroupingPreview(state, snapshot, adapter, bodyMetric, ridgeAdapter);
  lastGraphBundle = { key: graphKey, snapshot, preview };
  return { snapshot, preview, growth };
}

async function readPostgresDashboardBundle(source, growthPath, now, adapter, bodyMetric, ridgeAdapter,
  { recordInitial = false } = {}) {
  if (!source || typeof source.readSnapshot !== "function" || typeof growthPath !== "string" || !path.isAbsolute(growthPath))
    throw new TypeError("Invalid PostgreSQL dashboard source");
  const current = await source.readSnapshot({ now, graphLimit: MAX_GRAPH_PAGES });
  if (!current || !current.header || !current.point || !Object.hasOwn(current, "state"))
    throw new Error("PostgreSQL dashboard unavailable");
  let growth = null, store;
  try {
    if (recordInitial) {
      store = createCatalogGrowthStoreV2(growthPath, { now });
      store.sample(current.point);
      growth = store.read();
    } else growth = readCatalogGrowthHistoryV2(growthPath, { now });
  } catch { /* Derived history failure never disables the canonical dashboard. */ }
  finally { try { store?.close(); } catch {} }
  if(['hierarchy17','hierarchy18'].includes(source.schemaProfile)){
    if(!current.semantic||!current.legacyContainers||current.state!==null)throw new Error('PostgreSQL dashboard unavailable');
    // This is a present-tense metadata view. V2 history remains the legacy
    // container series; no semantic values are written into that strict format.
    const base=buildStatsOnlyDashboardSnapshotV2(current.point);
    return {snapshot:{...base,graphLimited:false,graphMode:'semantic-aggregates',schemaProfile:source.schemaProfile,
      catalogRevision:createHash('sha256').update(JSON.stringify([current.point.seriesId,current.header.catalogVersion,
        current.header.revision,current.semantic.revision])).digest('hex'),semantic:current.semantic,
      counts:{...base.counts,legacyContainers:current.legacyContainers,semantic:current.semantic.counts}},preview:null,growth};
  }
  if (current.state === null) {
    return { snapshot: buildStatsOnlyDashboardSnapshotV2(current.point), preview: null, growth };
  }
  const graphKey = JSON.stringify(["postgresql", current.point.seriesId, current.header.catalogVersion,
    ...dashboardArtifactKeys([LOCAL_RIDGE_ADAPTER_PATH, LOCAL_ADAPTER_PATH, LOCAL_BODY_METRIC_PATH]),
    adapter?.manifestSha256 ?? null, bodyMetric?.manifestSha256 ?? null, ridgeAdapter?.manifestSha256 ?? null]);
  if (lastGraphBundle?.key === graphKey && lastGraphBundle.snapshot.growthSeriesId === current.point.seriesId) {
    return { snapshot: lastGraphBundle.snapshot, preview: lastGraphBundle.preview, growth };
  }
  let snapshot;
  try { snapshot = buildDashboardSnapshotV2(current.state, { now }); }
  catch (error) {
    if (!(error instanceof DashboardGraphCapacityError)) throw error;
    // The source pins counts and catalog rows to one snapshot, so this is only
    // a defense against a caller supplying a lower graph limit than this CLI.
    return { snapshot: buildStatsOnlyDashboardSnapshotV2(current.point), preview: null, growth };
  }
  const preview = buildGroupingPreview(current.state, snapshot, adapter, bodyMetric, ridgeAdapter);
  lastGraphBundle = { key: graphKey, snapshot, preview };
  return { snapshot, preview, growth };
}

function dashboardArtifactKeys(filenames) {
  return filenames.map(filename => {
    try { const info = lstatSync(filename); return [info.size, info.mtimeMs, info.ctimeMs, info.isFile(), info.isSymbolicLink()]; }
    catch { return "absent"; }
  });
}

export function readDashboardRefreshKey(databasePath = APP_DATABASE_PATH, {
  ridgePath = LOCAL_RIDGE_ADAPTER_PATH, adapterPath = LOCAL_ADAPTER_PATH,
  bodyPath = LOCAL_BODY_METRIC_PATH, growthPath = path.join(path.dirname(databasePath), "topic-growth.sqlite") } = {}) {
  const artifactKeys = dashboardArtifactKeys([ridgePath, adapterPath, bodyPath, growthPath]);
  return JSON.stringify([readDashboardRevision(databasePath), ...artifactKeys]);
}

export async function readPostgresDashboardRefreshKey(source, {
  ridgePath = LOCAL_RIDGE_ADAPTER_PATH, adapterPath = LOCAL_ADAPTER_PATH,
  bodyPath = LOCAL_BODY_METRIC_PATH,
  growthPath = path.join(path.dirname(APP_DATABASE_PATH), CATALOG_GROWTH_V2_FILENAME) } = {}) {
  if (!source || typeof source.readRevision !== "function") throw new TypeError("Invalid PostgreSQL dashboard source");
  if(['hierarchy17','hierarchy18'].includes(source.schemaProfile))return JSON.stringify([await source.readRevision(),...dashboardArtifactKeys([growthPath])]);
  return JSON.stringify([await source.readRevision(), ...dashboardArtifactKeys([ridgePath, adapterPath, bodyPath, growthPath])]);
}

export function startPostgresDashboardGrowthSampler({ source,
  growthPath = path.join(path.dirname(APP_DATABASE_PATH), CATALOG_GROWTH_V2_FILENAME),
  now = () => new Date(), setIntervalImpl = setInterval, clearIntervalImpl = clearInterval,
  onOutcome = () => {} } = {}) {
  if (!source || typeof source.readCounts !== "function" || typeof growthPath !== "string" || !path.isAbsolute(growthPath) ||
      typeof now !== "function" || typeof setIntervalImpl !== "function" || typeof clearIntervalImpl !== "function" ||
      typeof onOutcome !== "function") throw new TypeError("Invalid PostgreSQL dashboard growth sampler");
  return startCatalogGrowthSamplerV2({ databasePath: growthPath, filename: growthPath, now,
    readCounts: (_databasePath, options) => source.readCounts(options),
    setIntervalImpl, clearIntervalImpl, onOutcome });
}

// The revision includes generation because a reset can start again at revision zero.
export function readDashboardRevision(databasePath = APP_DATABASE_PATH) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    // Poll only storage metadata, never catalog payloads or legacy documents.
    const objects = database.prepare("SELECT name, type FROM sqlite_master WHERE name IN ('canonical_meta', 'demo_state')").all();
    const normalized = objects.find(object => object.name === "canonical_meta");
    const metadata = normalized ?? objects.find(object => object.name === "demo_state");
    if (!metadata || metadata.type !== "table") throw new Error("Unsupported dashboard database schema");
    const row = database.prepare(normalized
      ? "SELECT format, schema, generation, revision FROM canonical_meta WHERE singleton = 1"
      : "SELECT schema, generation, revision FROM demo_state WHERE singleton = 1").get();
    if (!row || (normalized && (!([NORMALIZED_STORAGE_FORMAT, NORMALIZED_FIXED_REFERENCE_STORAGE_FORMAT].includes(row.format)) ||
        (row.schema === FIXED_REFERENCE_STATE_SCHEMA) !== (row.format === NORMALIZED_FIXED_REFERENCE_STORAGE_FORMAT))) ||
        !["demo-state/v2", ACCOUNT_STATE_SCHEMA, FIXED_REFERENCE_STATE_SCHEMA].includes(row.schema)) {
      throw new Error("Unsupported or incomplete dashboard snapshot");
    }
    try { readExpectedVersion({ generation: row.generation, revision: row.revision }); }
    catch { throw new Error("Unsupported or incomplete dashboard snapshot"); }
    return JSON.stringify([row.generation, row.revision]);
  } finally {
    database.close();
  }
}

export function generateDashboard({ databasePath = APP_DATABASE_PATH, outputPath = DEFAULT_REPORT_PATH,
  now = () => new Date(), adapter, bodyMetric, ridgeAdapter, formatVersion = 1 } = {}) {
  const installed = adapter === undefined && bodyMetric === undefined && ridgeAdapter === undefined ? readInstalledOwnerTopicConfiguration() : {};
  const { snapshot, preview, growth } = readDashboardBundle(databasePath, now,
    adapter ?? installed.alternateAdapter ?? null, bodyMetric ?? installed.alternateBodyMetric ?? null,
    ridgeAdapter ?? installed.alternateRidgeAdapter ?? null, { recordInitial: true, formatVersion });
  const document = renderDashboardDocument({
    template: readFileSync(path.join(webPath, "index.html"), "utf8"),
    style: readFileSync(path.join(webPath, "style.css"), "utf8"),
    script: readFileSync(path.join(webPath, "app.js"), "utf8"),
    snapshot, preview, growth,
  });
  writePrivateAtomic(path.join(path.dirname(outputPath), SNAPSHOT_FILE), renderSnapshotScript(snapshot, preview, growth));
  writePrivateAtomic(outputPath, document);
  return { outputPath, counts: snapshot.counts };
}

export function generateDashboardSnapshot({ databasePath = APP_DATABASE_PATH, outputPath = DEFAULT_REPORT_PATH,
  now = () => new Date(), adapter, bodyMetric, ridgeAdapter, formatVersion = 1 } = {}) {
  const installed = adapter === undefined && bodyMetric === undefined && ridgeAdapter === undefined ? readInstalledOwnerTopicConfiguration() : {};
  const { snapshot, preview, growth } = readDashboardBundle(databasePath, now,
    adapter ?? installed.alternateAdapter ?? null, bodyMetric ?? installed.alternateBodyMetric ?? null,
    ridgeAdapter ?? installed.alternateRidgeAdapter ?? null, { formatVersion });
  writePrivateAtomic(path.join(path.dirname(outputPath), SNAPSHOT_FILE), renderSnapshotScript(snapshot, preview, growth));
  return { outputPath, counts: snapshot.counts };
}

export async function generatePostgresDashboard({ source, outputPath = DEFAULT_REPORT_PATH,
  growthPath = path.join(path.dirname(APP_DATABASE_PATH), CATALOG_GROWTH_V2_FILENAME),
  now = () => new Date(), adapter, bodyMetric, ridgeAdapter } = {}) {
  const hierarchy=['hierarchy17','hierarchy18'].includes(source?.schemaProfile);
  const installed = !hierarchy && adapter === undefined && bodyMetric === undefined && ridgeAdapter === undefined ? readInstalledOwnerTopicConfiguration() : {};
  const { snapshot, preview, growth } = await readPostgresDashboardBundle(source, growthPath, now,
    hierarchy?null:adapter ?? installed.alternateAdapter ?? null, hierarchy?null:bodyMetric ?? installed.alternateBodyMetric ?? null,
    hierarchy?null:ridgeAdapter ?? installed.alternateRidgeAdapter ?? null, { recordInitial: true });
  const document = renderDashboardDocument({
    template: readFileSync(path.join(webPath, "index.html"), "utf8"),
    style: readFileSync(path.join(webPath, "style.css"), "utf8"),
    script: readFileSync(path.join(webPath, "app.js"), "utf8"),
    snapshot, preview, growth,
  });
  writePrivateAtomic(path.join(path.dirname(outputPath), SNAPSHOT_FILE), renderSnapshotScript(snapshot, preview, growth));
  writePrivateAtomic(outputPath, document);
  return { outputPath, counts: snapshot.counts };
}

export async function generatePostgresDashboardSnapshot({ source, outputPath = DEFAULT_REPORT_PATH,
  growthPath = path.join(path.dirname(APP_DATABASE_PATH), CATALOG_GROWTH_V2_FILENAME),
  now = () => new Date(), adapter, bodyMetric, ridgeAdapter } = {}) {
  const hierarchy=['hierarchy17','hierarchy18'].includes(source?.schemaProfile);
  const installed = !hierarchy && adapter === undefined && bodyMetric === undefined && ridgeAdapter === undefined ? readInstalledOwnerTopicConfiguration() : {};
  const { snapshot, preview, growth } = await readPostgresDashboardBundle(source, growthPath, now,
    hierarchy?null:adapter ?? installed.alternateAdapter ?? null, hierarchy?null:bodyMetric ?? installed.alternateBodyMetric ?? null,
    hierarchy?null:ridgeAdapter ?? installed.alternateRidgeAdapter ?? null);
  writePrivateAtomic(path.join(path.dirname(outputPath), SNAPSHOT_FILE), renderSnapshotScript(snapshot, preview, growth));
  return { outputPath, counts: snapshot.counts };
}

function writePrivateAtomic(outputPath, contents) {
  const outputDir = path.dirname(outputPath);
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const directory = lstatSync(outputDir);
  const actualDir = realpathSync.native(outputDir);
  const canonicalParent = realpathSync.native(path.dirname(outputDir));
  const expectedDir = path.join(canonicalParent, path.basename(outputDir));
  if (!directory.isDirectory() || directory.isSymbolicLink() ||
      (process.platform === "win32" ? actualDir.toLowerCase() !== expectedDir.toLowerCase() : actualDir !== expectedDir) ||
      (process.platform !== "win32" &&
        (directory.uid !== process.getuid() || (directory.mode & 0o077) !== 0))) {
    throw new Error("Dashboard output directory is not a private regular directory");
  }
  if (existsSync(outputPath) && (!lstatSync(outputPath).isFile() || lstatSync(outputPath).isSymbolicLink())) {
    throw new Error("Dashboard output path is not a regular file");
  }
  const pending = path.join(outputDir, `.dashboard-${randomUUID()}.tmp`);
  writeFileSync(pending, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
  renameSync(pending, outputPath);
}

export function watchDashboard({ readRevision = readDashboardRefreshKey, generate = generateDashboardSnapshot,
  intervalMs = 1_000, initialRevision, onError = () => {},
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let revision = initialRevision;
  let stopped = false;
  let timer;
  let lastError;
  const schedule = () => { if (!stopped) timer = setTimer(tick, intervalMs); };
  async function tick() {
    timer = undefined;
    if (stopped) return;
    try {
      const current = await readRevision();
      if (current !== revision) {
        await generate();
        revision = current;
      }
      lastError = undefined;
    } catch (error) {
      // A locked or temporarily unavailable database is retried on the next tick.
      if (error.message !== lastError) onError(error);
      lastError = error.message;
    } finally {
      schedule();
    }
  }
  schedule();
  return { stop() { stopped = true; if (timer !== undefined) clearTimer(timer); } };
}

function openReport(reportPath) {
  const program = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  return new Promise((resolve, reject) => {
    const child = spawn(program, [reportPath], { detached: true, stdio: "ignore", windowsHide: false });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}

export async function runDashboardCli(args = process.argv.slice(2)) {
  if (args.some((arg) => arg !== "--no-open")) throw new Error("Use only --no-open, or run without arguments");
  const oneShot = args.includes("--no-open");
  const revision = () => readDashboardRefreshKey(APP_DATABASE_PATH, { growthPath: path.join(path.dirname(APP_DATABASE_PATH), CATALOG_GROWTH_V2_FILENAME) });
  const initialRevision = oneShot ? undefined : revision();
  const result = generateDashboard({ formatVersion: 2 });
  if (!oneShot) await openReport(result.outputPath);
  process.stdout.write(`Dashboard ready: ${result.counts.learnedSources} captured pages; ${result.counts.multiMemberTopics} canonical Topics (at least two learned pages), ${result.counts.singletonTopics} singleton Topics${result.counts.displayedPages === 0 && result.counts.learnedSources > MAX_GRAPH_PAGES ? "; graph paused, aggregate history remains available" : ""}.\n${result.outputPath}\n`);
  if (!oneShot) {
    const watcher = watchDashboard({ initialRevision, readRevision: revision, generate: () => generateDashboardSnapshot({ formatVersion: 2 }),
      onError: (error) => process.stderr.write(`Dashboard refresh delayed: ${error.message}\n`) });
    for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
      process.once(signal, () => { watcher.stop(); process.exitCode = code; });
    }
  }
  return result;
}

// Startup owns credential loading and pool lifecycle. The dashboard accepts an
// already-created read-only source, so no password, URL, or fallback SQLite path
// is embedded in this package.
export async function runPostgresDashboardCli({ source, args = process.argv.slice(2),
  growthPath = path.join(path.dirname(APP_DATABASE_PATH), CATALOG_GROWTH_V2_FILENAME) } = {}) {
  if (args.some(arg => arg !== "--no-open")) throw new Error("Use only --no-open, or run without arguments");
  const oneShot = args.includes("--no-open");
  const revision = () => readPostgresDashboardRefreshKey(source, { growthPath });
  const initialRevision = oneShot ? undefined : await revision();
  const result = await generatePostgresDashboard({ source, growthPath });
  if (!oneShot) await openReport(result.outputPath);
  if(['hierarchy17','hierarchy18'].includes(source.schemaProfile)){
    const counts=result.counts.semantic,legacy=result.counts.legacyContainers;
    process.stdout.write(`Semantic dashboard ready: ${counts.currentHeadClassifiedSources} classified Sources; ${counts.currentHeadPendingSources} pending; ${counts.configuredDisplayGroups} configured display groups; ${counts.distinctRoots} distinct visible semantic roots. Legacy containers: ${legacy.multiMember} multi-member, ${legacy.singleton} singleton.\n${result.outputPath}\n`);
  }else{
  process.stdout.write(`Dashboard ready: ${result.counts.learnedSources} captured pages; ${result.counts.multiMemberTopics} canonical Topics (at least two learned pages), ${result.counts.singletonTopics} singleton Topics${result.counts.displayedPages === 0 && result.counts.learnedSources > MAX_GRAPH_PAGES ? "; graph paused, aggregate history remains available" : ""}.\n${result.outputPath}\n`);
  }
  if (!oneShot) {
    const growthSampler = startPostgresDashboardGrowthSampler({ source, growthPath,
      onOutcome: value => {
        if (value.outcome === "failed") process.stderr.write("Dashboard growth sampling delayed; retrying.\n");
      } });
    const watcher = watchDashboard({ initialRevision, readRevision: revision,
      generate: () => generatePostgresDashboardSnapshot({ source, growthPath }),
      onError: error => process.stderr.write(`Dashboard refresh delayed: ${error.message}\n`) });
    for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
      process.once(signal, () => { watcher.stop(); void growthSampler.close().catch(() => {}); process.exitCode = code; });
    }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDashboardCli().catch((error) => {
    process.stderr.write(`Dashboard could not start: ${error.message}\n`);
    process.exitCode = 1;
  });
}
