import { inspectPageUrl } from "../../../../spikes/topic-resolution/browser/core/page-content-policy.js";
import { buildInsightInstructions } from "./insight-prompts.js";

const API = "https://api.openai.com/v1";
const HOUR = 3_600_000;
const TIMEOUT = 90_000;
const MODEL_TIMEOUT = 25_000;
const MAX_STREAM_BYTES = 262_144;
const MAX_CATALOG_BYTES = 2_097_152;
const MAX_INPUT = 34_000;
const MAX_OUTPUT = 8_000;
const MAX_MODELS = 2_048;
const MAX_DISPLAY_MODELS = 100;
const MAX_TEXT = 4_096;
const MAX_RELATED_EXCERPTS = 4;
const MAX_RELATED_EXCERPT_TEXT = 2_048;
const MAX_RELATED_EXCERPT_TOTAL = 8_192;
const UNSAFE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const STREAM_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/u;
const TRACE_EVENTS = ["response.created", "response.in_progress", "response.output_item.added",
  "response.output_item.done", "response.output_text.delta", "response.output_text.done",
  "response.content_part.added", "response.content_part.done", "response.web_search_call.in_progress",
  "response.web_search_call.searching", "response.web_search_call.completed",
  "response.refusal.delta", "response.refusal.done", "response.completed",
  "response.failed", "response.incomplete", "error"];
const TRACE_ITEM_TYPES = new Set(["message", "web_search_call", "reasoning"]);
const TRACE_STATUSES = new Set(["in_progress", "completed", "incomplete", "failed"]);
const TRACE_PREFIX_BRANCHES = new Set(["length", "candidate-repeated", "later-observed",
  "prior-id", "prior-shape"]);
const LIMITATIONS = new Set(["grouping-provisional", "related-not-same-topic", "title-url-only", "sources-unverified", "visible-roots-only"]);
const CATALOG_DETAILS = new Set(["catalog-redirect", "catalog-content-type", "catalog-body", "catalog-too-large",
  "catalog-stream", "catalog-encoding", "catalog-json", "catalog-shape", "catalog-entry"]);
const INSIGHT_DETAILS = new Set(["response-redirect", "response-content-type", "response-content-json", "response-content-html",
  "response-content-text", "response-content-missing", "response-content-other", "response-stream", "response-too-large",
  "response-encoding", "response-event", "response-no-final", "response-empty-output", "response-no-message",
  "response-message-unfinished", "response-refusal", "response-no-text", "response-blank-text",
  "response-output-empty", "response-search-only", "response-reasoning-only",
  "response-final-item-missing", "response-item-identity", "response-item-conflict",
  "response-item-prefix", "response-item-text", "response-stream-text-unfinalized",
  "response-unsafe-text", "response-output-too-large",
  "response-incomplete", "response-failed", "response-http-400"]);

export class ChatGptInsightError extends Error {
  constructor(code, detail) {
    super("ChatGPT insight request unavailable");
    this.name = "ChatGptInsightError";
    this.code = code;
    if (((code === "invalid-response" && CATALOG_DETAILS.has(detail)) ||
         (["invalid-response", "provider-unavailable"].includes(code) && INSIGHT_DETAILS.has(detail)))) this.detail = detail;
  }
}
function fail(code, detail) { throw new ChatGptInsightError(code, detail); }
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("invalid-input");
  return value;
}
function own(value, key) {
  object(value);
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) fail("invalid-input");
  return descriptor.value;
}
function keys(value, expected) {
  object(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== expected.length ||
      expected.some((key) => !Object.hasOwn(descriptors, key)) ||
      Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !expected.includes(key) ||
        !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) fail("invalid-input");
  return value;
}
function array(value, maximum) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) fail("invalid-input");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) fail("invalid-input");
  return Array.from({ length: value.length }, (_, i) => {
    const descriptor = descriptors[i];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) fail("invalid-input");
    return descriptor.value;
  });
}
function text(value, maximum, multiline = false) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum ||
      (multiline ? UNSAFE : /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u).test(value)) fail("invalid-input");
  return value;
}
function id(value) { if (typeof value !== "string" || !ID.test(value)) fail("invalid-input"); return value; }
function publicUrl(value) {
  if (typeof value !== "string" || value.length > 2_048) fail("invalid-input");
  const inspected = inspectPageUrl(value);
  if (!inspected.supported || inspected.url !== value || !value.startsWith("https://")) fail("invalid-input");
  return value;
}
function source(value) {
  keys(value, ["id", "url", "title"]);
  return { id: id(own(value, "id")), url: publicUrl(own(value, "url")), title: text(own(value, "title"), 512) };
}
function contextValue(value) {
  keys(value, ["schema", "topic", "currentSource", "sameTopicSources", "relatedSources", "discussion", "coverage", "limitations"]);
  if (own(value, "schema") !== "insight-context/v1") fail("invalid-input");
  const topic = own(value, "topic"); keys(topic, ["id", "title"]);
  const selected = { id: id(own(topic, "id")), title: text(own(topic, "title"), 200) };
  const currentSource = own(value, "currentSource") === null ? null : source(own(value, "currentSource"));
  if (!currentSource) fail("invalid-input");
  const sameTopicSources = array(own(value, "sameTopicSources"), 5).map(source);
  const relatedSources = array(own(value, "relatedSources"), 5).map(source);
  const seen = new Set();
  for (const entry of [currentSource, ...sameTopicSources, ...relatedSources]) {
    if (seen.has(entry.id)) fail("invalid-input");
    seen.add(entry.id);
  }
  const discussion = array(own(value, "discussion"), 5).map((entry) => {
    keys(entry, ["id", "actorType", "body"]);
    if (own(entry, "actorType") !== "human") fail("invalid-input");
    return { id: id(own(entry, "id")), actorType: "human", body: text(own(entry, "body"), 800, true) };
  });
  const coverage = own(value, "coverage"); keys(coverage, ["sameTopicTotal", "relatedTotal", "discussionIncluded"]);
  for (const key of ["sameTopicTotal", "relatedTotal"]) {
    if (!Number.isSafeInteger(own(coverage, key)) || own(coverage, key) < 0 || own(coverage, key) > 100) fail("invalid-input");
  }
  if (own(coverage, "sameTopicTotal") < sameTopicSources.length || own(coverage, "relatedTotal") < relatedSources.length ||
      typeof own(coverage, "discussionIncluded") !== "boolean" ||
      (!own(coverage, "discussionIncluded") && discussion.length)) fail("invalid-input");
  const limitations = array(own(value, "limitations"), 8).map((item) => {
    if (!LIMITATIONS.has(item)) fail("invalid-input");
    return item;
  });
  return { schema: "insight-context/v1", topic: selected, currentSource, sameTopicSources, relatedSources,
    discussion, coverage: { sameTopicTotal: coverage.sameTopicTotal, relatedTotal: coverage.relatedTotal,
      discussionIncluded: coverage.discussionIncluded }, limitations };
}
function followupValue(value) {
  keys(value, ["parentBody", "questionBody"]);
  return { parentBody: text(own(value, "parentBody"), 2_000, true),
    questionBody: text(own(value, "questionBody"), 2_000, true) };
}
/** Verify each excerpt against the already validated, selected public source context. */
export function validateRelatedExcerpts(value, context) {
  const candidates = new Map([...context.sameTopicSources, ...context.relatedSources]
    .map((entry) => [entry.id, entry.url]));
  const seen = new Set();
  let total = 0;
  return array(value, MAX_RELATED_EXCERPTS).map((entry) => {
    keys(entry, ["sourceId", "url", "text"]);
    const sourceId = id(own(entry, "sourceId"));
    const url = own(entry, "url");
    if (typeof url !== "string" || url.length > 2_048) fail("invalid-input");
    const excerpt = text(own(entry, "text"), MAX_RELATED_EXCERPT_TEXT, true);
    if (sourceId === context.currentSource.id || url === context.currentSource.url ||
        !candidates.has(sourceId) || candidates.get(sourceId) !== url || seen.has(sourceId)) fail("invalid-input");
    seen.add(sourceId);
    total += excerpt.length;
    if (total > MAX_RELATED_EXCERPT_TOTAL) fail("invalid-input");
    return { sourceId, url, text: excerpt };
  });
}
function followupContext(context, articleText, followup, relatedExcerpts) {
  const sourceReference = ({ title, url }) => ({ title, url });
  return { currentSource: sourceReference(context.currentSource),
    sameTopicSources: context.sameTopicSources.map(sourceReference),
    relatedSources: context.relatedSources.map(sourceReference),
    articlePrefix: articleText, relatedExcerpts, robotParent: followup.parentBody,
    humanQuestion: followup.questionBody };
}
function errorForStatus(status) {
  return status === 401 || status === 403 ? "unauthorized" : status === 429 ? "rate-limit" : "provider-unavailable";
}
function errorForCode(code) {
  return code === "subscription_sharing_usage_limit_exceeded" ? "rate-limit" :
    code === "subscription_sharing_unsupported_capability" ? "unsupported-capability" : "provider-unavailable";
}
function responseContentDetail(contentType) {
  if (typeof contentType !== "string" || !contentType.trim()) return "response-content-missing";
  if (/^application\/json[ \t]*(?:;|$)/iu.test(contentType)) return "response-content-json";
  if (/^text\/html[ \t]*(?:;|$)/iu.test(contentType)) return "response-content-html";
  if (/^text\/plain[ \t]*(?:;|$)/iu.test(contentType)) return "response-content-text";
  return "response-content-other";
}
async function responseError(response, signal) {
  if (response?.status === 400 && /^application\/json(?:;|$)/iu.test(response.headers?.get("content-type") ?? "")) {
    try {
      const parsed = JSON.parse(await boundedBody(response, 8_192, signal));
      if (parsed?.error?.code === "subscription_sharing_unsupported_capability") fail("unsupported-capability");
    } catch (error) {
      if (error instanceof ChatGptInsightError && error.code === "unsupported-capability") throw error;
    }
  }
  fail(errorForStatus(response?.status), response?.status === 400 ? "response-http-400" : undefined);
}
function safeCitation(value, body, offset) {
  if (!value || value.type !== "url_citation") return null;
  try {
    const url = publicUrl(value.url);
    const title = text(value.title, 512);
    const startIndex = value.start_index, endIndex = value.end_index;
    if (!Number.isSafeInteger(startIndex) || !Number.isSafeInteger(endIndex) ||
        startIndex < 0 || endIndex <= startIndex || endIndex > body.length) return null;
    return { url, title, startIndex: offset + startIndex, endIndex: offset + endIndex };
  } catch { return null; }
}
function completed(value, model, streamShape) {
  if (!value || value.status !== "completed" || !Array.isArray(value.output)) fail("invalid-response", "response-event");
  // The response may report the resolved model behind an account-listed alias.
  if (value.model !== undefined && (typeof value.model !== "string" || !SLUG.test(value.model))) fail("invalid-response");
  let body = "";
  const citations = [];
  let assistantMessage = false;
  let completedMessage = false;
  let outputText = false;
  let refusal = false;
  for (const item of value.output) {
    if (item?.type !== "message" || item.role !== "assistant") continue;
    assistantMessage = true;
    if (item.status !== "completed" || !Array.isArray(item.content)) continue;
    completedMessage = true;
    for (const part of item.content) {
      if (part?.type === "refusal") refusal = true;
      if (part?.type !== "output_text" || typeof part.text !== "string") continue;
      outputText = true;
      const offset = body.length;
      body += part.text;
      if (body.length > MAX_OUTPUT) fail("invalid-response", "response-output-too-large");
      if (Array.isArray(part.annotations)) {
        for (const annotation of part.annotations.slice(0, 50)) {
          const citation = safeCitation(annotation, part.text, offset);
          if (citation) citations.push(citation);
        }
      }
    }
  }
  if (!assistantMessage) {
    if (streamShape.finalAssistantItem) fail("invalid-response", streamShape.fallbackFailure ?? "response-final-item-missing");
    if (streamShape.textDone) fail("invalid-response", "response-stream-text-unfinalized");
    if (value.output.length === 0) fail("invalid-response", "response-output-empty");
    if (value.output.some((item) => item?.type === "web_search_call") &&
        value.output.every((item) => ["web_search_call", "reasoning"].includes(item?.type)))
      fail("invalid-response", "response-search-only");
    if (value.output.every((item) => item?.type === "reasoning")) fail("invalid-response", "response-reasoning-only");
    fail("invalid-response", "response-no-message");
  }
  if (!completedMessage) fail("invalid-response", "response-message-unfinished");
  if (refusal) fail("invalid-response", "response-refusal");
  if (!outputText) fail("invalid-response", "response-no-text");
  if (!body.trim()) fail("invalid-response", "response-blank-text");
  if (UNSAFE.test(body)) fail("invalid-response", "response-unsafe-text");
  return { body, citations, model };
}
function completedStreamItemFallback(final, model, shape) {
  const reject = (detail, branch = null) => {
    shape.fallbackFailure = detail;
    shape.fallbackBranch = branch;
    return null;
  };
  const candidate = shape.candidate;
  if (shape.conflict) return reject("response-item-conflict");
  if (shape.createdCount !== 1 || !candidate || shape.candidateCount !== 1 ||
      typeof final?.id !== "string" || final.id !== shape.createdId) return reject("response-item-identity");
  if (final.status !== "completed" || !Array.isArray(final.output) ||
      final.error != null || final.incomplete_details != null ||
      final.output.some((item) => item?.type === "message" ||
        (item?.status != null && item.status !== "completed"))) return reject("response-item-conflict");
  if (!shape.completeStream) return reject("response-event");
  if (!Array.isArray(candidate.item.content) || candidate.item.content.length > 8) return reject("response-item-text");
  if (final.output.length === 0) {
    if (shape.addedItems.length !== candidate.index + 1 ||
        shape.doneItems.length !== candidate.index + 1) return reject("response-item-prefix", "length");
    const ids = new Set();
    for (let index = 0; index <= candidate.index; index += 1) {
      const added = shape.addedItems.find((item) => item.index === index);
      const done = shape.doneItems.find((item) => item.index === index);
      if (!added || !done) return reject("response-item-prefix", "length");
      if (ids.has(done.id) || added.id !== done.id || added.type !== done.type ||
          (done.type === "reasoning" ? added.status !== undefined || done.status !== undefined :
            added.status !== "in_progress" || done.status !== "completed"))
        return reject("response-item-identity");
      ids.add(done.id);
      if (index === candidate.index) {
        if (done.id !== candidate.item.id || done.type !== "message" || done.role !== "assistant" ||
            added.role !== "assistant") return reject("response-item-identity");
        // A newly added assistant message has no answer yet. A populated earlier
        // content field cannot establish the same final private draft.
        if (!Array.isArray(added.item.content) || added.item.content.length !== 0)
          return reject("response-item-text");
      } else if (!["reasoning", "web_search_call"].includes(done.type) ||
          added.role !== undefined || done.role !== undefined) return reject("response-item-conflict");
      if (index < candidate.index) {
        // Reasoning encrypted_content is opaque and may change between added and done.
        for (const key of done.type === "reasoning" ? ["content", "summary", "action"] :
          ["content", "summary", "encrypted_content", "action"]) {
          const preliminary = added.item[key];
          if (preliminary == null || preliminary === "" ||
              Array.isArray(preliminary) && preliminary.length === 0 ||
              typeof preliminary === "object" && !Array.isArray(preliminary) &&
                Object.keys(preliminary).length === 0) continue;
          if (JSON.stringify(preliminary) !== JSON.stringify(done.item[key]))
            return reject("response-item-conflict");
        }
      }
    }
    if (shape.unpairedDone) return reject("response-item-conflict");
  } else {
    if (final.output.length !== candidate.index) return reject("response-item-prefix", "length");
    if (final.output.some((item) => item?.id === candidate.item.id))
      return reject("response-item-prefix", "candidate-repeated");
    if (shape.addedItems.some((added) => added.index === candidate.index &&
        (added.id !== candidate.item.id || added.type !== "message" || added.role !== "assistant")))
      return reject("response-item-identity");
    for (const observed of [...shape.addedItems, ...shape.doneItems]) {
      if (observed.index > candidate.index) return reject("response-item-prefix", "later-observed");
      if (observed.index < candidate.index) {
        const terminal = final.output[observed.index];
        if (terminal?.id !== observed.id) return reject("response-item-prefix", "prior-id");
        if (terminal.type !== observed.type ||
            (observed.role !== undefined && terminal.role !== observed.role) ||
            (observed.status !== undefined && terminal.status !== observed.status))
          return reject("response-item-conflict", "prior-shape");
      }
    }
  }
  const texts = candidate.item.content.map((part, index) => ({ part, index }))
    .filter(({ part }) => part?.type === "output_text" && typeof part.text === "string");
  if (!texts.length || (shape.textDoneItems.length > 0 && texts.length !== shape.textDoneItems.length))
    return reject("response-item-text");
  if (shape.textDoneItems.length) {
    for (const { part, index } of texts) {
      const matches = shape.textDoneItems.filter((done) => done.itemId === candidate.item.id &&
        done.outputIndex === candidate.index && done.contentIndex === index && done.text === part.text);
      if (matches.length !== 1) return reject("response-item-text");
    }
  }
  for (const done of shape.contentDoneItems) {
    const part = candidate.item.content[done.contentIndex];
    if (done.itemId !== candidate.item.id || done.outputIndex !== candidate.index ||
        part?.type !== "output_text" || done.part?.type !== "output_text" ||
        done.part.text !== part.text) return reject("response-item-text");
  }
  // A finalized item may be used only after the terminal completed response;
  // no delta, tool result, conflicting final item or refused output is imported.
  return completed({ ...final, output: [candidate.item] }, model, shape);
}
async function boundedBody(response, maximum, signal, catalog = false) {
  if (!response.body?.getReader) fail("invalid-response", catalog ? "catalog-stream" : "response-stream");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) fail("cancelled");
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) fail("invalid-response", catalog ? "catalog-stream" : "response-stream");
      size += value.byteLength;
      if (size > maximum) fail("invalid-response", catalog ? "catalog-too-large" : "response-too-large");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail("invalid-response", catalog ? "catalog-encoding" : "response-encoding"); }
}
function traceIndex(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 100 ? value : null; }
function traceItem(item, index, phase) {
  return { phase, index: traceIndex(index), type: TRACE_ITEM_TYPES.has(item?.type) ? item.type : "other",
    status: TRACE_STATUSES.has(item?.status) ? item.status : "other" };
}
function parseSse(raw, model, onTrace) {
  const frames = raw.replace(/\r\n/gu, "\n").split("\n\n");
  let final = null;
  const streamShape = { finalAssistantItem: false, textDone: false, createdId: null,
    createdCount: 0, candidate: null, candidateCount: 0, textDoneItems: [], contentDoneItems: [],
    addedItems: [], doneItems: [], conflict: false, unpairedDone: false, completeStream: isCompleteSse(raw) };
  const eventCounts = Object.fromEntries(TRACE_EVENTS.map((type) => [type, 0]));
  const eventSequence = [];
  const observedItems = [];
  let otherEventCount = 0;
  let textDoneCount = 0;
  let contentDoneCount = 0;
  let outcome = "success";
  let detail = null;
  try {
  for (const frame of frames) {
    const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") continue;
    if (final !== null) fail("invalid-response", "response-event");
    let event;
    try { event = JSON.parse(data); } catch { fail("invalid-response", "response-event"); }
    if (Object.hasOwn(eventCounts, event?.type)) {
      eventCounts[event.type] = Math.min(eventCounts[event.type] + 1, 101);
      if (eventSequence.length < 24) eventSequence.push(event.type);
    } else {
      otherEventCount = Math.min(otherEventCount + 1, 101);
      if (eventSequence.length < 24) eventSequence.push("other");
    }
    if (event?.type === "response.output_item.added" || event?.type === "response.output_item.done") {
      if (observedItems.length < 16) observedItems.push(traceItem(event.item, event.output_index,
        event.type === "response.output_item.added" ? "added" : "done"));
    }
    if (event?.type === "response.output_text.done") textDoneCount = Math.min(textDoneCount + 1, 101);
    if (event?.type === "response.content_part.done") contentDoneCount = Math.min(contentDoneCount + 1, 101);
    const eventLine = frame.split("\n").find((line) => line.startsWith("event:"));
    if (!eventLine || eventLine.slice(6).trimStart() !== event.type) streamShape.conflict = true;
    if (event.type === "response.failed") fail(errorForCode(event.response?.error?.code), "response-failed");
    if (event.type === "response.incomplete") fail(errorForCode(event.response?.error?.code), "response-incomplete");
    if (event.type === "error") fail(errorForCode(event.error?.code), "response-failed");
    if (event.type === "response.refusal.delta" || event.type === "response.refusal.done") streamShape.conflict = true;
    if (event.type === "response.created") {
      streamShape.createdCount += 1;
      if (typeof event.response?.id !== "string" || !STREAM_ID.test(event.response.id) ||
          streamShape.createdCount !== 1) streamShape.conflict = true;
      else streamShape.createdId = event.response.id;
    }
    if (event.type === "response.in_progress" && streamShape.createdId &&
        event.response?.id !== streamShape.createdId) streamShape.conflict = true;
    if (event.type === "response.output_item.added") {
      if (streamShape.addedItems.length >= 101 || !Number.isSafeInteger(event.output_index) ||
          event.output_index < 0 || event.output_index > 100 || typeof event.item?.id !== "string" ||
          !STREAM_ID.test(event.item.id) || streamShape.addedItems.some((item) => item.index === event.output_index) ||
          (event.item.type === "message" && event.item.role === "assistant" &&
            streamShape.addedItems.some((item) => item.type === "message" && item.role === "assistant")))
        streamShape.conflict = true;
      else streamShape.addedItems.push({ index: event.output_index, id: event.item.id,
        type: event.item.type, role: event.item.role, status: event.item.status, item: event.item });
    }
    if (event.type === "response.output_item.done") {
      if (streamShape.doneItems.length >= 101 || !Number.isSafeInteger(event.output_index) ||
          event.output_index < 0 || event.output_index > 100 || typeof event.item?.id !== "string" ||
          !STREAM_ID.test(event.item.id) || streamShape.doneItems.some((item) => item.index === event.output_index) ||
          streamShape.addedItems.some((item) => item.index === event.output_index &&
            (item.id !== event.item.id || item.type !== event.item.type ||
              (item.role !== undefined && item.role !== event.item.role))))
        streamShape.conflict = true;
      else streamShape.doneItems.push({ index: event.output_index, id: event.item.id,
        type: event.item.type, role: event.item.role, status: event.item.status, item: event.item });
      if (!streamShape.addedItems.some((item) => item.index === event.output_index))
        streamShape.unpairedDone = true;
      if (event.item?.status !== undefined && event.item.status !== "completed") streamShape.conflict = true;
      if (event.item?.type === "message" && event.item.role === "assistant") {
        streamShape.candidateCount += 1;
        if (event.item.status !== "completed") streamShape.conflict = true;
        else {
          streamShape.finalAssistantItem = true;
          if (streamShape.candidateCount !== 1 || typeof event.item.id !== "string" ||
              !STREAM_ID.test(event.item.id) || !Number.isSafeInteger(event.output_index) ||
              event.output_index < 0 || event.output_index > 100) streamShape.conflict = true;
          else streamShape.candidate = { item: event.item, index: event.output_index };
        }
      }
    }
    if (event.type === "response.output_text.done") {
      streamShape.textDone = true;
      if (streamShape.textDoneItems.length >= 8 || typeof event.item_id !== "string" ||
          !STREAM_ID.test(event.item_id) || !Number.isSafeInteger(event.output_index) ||
          !Number.isSafeInteger(event.content_index) || event.output_index < 0 || event.output_index > 100 ||
          event.content_index < 0 || event.content_index > 7 || typeof event.text !== "string" ||
          event.text.length > MAX_OUTPUT)
        streamShape.conflict = true;
      else streamShape.textDoneItems.push({ itemId: event.item_id, outputIndex: event.output_index,
        contentIndex: event.content_index, text: event.text });
    }
    if (event.type === "response.content_part.done") {
      if (streamShape.contentDoneItems.length >= 8 || typeof event.item_id !== "string" ||
          !STREAM_ID.test(event.item_id) || !Number.isSafeInteger(event.output_index) ||
          !Number.isSafeInteger(event.content_index) || event.output_index < 0 || event.output_index > 100 ||
          event.content_index < 0 || event.content_index > 7 || event.part?.type !== "output_text" ||
          typeof event.part.text !== "string" || event.part.text.length > MAX_OUTPUT ||
          streamShape.contentDoneItems.some((part) => part.contentIndex === event.content_index))
        streamShape.conflict = true;
      else streamShape.contentDoneItems.push({ itemId: event.item_id, outputIndex: event.output_index,
        contentIndex: event.content_index, part: event.part });
    }
    if (event.type === "response.completed") {
      final = event.response;
    }
  }
  if (!final) fail("invalid-response", "response-no-final");
  const recovered = completedStreamItemFallback(final, model, streamShape);
  if (recovered) return recovered;
  return completed(final, model, streamShape);
  } catch (error) {
    outcome = "failure";
    detail = INSIGHT_DETAILS.has(error?.detail) ? error.detail : null;
    throw error;
  } finally {
    if (onTrace) {
      const output = Array.isArray(final?.output) ? final.output : [];
      const trace = { schema: "insight-response-trace/v1", outcome, detail,
        events: { sequence: eventSequence, counts: eventCounts, otherCount: otherEventCount },
        createdCount: Math.min(streamShape.createdCount, 101),
        createdFinalMatch: typeof streamShape.createdId === "string" &&
          typeof final?.id === "string" && streamShape.createdId === final.id,
        finalStatus: TRACE_STATUSES.has(final?.status) ? final.status : "other",
        observedItems, finalOutput: output.slice(0, 16).map((item, index) => traceItem(item, index, "final")),
        finalOutputCount: Math.min(output.length, 101),
        candidateCount: Math.min(streamShape.candidateCount, 101),
        candidateIndex: traceIndex(streamShape.candidate?.index), textDoneCount, contentDoneCount,
        fallbackFailure: INSIGHT_DETAILS.has(streamShape.fallbackFailure) ? streamShape.fallbackFailure : null,
        fallbackBranch: TRACE_PREFIX_BRANCHES.has(streamShape.fallbackBranch) ? streamShape.fallbackBranch : null };
      try {
        const sent = onTrace(trace);
        if (sent && typeof sent.then === "function") void Promise.resolve(sent).catch(() => {});
      } catch { /* Diagnostics never change a research result. */ }
    }
  }
}
function isCompleteSse(raw) {
  const normalized = raw.replace(/\r\n|\r/gu, "\n");
  if (!normalized.endsWith("\n\n")) return false;
  const frames = normalized.slice(0, -2).split("\n\n");
  if (!frames.length) return false;
  let completedEvent = false;
  for (const frame of frames) {
    let type = null;
    let data = null;
    for (const line of frame.split("\n")) {
      if (line.startsWith(":")) continue;
      const match = /^(event|data): ?(.*)$/u.exec(line);
      if (!match) return false;
      if (match[1] === "event") {
        if (type !== null) return false;
        type = match[2];
      } else {
        if (data !== null) return false;
        data = match[2];
      }
    }
    if (!type || data === null || completedEvent) return false;
    let parsed;
    try { parsed = JSON.parse(data); } catch { return false; }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.type !== type) return false;
    if (type === "response.completed") completedEvent = true;
  }
  return completedEvent;
}
function completeHeaderlessFailureCode(raw) {
  const normalized = raw.replace(/\r\n|\r/gu, "\n");
  if (!normalized.endsWith("\n\n")) return null;
  const frames = normalized.slice(0, -2).split("\n\n");
  if (frames.length < 2 || frames.length > 4) return null;
  let createdId = null;
  let previous = "";
  let failureCode = null;
  for (const [index, frame] of frames.entries()) {
    const lines = frame.split("\n");
    if (lines.length !== 2) return null;
    const eventLine = /^event: ?([^\s]+)$/u.exec(lines[0]);
    const dataLine = /^data: ?(.+)$/u.exec(lines[1]);
    if (!eventLine || !dataLine) return null;
    let event;
    try { event = JSON.parse(dataLine[1]); } catch { return null; }
    if (!event || typeof event !== "object" || Array.isArray(event) || event.type !== eventLine[1]) return null;
    const type = event.type;
    if (index === 0 ? type !== "response.created" :
        type !== "response.in_progress" && type !== "error" && type !== "response.failed") return null;
    if (type === "response.in_progress" && previous !== "response.created") return null;
    if (type === "error" && !["response.created", "response.in_progress"].includes(previous)) return null;
    if (type === "response.failed" && index !== frames.length - 1) return null;
    if (type !== "error") {
      if (!event.response || typeof event.response !== "object" || Array.isArray(event.response)) return null;
      const responseId = event.response.id;
      if (responseId !== undefined) {
        if (typeof responseId !== "string" || !STREAM_ID.test(responseId) ||
            createdId !== null && responseId !== createdId) return null;
        createdId = responseId;
      }
      if (type !== "response.failed" && event.response.status !== "in_progress") return null;
    }
    if (type === "response.failed") {
      if (event.response.status !== "failed" || event.response.output?.length ||
          typeof event.response.error?.code !== "string") return null;
      failureCode = event.response.error.code;
    }
    previous = type;
  }
  return previous === "response.failed" &&
    ["subscription_sharing_usage_limit_exceeded", "subscription_sharing_unsupported_capability"].includes(failureCode)
    ? failureCode : null;
}

/** Injected transport only; construction performs no I/O. All limits reset on process restart. */
export function createChatGptInsights({ fetchImpl, getAccessToken, now = Date.now, onTrace, onDebug }) {
  if (typeof fetchImpl !== "function" || typeof getAccessToken !== "function" || typeof now !== "function" ||
      (onTrace !== undefined && typeof onTrace !== "function") ||
      (onDebug !== undefined && typeof onDebug !== "function")) fail("invalid-input");
  let active = null;
  let disposed = false;
  let listed = new Set();
  let modelEpoch = 0;
  let calls = [];
  function debug(event) {
    if (!onDebug) return;
    try {
      const sent = onDebug(event);
      if (sent && typeof sent.then === "function") void Promise.resolve(sent).catch(() => {});
    } catch { /* Opt-in diagnostics never change the research result. */ }
  }
  function check(signal) { if (signal.aborted || disposed) fail("cancelled"); }
  function guard() { if (disposed) fail("cancelled"); if (active) fail("busy"); }
  async function run(work, signal, timeout = TIMEOUT) {
    guard();
    const abort = new AbortController();
    active = abort;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; abort.abort(); }, timeout);
    const cancel = () => abort.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(new ChatGptInsightError("cancelled"));
      abort.signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      if (signal?.aborted) fail("cancelled");
      const result = await Promise.race([work(abort.signal), aborted]);
      check(abort.signal);
      return result;
    } catch (error) {
      if (timedOut) fail("timeout");
      if (abort.signal.aborted) fail("cancelled");
      if (error instanceof ChatGptInsightError) throw error;
      fail("provider-unavailable");
    } finally {
      clearTimeout(timer); signal?.removeEventListener("abort", cancel);
      abort.signal.removeEventListener("abort", onAbort); active = null;
    }
  }
  async function token() {
    const value = await getAccessToken();
    if (typeof value !== "string" || value.length < 16 || value.length > 20_000 || /[\s\u0000-\u001f]/u.test(value)) fail("unauthorized");
    return value;
  }
  async function listModels({ signal } = {}) {
    return run(async (requestSignal) => {
      const before = modelEpoch;
      const accessToken = await token();
      check(requestSignal);
      const response = await fetchImpl(`${API}/models`, { method: "GET", headers: { Authorization: `Bearer ${accessToken}` },
        signal: requestSignal, redirect: "error", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
      check(requestSignal);
      if (response?.redirected || response?.url && response.url !== `${API}/models`) fail("invalid-response", "catalog-redirect");
      if (!response?.ok) fail(errorForStatus(response?.status));
      if (!/^application\/json(?:;|$)/iu.test(response.headers?.get("content-type") ?? "")) fail("invalid-response", "catalog-content-type");
      let raw;
      try { raw = await boundedBody(response, MAX_CATALOG_BYTES, requestSignal, true); } catch (error) {
        if (error instanceof ChatGptInsightError && error.code === "invalid-response" && CATALOG_DETAILS.has(error.detail)) throw error;
        if (error instanceof ChatGptInsightError && error.code === "invalid-response") fail("invalid-response", "catalog-body");
        throw error;
      }
      let parsed;
      try { parsed = JSON.parse(raw); } catch { fail("invalid-response", "catalog-json"); }
      check(requestSignal);
      if (!parsed || !Array.isArray(parsed.models) || parsed.models.length > MAX_MODELS) fail("invalid-response", "catalog-shape");
      const models = [];
      const seen = new Set();
      for (const entry of parsed.models) {
        if (entry?.visibility !== "list") continue;
        if (typeof entry.slug !== "string" || !SLUG.test(entry.slug) || seen.has(entry.slug) ||
            typeof entry.display_name !== "string" || !entry.display_name.trim() || entry.display_name.length > 200 || UNSAFE.test(entry.display_name)) fail("invalid-response", "catalog-entry");
        seen.add(entry.slug);
        if (models.length < MAX_DISPLAY_MODELS) models.push({ slug: entry.slug, displayName: entry.display_name });
      }
      check(requestSignal);
      if (modelEpoch !== before) fail("cancelled");
      listed = new Set(models.map((entry) => entry.slug));
      return models;
    }, signal, MODEL_TIMEOUT);
  }
  async function createInsight(request, { signal } = {}) {
    return run(async (requestSignal) => {
      const before = modelEpoch;
      const hasFollowup = Object.hasOwn(object(request), "followup");
      keys(request, ["model", "context", "articleText", "allowWebResearch",
        ...(Object.hasOwn(request, "relatedExcerpts") ? ["relatedExcerpts"] : []),
        ...(hasFollowup ? ["followup"] : [])]);
      const model = own(request, "model");
      if (typeof model !== "string" || !listed.has(model)) fail("model-unavailable");
      const allowWebResearch = own(request, "allowWebResearch");
      if (typeof allowWebResearch !== "boolean") fail("invalid-input");
      const followup = hasFollowup ? followupValue(own(request, "followup")) : null;
      const context = contextValue(own(request, "context"));
      const articleText = text(own(request, "articleText"), MAX_TEXT, true);
      const relatedExcerpts = validateRelatedExcerpts(
        Object.hasOwn(request, "relatedExcerpts") ? own(request, "relatedExcerpts") : [], context);
      const domains = [...new Set([context.currentSource, ...context.sameTopicSources, ...context.relatedSources]
        .map((entry) => new URL(entry.url).hostname))];
      if (!domains.length || domains.length > 11) fail("invalid-input");
      const userText = JSON.stringify(followup ? followupContext(context, articleText, followup, relatedExcerpts) :
        { context, articlePrefix: articleText, relatedExcerpts });
      if (userText.length > MAX_INPUT) fail("invalid-input");
      const instant = now();
      if (!Number.isSafeInteger(instant) || instant < 0) fail("invalid-input");
      calls = calls.filter((time) => time > instant - HOUR);
      if (calls.length >= 5) fail("rate-limit");
      const accessToken = await token();
      check(requestSignal);
      if (modelEpoch !== before) fail("cancelled");
      calls.push(instant); // A dispatched call consumes a slot, even on failure or cancellation.
      const payload = { model, store: false, stream: true,
        instructions: buildInsightInstructions(Boolean(followup), allowWebResearch),
        input: [{ role: "user", content: userText }],
        tools: allowWebResearch ? [{ type: "web_search", search_context_size: "low", filters: { allowed_domains: domains } }] : [],
      };
      debug({ phase: "request", payload });
      const response = await fetchImpl(`${API}/responses`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: requestSignal,
        redirect: "error", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
      check(requestSignal);
      if (response?.redirected || response?.url && response.url !== `${API}/responses`) fail("invalid-response", "response-redirect");
      if (!response?.ok) await responseError(response, requestSignal);
      const contentType = response.headers?.get("content-type");
      const headerlessSse = response.status === 200 && (contentType == null || contentType.trim() === "");
      if (!headerlessSse && !/^text\/event-stream[ \t]*(?:;|$)/iu.test(contentType ?? ""))
        fail("invalid-response", responseContentDetail(contentType));
      const raw = await boundedBody(response, MAX_STREAM_BYTES, requestSignal);
      check(requestSignal);
      if (modelEpoch !== before) fail("cancelled");
      debug({ phase: "response", status: response.status, contentType, body: raw });
      if (headerlessSse && !isCompleteSse(raw)) {
        const failureCode = completeHeaderlessFailureCode(raw);
        if (failureCode) fail(errorForCode(failureCode), "response-failed");
        fail("invalid-response", "response-content-missing");
      }
      return parseSse(raw, model, onTrace);
    }, signal);
  }
  function cancel() { active?.abort(); }
  function clearModels() { modelEpoch += 1; listed = new Set(); cancel(); }
  function dispose() { disposed = true; cancel(); clearModels(); calls = []; }
  return Object.freeze({ listModels, createInsight, cancel, clearModels, dispose });
}
