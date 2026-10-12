import { createHash, randomUUID } from "node:crypto";
import { PrivateRepository } from "./private-repository.js";
import { isAccountActor, isAccountPrincipal } from "../accounts/account-principal.js";
import { fail, ServiceError } from "../domain/errors.js";
import { readRecord } from "../domain/validation.js";
import { inspectPageUrl } from "../../../../spikes/topic-resolution/browser/core/page-content-policy.js";
import { safeInsightCitationUrl } from "../../../../spikes/topic-resolution/browser/core/insight-citations.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const UNSAFE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const ERRORS = new Set(["interrupted", "cancelled", "context-unavailable", "stale-context", "invalid-input",
  "model-unavailable", "unauthorized", "rate-limit", "busy", "timeout", "provider-unavailable",
  "invalid-response", "unsupported-capability"]);
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function id(value) { if (typeof value !== "string" || !ID.test(value)) fail("invalid", "Invalid request"); return value; }
function text(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 8_000 || UNSAFE.test(value)) fail("invalid", "Invalid request");
  return value;
}
function revision(value) { if (!Number.isSafeInteger(value) || value < 1) fail("invalid", "Invalid request"); return value; }
function page(input, extra = []) {
  const body = readRecord(input, [...extra, "after", "limit"]);
  if (body.after !== null) id(body.after);
  if (!Number.isInteger(body.limit) || body.limit < 1 || body.limit > 25) fail("invalid", "Invalid request");
  return body;
}
function conversationDto(row) {
  return { id: row.id, visibility: "private", sourceId: row.source_id, sourceUrl: row.source_url,
    title: row.title, revision: row.revision, createdAt: row.created_at };
}

/** Private own-account destination; never writes to the canonical discussion service. */
export function createPrivateDiscussionService({ databasePath, ai, publicService,
  nextId = prefix => `${prefix}-${randomUUID()}`, now = () => new Date().toISOString(),
  canGenerate = () => false }) {
  const repository = new PrivateRepository(databasePath);
  const db = repository.db;
  const running = new Map();
  let closed = false;
  function principalActor(principal) {
    if (closed || !isAccountPrincipal(principal)) fail("forbidden", "Actor unavailable");
    const current = publicService.actor(principal.id);
    if (!isAccountPrincipal(current) || current.accountId !== principal.accountId) fail("forbidden", "Actor unavailable");
    return current.id;
  }
  function owned(actorId, conversationId) {
    const row = db.prepare("SELECT * FROM private_conversations WHERE id=? AND owner_id=?").get(id(conversationId), actorId);
    if (!row) fail("not-found", "Object unavailable");
    return row;
  }
  function message(conversationId, messageId) {
    const row = db.prepare("SELECT rowid AS ordinal,* FROM private_messages WHERE id=? AND conversation_id=?").get(id(messageId), conversationId);
    if (!row) fail("not-found", "Object unavailable");
    return row;
  }
  function generationDto(messageId) {
    const claim = db.prepare("SELECT state,error,answer_id FROM private_claims WHERE message_id=?").get(messageId);
    return claim ? { state: claim.state, ...(claim.error ? { error: claim.error } : {}),
      ...(claim.answer_id ? { answerId: claim.answer_id } : {}) } : { state: "none" };
  }
  function messageDto(row) {
    return { id: row.id, replyToId: row.reply_to_id, actorType: row.actor_type, body: row.body,
      citations: JSON.parse(row.citations), createdAt: row.created_at,
      ...(row.actor_type === "agent" ? { insight: { operatorId: row.operator_id, model: row.model } } :
        { generation: generationDto(row.id) }) };
  }
  function result(conversationId, messageId, replayed) {
    const row = db.prepare("SELECT revision FROM private_conversations WHERE id=?").get(conversationId);
    if (!row) fail("not-found", "Object unavailable");
    return { conversationId, messageId, revision: row.revision, replayed, generation: generationDto(messageId) };
  }
  function receipt(actorId, operationId, value) {
    const old = db.prepare("SELECT * FROM private_operations WHERE owner_id=? AND operation_id=?").get(actorId, id(operationId));
    if (!old) return null;
    if (old.digest !== digest(value)) fail("conflict", "Operation changed");
    return result(old.conversation_id, old.message_id, true);
  }
  function storeReceipt(actorId, operationId, value, conversationId, messageId) {
    db.prepare("INSERT INTO private_operations VALUES (?,?,?,?,?)").run(actorId, operationId, digest(value), conversationId, messageId);
  }
  function insertHuman(conversationId, replyToId, body) {
    const messageId = id(nextId("private-message"));
    db.prepare("INSERT INTO private_messages VALUES (?,?,?,'human',NULL,?,'[]',NULL,?)")
      .run(messageId, conversationId, replyToId, body, now());
    return messageId;
  }
  function failClaim(messageId, error) {
    if (closed) return;
    const claim = db.prepare("SELECT owner_id FROM private_claims WHERE message_id=?").get(messageId);
    if (!claim) return;
    repository.transaction(() => db.prepare("UPDATE private_claims SET state='failed',error=? WHERE message_id=? AND state='running'")
      .run(ERRORS.has(error) ? error : "provider-unavailable", messageId).changes > 0, claim.owner_id);
  }
  function start(principal, conversationId, messageId, expectedRevision, generation) {
    const actorId = principalActor(principal);
    const conversation = owned(actorId, conversationId);
    const human = message(conversation.id, messageId);
    if (human.actor_type !== "human") fail("forbidden", "Action unavailable");
    const existing = db.prepare("SELECT * FROM private_claims WHERE message_id=?").get(human.id);
    if (existing) return generationDto(human.id);
    if (conversation.revision !== revision(expectedRevision)) fail("conflict", "Conversation changed");
    const parent = human.reply_to_id === null ? null : message(conversation.id, human.reply_to_id);
    if (parent?.actor_type === "agent" && parent.operator_id !== actorId) fail("forbidden", "Action unavailable");
    // Claim is committed before any provider/context work. Failure cannot retry it.
    repository.transaction(() => db.prepare("INSERT INTO private_claims VALUES (?,?,?,?,'running',NULL,NULL)")
      .run(human.id, conversation.id, actorId, conversation.revision), actorId);
    const controller = new AbortController();
    const task = { actorId, conversationId: conversation.id, controller, promise: null };
    running.set(human.id, task);
    task.promise = (async () => {
      try {
        if (!generation || !ai?.generatePrivate || !canGenerate(actorId)) fail("forbidden", "Context unavailable");
        readRecord(generation, ["model", "context", "articleText", "allowWebResearch", "expected",
          ...(Object.hasOwn(generation, "excludedRelatedSourceIds") ? ["excludedRelatedSourceIds"] : []),
          ...(Object.hasOwn(generation, "preferences") ? ["preferences"] : [])]);
        if (generation.context?.currentSource?.id !== conversation.source_id ||
            generation.context?.currentSource?.url !== conversation.source_url) fail("conflict", "Source changed");
        const anchor = publicService.insightAnchor(generation.context?.topic?.id, conversation.source_id);
        const anchorDigest = digest({ ...anchor, version: null });
        const answer = await ai.generatePrivate({ ...structuredClone(generation),
          followup: { parentBody: (parent?.actor_type === "agent" ? parent.body : human.body).slice(0, 2_000),
            questionBody: human.body.slice(0, 2_000) } }, actorId, { signal: controller.signal });
        if (closed || controller.signal.aborted) return;
        principalActor(principal);
        if (!canGenerate(actorId)) fail("conflict", "Provider account changed");
        const currentAnchor = publicService.insightAnchor(anchor.topicId, conversation.source_id);
        if (currentAnchor.version.generation !== anchor.version.generation ||
            digest({ ...currentAnchor, version: null }) !== anchorDigest) fail("conflict", "Source changed");
        const current = owned(actorId, conversation.id);
        if (current.revision !== conversation.revision ||
            message(conversation.id, human.id).body !== human.body ||
            parent && message(conversation.id, parent.id).body !== parent.body) fail("conflict", "Conversation changed");
        text(answer.body);
        if (!Array.isArray(answer.citations) || answer.citations.length > 50 ||
            answer.citations.some(citation => !citation || !safeInsightCitationUrl(citation.url)) ||
            Buffer.byteLength(JSON.stringify(answer.citations)) > 131_072) fail("invalid", "Invalid result");
        id(answer.model);
        repository.transaction(() => {
          const claim = db.prepare("SELECT state FROM private_claims WHERE message_id=?").get(human.id);
          if (claim?.state !== "running") fail("conflict", "Generation changed");
          const answerId = id(nextId("private-message"));
          db.prepare("INSERT INTO private_messages VALUES (?,?,?,'agent',?,?,?,?,?)")
            .run(answerId, conversation.id, human.id, actorId, answer.body, JSON.stringify(answer.citations), answer.model, now());
          db.prepare("UPDATE private_conversations SET revision=revision+1 WHERE id=?").run(conversation.id);
          db.prepare("UPDATE private_claims SET state='completed',answer_id=? WHERE message_id=?").run(answerId, human.id);
        }, actorId);
      } catch (error) {
        failClaim(human.id, controller.signal.aborted ? "cancelled" : error instanceof ServiceError
          ? error.code === "conflict" || error.code === "not-found" ? "stale-context" : "context-unavailable"
          : error?.code);
      } finally { running.delete(human.id); }
    })();
    // Storage failures in a terminal-status write cannot become an unhandled rejection.
    void task.promise.catch(() => {});
    return generationDto(human.id);
  }
  function cancelWhere(predicate) {
    for (const [messageId, task] of running) if (predicate(task)) {
      task.controller.abort(); failClaim(messageId, "cancelled");
    }
  }
  return Object.freeze({
    create(principal, input) {
      const actorId = principalActor(principal);
      const body = readRecord(input, ["operationId", "body", "sourceId", "sourceUrl"]);
      id(body.operationId); id(body.sourceId); text(body.body);
      const replay = receipt(actorId, body.operationId, body);
      if (replay) return replay;
      const source = typeof publicService.exactSource === "function" ? publicService.exactSource(body.sourceId)
        : publicService.catalog().sources.find(entry => entry.id === body.sourceId);
      const inspected = inspectPageUrl(body.sourceUrl);
      if (!source || source.url !== body.sourceUrl || !inspected.supported || inspected.url !== body.sourceUrl ||
          !body.sourceUrl.startsWith("https://")) fail("forbidden", "Source unavailable");
      publicService.insightAnchor(source.topicId, source.id);
      let conversationId, messageId;
      repository.transaction(() => {
        conversationId = id(nextId("private-conversation"));
        db.prepare("INSERT INTO private_conversations VALUES (?,?,'private',?,?,?,1,?)")
          .run(conversationId, actorId, source.id, source.url, body.body.trim().slice(0, 160), now());
        messageId = insertHuman(conversationId, null, body.body);
        storeReceipt(actorId, body.operationId, body, conversationId, messageId);
      }, actorId);
      return result(conversationId, messageId, false);
    },
    list(principal, input) {
      const actorId = principalActor(principal), body = page(input);
      const rows = db.prepare("SELECT * FROM private_conversations WHERE owner_id=? AND id>? ORDER BY id LIMIT ?")
        .all(actorId, body.after ?? "", body.limit + 1);
      return { conversations: rows.slice(0, body.limit).map(conversationDto),
        next: rows.length > body.limit ? rows[body.limit - 1].id : null };
    },
    read(principal, input) {
      const actorId = principalActor(principal), body = page(input, ["conversationId"]);
      const conversation = owned(actorId, body.conversationId);
      let after = null;
      if (body.after !== null) after = message(conversation.id, body.after);
      const rows = after ? db.prepare(`SELECT * FROM private_messages WHERE conversation_id=?
        AND rowid<? ORDER BY rowid DESC LIMIT ?`)
        .all(conversation.id, after.ordinal, body.limit + 1)
        : db.prepare("SELECT * FROM private_messages WHERE conversation_id=? ORDER BY rowid DESC LIMIT ?")
          .all(conversation.id, body.limit + 1);
      const messages = []; let bytes = 8_192;
      for (const row of rows.slice(0, body.limit)) {
        const projected = messageDto(row), size = Buffer.byteLength(JSON.stringify(projected));
        if (messages.length && bytes + size > 512_000) break;
        bytes += size; messages.push(projected);
      }
      return { conversation: conversationDto(conversation), messages: messages.reverse(),
        next: rows.length > messages.length ? messages[0].id : null };
    },
    send(principal, input) {
      const actorId = principalActor(principal);
      const body = readRecord(input, ["operationId", "conversationId", "replyToId", "body", "expectedRevision",
        ...(Object.hasOwn(input ?? {}, "generation") ? ["generation"] : [])]);
      id(body.operationId); text(body.body); revision(body.expectedRevision);
      const replay = receipt(actorId, body.operationId, body);
      if (replay) { owned(actorId, replay.conversationId); return replay; }
      const conversation = owned(actorId, body.conversationId);
      const parent = message(conversation.id, body.replyToId);
      if (conversation.revision !== body.expectedRevision) fail("conflict", "Conversation changed");
      let messageId;
      repository.transaction(() => {
        messageId = insertHuman(conversation.id, parent.id, body.body);
        db.prepare("UPDATE private_conversations SET revision=revision+1 WHERE id=?").run(conversation.id);
        storeReceipt(actorId, body.operationId, body, conversation.id, messageId);
      }, actorId);
      if (parent.actor_type === "agent" && parent.operator_id === actorId) {
        start(principal, conversation.id, messageId, conversation.revision + 1, body.generation);
      }
      return result(conversation.id, messageId, false);
    },
    generate(principal, input) {
      const body = readRecord(input, ["conversationId", "messageId", "expectedRevision", "generation"]);
      return { conversationId: body.conversationId, messageId: body.messageId,
        generation: start(principal, body.conversationId, body.messageId, body.expectedRevision, body.generation) };
    },
    remove(principal, input) {
      const actorId = principalActor(principal), body = readRecord(input, ["conversationId"]);
      const conversation = owned(actorId, body.conversationId);
      cancelWhere(task => task.conversationId === conversation.id);
      repository.transaction(() => db.prepare("DELETE FROM private_conversations WHERE id=? AND owner_id=?").run(conversation.id, actorId), actorId);
      return { deleted: true };
    },
    exportPage(actorId, input) {
      if (!isAccountActor(actorId)) fail("forbidden", "Actor unavailable");
      const body = readRecord(input, ["after", "expectedVersion"]);
      const version = repository.version(actorId);
      if (body.after !== null) id(body.after);
      if (body.expectedVersion !== null && (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion !== version)) {
        fail("conflict", "Export changed");
      }
      if (body.after !== null && !db.prepare(`SELECT 1 FROM private_messages m JOIN private_conversations c ON c.id=m.conversation_id
        WHERE c.owner_id=? AND m.id=?`).get(actorId, body.after)) fail("conflict", "Export changed");
      const rows = db.prepare(`SELECT m.* FROM private_messages m JOIN private_conversations c ON c.id=m.conversation_id
        WHERE c.owner_id=? AND m.id>? ORDER BY m.id LIMIT 2`).all(actorId, body.after ?? "");
      return { schema: "private-export/v1", version, conversations: rows.length
        ? [conversationDto(owned(actorId, rows[0].conversation_id))] : [],
        messages: rows.slice(0, 1).map(row => ({ ...messageDto(row), conversationId: row.conversation_id })),
        next: rows.length > 1 ? rows[0].id : null };
    },
    cancelAccount(actorId) { cancelWhere(task => task.actorId === actorId); },
    eraseAccount(actorId) {
      if (!isAccountActor(actorId)) fail("forbidden", "Actor unavailable");
      cancelWhere(task => task.actorId === actorId);
      repository.transaction(() => {
        db.prepare("DELETE FROM private_conversations WHERE owner_id=?").run(actorId);
        db.prepare("DELETE FROM private_operations WHERE owner_id=?").run(actorId);
        db.prepare("DELETE FROM private_owner_versions WHERE owner_id=?").run(actorId);
      });
    },
    whenIdle: () => Promise.allSettled([...running.values()].map(task => task.promise)),
    close() {
      if (closed) return;
      cancelWhere(() => true); closed = true; repository.close();
    },
  });
}
