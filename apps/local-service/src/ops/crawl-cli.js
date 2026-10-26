import path from "node:path";
import { fileURLToPath } from "node:url";
import { types } from "node:util";
import { createCrawlState } from "../crawler/crawl-state.js";
import { DEFAULT_CRAWL_LIMITS, runCrawler } from "../crawler/crawl-runner.js";
import { CrawlerApiError, createLocalIngestClient, fixedIngestError, fixedIngestDetail } from "../crawler/local-ingest-client.js";
import { createPackagedCrawlerEmbedder } from "../crawler/packaged-e5.js";
import { fetchPublicResource } from "../crawler/public-fetch.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STATE_FILE = path.join(ROOT, "data", "topic-crawler.sqlite");
const STOP_CODES = new Set(["aborted", "time-limit", "policy-unavailable", "policy-state-invalid", "embedding-unavailable",
  "request-capacity", "request-too-large", "invalid-response", "invalid-request", "unauthorized", "forbidden", "conflict", "capacity",
  "unavailable", "ambiguous", "response-timeout", "service-error", "service-unavailable"]);
const FATAL_NAMES = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "AbortError", "PublicFetchError", "CrawlerRunError", "CrawlerApiError"]);
const FATAL_CODES = new Set(["ERR_SQLITE_ERROR", "ERR_OUT_OF_RANGE", "ERR_INVALID_ARG_TYPE", "ERR_INVALID_STATE",
  "ERR_BUFFER_TOO_LARGE", "ERR_MEMORY_ALLOCATION_FAILED", "ERR_WORKER_OUT_OF_MEMORY", "ENOMEM", "EIO", "ENOSPC", "EMFILE", "ENFILE", "EACCES", "EPERM", "EPIPE"]);
const SQLITE_PRIMARY = Object.freeze({1:"SQLITE_ERROR",2:"SQLITE_INTERNAL",3:"SQLITE_PERM",4:"SQLITE_ABORT",5:"SQLITE_BUSY",6:"SQLITE_LOCKED",
  7:"SQLITE_NOMEM",8:"SQLITE_READONLY",9:"SQLITE_INTERRUPT",10:"SQLITE_IOERR",11:"SQLITE_CORRUPT",12:"SQLITE_NOTFOUND",
  13:"SQLITE_FULL",14:"SQLITE_CANTOPEN",15:"SQLITE_PROTOCOL",16:"SQLITE_EMPTY",17:"SQLITE_SCHEMA",18:"SQLITE_TOOBIG",
  19:"SQLITE_CONSTRAINT",20:"SQLITE_MISMATCH",21:"SQLITE_MISUSE",22:"SQLITE_NOLFS",23:"SQLITE_AUTH",24:"SQLITE_FORMAT",
  25:"SQLITE_RANGE",26:"SQLITE_NOTADB",27:"SQLITE_NOTICE",28:"SQLITE_WARNING"});

// No messages, stacks, paths, URLs, subjects or nested causes cross this boundary.
export function classifyCrawlerFatal(error) {
  try {
    if(error===null || !["object","function"].includes(typeof error) || types.isProxy(error))return Object.freeze({name:"unknown",code:"unknown"});
    const ownValue=key=>{const descriptor=Object.getOwnPropertyDescriptor(error,key);return descriptor&&Object.hasOwn(descriptor,"value")?descriptor.value:undefined;};
    const ownName=ownValue("name"), ownCode=ownValue("code"), number=ownValue("errcode");
    let name=FATAL_NAMES.has(ownName)?ownName:"unknown";
    if(name==="unknown"&&!Object.hasOwn(error,"name")){
      const prototype=Object.getPrototypeOf(error);
      if(prototype===Error.prototype)name="Error";
      else if(prototype===TypeError.prototype)name="TypeError";
      else if(prototype===RangeError.prototype)name="RangeError";
      else if(prototype===SyntaxError.prototype)name="SyntaxError";
    }
    const code=FATAL_CODES.has(ownCode)||STOP_CODES.has(ownCode)?ownCode:"unknown";
    return Object.freeze({name,code,...(code==="ERR_SQLITE_ERROR"&&Number.isSafeInteger(number)&&number>0&&number<=65535&&
      Object.hasOwn(SQLITE_PRIMARY,number&255)?{sqliteCode:number,sqlitePrimary:SQLITE_PRIMARY[number&255]}:{})});
  }catch{return Object.freeze({name:"unknown",code:"unknown"});}
}

export function createProgressReporter({ write = value => process.stdout.write(value),
  schedule = setInterval, cancel = clearInterval } = {}) {
  const events = new Set(["phase", "checkpoint", "page", "ingested", "ingest-failed", "complete", "catalog-page", "read-retry"]);
  const phases = new Set(["loading-model", "connecting", "crawling", "policy", "fetching", "embedding", "applying", "complete"]);
  let latest = null, closed = false;
  function print() {
    if (!latest || closed) return;
    const catalog = latest.catalogPages === undefined ? '' : ` catalogPages=${latest.catalogPages} catalogSources=${latest.catalogSources}`;
    try { write(`Crawler ${latest.phase}: attempted=${latest.attemptedThisRun} staged=${latest.stagedThisRun} ingested=${latest.ingestedThisRun}${catalog}\n`); }
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
      if (value.event === "catalog-page" && Number.isSafeInteger(value.catalogPages) && value.catalogPages >= 0 &&
          Number.isSafeInteger(value.catalogSources) && value.catalogSources >= 0) {
        latest.catalogPages = value.catalogPages; latest.catalogSources = value.catalogSources;
        if (value.catalogPages % 25 === 0) print();
      }
      if (value.event === "read-retry" && Number.isSafeInteger(value.retry) && value.retry > 0 &&
          Number.isSafeInteger(value.delayMs) && value.delayMs > 0 && value.delayMs <= 16_000) {
        const code = fixedIngestError(new CrawlerApiError(value.readError));
        try { write(`Crawler read retry: ${code} attempt=${value.retry} delayMs=${value.delayMs}\n`); } catch {}
      }
      if (value.event === "ingest-failed") {
        const code = typeof value.ingestError === "string" ? fixedIngestError(new CrawlerApiError(value.ingestError)) : "unknown";
        try { write(`Crawler ingest failed: ${code}\n`); } catch {}
        const detail = fixedIngestDetail(new CrawlerApiError(code, value.ingestDetail));
        if (detail) { try { write(`Crawler ingest detail: ${detail}\n`); } catch {} }
        print();
      }
      if (["checkpoint", "complete"].includes(value.event) || value.event === "phase" && ["connecting", "crawling"].includes(value.phase) ||
          value.event === "page" && value.attemptedThisRun % 25 === 0) print();
    },
    close() { if (!closed) { closed = true; cancel(timer); } },
    snapshot() { return latest ? Object.freeze({...latest}) : null; },
  });
}

function usage() {
  return `Murmingle owner-local topic crawler

The normal PowerShell launcher supplies the pairing token through hidden stdin.
Default mode performs real public fetching and durable staging, but no canonical writes.

Options:
  --apply                 Continuously ingest diverse checkpoints until stopped or exhausted
  --max-pages N           Optional durable campaign cap, 0..50000; 0 is unlimited (default)
  --max-depth N           Link depth, -1 unlimited (default), 0 seeds only, or 1..8
  --per-host N            Optional durable per-origin page cap; 0 is unlimited (default)
  --per-section N         Optional selection cap per subject/origin section; 0 is unlimited (default)
  --max-minutes N         Stop this invocation after N minutes; 0 is unlimited
  --rebase-state          Abandon unfinished work if the canonical generation changed
  --token-stdin           Read exactly one pairing token from stdin
  --help                  Show this text without reading a token
`;
}

function integer(value, minimum, maximum) {
  if (typeof value !== "string" || !/^(?:-1|0|[1-9][0-9]*)$/u.test(value)) throw new Error("invalid-arguments");
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new Error("invalid-arguments");
  return number;
}

export function argumentsFrom(argv) {
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
      if (flag === "--max-pages") options.maxPages = integer(value, 0, 50_000);
      else if (flag === "--max-depth") options.maxDepth = integer(value, -1, 8);
      else if (flag === "--per-host") options.perHost = integer(value, 0, 50_000);
      else if (flag === "--per-section") options.perSection = integer(value, 0, 10_000);
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

export async function runCrawlerCli({ args = process.argv.slice(2), tokenReader = readToken,
  clientFactory = token => createLocalIngestClient({ token }),
  embedderFactory = createPackagedCrawlerEmbedder,
  stateFactory = () => createCrawlState({ filename: STATE_FILE }),
  fetchPublic = fetchPublicResource,
  write = value => process.stdout.write(value), errorWrite = value => process.stderr.write(value) } = {}) {
  if (typeof tokenReader !== "function" || typeof clientFactory !== "function" || typeof embedderFactory !== "function" ||
      typeof stateFactory !== "function" || typeof fetchPublic !== "function" || typeof write !== "function" || typeof errorWrite !== "function")
    throw new TypeError("Invalid crawler CLI dependencies");
  let options;
  try { options = argumentsFrom(args); }
  catch (error) {
    errorWrite(`Crawler could not start: ${error.message}\n`);
    errorWrite(usage());
    process.exitCode = 2;
    return;
  }
  if (options.help) { write(usage()); return; }
  let token;
  try { token = await tokenReader(); }
  catch (error) { errorWrite(`Crawler could not start: ${error.message}\n`); process.exitCode = 2; return; }

  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  let client, embedder, state, progress;
  try {
    client = await clientFactory(token);
    if (!client || typeof client.knownSourceUrls !== "function" || typeof client.ingest !== "function")
      throw new TypeError("Invalid crawler client");
    token = null;
    write(`Crawler mode: ${options.apply ? "apply" : "preview"}; verifying assets and loading local model.\n`);
    progress = createProgressReporter({ write });
    progress.onProgress({ event: "phase", phase: "loading-model", attemptedThisRun: 0, stagedThisRun: 0, ingestedThisRun: 0 });
    embedder = await embedderFactory();
    state = stateFactory();
    const result = await runCrawler({ state, client, fetchPublic, embedder,
      apply: options.apply, rebase: options.rebase, maxPages: options.maxPages, maxDepth: options.maxDepth,
      perHost: options.perHost, perSection: options.perSection, maxDurationMs: options.maxDurationMs,
      signal: controller.signal, onProgress: progress.onProgress });
    write(`${JSON.stringify(result, null, 2)}\n`);
    if (["ingest-unavailable", "embedding-unavailable"].includes(result.reason)) process.exitCode = 1;
    else if (result.reason === "aborted") process.exitCode = 130;
    return result;
  } catch (error) {
    const fatal=classifyCrawlerFatal(error);
    const code = STOP_CODES.has(fatal.code) ? fatal.code : "crawler-failed";
    errorWrite(`Crawler stopped: ${code}\n`);
    if(code==="crawler-failed")errorWrite(`Crawler fatal: ${JSON.stringify({...fatal,progress:progress?.snapshot()??null})}\n`);
    process.exitCode = code === "aborted" ? 130 : 1;
  } finally {
    token = null;
    progress?.close();
    try { state?.close(); } catch { process.exitCode = 1; }
    try { await embedder?.close(); } catch { process.exitCode = 1; }
    try { await client?.close?.(); } catch { process.exitCode = 1; }
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCrawlerCli();
