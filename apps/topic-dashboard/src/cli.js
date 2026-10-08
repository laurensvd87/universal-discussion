import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { APP_DATABASE_PATH } from "../../local-service/src/startup.js";
import { loadDashboardData } from "./data/catalog.js";

const webPath = fileURLToPath(new URL("../web/", import.meta.url));
export const DEFAULT_REPORT_PATH = path.join(tmpdir(), "universal-discussion-dashboard", "dashboard.html");
const styleTag = '<link rel="stylesheet" href="./style.css" data-dashboard-style>';
const scriptTag = '<script src="./app.js" defer data-dashboard-script></script>';
const dataTag = '<script id="dashboard-data" type="application/json"></script>';

function replaceOnce(document, needle, replacement) {
  if (document.split(needle).length !== 2) throw new Error("Dashboard template changed unexpectedly");
  return document.replace(needle, replacement);
}

export function renderDashboardDocument({ template, style, script, snapshot }) {
  const safeJson = JSON.stringify(snapshot).replaceAll("<", "\\u003c").replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
  let document = replaceOnce(template, styleTag, `<style>${style}</style>`);
  document = replaceOnce(document, scriptTag, `<script>${script}</script>`);
  return replaceOnce(document, dataTag, `<script id="dashboard-data" type="application/json">${safeJson}</script>`);
}

export function generateDashboard({ databasePath = APP_DATABASE_PATH, outputPath = DEFAULT_REPORT_PATH,
  now = () => new Date() } = {}) {
  const snapshot = loadDashboardData(databasePath, { now });
  const document = renderDashboardDocument({
    template: readFileSync(path.join(webPath, "index.html"), "utf8"),
    style: readFileSync(path.join(webPath, "style.css"), "utf8"),
    script: readFileSync(path.join(webPath, "app.js"), "utf8"),
    snapshot,
  });
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
  writeFileSync(pending, document, { encoding: "utf8", mode: 0o600, flag: "wx" });
  renameSync(pending, outputPath);
  return { outputPath, counts: snapshot.counts };
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
  const result = generateDashboard();
  if (!args.includes("--no-open")) await openReport(result.outputPath);
  process.stdout.write(`Dashboard ready: ${result.counts.displayedPages} captured pages in ${result.counts.topics} Topics.\n${result.outputPath}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDashboardCli().catch((error) => {
    process.stderr.write(`Dashboard could not start: ${error.message}\n`);
    process.exitCode = 1;
  });
}
