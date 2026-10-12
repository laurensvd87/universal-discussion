import { fail } from "../domain/errors.js";
import { MAX_RESPONSE_BYTES, projectContribution } from "../domain/discussion-view.js";
import { assertExpected } from "../domain/repository-contract.js";
import { frozenClone, readExpectedVersion, readId, readRecord, readText } from "../domain/validation.js";

const SCHEMA = "canonical-contributions/v1";
const PAGE_BYTES = MAX_RESPONSE_BYTES - 4096;
const encoder = new TextEncoder();

function position(value) {
  const item = readRecord(value, ["createdAt", "id"]);
  return { createdAt: readText(item.createdAt, 64), id: readId(item.id) };
}

function encodeCursor(version, topicId, limit, after) {
  return Buffer.from(JSON.stringify({ schema: SCHEMA, version, topicId, limit, after })).toString("base64url");
}

function decodeCursor(value, version, topicId, limit) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length < 1 || value.length > 2048 || !/^[A-Za-z0-9_-]+$/u.test(value)) fail("invalid", "Invalid discussion cursor");
  let parsed;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) fail("invalid", "Invalid discussion cursor");
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { fail("invalid", "Invalid discussion cursor"); }
  const item = readRecord(parsed, ["schema", "version", "topicId", "limit", "after"]);
  const suppliedVersion = readExpectedVersion(item.version);
  const suppliedTopic = readId(item.topicId);
  const after = position(item.after);
  if (item.schema !== SCHEMA || !Number.isInteger(item.limit) || item.limit < 1 || item.limit > 100) fail("invalid", "Invalid discussion cursor");
  assertExpected(version, suppliedVersion);
  if (suppliedTopic !== topicId || item.limit !== limit) fail("conflict", "Discussion page changed");
  return after;
}

// Flat references can point outside this read page. They do not attest a parent,
// complete thread or write destination; canonical commands keep their own checks.
export function createCanonicalPages(repository) {
  return Object.freeze({
    contributions(value) {
      const input = readRecord(value, ["topicId", "limit", "cursor"]);
      const topicId = readId(input.topicId), limit = input.limit;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail("invalid", "Invalid request");
      if (typeof repository.readContributionPage !== "function" || typeof repository.readMetadataScope !== "function") fail("unavailable", "Paged discussions unavailable");
      const version = readExpectedVersion(repository.version());
      const after = decodeCursor(input.cursor, version, topicId, limit);
      const page = repository.readContributionPage(topicId, { after, limit, expectedVersion: version });
      assertExpected(page.version, version);
      if (!Array.isArray(page.items) || page.items.length > limit || page.topic?.id !== topicId ||
          page.items.some(item => item.visibility !== "local-public" || item.discussionId !== page.discussionId)) fail("storage-corrupt", "Local database is inconsistent");
      const state = repository.readMetadataScope({ topicIds: [topicId],
        sourceIds: [...new Set(page.items.filter(item => !item.withdrawn && item.originSourceId).map(item => item.originSourceId))],
        expectedVersion: version });
      assertExpected({ generation: state.generation, revision: state.revision }, version);
      const result = { version, topic: { id: page.topic.id, title: page.topic.title, kind: page.topic.kind },
        discussionId: page.discussionId, items: [], nextCursor: null };
      for (let index = 0; index < page.items.length; index++) {
        const entry = page.items[index];
        const nextCursor = index < page.items.length - 1 || page.nextCursor !== null
          ? encodeCursor(version, topicId, limit, position({ createdAt: entry.createdAt, id: entry.id })) : null;
        const candidate = { ...result, items: [...result.items, projectContribution(entry, state)], nextCursor };
        if (encoder.encode(JSON.stringify(candidate)).byteLength > PAGE_BYTES) {
          if (!result.items.length) fail("capacity", "Discussion page capacity reached");
          break;
        }
        result.items = candidate.items; result.nextCursor = nextCursor;
      }
      if (encoder.encode(JSON.stringify(result)).byteLength > PAGE_BYTES) fail("capacity", "Discussion page capacity reached");
      assertExpected(repository.version(), version);
      return frozenClone(result);
    },
  });
}
