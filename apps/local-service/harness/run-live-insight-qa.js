// Owner-invoked, one-shot quality probe. This module has no I/O on import.
// Run from apps/local-service: node harness/run-live-insight-qa.js --run-live --model <listed-slug|auto> [--with-related-text] [--show-result]
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

export function qualityMetrics(result, articleText, relatedExcerpts = []) {
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

function inspectArgs(args) {
  if (!args.includes("--run-live")) fail("Explicit --run-live required");
  const modelIndex = args.indexOf("--model");
  if (modelIndex < 0 || modelIndex + 1 >= args.length ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(args[modelIndex + 1])) fail("A listed --model slug is required");
  const expected = ["--run-live", "--model", args[modelIndex + 1]];
  if (args.includes("--show-result")) expected.push("--show-result");
  if (args.includes("--with-related-text")) expected.push("--with-related-text");
  if (args.length !== expected.length || args.some((arg) => !expected.includes(arg)) ||
      args.filter((arg) => arg === "--run-live").length !== 1 ||
      args.filter((arg) => arg === "--model").length !== 1) fail("Unsupported QA option");
  return { model: args[modelIndex + 1], showResult: args.includes("--show-result"),
    withRelatedText: args.includes("--with-related-text") };
}

export async function runLiveInsightQa(args, { fetchImpl = fetch, print = console.log } = {}) {
  const { model, showResult, withRelatedText } = inspectArgs(args);
  if (!existsSync(path.join(DATA_DIR, "chatgpt-registration.json"))) fail("Existing ChatGPT registration unavailable");
  const release = await ownFixedPort();
  let connection, insights;
  try {
    const store = createChatGPTRegistrationStore(DATA_DIR);
    const refreshStore = createProtectedRefreshStore({ hostId: store.hostId });
    if (!refreshStore) fail("Protected Windows ChatGPT connection unavailable");
    const provider = oneResponseFetch(fetchImpl);
    connection = createChatGPTConnection({ hostId: store.hostId, agentName: "Universal Discussion Layer",
      readRegistration: store.readRegistration, writeRegistration: store.writeRegistration,
      fetchImpl: provider.fetch, refreshStore });
    if (!await connection.restore() || !connection.status().planEnabled) fail("Connected ChatGPT plan unavailable");
    insights = createChatGptInsights({ fetchImpl: provider.fetch, getAccessToken: connection.getAccessToken });
    const models = await insights.listModels();
    const selectedModel = chooseListedModel(models, model);
    const page = withRelatedText ? RELATED_TEXT_PAGE : PUBLIC_PAGE;
    const articleText = await readPublicPage(fetchImpl, page);
    const context = { schema: "insight-context/v1", topic: withRelatedText
      ? { id: "qa-python-style", title: "Python style guides" } : { id: "qa-http", title: "HTTP" },
      currentSource: { id: withRelatedText ? "qa-pep-8" : "qa-mdn-http-overview", url: page.url, title: page.title },
      sameTopicSources: page.related.map((source, index) => ({ id: withRelatedText
        ? `qa-pep-related-${index + 1}` : `qa-mdn-related-${index + 1}`, ...source })),
      relatedSources: [], discussion: [],
      coverage: { sameTopicTotal: page.related.length, relatedTotal: 0, discussionIncluded: false },
      limitations: ["grouping-provisional", "title-url-only", "sources-unverified"] };
    const relatedExcerpts = withRelatedText ? await readRequiredRelatedExcerpts(context, fetchImpl) : [];
    const result = await insights.createInsight({ model: selectedModel, context, articleText, allowWebResearch: true,
      ...(withRelatedText ? { relatedExcerpts } : {}) });
    const metrics = qualityMetrics(result, articleText, relatedExcerpts);
    print(JSON.stringify({ status: "completed", model: selectedModel, responsesSent: provider.responsesSent(), ...metrics }));
    if (showResult) {
      print(`Private public-page QA excerpt: ${JSON.stringify(result.body.slice(0, MAX_PRINT_CHARS))}`);
      print(`${withRelatedText ? "PEP" : "MDN"} citations: ${JSON.stringify(publicCitationSummary(result.citations, page))}`);
    }
    return metrics;
  } finally {
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
