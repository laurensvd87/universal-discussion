import { createHash } from "node:crypto";

export const CRAWLER_EXTRACTOR_VERSION = "crawler-static-html-prefix/v1";
const MAX_TEXT = 4_096;
const MAX_TITLE = 200;
const MAX_LINKS = 4_000;
const MIN_TEXT = 160;
const SKIP = new Set(["script", "style", "noscript", "template", "svg", "canvas", "iframe", "object", "embed"]);
const CHROME = new Set(["nav", "header", "footer", "aside", "form"]);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW_TEXT = new Set(["script", "style"]);
const ENTITY = new Map([["amp", "&"], ["lt", "<"], ["gt", ">"], ["quot", "\""], ["apos", "'"], ["nbsp", " "]]);
// These are the ONLY attributes consumed below. Names are bounded before
// slicing; all other values stay in the original input and are never decoded.
const INTERPRETED_ATTRIBUTES = new Set(["hidden", "aria-hidden", "style", "name", "http-equiv", "content", "rel", "href"]);

// Only exact errors created at the parser's existing rejection sites receive
// metadata. Neither this registry nor its projection inspects unknown errors.
const failureMetadata = new WeakMap();
function counts(html) {
  return { inputCharacters: typeof html === "string" ? Math.min(html.length, 2 * 1024 * 1024 + 1) : 0,
    tokens: 0, tags: 0, skipTags: 0, chromeTags: 0, hiddenTags: 0, preferredTags: 0,
    maximumStackDepth: 0, maximumAttributeCount: 0, maximumInterpretedAttributeSurface: 0,
    skippedTextCharacters: 0, chromeTextCharacters: 0, hiddenTextCharacters: 0,
    titleBufferLength: 0, preferredBufferLength: 0, fallbackBufferLength: 0,
    titleLength: 0, extractedLength: 0, preferredSelected: false };
}
function summary(diagnostic) { return Object.freeze({ ...diagnostic }); }
class StaticCaptureError extends TypeError {
  constructor(code, diagnostic) {
    super("Invalid crawler document");
    failureMetadata.set(this, Object.freeze({ code, summary: summary(diagnostic) }));
  }
}
export function describeStaticCaptureFailure(error) { return failureMetadata.get(error) ?? null; }

function decodeEntities(value) {
  return value.replace(/&(?:#(x[0-9a-f]+|[0-9]+)|([a-z][a-z0-9]+));/giu, (whole, numeric, named) => {
    if (numeric) {
      const radix = numeric[0].toLowerCase() === "x" ? 16 : 10;
      const digits = radix === 16 ? numeric.slice(1) : numeric;
      const point = Number.parseInt(digits, radix);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point) : " ";
    }
    return ENTITY.get(named.toLowerCase()) ?? " ";
  });
}

function normalizedText(value) {
  return decodeEntities(value).normalize("NFKC").replace(/[\u0000-\u001f\u007f-\u009f]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function attributes(source, index, end, diagnostic) {
  const result = Object.create(null);
  let count = 0, surface = 0;
  const budget = amount => {
    surface += amount;
    diagnostic.maximumInterpretedAttributeSurface = Math.max(diagnostic.maximumInterpretedAttributeSurface, Math.min(surface, 16_385));
    if (surface > 16_384) throw new StaticCaptureError("attribute-surface-limit", diagnostic);
  };
  while (index < end) {
    const whitespaceStart = index;
    while (index < end && /\s/u.test(source[index])) index++;
    budget(index - whitespaceStart);
    if (index >= end || source[index] === "/") break;
    const start = index;
    while (index < end && !/[\s=/>]/u.test(source[index])) index++;
    const nameEnd = index;
    if (nameEnd === start) { index++; budget(1); continue; }
    diagnostic.maximumAttributeCount = Math.max(diagnostic.maximumAttributeCount, count + 1);
    if (++count > 128) throw new StaticCaptureError("attribute-count-limit", diagnostic);
    // Quote-aware scanning still visits every attribute, including fake tags
    // embedded in unused values. No name longer than aria-hidden is allocated.
    const name = nameEnd - start <= 11 ? source.slice(start, nameEnd).toLowerCase() : null;
    const ignored = !INTERPRETED_ATTRIBUTES.has(name);
    while (index < end && /\s/u.test(source[index])) index++;
    let valueStart = index, valueEnd = index;
    if (source[index] === "=") {
      index++;
      while (index < end && /\s/u.test(source[index])) index++;
      const quote = source[index] === "\"" || source[index] === "'" ? source[index++] : null;
      valueStart = index;
      if (quote) while (index < end && source[index] !== quote) index++;
      else while (index < end && !/[\s>]/u.test(source[index])) index++;
      valueEnd = index;
      if (quote && source[index] === quote) index++;
    }
    if (!ignored) {
      budget(index - start);
      if (!Object.hasOwn(result, name)) result[name] = decodeEntities(source.slice(valueStart, valueEnd));
    }
  }
  return result;
}

function directiveSet(value) {
  return new Set((value ?? "").toLowerCase().split(/[\s,;]+/u).filter(Boolean));
}

function append(target, value, maximum = MAX_TEXT * 3) {
  if (!value || target.length >= maximum) return target;
  return `${target}${target ? " " : ""}${value}`.slice(0, maximum);
}

function* htmlTokens(html, diagnostic) {
  let offset = 0;
  while (offset < html.length) {
    if (html[offset] !== "<") {
      const next = html.indexOf("<", offset);
      const end = next < 0 ? html.length : next;
      yield { start: offset, end, kind: "text" };
      offset = end;
      continue;
    }
    if (html.startsWith("<!--", offset)) {
      const end = html.indexOf("-->", offset + 4);
      if (end < 0) throw new StaticCaptureError("unterminated-comment", diagnostic);
      yield { start: offset, end: end + 3, kind: "comment" };
      offset = end + 3;
      continue;
    }
    let quote = null, end = offset + 1;
    for (; end < html.length; end += 1) {
      const character = html[end];
      if (quote !== null) {
        if (character === quote) quote = null;
      } else if (character === "\"" || character === "'") quote = character;
      else if (character === ">") break;
    }
    if (end >= html.length || quote !== null) throw new StaticCaptureError("unterminated-tag", diagnostic);
    const start = offset;
    yield { start, end: end + 1, kind: "tag" };
    offset = end + 1;
    // HTML script/style data is not a sequence of ordinary HTML tags. In
    // particular '<' comparisons and quoted HTML fragments cannot swallow the
    // later real article or invent robots/TDM metadata. No script is executed.
    const raw = [...RAW_TEXT].find(name => html.slice(start, start + name.length + 1).toLowerCase() === "<" + name &&
      /[\t\n\f\r />]/u.test(html[start + name.length + 1] ?? ""));
    if (raw) {
      const closing = new RegExp("</" + raw + "(?=[\\t\\n\\f\\r />])", "giu");
      closing.lastIndex = offset;
      const found = closing.exec(html), bodyEnd = found?.index ?? html.length;
      // This bounded extractor does not implement HTML's double-escaped script
      // states. Refuse those forms instead of treating a nested end tag as real.
      if (raw === "script") {
        const escapes = /<!--|-->|<script(?=[\t\n\f\r />])/giu;escapes.lastIndex = offset;
        let escaped = false, marker;
        while ((marker = escapes.exec(html)) && marker.index < bodyEnd) {
          if (marker[0] === "<!--") escaped = true;
          else if (marker[0] === "-->") escaped = false;
          else if (escaped) throw new StaticCaptureError("script-escape-unsupported", diagnostic);
        }
      }
      if (bodyEnd > offset) yield { start: offset, end: bodyEnd, kind: "text" };
      if (!found) { offset = html.length;continue; }
      const endTag = new RegExp("</" + raw + "[\\t\\n\\f\\r ]*/?[\\t\\n\\f\\r ]*>", "iyu");
      endTag.lastIndex = found.index;
      const endMatch = endTag.exec(html);
      if (!endMatch) throw new StaticCaptureError("raw-end-tag-unsupported", diagnostic);
      yield { start: found.index, end: endTag.lastIndex, kind: "tag" };
      offset = endTag.lastIndex;
    }
  }
}

function capture(html, pageUrl, diagnostic) {
  if (typeof html !== "string" || !html || html.length > 2 * 1024 * 1024 || typeof pageUrl !== "string")
    throw new StaticCaptureError("document-input", diagnostic);
  let skipDepth = 0, chromeDepth = 0, hiddenDepth = 0, preferredDepth = 0, titleDepth = 0, locDepth = 0;
  let fallback = "", preferred = "", title = "", locText = "", canonical = null;
  let noindex = false, nofollow = false, tdmReservation = null, tdmReservationInvalid = false;
  let activeAnchor = null;
  const links = [];
  const stack = [];
  let tokenCount = 0;
  const tagStart = /<\s*(\/?)\s*([a-zA-Z][\w:-]*)/uy;
  for (const token of htmlTokens(html, diagnostic)) {
    diagnostic.tokens = tokenCount + 1;
    if (++tokenCount > 100_000) throw new StaticCaptureError("token-limit", diagnostic);
    if (token.kind === "text") {
      const text = normalizedText(html.slice(token.start, token.end));
      if (!text) continue;
      if (skipDepth) diagnostic.skippedTextCharacters += text.length;
      if (chromeDepth) diagnostic.chromeTextCharacters += text.length;
      if (hiddenDepth) diagnostic.hiddenTextCharacters += text.length;
      if (titleDepth) title = append(title, text, MAX_TITLE * 3);
      if (locDepth) locText = append(locText, text, 2_048);
      if (activeAnchor) activeAnchor.text = append(activeAnchor.text, text, 300);
      if (!skipDepth && !chromeDepth && !hiddenDepth) {
        fallback = append(fallback, text);
        if (preferredDepth) preferred = append(preferred, text);
      }
      diagnostic.titleBufferLength = title.length;
      diagnostic.preferredBufferLength = preferred.length;
      diagnostic.fallbackBufferLength = fallback.length;
      continue;
    }
    if (token.kind === "comment" || html.startsWith("<!", token.start)) continue;
    tagStart.lastIndex = token.start;
    const match = tagStart.exec(html);
    if (!match) continue;
    diagnostic.tags++;
    let tail = token.end - 2;
    while (tail >= tagStart.lastIndex && /\s/u.test(html[tail])) tail--;
    const closing = Boolean(match[1]), name = match[2].toLowerCase(), selfClosing = html[tail] === "/" && !RAW_TEXT.has(name);
    if (closing) {
      if (name === "a" && activeAnchor) { if (links.length < MAX_LINKS) links.push(activeAnchor); activeAnchor = null; }
      if (name === "loc" && locDepth) {
        if (locText && links.length < MAX_LINKS) links.push({ href: locText, text: "sitemap" });
        locText = "";
      }
      const index = stack.map(frame => frame.name).lastIndexOf(name);
      if (index >= 0) for (const frame of stack.splice(index)) {
        if (frame.skip) skipDepth = Math.max(0, skipDepth - 1);
        if (frame.chrome) chromeDepth = Math.max(0, chromeDepth - 1);
        if (frame.hidden) hiddenDepth = Math.max(0, hiddenDepth - 1);
        if (frame.preferred) preferredDepth = Math.max(0, preferredDepth - 1);
        if (frame.title) titleDepth = Math.max(0, titleDepth - 1);
        if (frame.loc) locDepth = Math.max(0, locDepth - 1);
      }
      continue;
    }
    const attrs = attributes(html, tagStart.lastIndex, token.end - 1, diagnostic);
    const hidden = Object.hasOwn(attrs, "hidden") || attrs["aria-hidden"]?.toLowerCase() === "true" ||
      /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)(?:\s*!important)?\s*(?:;|$)/iu.test(attrs.style ?? "");
    if (name === "meta") {
      const key = (attrs.name || attrs["http-equiv"] || "").toLowerCase();
      if (key === "robots" || key === "x-robots-tag" || key === "murmingletopiccrawler") {
        const directives = directiveSet(attrs.content);
        noindex ||= directives.has("noindex") || directives.has("none") || directives.has("noai") || directives.has("notrain");
        nofollow ||= directives.has("nofollow") || directives.has("none");
      }
      if (key === "tdm-reservation") {
        const content = attrs.content ?? "";
        if (!/^[01]$/u.test(content)) tdmReservationInvalid = true;
        else if (tdmReservation !== null && tdmReservation !== Number(content)) tdmReservationInvalid = true;
        else tdmReservation = Number(content);
      }
    }
    if (name === "link") {
      const rel = directiveSet(attrs.rel);
      if (rel.has("canonical") && typeof attrs.href === "string" && canonical === null) canonical = attrs.href;
      if ((rel.has("alternate") || rel.has("sitemap")) && typeof attrs.href === "string" && links.length < MAX_LINKS)
        links.push({ href: attrs.href, text: "alternate" });
    }
    if (name === "a" && typeof attrs.href === "string" && !skipDepth && !chromeDepth && !hiddenDepth && !hidden)
      activeAnchor = { href: attrs.href, text: "" };
    if (!selfClosing && !VOID.has(name)) {
      if (stack.length >= 256) throw new StaticCaptureError("stack-depth-limit", diagnostic);
      const frame = { name, skip: SKIP.has(name), chrome: CHROME.has(name), hidden,
        preferred: name === "main" || name === "article", title: name === "title", loc: name === "loc" };
      stack.push(frame);
      diagnostic.maximumStackDepth = Math.max(diagnostic.maximumStackDepth, stack.length);
      if (frame.skip) diagnostic.skipTags++;
      if (frame.chrome) diagnostic.chromeTags++;
      if (frame.hidden) diagnostic.hiddenTags++;
      if (frame.preferred) diagnostic.preferredTags++;
      if (frame.skip) skipDepth++;
      if (frame.chrome) chromeDepth++;
      if (frame.hidden) hiddenDepth++;
      if (frame.preferred) preferredDepth++;
      if (frame.title) titleDepth++;
      if (frame.loc) locDepth++;
    }
  }
  if (activeAnchor && links.length < MAX_LINKS) links.push(activeAnchor);
  const selected = preferred.length >= MIN_TEXT ? preferred : fallback;
  const text = normalizedText(selected).slice(0, MAX_TEXT);
  const safeTitle = normalizedText(title).slice(0, MAX_TITLE) || new URL(pageUrl).hostname.slice(0, MAX_TITLE);
  diagnostic.titleLength = safeTitle.length;
  diagnostic.extractedLength = text.length;
  diagnostic.preferredSelected = preferred.length >= MIN_TEXT;
  const hash = text ? createHash("sha256").update(text).digest("hex") : null;
  return Object.freeze({ title: safeTitle, text, contentHash: hash, links: Object.freeze(links), canonical,
    directives: Object.freeze({ noindex, nofollow, tdmReservation, tdmReservationInvalid }), extractorVersion: CRAWLER_EXTRACTOR_VERSION,
    eligible: text.length >= MIN_TEXT });
}

export function captureStaticHtml(html, pageUrl) { return capture(html, pageUrl, counts(html)); }
export function diagnoseStaticHtml(html, pageUrl) {
  const diagnostic = counts(html);
  try {
    const result = capture(html, pageUrl, diagnostic);
    return Object.freeze({ status: result.eligible ? "eligible" : "insufficient-text", summary: summary(diagnostic), failure: null });
  } catch (error) {
    const failure = describeStaticCaptureFailure(error);
    if (failure === null) throw error;
    return Object.freeze({ status: "document-invalid", summary: failure.summary, failure: failure.code });
  }
}

export function parseXRobotsTag(value, product = "murmingletopiccrawler") {
  const directives = directiveSet(value);
  // Product-scoped values are tolerated conservatively: any negative directive
  // in the combined header applies to this local crawler.
  return Object.freeze({ noindex: directives.has("noindex") || directives.has("none") || directives.has("noai"),
    nofollow: directives.has("nofollow") || directives.has("none"), product });
}
