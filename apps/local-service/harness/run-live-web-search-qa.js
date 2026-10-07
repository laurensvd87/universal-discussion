// Deliberate one-shot SIWC web-search probe. No I/O occurs on import.
// Stop the regular service, then run from apps/local-service:
// node harness/run-live-web-search-qa.js --run-live --case control|publisher --model <listed model slug>
// One Responses POST maximum. This does not change production Insight behavior.
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createChatGPTRegistrationStore } from "../src/ai/chatgpt-runtime.js";
import { createChatGPTConnection } from "../src/ai/chatgpt-connection.js";
import { createProtectedRefreshStore } from "../src/ai/protected-refresh-store.js";

const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const ENDPOINT = "https://api.openai.com/v1/responses";
const MAX_STREAM_BYTES = 4_194_304;
const CASES = Object.freeze({
  control: Object.freeze([
    "https://peps.python.org/pep-0008/",
    "https://peps.python.org/pep-0257/",
  ]),
  publisher: Object.freeze([
    "https://www.standaard.be/buitenland/poetin-gaat-in-kiev-voor-de-totale-destructie-rusland-zal-zo-de-oorlog-niet-winnen-maar-voor-de-oekraners-wordt-het-verschrikkelijk/162649530.html",
  ]),
  newsPair: Object.freeze([
    "https://www.rtl.nl/nieuws/buitenland/artikel/5656001/poetin-roept-15000-nieuwe-militairen-op-leger-telt-nu-15-miljoen",
    "https://www.rd.nl/artikel/poetin-schaalt-per-decreet-omvang-strijdmacht-op",
  ]),
});

function fail(message) { throw new Error(message); }

export function parseArgs(args) {
  if (!args.includes("--run-live")) fail("Explicit --run-live required");
  if (![5, 6].includes(args.length) || args.filter((arg) => arg === "--run-live").length !== 1 ||
      args.filter((arg) => arg === "--case").length !== 1 ||
      args.filter((arg) => arg === "--model").length !== 1 ||
      (args.length === 6 && args.filter((arg) => arg === "--show-result").length !== 1)) fail("Unsupported QA option");
  const caseName = args[args.indexOf("--case") + 1];
  const model = args[args.indexOf("--model") + 1];
  if (!Object.hasOwn(CASES, caseName)) fail("Unknown fixed QA case");
  if (typeof model !== "string" || !/^gpt-[a-z0-9][a-z0-9.-]{0,100}$/u.test(model))
    fail("A model slug is required");
  return { caseName, model, showResult: args.includes("--show-result") };
}

export function buildRequest(caseName, model) {
  const urls = CASES[caseName];
  if (!urls) fail("Unknown fixed QA case");
  const allowedDomains = [...new Set(urls.map((url) => new URL(url).hostname))];
  return {
    model, store: false, stream: true,
    reasoning: { effort: "low" },
    tools: [{ type: "web_search", external_web_access: true,
      filters: { allowed_domains: allowedDomains } }],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    instructions: "Use hosted web search to inspect the specified public URLs. Report only whether the pages can be opened and whether they discuss the same specific subject. Cite supporting pages. If a page is inaccessible, say so; do not infer its content from its title or URL.",
    input: [{ role: "user", content: `Inspect these public pages with web search: ${urls.join(" ; ")}` }],
  };
}

export function oneResponseFetch(fetchImpl = fetch) {
  let count = 0;
  return Object.freeze({
    fetch(url, options) {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash ||
          !["https://auth.openai.com", "https://api.openai.com"].includes(parsed.origin) ||
          parsed.origin === "https://api.openai.com" && parsed.pathname !== "/v1/responses")
        fail("Unexpected provider endpoint");
      if (parsed.href === ENDPOINT) {
        if (options?.method !== "POST" || ++count > 1) fail("One Responses request per invocation");
      }
      return fetchImpl(url, options);
    },
    responsesSent: () => count,
  });
}

// Print only HTTPS URLs with no credentials, query, fragment, or nonstandard port.
function safeUrl(value) {
  try {
    if (typeof value !== "string" || value.length > 2_000) return null;
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
        parsed.search || parsed.hash || parsed.hostname.length > 253) return null;
    return parsed.href;
  } catch { return null; }
}

export function summarizeEvents(events, caseName) {
  if (!Object.hasOwn(CASES, caseName)) fail("Unknown fixed QA case");
  const fixed = new Set(CASES[caseName]);
  let searchCalls = 0;
  let openCalls = 0;
  let status = "incomplete";
  const citations = new Set();
  const sourceHosts = new Set();
  const seenCalls = new Set();
  let answerExcerpt = "";
  const addAnnotations = (output) => {
    if (output?.type !== "message") return;
    for (const part of output.content ?? []) for (const annotation of part.annotations ?? []) {
      if (annotation?.type !== "url_citation") continue;
      const url = safeUrl(annotation.url);
      if (url) citations.add(fixed.has(url) ? url : new URL(url).hostname);
    }
    if (!answerExcerpt && output.status === "completed") {
      const body = output.content?.filter((part) => part?.type === "output_text")
        .map((part) => part.text).filter((part) => typeof part === "string").join(" ");
      if (body) answerExcerpt = body.replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ").slice(0, 800);
    }
  };
  for (const event of events) {
    const item = event?.item ?? event?.response;
    if (event?.type === "response.output_item.done" && item?.type === "web_search_call" &&
        typeof item.id === "string" && !seenCalls.has(item.id)) {
      seenCalls.add(item.id);
      if (item.action?.type === "search") searchCalls++;
      if (item.action?.type === "open_page") openCalls++;
      for (const source of item.action?.sources ?? []) {
        const url = safeUrl(source?.url);
        if (url) sourceHosts.add(new URL(url).hostname);
      }
    }
    if (event?.type === "response.output_item.done") addAnnotations(item);
    if (event?.type === "response.completed" || event?.type === "response.failed" ||
        event?.type === "response.incomplete") {
      status = event.type.slice("response.".length);
      for (const output of item?.output ?? []) {
        if (output.type === "web_search_call" && typeof output.id === "string" && !seenCalls.has(output.id)) {
          seenCalls.add(output.id);
          if (output.action?.type === "search") searchCalls++;
          if (output.action?.type === "open_page") openCalls++;
          for (const source of output.action?.sources ?? []) {
            const url = safeUrl(source?.url);
            if (url) sourceHosts.add(new URL(url).hostname);
          }
        }
        addAnnotations(output);
      }
    }
  }
  return { status, searchCalls, openCalls, citedUrlsOrHosts: [...citations].slice(0, 20),
    sourceHosts: [...sourceHosts].slice(0, 20), answerExcerpt };
}

export async function readEvents(response) {
  if (!response?.body) fail("Provider stream unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let pending = "";
  const events = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_STREAM_BYTES) fail("Provider stream too large");
      pending += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = pending.search(/\r?\n\r?\n/u)) >= 0) {
        const frame = pending.slice(0, boundary);
        pending = pending.slice(boundary).replace(/^\r?\n\r?\n/u, "");
        const data = frame.split(/\r?\n/u).filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart()).join("\n");
        if (data && data !== "[DONE]") events.push(JSON.parse(data));
      }
    }
    return events;
  } finally { await reader.cancel().catch(() => {}); }
}

async function ownFixedPort() {
  const server = createServer((socket) => socket.destroy());
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host: "127.0.0.1", port: 4174, exclusive: true }, resolve);
    });
  } catch {
    server.close();
    fail("Port 4174 is occupied; stop the regular local service before this QA run");
  }
  return () => new Promise((resolve) => server.close(resolve));
}

export async function runLiveWebSearchQa(args, { fetchImpl = fetch, print = console.log } = {}) {
  const { caseName, model, showResult } = parseArgs(args);
  if (!existsSync(path.join(DATA_DIR, "chatgpt-registration.json"))) fail("Existing ChatGPT registration unavailable");
  const release = await ownFixedPort();
  let connection;
  try {
    const store = createChatGPTRegistrationStore(DATA_DIR);
    const refreshStore = createProtectedRefreshStore({ hostId: store.hostId });
    if (!refreshStore) fail("Protected Windows ChatGPT connection unavailable");
    const provider = oneResponseFetch(fetchImpl);
    connection = createChatGPTConnection({ hostId: store.hostId, agentName: "Universal Discussion Layer",
      readRegistration: store.readRegistration, writeRegistration: store.writeRegistration,
      fetchImpl: provider.fetch, refreshStore });
    if (!await connection.restore() || !connection.status().planEnabled) fail("Connected ChatGPT plan unavailable");
    const token = await connection.getAccessToken();
    const response = await provider.fetch(ENDPOINT, { method: "POST", redirect: "error",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildRequest(caseName, model)), signal: AbortSignal.timeout(120_000) });
    if (response.redirected || response.url && response.url !== ENDPOINT) fail("Provider response invalid");
    if (!response.ok) {
      print(JSON.stringify({ status: "http-error", httpStatus: response.status,
        responsesSent: provider.responsesSent() }));
      return;
    }
    const summary = summarizeEvents(await readEvents(response), caseName);
    const { answerExcerpt, ...metadata } = summary;
    print(JSON.stringify({ ...metadata, ...(showResult ? { answerExcerpt } : {}),
      responsesSent: provider.responsesSent(), case: caseName }));
    return summary;
  } finally { connection?.dispose(); await release(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLiveWebSearchQa(process.argv.slice(2)).catch((error) => {
    const safe = new Set(["Explicit --run-live required", "Unsupported QA option", "Unknown fixed QA case",
      "A model slug is required", "Unexpected provider endpoint", "One Responses request per invocation",
      "Existing ChatGPT registration unavailable", "Port 4174 is occupied; stop the regular local service before this QA run",
      "Protected Windows ChatGPT connection unavailable", "Connected ChatGPT plan unavailable",
      "Provider response invalid", "Provider stream unavailable", "Provider stream too large"]);
    console.error(safe.has(error?.message) ? error.message : "Live web-search QA failed");
    process.exitCode = 1;
  });
}
