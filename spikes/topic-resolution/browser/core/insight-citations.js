import { inspectPageUrl } from "./page-content-policy.js";

const MARKER = /\[(\??↗)\]\((https:\/\/[^\s)]{1,2048})\)/gu;
const PROVIDER_MARKER = /^cite[^]{1,200}$/u;
const UNRESOLVED_PROVIDER_MARKER = /cite[^]{1,200}/u;
const RAW_URL = /https?:\/\/[^\s<>"'`]+/giu;
const RELATED_MARKER = /^\[\[ref:([1-9]\d*)\]\]$/u;
const WEB_MARKER = /^\[\[webref:([1-9]\d*)\]\]$/u;
const MODEL_REF_MARKER = /^\[ref([1-9]\d*)\]$/u;

function neutralizeUnannotated(text) {
  // Page prose and model output can contain forged citation syntax. An URL in
  // that prose has no provider annotation, so retain surrounding words while
  // replacing the unverified address with a non-navigable placeholder.
  return text.replace(RAW_URL, (match) => {
    const trailing = match.match(/[),.;:!?]+$/u)?.[0] ?? "";
    return `[link omitted]${trailing}`;
  });
}

function sameCitationHost(label, url) {
  if (!/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/iu.test(label)) return false;
  const host = new URL(url).hostname.toLowerCase();
  const withoutWww = (value) => value.replace(/^www\./u, "");
  return withoutWww(label.toLowerCase()) === withoutWww(host);
}

function citationOnlyMarkdown(span, url) {
  const wrapped = /^\([ \t]*(\[[^\]\r\n]+\]\(https:\/\/[^\r\n]+\))[ \t]*\)$/u.exec(span);
  if (wrapped) span = wrapped[1];
  const match = /^\[([^\]\r\n]+)\]\((https:\/\/[^\r\n]+)\)$/u.exec(span);
  if (!match || !sameCitationHost(match[1], url)) return false;
  // The annotation, not the model-written Markdown, supplies link authority.
  return match[2] === url;
}

function hideLegacyDuplicateCitation(before, url) {
  const match = /\([ \t]*\[((?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+)\]\(\[link omitted\]\)[ \t]*\)[ \t]*$/iu.exec(before);
  return match && sameCitationHost(match[1], url) ? before.slice(0, match.index) : before;
}

export function safeInsightCitationUrl(url) {
  if (typeof url !== "string" || !url.startsWith("https://")) return false;
  const inspected = inspectPageUrl(url);
  return inspected.supported && inspected.url === url;
}

// Provider url_citation annotations place attested links; server-mapped
// model reference spans place distinct, visibly unverified link hints.
export function formatInsightCitations(body, citations, maxLength = 8000) {
  if (typeof body !== "string" || !Array.isArray(citations) || !Number.isSafeInteger(maxLength))
    throw new TypeError("Invalid citation result");
  if (!citations.length) {
    if (UNRESOLVED_PROVIDER_MARKER.test(body)) throw new TypeError("Unresolved provider citation");
    const draft = neutralizeUnannotated(body);
    if (draft.length > maxLength) throw new RangeError("Insight draft too long");
    return draft;
  }
  const ordered = citations.map((citation) => {
    let { startIndex, endIndex } = citation ?? {};
    const { url } = citation ?? {};
    if (!Number.isSafeInteger(startIndex) || !Number.isSafeInteger(endIndex) || startIndex < 0 ||
        endIndex <= startIndex || endIndex > body.length || !safeInsightCitationUrl(url))
      throw new TypeError("Invalid citation annotation");
    // The provider may count Unicode code points while JavaScript slices UTF-16
    // code units. Resolve this only when it identifies a complete citation token.
    if (!PROVIDER_MARKER.test(body.slice(startIndex, endIndex)) &&
        !RELATED_MARKER.test(body.slice(startIndex, endIndex)) &&
        !WEB_MARKER.test(body.slice(startIndex, endIndex)) &&
        !MODEL_REF_MARKER.test(body.slice(startIndex, endIndex)) &&
        !citationOnlyMarkdown(body.slice(startIndex, endIndex), url)) {
      const points = Array.from(body);
      if (endIndex <= points.length) {
        const candidateStart = points.slice(0, startIndex).join("").length;
        const candidateEnd = points.slice(0, endIndex).join("").length;
        if (PROVIDER_MARKER.test(body.slice(candidateStart, candidateEnd)) ||
            RELATED_MARKER.test(body.slice(candidateStart, candidateEnd)) ||
            WEB_MARKER.test(body.slice(candidateStart, candidateEnd)) ||
            MODEL_REF_MARKER.test(body.slice(candidateStart, candidateEnd)) ||
            citationOnlyMarkdown(body.slice(candidateStart, candidateEnd), url)) {
          startIndex = candidateStart; endIndex = candidateEnd;
        }
      }
    }
    return { startIndex, endIndex, url };
  }).sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex);
  let cursor = 0;
  let result = "";
  for (let index = 0; index < ordered.length;) {
    const first = ordered[index];
    if (first.startIndex < cursor) throw new TypeError("Overlapping citation annotations");
    const span = body.slice(first.startIndex, first.endIndex);
    const citationMarker = PROVIDER_MARKER.test(span);
    const relatedMatch = span.match(RELATED_MARKER);
    const relatedMarker = relatedMatch !== null;
    const webMatch = span.match(WEB_MARKER);
    const webMarker = webMatch !== null;
    const modelRefMatch = span.match(MODEL_REF_MARKER);
    const modelRefMarker = modelRefMatch !== null;
    const markdownCitation = citationOnlyMarkdown(span, first.url);
    if (span.startsWith("[[ref:") && !relatedMarker)
      throw new TypeError("Invalid related citation annotation");
    if (span.startsWith("[[webref:") && !webMarker)
      throw new TypeError("Invalid web citation annotation");
    if (span.startsWith("[ref") && !span.startsWith("[[ref:") && !modelRefMarker)
      throw new TypeError("Invalid model reference annotation");
    if (relatedMarker && Number(relatedMatch[1]) > 4)
      throw new TypeError("Unknown related citation reference");
    if (webMarker && Number(webMatch[1]) > 5)
      throw new TypeError("Unknown web citation reference");
    if (modelRefMarker && Number(modelRefMatch[1]) > 5)
      throw new TypeError("Unknown model reference");
    const unverifiedMarker = webMarker || modelRefMarker;
    let replacementStart = first.startIndex;
    let replacementEnd = first.endIndex;
    if (markdownCitation) {
      const open = /\([ \t]*$/u.exec(body.slice(cursor, replacementStart));
      const close = /^[ \t]*\)/u.exec(body.slice(replacementEnd));
      if (open && close) {
        replacementStart -= open[0].length;
        replacementEnd += close[0].length;
      }
    }
    result += neutralizeUnannotated(body.slice(cursor,
      citationMarker || relatedMarker || unverifiedMarker || markdownCitation ? replacementStart : replacementEnd));
    let next = index;
    while (next < ordered.length && ordered[next].startIndex === first.startIndex &&
        ordered[next].endIndex === first.endIndex) {
      // A canonical URL may contain parentheses. Percent-encode them so the
      // persistable marker remains unambiguous when it is edited or rendered.
      if (markdownCitation && ordered[next].url !== first.url)
        throw new TypeError("Conflicting citation annotation URLs");
      const url = ordered[next].url.replaceAll("(", "%28").replaceAll(")", "%29");
      if (!safeInsightCitationUrl(url)) throw new TypeError("Invalid citation URL");
      result += `${citationMarker || relatedMarker || unverifiedMarker || markdownCitation || /\s$/u.test(result) ? "" : " "}[${unverifiedMarker ? "?↗" : "↗"}](${url})`;
      next++;
    }
    cursor = replacementEnd;
    if (next < ordered.length && ordered[next].startIndex < cursor)
      throw new TypeError("Overlapping citation annotations");
    index = next;
  }
  result += neutralizeUnannotated(body.slice(cursor));
  if (result.length > maxLength) throw new RangeError("Insight draft too long");
  if (UNRESOLVED_PROVIDER_MARKER.test(result)) throw new TypeError("Unresolved provider citation");
  return result;
}

// Render only this exact marker form. All other Markdown and HTML remain text.
export function appendInsightCitationNodes(document, container, body,
  label = "Open source link", unverifiedLabel = "Unverified AI-suggested link",
  unverifiedNote = "AI-suggested links · sources not verified") {
  MARKER.lastIndex = 0;
  container.replaceChildren();
  let cursor = 0;
  let found = false;
  let foundUnverified = false;
  const sourceNumbers = new Map();
  for (const match of body.matchAll(MARKER)) {
    const url = match[2];
    if (!safeInsightCitationUrl(url)) continue;
    found = true;
    const unverified = match[1] === "?↗";
    if (unverified) foundUnverified = true;
    if (!sourceNumbers.has(url)) sourceNumbers.set(url, sourceNumbers.size + 1);
    const number = sourceNumbers.get(url);
    const before = document.createElement("span");
    before.textContent = match[1] === "↗"
      ? hideLegacyDuplicateCitation(body.slice(cursor, match.index), url)
      : body.slice(cursor, match.index);
    const superscript = document.createElement("sup");
    superscript.className = "inline-citation-sup";
    const link = document.createElement("a");
    link.className = unverified ? "inline-citation inline-citation-unverified" : "inline-citation";
    link.textContent = "↗";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.referrerPolicy = "no-referrer";
    link.setAttribute("aria-label", `${unverified ? unverifiedLabel : label} ${number}`);
    link.title = `${unverified ? unverifiedLabel : label} ${number}`;
    superscript.append(link);
    container.append(before, superscript);
    cursor = match.index + match[0].length;
  }
  if (found) {
    const after = document.createElement("span");
    after.textContent = body.slice(cursor);
    container.append(after);
    if (foundUnverified) {
      const note = document.createElement("span");
      note.className = "unverified-source-note";
      note.textContent = unverifiedNote;
      container.append(note);
    }
  } else container.textContent = body;
}
