import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { APP_DATABASE_PATH } from "../../local-service/src/startup.js";
import { buildDashboardSnapshot, loadDashboardState } from "./data/catalog.js";
import { buildGroupingPreview, LOCAL_ADAPTER_PATH, LOCAL_BODY_METRIC_PATH, LOCAL_RIDGE_ADAPTER_PATH, readInstalledOwnerTopicConfiguration } from "./data/grouping-preview.js";

const webPath = fileURLToPath(new URL("../web/", import.meta.url));
export const DEFAULT_REPORT_PATH = path.join(tmpdir(), "universal-discussion-dashboard", "dashboard.html");
const styleTag = '<link rel="stylesheet" href="./style.css" data-dashboard-style>';
const scriptTag = '<script src="./app.js" defer data-dashboard-script></script>';
const dataTag = '<script id="dashboard-data" type="application/json"></script>';
const previewTag = '<script id="dashboard-preview-data" type="application/json"></script>';
const SNAPSHOT_FILE = "snapshot.js";

function replaceOnce(document, needle, replacement) {
  if (document.split(needle).length !== 2) throw new Error("Dashboard template changed unexpectedly");
  return document.replace(needle, replacement);
}

export function renderDashboardDocument({ template, style, script, snapshot, preview = null }) {
  const safeJson = serializeSnapshot(snapshot);
  let document = replaceOnce(template, styleTag, `<style>${style}</style>`);
  document = replaceOnce(document, scriptTag, `<script>${script}</script>`);
  document = replaceOnce(document, dataTag, `<script id="dashboard-data" type="application/json">${safeJson}</script>`);
  if (document.includes(previewTag)) document = replaceOnce(document, previewTag,
    `<script id="dashboard-preview-data" type="application/json">${serializeSnapshot(preview)}</script>`);
  return document;
}

function serializeSnapshot(snapshot) {
  return JSON.stringify(snapshot).replaceAll("<", "\\u003c").replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

export function renderSnapshotScript(snapshot, preview = null) {
  return `globalThis.__topicAtlasSnapshot = ${serializeSnapshot(snapshot)};\n` +
    `globalThis.__topicAtlasPreview = ${serializeSnapshot(preview)};\n`;
}

function readDashboardBundle(databasePath, now, adapter, bodyMetric, ridgeAdapter) {
  const state = loadDashboardState(databasePath);
  const snapshot = buildDashboardSnapshot(state, { now });
  const preview = buildGroupingPreview(state, snapshot, adapter, bodyMetric, ridgeAdapter);
  return { snapshot, preview };
}

export function readDashboardRefreshKey(databasePath = APP_DATABASE_PATH, {
  ridgePath = LOCAL_RIDGE_ADAPTER_PATH, adapterPath = LOCAL_ADAPTER_PATH,
  bodyPath = LOCAL_BODY_METRIC_PATH } = {}) {
  const artifactKeys = [ridgePath, adapterPath, bodyPath].map(filename => {
    try { const info = lstatSync(filename); return [info.size, info.mtimeMs, info.ctimeMs, info.isFile(), info.isSymbolicLink()]; }
    catch { return "absent"; }
  });
  return JSON.stringify([readDashboardRevision(databasePath), ...artifactKeys]);
}

// The revision includes generation because a reset can start again at revision zero.
export function readDashboardRevision(databasePath = APP_DATABASE_PATH) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = database.prepare("SELECT schema, generation, revision FROM demo_state WHERE singleton = 1").get();
    if (!row || row.schema !== "demo-state/v2" || typeof row.generation !== "string" ||
        !Number.isSafeInteger(row.revision) || row.revision < 0) {
      throw new Error("Unsupported or incomplete dashboard snapshot");
    }
    return JSON.stringify([row.generation, row.revision]);
  } finally {
    database.close();
  }
}

export function generateDashboard({ databasePath = APP_DATABASE_PATH, outputPath = DEFAULT_REPORT_PATH,
  now = () => new Date(), adapter, bodyMetric, ridgeAdapter } = {}) {
  const installed = adapter === undefined && bodyMetric === undefined && ridgeAdapter === undefined ? readInstalledOwnerTopicConfiguration() : {};
  const { snapshot, preview } = readDashboardBundle(databasePath, now,
    adapter ?? installed.alternateAdapter ?? null, bodyMetric ?? installed.alternateBodyMetric ?? null,
    ridgeAdapter ?? installed.alternateRidgeAdapter ?? null);
  const document = renderDashboardDocument({
    template: readFileSync(path.join(webPath, "index.html"), "utf8"),
    style: readFileSync(path.join(webPath, "style.css"), "utf8"),
    script: readFileSync(path.join(webPath, "app.js"), "utf8"),
    snapshot, preview,
  });
  writePrivateAtomic(path.join(path.dirname(outputPath), SNAPSHOT_FILE), renderSnapshotScript(snapshot, preview));
  writePrivateAtomic(outputPath, document);
  return { outputPath, counts: snapshot.counts };
}

export function generateDashboardSnapshot({ databasePath = APP_DATABASE_PATH, outputPath = DEFAULT_REPORT_PATH,
  now = () => new Date(), adapter, bodyMetric, ridgeAdapter } = {}) {
  const installed = adapter === undefined && bodyMetric === undefined && ridgeAdapter === undefined ? readInstalledOwnerTopicConfiguration() : {};
  const { snapshot, preview } = readDashboardBundle(databasePath, now,
    adapter ?? installed.alternateAdapter ?? null, bodyMetric ?? installed.alternateBodyMetric ?? null,
    ridgeAdapter ?? installed.alternateRidgeAdapter ?? null);
  writePrivateAtomic(path.join(path.dirname(outputPath), SNAPSHOT_FILE), renderSnapshotScript(snapshot, preview));
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
  const initialRevision = oneShot ? undefined : readDashboardRefreshKey();
  const result = generateDashboard();
  if (!oneShot) await openReport(result.outputPath);
  process.stdout.write(`Dashboard ready: ${result.counts.displayedPages} captured pages in ${result.counts.topics} Topics.\n${result.outputPath}\n`);
  if (!oneShot) {
    const watcher = watchDashboard({ initialRevision,
      onError: (error) => process.stderr.write(`Dashboard refresh delayed: ${error.message}\n`) });
    for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
      process.once(signal, () => { watcher.stop(); process.exitCode = code; });
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
