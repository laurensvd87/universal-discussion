import { inspectPageUrl } from "./page-content-policy.js";

const MAX_PAGES = 4;
const MAX_BYTES = 768 * 1024;
const MAX_TEXT = 2048;
const MAX_TOKENS = 8192;
const MAX_DEPTH = 128;
const TIMEOUT_MS = 5000;
const HIDDEN = new Set(["head", "script", "style", "noscript", "textarea", "title", "iframe", "xmp", "noembed", "noframes", "plaintext", "svg", "template", "nav", "footer", "aside", "header"]);
const RAW = new Set(["script", "style", "noscript", "textarea", "title", "iframe", "xmp", "noembed", "noframes"]);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const TAG = /^<(?:\/([a-z][a-z0-9:-]*)|([a-z][a-z0-9:-]*))(?=[\s/>])/iu;
const RESTRICTED = /["']?isAccessibleForFree["']?\s*:\s*(?:false|["']false["'])|\bdata-(?:paywall|requires-auth)\s*=\s*["']?(?:true|yes|1)\b|<meta\b[^>]*\b(?:paywall|subscriber-only|subscription-required)\b/iu;
const CLASS_OR_ID = /\b(?:class|id)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`=]+))/giu;
const LOCKED_MARKER = /\b(?:paywall|subscriber[-_ ]only|locked[-_ ]content|premium[-_ ]content|members[-_ ]only|subscription[-_ ]wall)\b/iu;

function hiddenAttributes(attributes) {
  const style = /(?:^|\s)style\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/iu.exec(attributes);
  return /(?:^|\s)(?:hidden|inert)(?:\s|=|\/|$)/iu.test(attributes) ||
    /(?:^|\s)aria-hidden\s*=\s*(?:"true"|'true'|true)(?:\s|\/|$)/iu.test(attributes) ||
    /(?:^|\s)data-(?:paywall|requires-auth)\s*=\s*(?:"true"|'true'|true|"1"|'1'|1)(?:\s|\/|$)/iu.test(attributes) ||
    /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)(?:\s*!important)?(?=\s|;|$)/iu.test(style?.[1] ?? style?.[2] ?? style?.[3] ?? "");
}

function tokenize(html) {
  const tokens = [];
  let position = 0;
  while (position < html.length) {
    if (tokens.length >= MAX_TOKENS) return null;
    if (html[position] !== "<") {
      const next = html.indexOf("<", position);
      const end = next < 0 ? html.length : next;
      tokens.push(html.slice(position, end)); position = end;
      continue;
    }
    if (html.startsWith("<!--", position)) {
      const end = html.indexOf("-->", position + 4);
      if (end < 0) return null;
      tokens.push(html.slice(position, end + 3)); position = end + 3;
      continue;
    }
    let quote = null, end = -1;
    for (let index = position + 1; index < html.length && index - position <= 2048; index++) {
      const char = html[index];
      if (quote) { if (char === quote) quote = null; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === ">") { end = index; break; }
      else if (char === "<") return null;
    }
    if (end < 0) return null;
    const token = html.slice(position, end + 1);
    tokens.push(token); position = end + 1;
    const match = TAG.exec(token);
    if (!match && !token.startsWith("<!") && !token.startsWith("<?")) return null;
    const tag = (match?.[1] ?? match?.[2])?.toLowerCase();
    if (!match?.[1] && tag === "plaintext") return null;
    if (!match?.[1] && RAW.has(tag)) {
      if (/\/\s*>$/u.test(token)) return null;
      const closing = new RegExp(`<\\/${tag}\\s*>`, "iu").exec(html.slice(position));
      if (!closing) return null;
      tokens.push(closing[0]);
      if (tokens.length > MAX_TOKENS) return null;
      position += closing.index + closing[0].length;
    }
  }
  return tokens;
}

function decodeEntities(value) {
  return value.replace(/&(?:#(x[0-9a-f]+|[0-9]+)|([a-z]+));/giu, (all, number, name) => {
    if (number) {
      const code = number[0]?.toLowerCase() === "x" ? Number.parseInt(number.slice(1), 16) : Number.parseInt(number, 10);
      return Number.isSafeInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code) : " ";
    }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
      hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" })[name.toLowerCase()] ?? all;
  });
}

// A bounded text-only tokenizer. It never inserts fetched HTML into a DOM, so
// scripts, images, styles and other subresources cannot execute or load.
export function extractRelatedPageText(html) {
  if (typeof html !== "string" || html.length > MAX_BYTES || RESTRICTED.test(html)) return "";
  for (const marker of html.matchAll(CLASS_OR_ID)) {
    if (LOCKED_MARKER.test(marker[1] ?? marker[2] ?? marker[3])) return "";
  }
  const pieces = { article: [], main: [], body: [] };
  const lengths = { article: 0, main: 0, body: 0 };
  const stack = [];
  let visibleArticle = false, visibleMain = false;
  const append = (value, inArticle, inMain) => {
    for (const region of ["body", ...(inMain ? ["main"] : []), ...(inArticle ? ["article"] : [])]) {
      if (lengths[region] >= MAX_TEXT * 2) continue;
      pieces[region].push(value);
      lengths[region] += value.length;
    }
  };
  const tokens = tokenize(html);
  if (!tokens) return "";
  for (const token of tokens) {
    if (token.startsWith("<!--") || token.startsWith("<!") || token.startsWith("<?")) continue;
    if (token.startsWith("<")) {
      const match = TAG.exec(token);
      if (!match) return "";
      const tag = (match[1] ?? match[2]).toLowerCase();
      if (match[1]) {
        if (!/^<\/[a-z][a-z0-9:-]*\s*>$/iu.test(token)) return "";
        const index = stack.findLastIndex((entry) => entry.tag === tag);
        if (index !== -1 && index !== stack.length - 1) return "";
        if (index >= 0) stack.pop();
        else if (RAW.has(tag) || tag === "template" || tag === "svg") return "";
        continue;
      }
      const attributes = token.slice(match[0].length, -1);
      const selfClosing = /\/\s*>$/u.test(token);
      if (selfClosing && !VOID.has(tag) && tag !== "svg" && !stack.some((entry) => entry.tag === "svg")) return "";
      const hidden = HIDDEN.has(tag) || hiddenAttributes(attributes) || stack.some((entry) => entry.hidden);
      if (!hidden && tag === "article") visibleArticle = true;
      if (!hidden && tag === "main") visibleMain = true;
      if (!VOID.has(tag) && !selfClosing) {
        if (stack.length >= MAX_DEPTH) return "";
        stack.push({ tag, hidden });
      }
      if (!hidden && /^(?:p|div|article|main|section|h[1-6]|li|br)$/u.test(tag)) {
        append(" ", stack.some((entry) => entry.tag === "article" && !entry.hidden),
          stack.some((entry) => entry.tag === "main" && !entry.hidden));
      }
      continue;
    }
    if (!stack.some((entry) => entry.hidden)) {
      const decoded = decodeEntities(token);
      append(decoded, stack.some((entry) => entry.tag === "article" && !entry.hidden),
        stack.some((entry) => entry.tag === "main" && !entry.hidden));
    }
    if (lengths.body >= MAX_TEXT * 2 && lengths.main >= MAX_TEXT * 2 && lengths.article >= MAX_TEXT * 2) break;
  }
  if (stack.some((entry) => entry.hidden)) return "";
  const excerpt = (region) => pieces[region].join("").replace(/\s+/gu, " ").trim().slice(0, MAX_TEXT).trim();
  const article = excerpt("article");
  if (article.length >= 80) return article;
  const main = excerpt("main");
  if (main.length >= 80) return main;
  return visibleArticle || visibleMain ? article || main : excerpt("body");
}

export function createRelatedPageExcerptReader({ fetchImpl, hasHostAccess }) {
  if (typeof fetchImpl !== "function" || typeof hasHostAccess !== "function") throw new TypeError("Related reader adapters required");
  return Object.freeze({ async read(context, excludedIds = [], signal, onDiagnostic = null) {
    // Only fixed counters leave this reader. Never attach source IDs, URLs, text, or exception details.
    const diagnostic = { eligible: 0, attempted: 0, accepted: 0,
      failures: { noHostAccess: 0, fetchHttpRedirect: 0, sizeType: 0, parseShort: 0 } };
    const report = () => {
      if (typeof onDiagnostic === "function") {
        try { onDiagnostic(diagnostic); } catch { /* Diagnostics cannot affect an Insight. */ }
      }
    };
    if (!context || !Array.isArray(excludedIds)) { report(); return []; }
    const excluded = new Set(excludedIds);
    const candidates = [...(context.sameTopicSources ?? []), ...(context.relatedSources ?? [])]
      .filter((source) => !excluded.has(source?.id)).slice(0, MAX_PAGES);
    const eligible = candidates.filter((source) => {
      const inspected = inspectPageUrl(source?.url);
      return inspected.supported && inspected.url === source.url && typeof source.id === "string" &&
        new URL(inspected.url).protocol === "https:";
    });
    diagnostic.eligible = eligible.length;
    if (signal?.aborted) { report(); return []; }
    try { if (!await hasHostAccess()) { diagnostic.failures.noHostAccess = eligible.length; report(); return []; } }
    catch { diagnostic.failures.noHostAccess = eligible.length; report(); return []; }
    if (signal?.aborted) { report(); return []; }
    const excerpts = [];
    for (const source of eligible) {
      if (signal?.aborted) break;
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
      const abort = () => timeout.abort();
      signal?.addEventListener("abort", abort, { once: true });
      let reader;
      let response;
      let failure = "fetchHttpRedirect";
      try {
        diagnostic.attempted++;
        response = await fetchImpl(source.url, { method: "GET", credentials: "omit", redirect: "error",
          referrerPolicy: "no-referrer", cache: "no-store", signal: timeout.signal,
          headers: { Accept: "text/html" } });
        if (!response?.ok || response.redirected || response.url !== source.url) continue;
        failure = "sizeType";
        if (!/^text\/html(?:\s*;|\s*$)/iu.test(response.headers.get("content-type") ?? "")) continue;
        const length = response.headers.get("content-length");
        if (length !== null && (!/^\d+$/u.test(length) || Number(length) > MAX_BYTES)) continue;
        reader = response.body?.getReader();
        if (!reader) continue;
        failure = "fetchHttpRedirect";
        const chunks = []; let size = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) { failure = "sizeType"; throw new TypeError("Related page too large"); }
          chunks.push(value);
        }
        const bytes = new Uint8Array(size); let position = 0;
        for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
        failure = "parseShort";
        const text = extractRelatedPageText(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        if (text.length >= 80 && !signal?.aborted) {
          excerpts.push({ sourceId: source.id, url: source.url, text });
          diagnostic.accepted++;
          failure = null;
        }
      } catch { /* The candidate is optional; a failed page never blocks the current insight. */ }
      finally {
        if (failure && !signal?.aborted) diagnostic.failures[failure]++;
        clearTimeout(timer); signal?.removeEventListener("abort", abort); timeout.abort();
        try {
          if (reader) void Promise.resolve(reader.cancel()).catch(() => {});
          else if (response?.body?.cancel) void Promise.resolve(response.body.cancel()).catch(() => {});
        } catch { /* Rejected response cleanup remains best effort after abort. */ }
      }
    }
    report();
    return excerpts;
  } });
}
