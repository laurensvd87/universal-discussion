// Owner-invoked, one-shot quality probe. This module has no I/O on import.
// Run from apps/local-service: node harness/run-live-insight-qa.js --run-live --model <listed-slug|auto> [--with-related-text|--with-web-search] [--show-result]
// PCGames case: --run-live --with-web-search --pcgames (uses an account-listed automatic model).
// Current Source citation case: --run-live --model auto --with-web-search --current-source-citation.
// Stop the regular service first. This program exclusively owns 127.0.0.1:4174
// before restoring a rotating protected refresh token; an occupied port fails.
// Fixed, signed-out public HTML fetches approximate the extension's isolated
// Chrome reader: they cannot attest the browser's displayed document.
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createChatGPTRegistrationStore } from "../src/ai/chatgpt-runtime.js";
import { createChatGPTConnection } from "../src/ai/chatgpt-connection.js";
import { createProtectedRefreshStore } from "../src/ai/protected-refresh-store.js";
import { createChatGptInsights } from "../src/ai/chatgpt-insights.js";
import { createRelatedPageExcerptReader } from "../../../spikes/topic-resolution/browser/core/related-page-excerpts.js";
import { inspectPageUrl } from "../../../spikes/topic-resolution/browser/core/page-content-policy.js";

export const PUBLIC_PAGE = Object.freeze({
  url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview",
  title: "Overview of HTTP - HTTP | MDN",
  related: Object.freeze([
    Object.freeze({ url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Connection_management_in_HTTP_1.x", title: "Connection management in HTTP/1.x - HTTP | MDN" }),
  ]),
});
export const RELATED_TEXT_PAGE = Object.freeze({
  url: "https://peps.python.org/pep-0008/",
  title: "PEP 8 – Style Guide for Python Code",
  related: Object.freeze([
    Object.freeze({ url: "https://peps.python.org/pep-0257/", title: "PEP 257 – Docstring Conventions" }),
    Object.freeze({ url: "https://peps.python.org/pep-0020/", title: "PEP 20 – The Zen of Python" }),
    Object.freeze({ url: "https://peps.python.org/pep-0007/", title: "PEP 7 – Style Guide for C Code" }),
  ]),
});
export const PCGAMES_PAGE = Object.freeze({
  url: "https://www.pcgames.de/GTA-6-Spiel-55239/News/Game-Informer-Wetter-Tierwelt-Release-Infos-1555194/",
  title: "GTA 6: Game Informer reports",
  related: Object.freeze([
    Object.freeze({ url: "https://www.gamestar.de/artikel/gta-6-game-informer-cover-info-zusammenfassung-uhrzeit,3460312.html",
      title: "GTA 6: Game Informer cover information" }),
  ]),
});
const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const MAX_HTML_BYTES = 524_288;
const MAX_ARTICLE_CHARS = 4_096;
const MAX_PRINT_CHARS = 2_000;
const MAX_CITATION_TITLE = 160;
const LUNA_MODEL_SLUG = /^gpt-[0-9]+(?:\.[0-9]+)*-luna(?:-[0-9]{4}-[0-9]{2}-[0-9]{2})?$/u;
const GPT_6_LUNA_SLUG = /^gpt-6-luna(?:-[0-9]{4}-[0-9]{2}-[0-9]{2})?$/u;

function fail(message) { throw new Error(message); }
function decodeEntities(value) {
  return value.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|amp|lt|gt|quot|apos|nbsp);/giu, (_match, entity) => {
    const lower = entity.toLowerCase();
    if (lower[0] === "#") {
      const n = lower[1] === "x" ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
      return n >= 32 && n <= 0x10ffff && ![0x7f, 0x2028, 0x2029].includes(n) ? String.fromCodePoint(n) : " ";
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[lower];
  });
}

export function extractPublicArticle(html) {
  if (typeof html !== "string" || Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) fail("Public page response unavailable");
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/iu.exec(html)?.[1];
  if (!main) fail("Public article region unavailable");
  const cleaned = main.replace(/<(script|style|noscript|template|form|nav|aside|footer|header)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, " ");
  const paragraphs = [...cleaned.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/giu)]
    .map((match) => decodeEntities(match[1].replace(/<[^>]*>/gu, " ")).replace(/\s+/gu, " ").trim())
    .filter((part) => part.length >= 40);
  const article = paragraphs.join("\n\n").slice(0, MAX_ARTICLE_CHARS).trim();
  if (article.length < 200 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(article))
    fail("Public article text unavailable");
  return article;
}

async function boundedText(response, maxBytes, expectedUrl) {
  if (!response?.ok || response.redirected || response.url !== expectedUrl ||
      !/^text\/html(?:;|$)/iu.test(response.headers?.get("content-type") ?? "")) fail("Public page response unavailable");
  const reader = response.body?.getReader();
  if (!reader) fail("Public page response unavailable");
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) fail("Public page response unavailable");
      bytes += value.byteLength;
      if (bytes > maxBytes) fail("Public page response too large");
      chunks.push(Buffer.from(value));
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, bytes));
  } finally { await reader.cancel().catch(() => {}); }
}

export async function readPublicPage(fetchImpl = fetch, page = PUBLIC_PAGE) {
  const signal = AbortSignal.timeout(15_000);
  const response = await fetchImpl(page.url, { method: "GET", redirect: "error", credentials: "omit",
    cache: "no-store", referrerPolicy: "no-referrer", signal });
  return extractPublicArticle(await boundedText(response, MAX_HTML_BYTES, page.url));
}

export async function readRequiredRelatedExcerpts(context, fetchImpl = fetch) {
  const reader = createRelatedPageExcerptReader({ fetchImpl, hasHostAccess: async () => true });
  const excerpts = await reader.read(context);
  if (excerpts.length < 1) fail("Related public excerpts unavailable");
  return excerpts;
}

export function oneResponseFetch(fetchImpl = fetch) {
  let responses = 0;
  const guarded = (url, options) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !["https://auth.openai.com", "https://api.openai.com"].includes(parsed.origin) ||
        parsed.username || parsed.password || parsed.search || parsed.hash ||
        parsed.origin === "https://api.openai.com" && !["/v1/models", "/v1/responses"].includes(parsed.pathname))
      fail("Unexpected provider endpoint");
    if (parsed.origin === "https://api.openai.com" && parsed.pathname === "/v1/responses") {
      if (options?.method !== "POST" || ++responses > 1) fail("One Responses request per invocation");
    }
    return fetchImpl(url, options);
  };
  return Object.freeze({ fetch: guarded, responsesSent: () => responses });
}

export function chooseListedModel(models, requested) {
  if (!Array.isArray(models) || !models.length) fail("Selected model is not listed for this account");
  const selected = requested === "auto"
    ? models.find((entry) => typeof entry?.slug === "string" && GPT_6_LUNA_SLUG.test(entry.slug))?.slug ??
      models.find((entry) => typeof entry?.slug === "string" && LUNA_MODEL_SLUG.test(entry.slug))?.slug ??
      models.at(-1)?.slug
    : requested;
  if (typeof selected !== "string" || !models.some((entry) => entry?.slug === selected))
    fail("Selected model is not listed for this account");
  return selected;
}

export function qualityMetrics(result, articleText, relatedExcerpts = [], page = PUBLIC_PAGE) {
  const body = result?.body;
  if (typeof body !== "string") fail("Insight result unavailable");
  const citations = Array.isArray(result.citations) ? result.citations : [];
  return Object.freeze({
    articleCharacters: articleText.length,
    ...(relatedExcerpts.length ? { relatedExcerptCount: relatedExcerpts.length,
      relatedExcerptCharacters: relatedExcerpts.reduce((total, excerpt) => total + excerpt.text.length, 0) } : {}),
    bodyCharacters: body.length,
    words: body.trim().split(/\s+/u).filter(Boolean).length,
    sentences: (body.match(/[.!?](?:\s|$)/gu) ?? []).length,
    hasQuestion: body.includes("?"),
    citationCount: citations.length,
    currentSourceCitations: citations.filter((citation) => citation?.url === page.url).length,
    externalSourceCitations: citations.filter((citation) => citation?.url !== page.url).length,
    sourceMentions: (body.match(relatedExcerpts.length ? /\b(?:PEP|Python)\b/giu : /\b(?:HTTP|MDN)\b/giu) ?? []).length,
  });
}

export function publicCitationSummary(citations, page = PUBLIC_PAGE) {
  if (!Array.isArray(citations)) return [];
  return citations.slice(0, 5).flatMap((citation) => {
    try {
      const { url, title } = citation ?? {};
      const parsed = new URL(url);
      const allowed = page === RELATED_TEXT_PAGE
        ? parsed.hostname === "peps.python.org" && /^\/pep-[0-9]{4}\/$/u.test(parsed.pathname)
        : parsed.hostname === "developer.mozilla.org";
      if (parsed.protocol !== "https:" || !allowed ||
          parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash ||
          typeof title !== "string" || title.length > MAX_CITATION_TITLE ||
          /[\u0000-\u001f\u007f-\u009f]/u.test(title)) return [];
      return [{ url: parsed.href, title }];
    } catch { return []; }
  });
}

const ANNOTATION_CATEGORIES = Object.freeze(["exactSelected", "currentPage", "sameHostSameArticleId",
  "sameCurrentHostOther", "sameSelectedHostOther", "foreignHost", "invalid"]);
function articleId(parsed) {
  const match = /(?:,|-)([0-9]{5,})(?:\.html|\/)?$/u.exec(parsed.pathname);
  return match?.[1] ?? null;
}
export function classifyCitationUrl(value, page = PCGAMES_PAGE) {
  if (typeof value !== "string") return "invalid";
  if (page.related.some((source) => source.url === value)) return "exactSelected";
  if (page.url === value) return "currentPage";
  let parsed;
  try { parsed = new URL(value); } catch { return "invalid"; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
      !inspectPageUrl(value).supported) return "invalid";
  const known = [page, ...page.related].map((source) => new URL(source.url));
  const sameHost = known.filter((source) => source.hostname === parsed.hostname);
  if (!sameHost.length) return "foreignHost";
  const id = articleId(parsed);
  if (id && sameHost.some((source) => articleId(source) === id)) return "sameHostSameArticleId";
  return parsed.hostname === new URL(page.url).hostname ? "sameCurrentHostOther" : "sameSelectedHostOther";
}
// The provider SSE has already been bounded by the adapter. These counts are
// diagnostic, not citation authority: output_item.done may precede or outlive
// a missing terminal completion. Discard parsed objects and retain fixed counts.
export function classifyResponseAnnotations(raw, page = PCGAMES_PAGE) {
  const counts = Object.fromEntries(ANNOTATION_CATEGORIES.map((name) => [name, 0]));
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 262_144)
    return { observed: false, terminalCompleted: false, total: 0, webRefMarkers: 0, ownerRefMarkers: 0,
      selectedSourceHits: 0, ...counts };
  let finalOutput = null;
  let terminalCompleted = false;
  const done = new Map();
  for (const block of raw.split(/\r?\n\r?\n/u)) {
    const data = block.split(/\r?\n/u).filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart()).join("\n");
    if (!data) continue;
    let event;
    try { event = JSON.parse(data); } catch { continue; }
    if (event?.type === "response.completed") {
      terminalCompleted = event.response?.status === "completed";
      if (Array.isArray(event.response?.output)) finalOutput = event.response.output;
    }
    else if (event?.type === "response.output_item.done" && event.item?.type === "message" &&
        event.item.role === "assistant" && Number.isSafeInteger(event.output_index))
      done.set(event.output_index, event.item);
  }
  const output = finalOutput?.some((item) => item?.type === "message" && item.role === "assistant")
    ? finalOutput : [...done.values()];
  let total = 0;
  let webRefMarkers = 0;
  let ownerRefMarkers = 0;
  for (const item of output) {
    if (item?.type !== "message" || item.role !== "assistant") continue;
    for (const part of Array.isArray(item.content) ? item.content : []) {
      if (typeof part?.text === "string") webRefMarkers += [...part.text.matchAll(/\[\[webref:/giu)].length;
      if (typeof part?.text === "string") ownerRefMarkers += [...part.text.matchAll(/(?<!\[)\[ref[1-9][0-9]*\]/gu)].length;
      for (const annotation of Array.isArray(part?.annotations) ? part.annotations : []) {
        if (annotation?.type !== "url_citation") continue;
        if (total >= 100) break;
        counts[classifyCitationUrl(annotation.url, page)]++;
        total++;
      }
    }
  }
  const selected = new Set(page.related.map((source) => source.url));
  const selectedHits = new Set();
  for (const item of [...(finalOutput ?? []), ...done.values()]) {
    if (item?.type !== "web_search_call" || item.status !== "completed" ||
        !Array.isArray(item.action?.sources) || item.action.sources.length > 100) continue;
    for (const source of item.action.sources) if (selected.has(source?.url)) selectedHits.add(source.url);
  }
  return { observed: finalOutput !== null || done.size > 0, terminalCompleted, total,
    webRefMarkers: Math.min(webRefMarkers, 100), ownerRefMarkers: Math.min(ownerRefMarkers, 100),
    selectedSourceHits: selectedHits.size, ...counts };
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

export function inspectArgs(args) {
  if (!args.includes("--run-live")) fail("Explicit --run-live required");
  const modelIndex = args.indexOf("--model");
  const pcgames = args.includes("--pcgames");
  if ((modelIndex < 0 && !pcgames) || modelIndex >= 0 && (modelIndex + 1 >= args.length ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(args[modelIndex + 1])))
    fail("A listed --model slug is required");
  const expected = ["--run-live", ...(modelIndex >= 0 ? ["--model", args[modelIndex + 1]] : [])];
  if (args.includes("--show-result")) expected.push("--show-result");
  if (args.includes("--with-related-text")) expected.push("--with-related-text");
  if (args.includes("--with-web-search")) expected.push("--with-web-search");
  if (args.includes("--pcgames")) expected.push("--pcgames");
  if (args.includes("--current-source-citation")) expected.push("--current-source-citation");
  if (args.length !== expected.length || args.some((arg) => !expected.includes(arg)) ||
      args.filter((arg) => arg === "--run-live").length !== 1 ||
      args.filter((arg) => arg === "--model").length !== (modelIndex >= 0 ? 1 : 0) ||
      (args.includes("--with-related-text") && args.includes("--with-web-search")) ||
      (args.includes("--pcgames") && (!args.includes("--with-web-search") || args.includes("--show-result"))) ||
      (args.includes("--current-source-citation") && (modelIndex < 0 || !args.includes("--with-web-search") ||
        args.includes("--pcgames") || args.includes("--with-related-text") || args.includes("--show-result"))))
    fail("Unsupported QA option");
  return { model: modelIndex >= 0 ? args[modelIndex + 1] : "auto", showResult: args.includes("--show-result"),
    withRelatedText: args.includes("--with-related-text"), withWebSearch: args.includes("--with-web-search"),
    pcgames: args.includes("--pcgames"), currentSourceCitation: args.includes("--current-source-citation") };
}

export function buildQaFixture({ pcgames, withRelatedText, withWebSearch, currentSourceCitation }) {
  const python = (withRelatedText || withWebSearch) && !currentSourceCitation;
  const page = pcgames ? PCGAMES_PAGE : python ? RELATED_TEXT_PAGE : PUBLIC_PAGE;
  const related = currentSourceCitation ? [] : page.related;
  const context = { schema: "insight-context/v1", topic: pcgames
    ? { id: "qa-gta-6", title: "GTA 6 Game Informer coverage" } : python
      ? { id: "qa-python-style", title: "Python style guides" } : { id: "qa-http", title: "HTTP" },
    currentSource: { id: pcgames ? "qa-pcgames-gta-6" : python ?
      "qa-pep-8" : "qa-mdn-http-overview", url: page.url, title: page.title },
    sameTopicSources: related.map((source, index) => ({ id: pcgames ? `qa-gamestar-${index + 1}` :
      python ? `qa-pep-related-${index + 1}` :
        `qa-mdn-related-${index + 1}`, ...source })),
    relatedSources: [], discussion: [],
    coverage: { sameTopicTotal: related.length, relatedTotal: 0, discussionIncluded: false },
    limitations: ["grouping-provisional", "title-url-only", "sources-unverified"] };
  const followup = currentSourceCitation ? { parentBody: "Discussing the HTTP overview.",
    questionBody: "Please verify the current page online and cite its definition of HTTP. Use only this supplied current URL." } : null;
  return { page, context, followup };
}

export async function runLiveInsightQa(args, { fetchImpl = fetch, print = console.log } = {}) {
  const { model, showResult, withRelatedText, withWebSearch, pcgames, currentSourceCitation } = inspectArgs(args);
  if (!existsSync(path.join(DATA_DIR, "chatgpt-registration.json"))) fail("Existing ChatGPT registration unavailable");
  const release = await ownFixedPort();
  let connection, insights;
  let annotationSummary = null;
  try {
    const store = createChatGPTRegistrationStore(DATA_DIR);
    const refreshStore = createProtectedRefreshStore({ hostId: store.hostId });
    if (!refreshStore) fail("Protected Windows ChatGPT connection unavailable");
    const provider = oneResponseFetch(fetchImpl);
    connection = createChatGPTConnection({ hostId: store.hostId, agentName: "Universal Discussion Layer",
      readRegistration: store.readRegistration, writeRegistration: store.writeRegistration,
      fetchImpl: provider.fetch, refreshStore });
    if (!await connection.restore() || !connection.status().planEnabled) fail("Connected ChatGPT plan unavailable");
    insights = createChatGptInsights({ fetchImpl: provider.fetch, getAccessToken: connection.getAccessToken,
      onTrace: (trace) => {
        // Fixed categories only; never print page text, URLs or provider output.
        if (trace?.outcome === "failure") print(JSON.stringify({ status: "rejected",
          detail: trace.detail, citationFailure: trace.citationFailure ?? null }));
      }, onDebug: pcgames ? (event) => {
        if (event?.phase === "response") annotationSummary = classifyResponseAnnotations(event.body, PCGAMES_PAGE);
      } : undefined });
    const models = await insights.listModels();
    const selectedModel = chooseListedModel(models, model);
    const { page, context, followup } = buildQaFixture({ pcgames, withRelatedText, withWebSearch, currentSourceCitation });
    const articleText = await readPublicPage(fetchImpl, page);
    const relatedExcerpts = withRelatedText ? await readRequiredRelatedExcerpts(context, fetchImpl) : [];
    const result = await insights.createInsight({ model: selectedModel, context, articleText, allowWebResearch: withWebSearch,
      ...(withRelatedText ? { relatedExcerpts } : {}), ...(followup ? { followup } : {}) });
    const metrics = qualityMetrics(result, articleText, relatedExcerpts, page);
    print(JSON.stringify({ status: "completed", model: selectedModel, responsesSent: provider.responsesSent(), ...metrics }));
    if (showResult) {
      print(`Private public-page QA excerpt: ${JSON.stringify(result.body.slice(0, MAX_PRINT_CHARS))}`);
      print(`${withRelatedText || withWebSearch ? "PEP" : "MDN"} citations: ${JSON.stringify(publicCitationSummary(result.citations, page))}`);
    }
    return metrics;
  } finally {
    if (pcgames) print(JSON.stringify({ status: "annotation-classification",
      ...(annotationSummary ?? classifyResponseAnnotations("", PCGAMES_PAGE)) }));
    insights?.dispose();
    connection?.dispose();
    await release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLiveInsightQa(process.argv.slice(2)).catch((error) => {
    // Never print arbitrary provider/credential exception messages.
    const safe = new Set(["Explicit --run-live required", "A listed --model slug is required", "Unsupported QA option",
      "Existing ChatGPT registration unavailable", "Port 4174 is occupied; stop the regular local service before this QA run",
      "Protected Windows ChatGPT connection unavailable", "Connected ChatGPT plan unavailable",
      "Selected model is not listed for this account", "Public page response unavailable",
      "Public page response too large", "Public article region unavailable", "Public article text unavailable",
      "One Responses request per invocation", "Unexpected provider endpoint", "Related public excerpts unavailable"]);
    console.error(safe.has(error?.message) ? error.message : `Live QA failed (${typeof error?.code === "string" &&
      /^[a-z-]{1,40}$/u.test(error.code) ? error.code : "unavailable"})`);
    process.exitCode = 1;
  });
}
