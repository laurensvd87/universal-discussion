import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCrawlState } from "../crawler/crawl-state.js";
import { DEFAULT_CRAWL_LIMITS, runCrawler } from "../crawler/crawl-runner.js";
import { CrawlerApiError, createLocalIngestClient, fixedIngestError } from "../crawler/local-ingest-client.js";
import { createPackagedCrawlerEmbedder } from "../crawler/packaged-e5.js";
import { fetchPublicResource } from "../crawler/public-fetch.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STATE_FILE = path.join(ROOT, "data", "topic-crawler.sqlite");
const STOP_CODES = new Set(["aborted", "time-limit", "policy-unavailable", "policy-state-invalid", "embedding-unavailable",
  "request-capacity", "request-too-large", "invalid-response", "invalid-request", "unauthorized", "forbidden", "conflict", "capacity",
  "unavailable", "ambiguous"]);

export function createProgressReporter({ write = value => process.stdout.write(value),
  schedule = setInterval, cancel = clearInterval } = {}) {
  const events = new Set(["phase", "checkpoint", "page", "ingested", "ingest-failed", "complete"]);
  const phases = new Set(["loading-model", "connecting", "crawling", "policy", "fetching", "embedding", "applying", "complete"]);
  let latest = null, closed = false;
  function print() {
    if (!latest || closed) return;
    try { write(`Crawler ${latest.phase}: attempted=${latest.attemptedThisRun} staged=${latest.stagedThisRun} ingested=${latest.ingestedThisRun}\n`); }
    catch {}
  }
  const timer = schedule(print, 15_000);
  timer?.unref?.();
  return Object.freeze({
    onProgress(value) {
      if (closed || !value || !events.has(value.event) || !phases.has(value.phase) ||
          ![value.attemptedThisRun, value.stagedThisRun, value.ingestedThisRun].every(number => Number.isSafeInteger(number) && number >= 0)) return;
      latest = { phase: value.phase, attemptedThisRun: value.attemptedThisRun,
        stagedThisRun: value.stagedThisRun, ingestedThisRun: value.ingestedThisRun };
      if (value.event === "ingest-failed") {
        const code = typeof value.ingestError === "string" ? fixedIngestError(new CrawlerApiError(value.ingestError)) : "unknown";
        try { write(`Crawler ingest failed: ${code}\n`); } catch {}
        print();
      }
      if (["checkpoint", "complete"].includes(value.event) || value.event === "phase" && ["connecting", "crawling"].includes(value.phase) ||
          value.event === "page" && value.attemptedThisRun % 25 === 0) print();
    },
    close() { if (!closed) { closed = true; cancel(timer); } },
  });
}

function usage() {
  return `Murmingle owner-local topic crawler

The normal PowerShell launcher supplies the pairing token through hidden stdin.
Default mode performs real public fetching and durable staging, but no canonical writes.

Options:
  --apply                 Ingest a bounded diverse batch into the canonical database
  --max-pages N           Durable campaign cap, 1..50000 (default 5000)
  --max-depth N           Link depth, 0..8 (default 2)
  --per-host N            Durable per-origin page cap (default 1250)
  --per-section N         Selection cap per subject/origin section (default 100)
  --max-minutes N         Stop this invocation after N minutes; 0 is unlimited
  --rebase-state          Abandon unfinished work if the canonical generation changed
  --token-stdin           Read exactly one pairing token from stdin
  --help                  Show this text without reading a token
`;
}

function integer(value, minimum, maximum) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) throw new Error("invalid-arguments");
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new Error("invalid-arguments");
  return number;
}

function argumentsFrom(argv) {
  const options = { apply: false, rebase: false, tokenStdin: false,
    maxPages: DEFAULT_CRAWL_LIMITS.maxPages, maxDepth: DEFAULT_CRAWL_LIMITS.maxDepth,
    perHost: DEFAULT_CRAWL_LIMITS.perHost, perSection: DEFAULT_CRAWL_LIMITS.perSection,
    maxDurationMs: DEFAULT_CRAWL_LIMITS.maxDurationMs };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help") {
      if (argv.length !== 1) throw new Error("invalid-arguments");
      return { help: true };
    }
    if (!["--apply", "--rebase-state", "--token-stdin", "--max-pages", "--max-depth", "--per-host", "--per-section", "--max-minutes"].includes(flag) || seen.has(flag))
      throw new Error("invalid-arguments");
    seen.add(flag);
    if (flag === "--apply") options.apply = true;
    else if (flag === "--rebase-state") options.rebase = true;
    else if (flag === "--token-stdin") options.tokenStdin = true;
    else {
      const value = argv[++index];
      if (flag === "--max-pages") options.maxPages = integer(value, 1, 50_000);
      else if (flag === "--max-depth") options.maxDepth = integer(value, 0, 8);
      else if (flag === "--per-host") options.perHost = integer(value, 1, 50_000);
      else if (flag === "--per-section") options.perSection = integer(value, 1, 10_000);
      else options.maxDurationMs = integer(value, 0, 10_080) * 60_000;
    }
  }
  if (!options.tokenStdin) throw new Error("token-stdin-required");
  return options;
}

async function readToken() {
  if (process.stdin.isTTY) throw new Error("token-stdin-required");
  const chunks = [];
  let size = 0;
  for await (const value of process.stdin) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += chunk.length;
    if (size > 128) { for (const old of chunks) old.fill(0); chunk.fill(0); throw new Error("invalid-token"); }
    chunks.push(Buffer.from(chunk));
  }
  const bytes = Buffer.concat(chunks, size);
  for (const chunk of chunks) chunk.fill(0);
  try {
    const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!/^[A-Za-z0-9_-]{43}(?:\r?\n)?$/u.test(value)) throw new Error("invalid-token");
    return value.replace(/\r?\n$/u, "");
  } finally { bytes.fill(0); }
}

async function main() {
  let options;
  try { options = argumentsFrom(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`Crawler could not start: ${error.message}\n`);
    process.stderr.write(usage());
    process.exitCode = 2;
    return;
  }
  if (options.help) { process.stdout.write(usage()); return; }
  let token;
  try { token = await readToken(); }
  catch (error) { process.stderr.write(`Crawler could not start: ${error.message}\n`); process.exitCode = 2; return; }

  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  let embedder, state, progress;
  try {
    const client = createLocalIngestClient({ token });
    token = null;
    process.stdout.write(`Crawler mode: ${options.apply ? "apply" : "preview"}; verifying assets and loading local model.\n`);
    progress = createProgressReporter();
    progress.onProgress({ event: "phase", phase: "loading-model", attemptedThisRun: 0, stagedThisRun: 0, ingestedThisRun: 0 });
    embedder = await createPackagedCrawlerEmbedder();
    state = createCrawlState({ filename: STATE_FILE });
    const result = await runCrawler({ state, client, fetchPublic: fetchPublicResource, embedder,
      apply: options.apply, rebase: options.rebase, maxPages: options.maxPages, maxDepth: options.maxDepth,
      perHost: options.perHost, perSection: options.perSection, maxDurationMs: options.maxDurationMs,
      signal: controller.signal, onProgress: progress.onProgress });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (["ingest-unavailable", "embedding-unavailable"].includes(result.reason)) process.exitCode = 1;
    else if (result.reason === "aborted") process.exitCode = 130;
  } catch (error) {
    const code = STOP_CODES.has(error?.code) ? error.code : "crawler-failed";
    process.stderr.write(`Crawler stopped: ${code}\n`);
    process.exitCode = 1;
  } finally {
    token = null;
    progress?.close();
    try { state?.close(); } catch { process.exitCode = 1; }
    try { await embedder?.close(); } catch { process.exitCode = 1; }
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
