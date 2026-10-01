import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ChatGPTConnectionFailure, createChatGPTConnection } from "./chatgpt-connection.js";
import { ChatGptInsightError, createChatGptInsights } from "./chatgpt-insights.js";
import { buildInsightContext } from "../../../../spikes/topic-resolution/browser/core/insight-context.js";
import { fail } from "../domain/errors.js";

const FILE = "chatgpt-registration.json";
const OPERATION = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const RESULT_TTL_MS = 120_000;
const MAX_OPERATIONS = 1_024;
const SAFE_ERRORS = new Set(["invalid-input", "model-unavailable", "unauthorized", "rate-limit", "busy", "timeout", "cancelled", "provider-unavailable", "invalid-response", "unsupported-capability"]);
const MODEL_FAILURES = new Map([
  ["unauthorized", "access-rejected"], ["rate-limit", "rate-limited"], ["timeout", "timed-out"],
  ["invalid-response", "invalid-response"], ["provider-unavailable", "provider-unavailable"],
  ["cancelled", "provider-unavailable"], ["busy", "busy"],
]);
const MODEL_DETAILS = new Set(["catalog-redirect", "catalog-content-type", "catalog-body", "catalog-too-large",
  "catalog-stream", "catalog-encoding", "catalog-json", "catalog-shape", "catalog-entry"]);
const INSIGHT_DETAILS = new Set(["response-redirect", "response-content-type", "response-stream", "response-too-large",
  "response-encoding", "response-event", "response-no-final", "response-empty-output", "response-output-too-large",
  "response-incomplete", "response-failed", "response-http-400"]);
const MAX_DIAGNOSTIC_EVENTS = 20;
const FAILURE_STAGES = new Set(["callback-invalid", "callback-expired", "callback-busy", "token-exchange-rejected",
  "token-exchange-failed", "token-response-invalid", "discovery-failed",
  "identity-verification-failed", "registration-failed"]);

function exact(value, names) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== names.length || names.some((name) => !Object.hasOwn(value, name))) fail("invalid", "Invalid request");
  return value;
}
function operationId(value) {
  if (typeof value !== "string" || !OPERATION.test(value)) fail("invalid", "Invalid request");
  return value;
}
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

/** Non-secret installation mapping only. Access, refresh and ID tokens never reach this file. */
export function createChatGPTRegistrationStore(dataDir) {
  const file = path.join(dataDir, FILE);
  function read() {
    if (!existsSync(file)) return null;
    let value;
    try { value = JSON.parse(readFileSync(file, "utf8")); } catch { throw new Error("ChatGPT registration unavailable"); }
    exact(value, ["schema", "hostId", "registration"]);
    if (value.schema !== "chatgpt-registration/v1" ||
        !/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value.hostId)) throw new Error("ChatGPT registration unavailable");
    if (value.registration !== null) validateRegistration(value.registration);
    return value;
  }
  function atomic(value) {
    const temporary = path.join(dataDir, `.chatgpt-registration-${randomUUID()}.tmp`);
    try {
      writeFileSync(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
      chmodSync(temporary, 0o600);
      renameSync(temporary, file);
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
  let record = read();
  if (!record) {
    record = { schema: "chatgpt-registration/v1", hostId: `urn:uuid:${randomUUID()}`, registration: null };
    atomic(record);
  }
  return Object.freeze({ hostId: record.hostId,
    async readRegistration() { return record.registration; },
    async writeRegistration(registration) {
      // Only the non-secret identity fields accepted by the connection adapter.
      validateRegistration(registration);
      const next = { ...record, registration: { clientId: registration.clientId, subject: registration.subject,
        email: registration.email, label: registration.label } };
      atomic(next); record = next;
    },
  });
}

function validateRegistration(value) {
  exact(value, ["clientId", "subject", "email", "label"]);
  for (const key of ["clientId", "subject"]) {
    if (typeof value[key] !== "string" || !value[key] || value[key].length > 256 || /[\u0000-\u001f\u007f]/u.test(value[key])) fail("invalid", "Invalid request");
  }
  for (const key of ["email", "label"]) {
    if (value[key] !== null && (typeof value[key] !== "string" || !value[key] || value[key].length > 320 || /[\u0000-\u001f\u007f]/u.test(value[key]))) fail("invalid", "Invalid request");
  }
}

export function createChatGPTRuntime({ service, dataDir, fetchImpl, now = Date.now, connectionAdapter, insightsAdapter } = {}) {
  if (typeof fetchImpl !== "function" && !connectionAdapter) return null;
  const store = connectionAdapter ? null : createChatGPTRegistrationStore(dataDir);
  const connection = connectionAdapter ?? createChatGPTConnection({ hostId: store.hostId, agentName: "Universal Discussion Layer",
    readRegistration: store.readRegistration, writeRegistration: store.writeRegistration, fetchImpl, now });
  const insights = insightsAdapter ?? createChatGptInsights({ fetchImpl, getAccessToken: connection.getAccessToken, now });
  const jobs = new Map();
  const seen = new Set();
  const diagnosticEvents = [];
  function recordModelOutcome(outcome, detail) {
    const event = { kind: "models", outcome };
    if (outcome === "invalid-response" && MODEL_DETAILS.has(detail)) event.detail = detail;
    diagnosticEvents.push(event);
    if (diagnosticEvents.length > MAX_DIAGNOSTIC_EVENTS) diagnosticEvents.shift();
  }
  function recordInsightOutcome(outcome, detail) {
    const event = { kind: "insight", outcome };
    if (INSIGHT_DETAILS.has(detail)) event.detail = detail;
    diagnosticEvents.push(event);
    if (diagnosticEvents.length > MAX_DIAGNOSTIC_EVENTS) diagnosticEvents.shift();
  }
  let active = null;
  let disposed = false;
  let callbackPending = false;
  let callbackError = null;
  let failureStage = null;
  let failureSubstage = null;
  const identitySubstages = new Set(["jwks-request-failed", "jwks-invalid", "token-header-invalid",
    "matching-key-invalid", "signature-invalid", "claims-invalid"]);
  let callbackGeneration = 0;
  function finish(job) {
    job.finishedAt = now();
    job.expiry = setTimeout(() => { job.result = null; jobs.delete(job.operationId); }, RESULT_TTL_MS);
    job.expiry.unref?.();
  }
  function owned(key, actorId) {
    service.actor(actorId);
    const job = jobs.get(operationId(key));
    if (!job) fail("not-found", "Object unavailable");
    if (job.actorId !== actorId) fail("forbidden", "Actor unavailable");
    return job;
  }
  function cancelJob(job) {
    if (job.state === "running") insights.cancel();
    clearTimeout(job.expiry);
    job.result = null; job.state = "failed"; job.error = "cancelled"; job.detail = null; finish(job);
  }
  function stopJobs() {
    if (active) insights.cancel();
    for (const job of jobs.values()) { clearTimeout(job.expiry); job.result = null; job.state = "failed"; job.error = "cancelled"; }
    jobs.clear(); active = null;
  }
  function inspectContext(input) {
    const catalog = service.catalog();
    if (!same(input.expected, catalog.version)) fail("conflict", "State changed");
    const context = input.context;
    if (!context || typeof context !== "object" || !context.topic || !context.currentSource) fail("invalid", "Invalid request");
    const sourceId = context.currentSource.id, topicId = context.topic.id;
    const discussion = service.discussion(topicId);
    const related = service.related(sourceId, 5);
    if (!same(catalog.version, discussion.version) || !same(catalog.version, related.version)) fail("conflict", "State changed");
    let rebuilt;
    try { rebuilt = buildInsightContext({ catalog, discussion, related, sourceId, topicId,
      includeDiscussion: context.coverage?.discussionIncluded === true }); }
    catch { fail("invalid", "Invalid request"); }
    if (!same(rebuilt, context)) fail("invalid", "Invalid request");
    const excluded = input.excludedRelatedSourceIds ?? [];
    if (!Array.isArray(excluded) || excluded.length > rebuilt.relatedSources.length ||
        excluded.some((id) => typeof id !== "string" ||
          !rebuilt.relatedSources.some((source) => source.id === id)) ||
        new Set(excluded).size !== excluded.length) fail("invalid", "Invalid request");
    if (!excluded.length) return rebuilt;
    const hidden = new Set(excluded);
    const relatedSources = rebuilt.relatedSources.filter((source) => !hidden.has(source.id));
    return { ...rebuilt, relatedSources,
      coverage: { ...rebuilt.coverage, relatedTotal: relatedSources.length } };
  }
  return Object.freeze({
    diagnostics: () => ({ events: diagnosticEvents.map((event) => ({ ...event })) }),
    status: () => ({ ...connection.status(), pending: connection.status().pending || callbackPending,
      ...(callbackError ? { error: callbackError } : {}),
      ...(failureStage ? { failureStage } : {}),
      ...(failureStage === "identity-verification-failed" && failureSubstage ? { failureSubstage } : {}) }),
    connect: (value) => { exact(value, []); callbackError = null; failureStage = null; failureSubstage = null;
      return connection.start({ redirectUri: "http://127.0.0.1:4174/auth/callback" }).then((authorizationUrl) => ({ authorizationUrl })); },
    callback(url) { if (!disposed && callbackPending) {
      callbackError = "connection-failed"; failureStage = "callback-busy"; failureSubstage = null; return;
    }
      if (!disposed) { const generation = ++callbackGeneration;
        callbackPending = true; callbackError = null; failureStage = null; failureSubstage = null;
      void connection.completeCallback({ redirectUri: "http://127.0.0.1:4174/auth/callback", url })
        .then(() => { if (generation !== callbackGeneration || disposed) return;
          stopJobs(); insights.clearModels?.(); callbackError = null; failureStage = null; failureSubstage = null; })
        .catch((error) => { if (generation !== callbackGeneration || disposed) return;
          callbackError = "connection-failed";
          failureStage = error instanceof ChatGPTConnectionFailure && FAILURE_STAGES.has(error.failureStage)
            ? error.failureStage : null;
          failureSubstage = failureStage === "identity-verification-failed" &&
            identitySubstages.has(error.failureSubstage) ? error.failureSubstage : null;
        }).finally(() => { if (generation === callbackGeneration) callbackPending = false; }); } },
    async disconnect(value) { exact(value, []); callbackGeneration += 1; callbackPending = false;
      stopJobs(); insights.clearModels?.(); callbackError = null; failureStage = null; failureSubstage = null;
      return connection.disconnect(); },
    async models() { const state = connection.status();
      if (!state.connected || !state.planEnabled) fail("unauthorized", "ChatGPT plan permission required");
      try { const models = await insights.listModels(); recordModelOutcome("success"); return { models }; }
      catch (error) {
        if (error instanceof ChatGptInsightError && MODEL_FAILURES.has(error.code)) {
          const failure = MODEL_FAILURES.get(error.code);
          const detail = failure === "invalid-response" && MODEL_DETAILS.has(error.detail) ? error.detail : null;
          recordModelOutcome(failure, detail);
          return { failure, ...(detail ? { detail } : {}) };
        }
        throw error;
      } },
    create(value, actorId) {
      exact(value, Object.hasOwn(value ?? {}, "excludedRelatedSourceIds")
        ? ["operationId", "model", "context", "articleText", "allowWebResearch", "expected", "excludedRelatedSourceIds"]
        : ["operationId", "model", "context", "articleText", "allowWebResearch", "expected"]);
      service.actor(actorId);
      const key = operationId(value.operationId);
      if (seen.has(key)) fail("conflict", "Operation changed");
      if (seen.size >= MAX_OPERATIONS) fail("capacity", "Operation capacity reached");
      if (active) fail("conflict", "Operation active");
      const state = connection.status();
      if (!state.connected || !state.planEnabled) fail("unauthorized", "ChatGPT plan permission required");
      const context = inspectContext(value);
      const job = { operationId: key, actorId, expected: value.expected, state: "running", result: null,
        error: null, detail: null, finishedAt: null };
      seen.add(key); jobs.set(key, job); active = job;
      void insights.createInsight({ model: value.model, context, articleText: value.articleText,
        allowWebResearch: value.allowWebResearch }).then((result) => {
        if (job.state === "running" && !disposed) {
          job.state = "completed"; job.result = result; recordInsightOutcome("success"); finish(job);
        }
      }, (error) => {
        if (job.state === "running" && !disposed) { job.state = "failed";
          job.error = error instanceof ChatGptInsightError && SAFE_ERRORS.has(error.code) ? error.code : "provider-unavailable";
          job.detail = error instanceof ChatGptInsightError && INSIGHT_DETAILS.has(error.detail) ? error.detail : null;
          recordInsightOutcome(job.error, job.detail);
          finish(job); }
      }).finally(() => { if (active === job) active = null; });
      return { operationId: key, state: "running" };
    },
    result(value, actorId) {
      exact(value, ["operationId"]); const job = owned(value.operationId, actorId);
      if (!same(job.expected, service.catalog().version) && job.error !== "stale-context") {
        cancelJob(job); job.error = "stale-context";
      }
      if (job.state === "completed") return { operationId: job.operationId, state: job.state, result: job.result };
      if (job.state === "failed") return { operationId: job.operationId, state: job.state, error: job.error,
        ...(job.detail ? { detail: job.detail } : {}) };
      return { operationId: job.operationId, state: "running" };
    },
    cancel(value, actorId) { exact(value, ["operationId"]); const job = owned(value.operationId, actorId); cancelJob(job); return { cancelled: true }; },
    reset() { stopJobs(); },
    dispose() { disposed = true; callbackGeneration += 1; callbackPending = false;
      stopJobs(); diagnosticEvents.length = 0; insights.dispose(); connection.dispose(); },
  });
}
