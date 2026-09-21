import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  CANONICAL_JSON_DIGEST_ALGORITHM,
  canonicalJsonSha256,
} from "../evaluation/canonical-json.js";
import { normalizePublicHttpUrl } from "../src/url.js";

export const HTML_EXTRACTION_CONTRACT_VERSION =
  "synthetic-html-extraction/1.0.0";
export const HTML_PARSER_VERSION = "bounded-html-head-profile/1.0.0";
export const HTML_FINGERPRINT_VERSION = "sha256-raw-utf8-html/1.0.0";

export const HTML_EXTRACTION_LIMITS = Object.freeze({
  maximumAttributesPerTag: 32,
  maximumCanonicalDeclarations: 4,
  maximumComments: 256,
  maximumHeadAttributes: 1_024,
  maximumHeadBytes: 64 * 1_024,
  maximumHtmlBytes: 256 * 1_024,
  maximumNameCodeUnits: 64,
  maximumRawTitleCodeUnits: 1_024,
  maximumTags: 512,
  maximumTitleCodeUnits: 256,
  maximumValueCodeUnits: 8_192,
});

const INPUT_FIELDS = ["fixtureId", "htmlBytes", "mediaType", "observedUrl"];
const IDENTIFIER = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const ASCII_NAME_START = /^[A-Za-z]$/;
const ASCII_NAME_CONTINUE = /^[A-Za-z0-9:-]$/;
const SUPPORTED_ENTITIES = Object.freeze({
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
});
const HEAD_FORBIDDEN_TAGS = new Set([
  "base",
  "noscript",
  "script",
  "style",
  "template",
]);
const HEAD_IGNORED_TAGS = new Set(["meta"]);
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
const TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "buffer",
).get;
const TYPED_ARRAY_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "byteLength",
).get;
const TYPED_ARRAY_BYTE_OFFSET_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "byteOffset",
).get;
const ARRAY_BUFFER_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
).get;
const ARRAY_BUFFER_RESIZABLE_GETTER = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "resizable",
)?.get;

export class HtmlExtractionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HtmlExtractionError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new HtmlExtractionError(code, message);
}

function readExactObject(value, fields, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    utilTypes.isProxy(value) ||
    Array.isArray(value)
  ) {
    fail("INVALID_INPUT", `${label} must be a plain data object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("INVALID_INPUT", `${label} must not inherit data or behavior`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const allowed = new Set(fields);
  if (
    keys.some(
      (key) =>
        typeof key !== "string" ||
        !allowed.has(key) ||
        descriptors[key].get ||
        descriptors[key].set ||
        !descriptors[key].enumerable,
    ) ||
    fields.some((field) => !Object.hasOwn(descriptors, field))
  ) {
    fail("INVALID_INPUT", `${label} fields are not the exact data contract`);
  }
  return Object.fromEntries(fields.map((field) => [field, descriptors[field].value]));
}

function cloneExactBytes(value) {
  if (
    utilTypes.isProxy(value) ||
    !(value instanceof Uint8Array) ||
    Object.getPrototypeOf(value) !== Uint8Array.prototype
  ) {
    fail("INVALID_BYTES", "htmlBytes must be an exact Uint8Array");
  }
  let byteLength;
  try {
    byteLength = TYPED_ARRAY_BYTE_LENGTH_GETTER.call(value);
  } catch {
    fail("INVALID_BYTES", "htmlBytes must be an exact Uint8Array");
  }
  if (
    byteLength < 1 ||
    byteLength > HTML_EXTRACTION_LIMITS.maximumHtmlBytes
  ) {
    fail(
      "RESOURCE_LIMIT",
      `htmlBytes must be an exact Uint8Array with 1 to ${HTML_EXTRACTION_LIMITS.maximumHtmlBytes} bytes`,
    );
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    fail("INVALID_BYTES", "htmlBytes must not contain symbol fields");
  }
  const names = Object.getOwnPropertyNames(value);
  if (names.some((name, index) => name !== String(index))) {
    fail("INVALID_BYTES", "htmlBytes must not contain named or behavioral fields");
  }
  if (names.length !== byteLength) {
    fail(
      "INVALID_BYTES",
      "htmlBytes must contain only its complete indexed byte data",
    );
  }
  const backingBuffer = TYPED_ARRAY_BUFFER_GETTER.call(value);
  const bufferDescriptors = Object.getOwnPropertyDescriptors(backingBuffer);
  if (
    Object.getPrototypeOf(backingBuffer) !== ArrayBuffer.prototype ||
    Reflect.ownKeys(bufferDescriptors).length !== 0 ||
    (ARRAY_BUFFER_RESIZABLE_GETTER?.call(backingBuffer) ?? false) === true ||
    TYPED_ARRAY_BYTE_OFFSET_GETTER.call(value) !== 0 ||
    byteLength !== ARRAY_BUFFER_BYTE_LENGTH_GETTER.call(backingBuffer)
  ) {
    fail("INVALID_BYTES", "htmlBytes must own one fixed, non-shared ArrayBuffer");
  }
  return Uint8Array.from(value);
}

function isAsciiWhitespace(character) {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\f" ||
    character === "\r"
  );
}

function skipAsciiWhitespace(text, cursor) {
  while (cursor < text.length && isAsciiWhitespace(text[cursor])) cursor += 1;
  return cursor;
}

function startsWithAsciiInsensitive(text, cursor, expected) {
  if (cursor + expected.length > text.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    const actualCode = text.charCodeAt(cursor + index);
    const expectedCode = expected.charCodeAt(index);
    const foldedActual =
      actualCode >= 65 && actualCode <= 90 ? actualCode + 32 : actualCode;
    const foldedExpected =
      expectedCode >= 65 && expectedCode <= 90 ? expectedCode + 32 : expectedCode;
    if (foldedActual !== foldedExpected) return false;
  }
  return true;
}

function parseName(text, cursor) {
  if (cursor >= text.length || !ASCII_NAME_START.test(text[cursor])) {
    fail("INVALID_HTML_PROFILE", "Expected a bounded ASCII tag or attribute name");
  }
  const start = cursor;
  cursor += 1;
  while (cursor < text.length && ASCII_NAME_CONTINUE.test(text[cursor])) cursor += 1;
  if (cursor - start > HTML_EXTRACTION_LIMITS.maximumNameCodeUnits) {
    fail("RESOURCE_LIMIT", "HTML tag or attribute name exceeds the profile limit");
  }
  return { cursor, name: text.slice(start, cursor).toLowerCase() };
}

function parseStartTag(state) {
  const { text } = state;
  let cursor = state.cursor;
  if (text[cursor] !== "<" || text[cursor + 1] === "/") {
    fail("INVALID_HTML_PROFILE", "Expected an HTML start tag");
  }
  cursor += 1;
  const parsedName = parseName(text, cursor);
  cursor = parsedName.cursor;
  const attributes = new Map();
  let selfClosing = false;

  while (cursor < text.length) {
    const beforeWhitespace = cursor;
    cursor = skipAsciiWhitespace(text, cursor);
    if (text[cursor] === ">") {
      cursor += 1;
      break;
    }
    if (text[cursor] === "/" && text[cursor + 1] === ">") {
      selfClosing = true;
      cursor += 2;
      break;
    }
    if (cursor === beforeWhitespace) {
      fail("INVALID_HTML_PROFILE", "HTML attributes require separating whitespace");
    }

    const parsedAttribute = parseName(text, cursor);
    cursor = skipAsciiWhitespace(text, parsedAttribute.cursor);
    if (attributes.has(parsedAttribute.name)) {
      fail("INVALID_HTML_PROFILE", "Duplicate HTML attributes are not supported");
    }
    if (text[cursor] !== "=") {
      fail("INVALID_HTML_PROFILE", "HTML profile attributes require quoted values");
    }
    cursor = skipAsciiWhitespace(text, cursor + 1);
    const quote = text[cursor];
    if (quote !== '"' && quote !== "'") {
      fail("INVALID_HTML_PROFILE", "HTML profile attributes require quoted values");
    }
    const valueStart = cursor + 1;
    const valueEnd = text.indexOf(quote, valueStart);
    if (valueEnd === -1) {
      fail("INVALID_HTML_PROFILE", "HTML attribute quote is not closed");
    }
    if (valueEnd - valueStart > HTML_EXTRACTION_LIMITS.maximumValueCodeUnits) {
      fail("RESOURCE_LIMIT", "HTML attribute value exceeds the profile limit");
    }
    const rawValue = text.slice(valueStart, valueEnd);
    if (rawValue.includes("<")) {
      fail("INVALID_HTML_PROFILE", "HTML attribute value contains unsupported markup");
    }
    attributes.set(parsedAttribute.name, rawValue);
    if (attributes.size > HTML_EXTRACTION_LIMITS.maximumAttributesPerTag) {
      fail("RESOURCE_LIMIT", "HTML tag has too many attributes");
    }
    state.totalAttributes += 1;
    if (state.totalAttributes > HTML_EXTRACTION_LIMITS.maximumHeadAttributes) {
      fail("RESOURCE_LIMIT", "HTML head has too many attributes");
    }
    cursor = valueEnd + 1;
  }

  if (cursor > text.length || text[cursor - 1] !== ">") {
    fail("INVALID_HTML_PROFILE", "HTML start tag is not closed");
  }
  state.tags += 1;
  if (state.tags > HTML_EXTRACTION_LIMITS.maximumTags) {
    fail("RESOURCE_LIMIT", "HTML head has too many tags");
  }
  state.cursor = cursor;
  return { attributes, name: parsedName.name, selfClosing };
}

function parseEndTag(state, expectedName) {
  const { text } = state;
  let cursor = state.cursor;
  if (text[cursor] !== "<" || text[cursor + 1] !== "/") {
    fail("INVALID_HTML_PROFILE", "Expected an HTML end tag");
  }
  const parsedName = parseName(text, cursor + 2);
  cursor = skipAsciiWhitespace(text, parsedName.cursor);
  if (text[cursor] !== ">" || parsedName.name !== expectedName) {
    fail("INVALID_HTML_PROFILE", "HTML end tag does not match the profile");
  }
  state.tags += 1;
  if (state.tags > HTML_EXTRACTION_LIMITS.maximumTags) {
    fail("RESOURCE_LIMIT", "HTML head has too many tags");
  }
  state.cursor = cursor + 1;
}

function skipComment(state) {
  const start = state.cursor;
  const end = state.text.indexOf("-->", start + 4);
  if (end === -1 || state.text.slice(start + 4, end).includes("--")) {
    fail("INVALID_HTML_PROFILE", "HTML comment is malformed or unclosed");
  }
  if (end + 3 - start > HTML_EXTRACTION_LIMITS.maximumValueCodeUnits) {
    fail("RESOURCE_LIMIT", "HTML comment exceeds the profile limit");
  }
  state.comments += 1;
  if (state.comments > HTML_EXTRACTION_LIMITS.maximumComments) {
    fail("RESOURCE_LIMIT", "HTML head has too many comments");
  }
  state.cursor = end + 3;
}

function skipSpaceAndComments(state) {
  while (true) {
    state.cursor = skipAsciiWhitespace(state.text, state.cursor);
    if (!state.text.startsWith("<!--", state.cursor)) return;
    skipComment(state);
  }
}

function parseDoctype(state) {
  if (!startsWithAsciiInsensitive(state.text, state.cursor, "<!doctype")) {
    fail("INVALID_HTML_PROFILE", "Synthetic HTML requires an explicit doctype");
  }
  const end = state.text.indexOf(">", state.cursor + 9);
  if (end === -1) fail("INVALID_HTML_PROFILE", "HTML doctype is not closed");
  const declaration = state.text
    .slice(state.cursor + 2, end)
    .trim()
    .replace(/[\t\n\f\r ]+/g, " ")
    .toLowerCase();
  if (declaration !== "doctype html") {
    fail("INVALID_HTML_PROFILE", "Only the HTML doctype is supported");
  }
  state.cursor = end + 1;
}

function decodeEntityToken(token) {
  if (Object.hasOwn(SUPPORTED_ENTITIES, token)) return SUPPORTED_ENTITIES[token];
  let codePoint;
  if (/^#[0-9]+$/.test(token)) {
    codePoint = Number.parseInt(token.slice(1), 10);
  } else if (/^#x[0-9a-f]+$/i.test(token)) {
    codePoint = Number.parseInt(token.slice(2), 16);
  } else {
    fail("INVALID_ENTITY", "Extracted HTML field contains an unsupported entity");
  }
  if (
    !Number.isSafeInteger(codePoint) ||
    codePoint <= 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    fail("INVALID_ENTITY", "Extracted HTML field contains an invalid numeric entity");
  }
  return String.fromCodePoint(codePoint);
}

function decodeEntitiesOnce(value) {
  let output = "";
  let cursor = 0;
  while (cursor < value.length) {
    if (value[cursor] !== "&") {
      output += value[cursor];
      cursor += 1;
      continue;
    }
    const semicolon = value.indexOf(";", cursor + 1);
    if (semicolon === -1 || semicolon - cursor > 18) {
      fail("INVALID_ENTITY", "Extracted HTML field contains a malformed entity");
    }
    output += decodeEntityToken(value.slice(cursor + 1, semicolon));
    cursor = semicolon + 1;
  }
  return output;
}

function hasDisallowedExtractedCodePoint(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint === 0x7f ||
      (codePoint <= 0x1f && ![0x09, 0x0a, 0x0c, 0x0d].includes(codePoint)) ||
      (codePoint >= 0x80 && codePoint <= 0x9f) ||
      /\p{Cf}/u.test(character)
    ) {
      return true;
    }
  }
  return false;
}

function normalizeTitle(rawTitle) {
  if (rawTitle.length > HTML_EXTRACTION_LIMITS.maximumRawTitleCodeUnits) {
    fail("RESOURCE_LIMIT", "Raw HTML title exceeds the profile limit");
  }
  const decoded = decodeEntitiesOnce(rawTitle);
  if (hasDisallowedExtractedCodePoint(decoded)) {
    fail("INVALID_TITLE", "HTML title contains unsupported control characters");
  }
  const normalized = decoded.normalize("NFC").replace(/\p{White_Space}+/gu, " ").trim();
  if (
    normalized.length < 1 ||
    normalized.length > HTML_EXTRACTION_LIMITS.maximumTitleCodeUnits
  ) {
    fail(
      "INVALID_TITLE",
      `Normalized title must contain 1 to ${HTML_EXTRACTION_LIMITS.maximumTitleCodeUnits} code units`,
    );
  }
  return normalized;
}

function canonicalRelTokens(rawRel) {
  const decoded = decodeEntitiesOnce(rawRel);
  if (hasDisallowedExtractedCodePoint(decoded)) {
    fail("INVALID_ENTITY", "Canonical rel contains unsupported control characters");
  }
  return decoded
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .split(/\p{White_Space}+/u)
    .filter(Boolean);
}

function parseHeadProfile(text) {
  const state = {
    canonicalHrefs: [],
    comments: 0,
    cursor: 0,
    tags: 0,
    text,
    headClosed: false,
    title: null,
    totalAttributes: 0,
  };

  skipSpaceAndComments(state);
  parseDoctype(state);
  skipSpaceAndComments(state);
  const htmlTag = parseStartTag(state);
  if (htmlTag.name !== "html" || htmlTag.selfClosing) {
    fail("INVALID_HTML_PROFILE", "Synthetic HTML requires one non-empty html element");
  }
  skipSpaceAndComments(state);
  const headTag = parseStartTag(state);
  if (headTag.name !== "head" || headTag.selfClosing) {
    fail("INVALID_HTML_PROFILE", "Synthetic HTML requires one non-empty head element");
  }

  while (state.cursor < text.length) {
    skipSpaceAndComments(state);
    if (startsWithAsciiInsensitive(text, state.cursor, "</head")) {
      parseEndTag(state, "head");
      state.headClosed = true;
      break;
    }
    if (text[state.cursor] !== "<" || text[state.cursor + 1] === "/") {
      fail("INVALID_HTML_PROFILE", "HTML head contains unsupported text or end tags");
    }

    const tag = parseStartTag(state);
    if (HEAD_FORBIDDEN_TAGS.has(tag.name)) {
      fail("UNSUPPORTED_HEAD_CONTENT", "HTML head contains a forbidden active or base tag");
    }
    if (tag.name === "title") {
      if (tag.selfClosing || tag.attributes.size > 0 || state.title !== null) {
        fail("INVALID_TITLE", "Synthetic HTML requires exactly one plain title element");
      }
      const nextMarkup = text.indexOf("<", state.cursor);
      if (nextMarkup === -1) fail("INVALID_TITLE", "HTML title is not closed");
      const rawTitle = text.slice(state.cursor, nextMarkup);
      state.cursor = nextMarkup;
      parseEndTag(state, "title");
      state.title = normalizeTitle(rawTitle);
      continue;
    }
    if (tag.name === "link") {
      const rawRel = tag.attributes.get("rel");
      if (rawRel !== undefined && canonicalRelTokens(rawRel).includes("canonical")) {
        if (
          state.canonicalHrefs.length >=
          HTML_EXTRACTION_LIMITS.maximumCanonicalDeclarations
        ) {
          fail("RESOURCE_LIMIT", "HTML head has too many canonical declarations");
        }
        const rawHref = tag.attributes.get("href");
        state.canonicalHrefs.push(rawHref === undefined ? null : rawHref);
      }
      continue;
    }
    if (!HEAD_IGNORED_TAGS.has(tag.name)) {
      fail("UNSUPPORTED_HEAD_CONTENT", "HTML head contains an unsupported tag");
    }
  }

  if (state.title === null) {
    fail("INVALID_TITLE", "Synthetic HTML requires exactly one non-empty title");
  }
  if (!state.headClosed) {
    fail("INVALID_HTML_PROFILE", "HTML head is not closed");
  }
  const headBytes = new TextEncoder().encode(text.slice(0, state.cursor)).byteLength;
  if (headBytes > HTML_EXTRACTION_LIMITS.maximumHeadBytes) {
    fail("RESOURCE_LIMIT", "HTML head exceeds the byte limit");
  }
  return { canonicalHrefs: state.canonicalHrefs, title: state.title };
}

function validateDecodedHtml(text) {
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint === 0x7f ||
      (codePoint <= 0x1f && ![0x09, 0x0a, 0x0c, 0x0d].includes(codePoint)) ||
      (codePoint >= 0x80 && codePoint <= 0x9f)
    ) {
      fail("INVALID_UTF8", "HTML contains unsupported control characters");
    }
  }
}

function decodeUtf8(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail("INVALID_UTF8", "UTF-8 byte-order marks are not supported");
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("INVALID_UTF8", "htmlBytes must contain valid UTF-8");
  }
  validateDecodedHtml(text);
  return text;
}

function canonicalEvidence(canonicalHrefs, observedUrl) {
  const declarationCount = canonicalHrefs.length;
  if (declarationCount === 0) return { declarationCount, status: "absent" };
  if (declarationCount > 1) return { declarationCount, status: "ambiguous" };
  const [href] = canonicalHrefs;
  if (href === null) {
    return { declarationCount, status: "rejected-invalid" };
  }

  let decodedHref;
  try {
    decodedHref = decodeEntitiesOnce(href);
  } catch (error) {
    if (error instanceof HtmlExtractionError && error.code === "INVALID_ENTITY") {
      return { declarationCount, status: "rejected-invalid" };
    }
    throw error;
  }
  if (
    decodedHref.trim() === "" ||
    hasDisallowedExtractedCodePoint(decodedHref) ||
    /[\t\n\f\r]/.test(decodedHref)
  ) {
    return { declarationCount, status: "rejected-invalid" };
  }

  let candidateUrl;
  try {
    candidateUrl = normalizePublicHttpUrl(new URL(decodedHref, observedUrl).href);
  } catch {
    return { declarationCount, status: "rejected-invalid" };
  }
  if (new URL(candidateUrl).origin !== new URL(observedUrl).origin) {
    return { declarationCount, status: "rejected-cross-origin" };
  }
  return {
    candidateUrl,
    declarationCount,
    status: "same-origin-hint",
  };
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function extractSyntheticHtml(input) {
  const fields = readExactObject(input, INPUT_FIELDS, "extraction input");
  const htmlBytes = cloneExactBytes(fields.htmlBytes);
  if (fields.mediaType !== "text/html; charset=utf-8") {
    fail("INVALID_MEDIA_TYPE", "Only text/html; charset=utf-8 is supported");
  }
  if (typeof fields.fixtureId !== "string" || !IDENTIFIER.test(fields.fixtureId)) {
    fail("INVALID_FIXTURE_ID", "fixtureId must be a bounded lowercase identifier");
  }

  let observedUrl;
  try {
    observedUrl = normalizePublicHttpUrl(fields.observedUrl);
  } catch {
    fail("INVALID_OBSERVED_URL", "observedUrl must be a supported public HTTP(S) URL");
  }

  const html = decodeUtf8(htmlBytes);
  const extracted = parseHeadProfile(html);
  const contentFingerprint = `sha256:${createHash("sha256")
    .update(htmlBytes)
    .digest("hex")}`;
  const report = {
    contractVersion: HTML_EXTRACTION_CONTRACT_VERSION,
    fingerprintVersion: HTML_FINGERPRINT_VERSION,
    inputByteLength: htmlBytes.byteLength,
    metadataEvidence: {
      canonical: canonicalEvidence(extracted.canonicalHrefs, observedUrl),
    },
    parserVersion: HTML_PARSER_VERSION,
    scope: {
      callerDeclaredSynthetic: true,
      canonicalMetadataAuthoritative: false,
      completeP12SourceRecord: false,
      fixtureProvenanceVerified: false,
      liveFetchPerformed: false,
      networkUsed: false,
      rawContentRetained: false,
    },
    sourceProjection: {
      contentFingerprint,
      fingerprintEvidence: {
        fixtureId: fields.fixtureId,
        kind: "synthetic-fixture",
      },
      title: extracted.title,
      url: observedUrl,
    },
  };
  return deepFreeze({
    report,
    reportDigest: canonicalJsonSha256(report),
    reportDigestAlgorithm: CANONICAL_JSON_DIGEST_ALGORITHM,
  });
}
