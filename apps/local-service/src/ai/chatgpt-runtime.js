import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ChatGPTConnectionFailure, createChatGPTConnection } from "./chatgpt-connection.js";
import { ChatGptInsightError, createChatGptInsights, validateRelatedExcerpts } from "./chatgpt-insights.js";
import { buildInsightContext } from "../../../../spikes/topic-resolution/browser/core/insight-context.js";
import { normalizeInsightPreferences } from "../../../../spikes/topic-resolution/browser/core/insight-preferences.js";
import { formatInsightCitations } from "../../../../spikes/topic-resolution/browser/core/insight-citations.js";
import { ServiceError, fail } from "../domain/errors.js";
import { readId } from "../domain/validation.js";
import { isAccountPrincipal } from "../accounts/account-principal.js";
import { types } from "node:util";
import {readAuthoredTopicScope} from '../../../../spikes/topic-resolution/browser/core/local-service-contract.js';

const FILE = "chatgpt-registration.json";
const OPERATION = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const RESULT_TTL_MS = 30 * 60_000;
const FAILURE_TTL_MS = 120_000;
const MAX_OPERATIONS = 1_024;
const SAFE_ERRORS = new Set(["invalid-input", "model-unavailable", "unauthorized", "rate-limit", "busy", "timeout", "cancelled", "provider-unavailable", "invalid-response", "unsupported-capability"]);
const MODEL_FAILURES = new Map([
  ["unauthorized", "access-rejected"], ["rate-limit", "rate-limited"], ["timeout", "timed-out"],
  ["invalid-response", "invalid-response"], ["provider-unavailable", "provider-unavailable"],
  ["cancelled", "provider-unavailable"], ["busy", "busy"],
]);
const MODEL_DETAILS = new Set(["catalog-redirect", "catalog-content-type", "catalog-body", "catalog-too-large",
  "catalog-stream", "catalog-encoding", "catalog-json", "catalog-shape", "catalog-entry"]);
const INSIGHT_DETAILS = new Set(["response-redirect", "response-content-type", "response-content-json", "response-content-html",
  "response-content-text", "response-content-missing", "response-content-other", "response-stream", "response-too-large",
  "response-encoding", "response-event", "response-no-final", "response-empty-output", "response-no-message",
  "response-message-unfinished", "response-refusal", "response-no-text", "response-blank-text",
  "response-output-empty", "response-search-only", "response-reasoning-only",
  "response-final-item-missing", "response-item-identity", "response-item-conflict",
  "response-item-prefix", "response-item-text", "response-stream-text-unfinalized",
  "response-unsafe-text", "response-output-too-large", "response-excerpt-citation",
  "response-web-citation", "response-web-evidence", "response-unsafe-url",
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
function bodyDigest(body) { return createHash("sha256").update(body, "utf8").digest("hex"); }
function authoredScope(value){try{return readAuthoredTopicScope(value);}catch{fail('invalid','Invalid selected topic');}}
function semanticWitness(value) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype)
    fail('invalid', 'Invalid semantic witness');
  const fields=['nodeId','topicId','rootRevision','targetRevision'], descriptors=Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length!==4 || fields.some(key=>!descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key],'value')))
    fail('invalid', 'Invalid semantic witness');
  const {nodeId,topicId,rootRevision,targetRevision}=value;
  if(typeof nodeId!=='string'||!nodeId.length||nodeId.length>160||nodeId.trim()!==nodeId||/[\u0000-\u001f\u007f]/u.test(nodeId)||
      readId(topicId)!==topicId||![rootRevision,targetRevision].every(n=>Number.isSafeInteger(n)&&n>0))fail('invalid','Invalid semantic witness');
  return Object.freeze({nodeId,topicId,rootRevision,targetRevision});
}

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
      if (registration !== null) validateRegistration(registration);
      const next = { ...record, registration: registration === null ? null :
        { clientId: registration.clientId, subject: registration.subject,
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

export function createChatGPTRuntime({ service, dataDir, fetchImpl, refreshStore = null, now = Date.now,
  onInsightTrace = null, onInsightDebug = null, onInsightRequestTrace = null,
  connectionAdapter, insightsAdapter } = {}) {
  if (typeof fetchImpl !== "function" && !connectionAdapter) return null;
  const store = connectionAdapter ? null : createChatGPTRegistrationStore(dataDir);
  const protectedStore = connectionAdapter ? null : typeof refreshStore === "function"
    ? refreshStore({ hostId: store.hostId }) : refreshStore;
  const connection = connectionAdapter ?? createChatGPTConnection({ hostId: store.hostId, agentName: "Murmingle",
    readRegistration: store.readRegistration, writeRegistration: store.writeRegistration,
    fetchImpl, refreshStore: protectedStore, now });
  const insights = insightsAdapter ?? createChatGptInsights({ fetchImpl, getAccessToken: connection.getAccessToken,
    now, ...(typeof onInsightTrace === "function" ? { onTrace: onInsightTrace } : {}),
    ...(typeof onInsightDebug === "function" ? { onDebug: onInsightDebug } : {}),
    ...(typeof onInsightRequestTrace === "function" ? { onRequestTrace: onInsightRequestTrace } : {}) });
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
  let privateActive = null;
  const preparing = new Set();
  let preparationGeneration = 0;
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
    const retention=job.state === "completed" ? RESULT_TTL_MS : FAILURE_TTL_MS;
    job.expiry = setTimeout(() => { job.result = null; jobs.delete(job.operationId); },
      job.semanticTarget ? Math.min(retention,Math.max(0,job.expiresAt-now())) : retention);
    job.expiry.unref?.();
  }
  function removeJob(job) {
    if (job.state === "running" && active === job) insights.cancel();
    clearTimeout(job.expiry);
    job.result = null;
    job.state = "failed";
    jobs.delete(job.operationId);
    if (active === job) active = null;
  }
  function expired(job) {
    return job.finishedAt !== null && now() - job.finishedAt >=
      (job.state === "completed" ? RESULT_TTL_MS : FAILURE_TTL_MS);
  }
  function owned(key, actorId) {
    service.actor(actorId);
    const job = jobs.get(operationId(key));
    if (!job) fail("not-found", "Object unavailable");
    if (job.actorId !== actorId) fail("forbidden", "Actor unavailable");
    if (expired(job)) { removeJob(job); fail("not-found", "Object unavailable"); }
    return job;
  }
  function cancelJob(job) {
    if (job.state === "running") insights.cancel();
    clearTimeout(job.expiry);
    job.result = null; job.state = "failed"; job.error = "cancelled"; job.detail = null; finish(job);
  }
  function stopJobs() {
    preparationGeneration += 1;
    preparing.clear();
    privateActive?.controller.abort();
    if (active) insights.cancel();
    for (const job of jobs.values()) { clearTimeout(job.expiry); job.result = null; job.state = "failed"; job.error = "cancelled"; }
    jobs.clear(); active = null;
  }
  const mapResult = (value, next) => value && typeof value.then === "function" ? value.then(next) : next(value);
  const sameOrLaterVersion = (actual, expected) => Boolean(actual && expected &&
    actual.generation === expected.generation && Number.isSafeInteger(actual.revision) &&
    Number.isSafeInteger(expected.revision) && expected.revision >= 0 && actual.revision >= expected.revision);
  function inspectContext(input, destinationTopicId = null) {
    const context = input.context;
    if (!context || typeof context !== "object" || !context.topic || !context.currentSource) fail("invalid", "Invalid request");
    const includeRelatedSources = Object.hasOwn(input, "includeRelatedSources")
      ? input.includeRelatedSources : true;
    if (typeof includeRelatedSources !== "boolean") fail("invalid", "Invalid request");
    const sourceId = readId(context.currentSource.id), topicId = readId(context.topic.id);
    const includeDiscussion = context.coverage?.discussionIncluded === true;
    const inspect = ({ catalog, discussion, related, anchor = null, followupDiscussion = undefined, semanticTarget = null }) => {
        if (!sameOrLaterVersion(catalog.version, input.expected) ||
            !same(catalog.version, discussion.version) ||
            (includeRelatedSources && !same(catalog.version, related?.version)) ||
            (!includeRelatedSources && related !== null) ||
            (anchor && !same(catalog.version, anchor.version)) ||
            (followupDiscussion && !same(catalog.version, followupDiscussion.version)) ||
            (input.semanticTarget && (!semanticTarget || !anchor?.evidence || !same(catalog.version,semanticTarget.version)))) fail("conflict", "State changed");
        if(input.semanticTarget) {
          const evidence=exact(anchor.evidence,['sourceId','sourceVersion','operationId','operationDigest','sourceStamp']);
          if(anchor.sourceId!==sourceId||anchor.topicId!==topicId||evidence.sourceId!==sourceId||
              typeof evidence.sourceVersion!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(evidence.sourceVersion)||
              BigInt(evidence.sourceVersion)>9223372036854775807n||readId(evidence.operationId)!==evidence.operationId||
              [evidence.operationDigest,evidence.sourceStamp].some(v=>typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))||
              evidence.sourceStamp!==anchor.sourceStamp)fail('conflict','Evidence Source changed');
        }
        const excluded = input.excludedRelatedSourceIds ?? [];
        let rebuilt;
        try {
          // The popup offers a larger local choice pool. Exclusions are permitted
          // only from that exact catalog-derived pool; rebuild the bounded request
          // after exclusion so the next eligible source fills a freed slot.
          const localChoices = buildInsightContext({ catalog, discussion, related, sourceId, topicId,
            includeDiscussion, sourceLimit: sourceId === null ? 20 : 21 });
          const allowedRelatedSourceIds = [...localChoices.sameTopicSources, ...localChoices.relatedSources]
            .map((source) => source.id);
          const selectedIds = new Set(allowedRelatedSourceIds);
          if (!Array.isArray(excluded) || excluded.length > selectedIds.size ||
              excluded.some((id) => typeof id !== "string" || !selectedIds.has(id)) ||
              new Set(excluded).size !== excluded.length) fail("invalid", "Invalid request");
          rebuilt = buildInsightContext({ catalog, discussion, related, sourceId, topicId,
            includeDiscussion,
            allowedRelatedSourceIds, excludedRelatedSourceIds: excluded,
            sourceLimit: sourceId === null ? 5 : 6 });
        } catch { fail("invalid", "Invalid request"); }
        if (!same(rebuilt, context)) fail("invalid", "Invalid request");
        const catalogUrls = new Map(catalog.sources.map((source) => [source.id, source.url]));
        const excludedWebUrls = excluded.map((id) => catalogUrls.get(id));
        if (excludedWebUrls.some((url) => typeof url !== "string")) fail("invalid", "Invalid request");
        return { context: rebuilt, excludedWebUrls, version: catalog.version, anchor, followupDiscussion, semanticTarget };
    };
    if (typeof service.insightBundle === "function") return mapResult(service.insightBundle({
      sourceId, topicId, includeDiscussion, includeRelatedSources, destinationTopicId,
      ...(input.semanticTarget ? {semanticTarget:{...semanticWitness(input.semanticTarget),targetId:readId(input.followupQuestionId)}} : {}),
    }), inspect);
    if(input.semanticTarget)fail('unavailable','Semantic insight context unavailable');
    const catalogValue = typeof service.catalogContext === "function" ? service.catalogContext({ sourceId, topicId }) : service.catalog();
    return mapResult(catalogValue, catalog => {
      const discussionValue = typeof service.insightDiscussion === "function"
        ? service.insightDiscussion(topicId, includeDiscussion) : service.discussion(topicId);
      return mapResult(discussionValue, discussion => includeRelatedSources
        ? mapResult(service.related(sourceId, 20), related => inspect({ catalog, discussion, related }))
        : inspect({ catalog, discussion, related: null }));
    });
  }
  function inspectFollowup(questionId, destinationTopicId, sourceId, currentTopicId, expected,
    providedDiscussion = undefined, semanticTarget = null, witness = null) {
    const id = readId(questionId);
    if(witness && (!semanticTarget || semanticTarget.nodeId!==witness.nodeId || semanticTarget.topic.id!==witness.topicId ||
        semanticTarget.rootRevision!==witness.rootRevision || semanticTarget.targetRevision!==witness.targetRevision ||
        semanticTarget.targetId!==id))fail('conflict','Semantic reply target changed');
    const discussionValue = witness ? {...semanticTarget,roots:[semanticTarget.root]} : providedDiscussion !== undefined ? providedDiscussion :
      typeof service.discussionForContribution === "function"
        ? service.discussionForContribution(destinationTopicId, id) : service.discussion(destinationTopicId);
    return mapResult(discussionValue, discussion => {
      if (!discussion) fail("not-found", "Object unavailable");
      if (!same(discussion.version, expected)) fail("conflict", "State changed");
      for (const root of discussion.roots) {
        const target = root.id === id ? root : root.replies.find((entry) => entry.id === id);
        if (!target) continue;
        if (root.state !== "visible" || target.state !== "visible" ||
            typeof root.body !== "string" || typeof target.body !== "string") fail("forbidden", "Action unavailable");
        if (!witness && destinationTopicId !== currentTopicId && root.origin?.sourceId !== sourceId) {
          fail("forbidden", "Action unavailable");
        }
        return { parentBody: root.body.slice(0, 2_000), questionBody: target.body.slice(0, 2_000),
          parentDigest: bodyDigest(root.body), questionDigest: bodyDigest(target.body),
          rootId: root.id, replyToId: target.id, discussionId: discussion.discussionId,
          ...(witness?{semanticTarget:witness}:{}) };
      }
      fail("not-found", "Object unavailable");
    });
  }
  function requestAuthorityCurrent(isCurrent) {
    if (isCurrent === null) return true;
    if (typeof isCurrent !== "function") return false;
    try { return isCurrent(); } catch { return false; }
  }
  function publicationFor(job) {
    return Object.freeze({semanticTarget:Object.freeze({...job.semanticTarget}),evidence:Object.freeze({...job.anchor.evidence}),articleDigest:job.articleDigest,
      rootDigest:job.followup.parentDigest,targetDigest:job.followup.questionDigest,expiresAt:job.expiresAt});
  }
  function currentJobAuthority(job) {
    if (disposed || callbackPending || jobs.get(job.operationId) !== job) return false;
    if(job.semanticTarget && now()>=job.expiresAt)return false;
    const status = connection.status();
    if (!status.connected || !status.planEnabled || !same(status.account ?? null, job.account) ||
        !same(connection.accountIdentity?.() ?? null, job.accountIdentity)) return false;
    try { service.actor(job.actorId); } catch { return false; }
    return true;
  }
  function currentJobContext(job) {
    if (!currentJobAuthority(job)) return null;
    let bundleValue;
    try {
      bundleValue = typeof service.insightJobBundle === "function" ? service.insightJobBundle({
        sourceId: job.evidenceSourceId ?? job.originSourceId, topicId: job.topicId,
        destinationTopicId: job.replyToId === null ? null : job.destinationTopicId,
        ...(job.semanticTarget?{semanticTarget:{...job.semanticTarget,targetId:job.replyToId}}:{}),
      }) : mapResult(service.insightAnchor(job.topicId, job.originSourceId), anchor =>
        ({ anchor, followupDiscussion: undefined }));
    }
    catch (error) {
      if (error instanceof ServiceError && ["conflict", "not-found"].includes(error.code)) return null;
      throw error;
    }
    const validate = ({ anchor, followupDiscussion, semanticTarget }) => {
      if (!currentJobAuthority(job) || anchor.version.generation !== job.expected.generation ||
          !same({ ...anchor, version: null }, { ...job.anchor, version: null })) return null;
      if (job.replyToId === null) return job.authorScope?
        mapResult(service.authorScopeCurrent({generation:job.expected.generation,topicId:job.topicId,scope:job.authorScope}),current=>current===true?anchor:null):anchor;
      let followupValue;
      try { followupValue = inspectFollowup(job.replyToId, job.destinationTopicId,
        job.evidenceSourceId ?? job.originSourceId, job.topicId, anchor.version, followupDiscussion, semanticTarget, job.semanticTarget); }
      catch (error) {
        if (error instanceof ServiceError && ["conflict", "not-found", "forbidden"].includes(error.code)) return null;
        throw error;
      }
      const checked = mapResult(followupValue, followup =>
        currentJobAuthority(job) && same(followup, job.followup) ? anchor : null);
      return checked && typeof checked.then === "function" ? checked.catch(error => {
        if (error instanceof ServiceError && ["conflict", "not-found", "forbidden"].includes(error.code)) return null;
        throw error;
      }) : checked;
    };
    const checked = mapResult(bundleValue, validate);
    return checked && typeof checked.then === "function" ? checked.catch(error => {
      if (error instanceof ServiceError && ["conflict", "not-found"].includes(error.code)) return null;
      throw error;
    }) : checked;
  }
  return Object.freeze({
    restore: () => connection.restore?.() ?? Promise.resolve(false),
    accountIdentity: () => disposed || callbackPending ? null : connection.accountIdentity?.() ?? null,
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
    create(value, actorId, { signal = null, isCurrent = null } = {}) {
      exact(value, ["operationId", "model", "context", "articleText", "allowWebResearch", "expected",
        ...(Object.hasOwn(value ?? {}, "includeRelatedSources") ? ["includeRelatedSources"] : []),
        ...(Object.hasOwn(value ?? {}, "excludedRelatedSourceIds") ? ["excludedRelatedSourceIds"] : []),
        ...(Object.hasOwn(value ?? {}, "relatedExcerpts") ? ["relatedExcerpts"] : []),
        ...(Object.hasOwn(value ?? {}, "preferences") ? ["preferences"] : []),
        ...(Object.hasOwn(value ?? {}, "followupQuestionId") ? ["followupQuestionId"] : []),
        ...(Object.hasOwn(value ?? {}, "semanticTarget") ? ["semanticTarget"] : []),
        ...(Object.hasOwn(value ?? {}, "authorScope") ? ["authorScope"] : []),
        ...(Object.hasOwn(value ?? {}, "followupTopicId") ? ["followupTopicId"] : [])]);
      if (Object.hasOwn(value, "followupTopicId") && !Object.hasOwn(value, "followupQuestionId")) {
        fail("invalid", "Invalid request");
      }
      let preferences;
      if (Object.hasOwn(value, "preferences")) {
        if (value.preferences === undefined) fail("invalid", "Invalid request");
        try { preferences = normalizeInsightPreferences(value.preferences); }
        catch { fail("invalid", "Invalid request"); }
      }
      if (signal !== null && typeof signal !== "object" ||
          isCurrent !== null && typeof isCurrent !== "function") fail("invalid", "Invalid request");
      const requestCurrent = () => {
        if (signal?.aborted) return false;
        try { return isCurrent === null || isCurrent(); } catch { return false; }
      };
      if (!requestCurrent()) fail("unavailable", "Request unavailable");
      const actor = service.actor(actorId);
      const key = operationId(value.operationId);
      if (seen.has(key)) fail("conflict", "Operation changed");
      if (seen.size >= MAX_OPERATIONS) fail("capacity", "Operation capacity reached");
      if (active || privateActive || preparing.size) fail("conflict", "Operation active");
      const state = connection.status();
      const identity = connection.accountIdentity?.() ?? null;
      if (!state.connected || !state.planEnabled) fail("unauthorized", "ChatGPT plan permission required");
      const generation = preparationGeneration;
      const hasFollowup = Object.hasOwn(value, "followupQuestionId");
      const witness=Object.hasOwn(value,'semanticTarget')?semanticWitness(value.semanticTarget):null;
      if(witness&&!hasFollowup)fail('invalid','Invalid semantic followup');
      const selectedScope=Object.hasOwn(value,'authorScope')?authoredScope(value.authorScope):null;
      if(selectedScope&&(hasFollowup||typeof service.authorScopeCurrent!=='function'))fail('invalid','Selected topic unavailable');
      if(!hasFollowup&&typeof service.authorScopeCurrent==='function'&&!selectedScope&&service.legacyAuthorCommandsEnabled!==true)fail('invalid','Selected topic required');
      // Snapshot provider primitives before any asynchronous snapshot/dispatch
      // validation. The transient article is not retained in the job record.
      const captured=witness||selectedScope?Object.freeze({model:value.model,articleText:value.articleText,allowWebResearch:value.allowWebResearch}):null;
      if(captured && (typeof captured.model!=='string'||!captured.model.length||captured.model.length>256||
          typeof captured.articleText!=='string'||!captured.articleText.length||captured.articleText.length>4096||
          typeof captured.allowWebResearch!=='boolean'))fail('invalid','Invalid semantic provider input');
      const contextTopicId = readId(value.context?.topic?.id);
      const destinationTopicId = Object.hasOwn(value, "followupTopicId")
        ? readId(value.followupTopicId) : contextTopicId;
      if(witness&&witness.topicId!==destinationTopicId)fail('invalid','Invalid semantic destination');
      if (Object.hasOwn(value, "followupTopicId") && destinationTopicId === contextTopicId)
        fail("invalid", "Invalid request");
      const inspected = mapResult(inspectContext(value, hasFollowup ? destinationTopicId : null),bundle=>{
        if(!selectedScope)return bundle;
        if(selectedScope.sourceId!==bundle.context.currentSource.id)fail('invalid','Selected page changed');
        return mapResult(service.authorScopeCurrent({generation:bundle.version.generation,topicId:contextTopicId,scope:selectedScope}),current=>{
          if(current!==true)fail('conflict','Selected topic changed');return bundle;
        });
      });
      const prepare = ({ context, excludedWebUrls, version, anchor: bundledAnchor, followupDiscussion, semanticTarget }) => {
        if (disposed || generation !== preparationGeneration || seen.has(key) || active || privateActive)
          fail("conflict", "Operation changed");
        if (!requestCurrent()) fail("unavailable", "Request unavailable");
        const currentState = connection.status();
        if (!currentState.connected || !currentState.planEnabled ||
            !same(currentState.account ?? null, state.account ?? null) ||
            !same(connection.accountIdentity?.() ?? null, identity))
          fail("unauthorized", "ChatGPT plan permission required");
        let relatedExcerpts;
        try { relatedExcerpts = validateRelatedExcerpts(
          Object.hasOwn(value, "relatedExcerpts") ? value.relatedExcerpts : [], context); }
        catch { fail("invalid", "Invalid request"); }
        // Older clients may still submit locally fetched related-page text. Reject it
        // at the API boundary so Insight evidence can only come from hosted research.
        if (relatedExcerpts.length) fail("invalid", "Invalid request");
        const followupValue = hasFollowup
          ? inspectFollowup(value.followupQuestionId, destinationTopicId,
            context.currentSource.id, context.topic.id, version, followupDiscussion, semanticTarget, witness) : null;
        const anchorValue = bundledAnchor ?? service.insightAnchor(context.topic.id, context.currentSource.id);
        return mapResult(followupValue, followup => mapResult(
          anchorValue, anchor => {
            const currentActor = service.actor(actorId);
            if (disposed || generation !== preparationGeneration || seen.has(key) || active || privateActive ||
                isAccountPrincipal(actor) && (!isAccountPrincipal(currentActor) || currentActor.accountId !== actor.accountId))
              fail("conflict", "Operation changed");
            if (!requestCurrent()) fail("unavailable", "Request unavailable");
            const dispatchState = connection.status();
            if (callbackPending || !dispatchState.connected || !dispatchState.planEnabled ||
                !same(dispatchState.account ?? null, state.account ?? null) ||
                !same(connection.accountIdentity?.() ?? null, identity))
              fail("unauthorized", "ChatGPT plan permission required");
            if (!same(anchor.version, version)) fail("conflict", "State changed");
            const job = { operationId: key, actorId, expected: anchor.version, topicId: context.topic.id,
              ...(selectedScope?{authorScope:selectedScope}:{}),
              destinationTopicId,
              originSourceId: witness && destinationTopicId!==context.topic.id ? null : context.currentSource?.id ?? null,
              ...(witness?{semanticTarget:witness,evidenceSourceId:context.currentSource.id,articleDigest:bodyDigest(captured.articleText),
                expiresAt:now()+RESULT_TTL_MS}:{}),
              rootId: followup?.rootId ?? null, replyToId: followup?.replyToId ?? null,
              discussionId: followup?.discussionId ?? null, anchor:witness?structuredClone(anchor):anchor, followup,
              account: state.account ? { clientId: state.account.clientId, label: state.account.label } : null,
              accountIdentity: identity,
              state: "running", result: null,
              error: null, detail: null, finishedAt: null };
            seen.add(key); jobs.set(key, job); active = job;
            const invoke=()=>insights.createInsight({ model: captured?captured.model:value.model, context, articleText: captured?captured.articleText:value.articleText,
              allowWebResearch: captured?captured.allowWebResearch:value.allowWebResearch, relatedExcerpts,
              ...(preferences ? { preferences } : {}),
              ...(followup ? { followup: { parentBody: followup.parentBody, questionBody: followup.questionBody },
                excludedWebUrls } : {}) });
            const pending=witness?Promise.resolve().then(()=>currentJobContext(job)).then(checked=>{
              if(!checked || !currentJobAuthority(job) || !requestCurrent())fail('conflict','State changed');return invoke();
            }):invoke();
            void pending.then((result) => {
              const complete=()=>{if (job.state === "running" && !disposed) {
                job.state = "completed"; job.result = result; recordInsightOutcome("success"); finish(job);
              }};
              if(!witness){complete();return;}
              return Promise.resolve().then(()=>currentJobContext(job)).catch(()=>null).then(checked=>{
                if(!checked || !currentJobAuthority(job)) {
                  if(job.state==='running'){job.state='failed';job.error='stale-context';finish(job);}return;
                }
                complete();
              });
            }, (error) => {
              if (job.state === "running" && !disposed) { job.state = "failed";
                job.error = error instanceof ChatGptInsightError && SAFE_ERRORS.has(error.code) ? error.code : "provider-unavailable";
                job.detail = error instanceof ChatGptInsightError && INSIGHT_DETAILS.has(error.detail) ? error.detail : null;
                recordInsightOutcome(job.error, job.detail);
                finish(job); }
            }).finally(() => { if (active === job) active = null; });
            return { operationId: key, state: "running" };
          }));
      };
      const outcome = mapResult(inspected, prepare);
      if (outcome && typeof outcome.then === "function") {
        preparing.add(key);
        return outcome.finally(() => preparing.delete(key));
      }
      return outcome;
    },
    async generatePrivate(value, actorId, { signal } = {}) {
      exact(value, ["model", "context", "articleText", "allowWebResearch", "expected", "followup",
        ...(Object.hasOwn(value ?? {}, "includeRelatedSources") ? ["includeRelatedSources"] : []),
        ...(Object.hasOwn(value ?? {}, "excludedRelatedSourceIds") ? ["excludedRelatedSourceIds"] : []),
        ...(Object.hasOwn(value ?? {}, "preferences") ? ["preferences"] : [])]);
      const actor = service.actor(actorId);
      if (!isAccountPrincipal(actor)) fail("forbidden", "Actor unavailable");
      if (disposed || signal?.aborted) fail("forbidden", "Action unavailable");
      if (active || privateActive || preparing.size) fail("conflict", "Operation active");
      const status = connection.status();
      const identity = connection.accountIdentity?.() ?? null;
      if (!status.connected || !status.planEnabled || !identity) fail("forbidden", "Provider account unavailable");
      const preparation = Symbol("private-insight-preparation");
      const generation = preparationGeneration;
      preparing.add(preparation);
      try {
        const inspectedValue = inspectContext(value);
        const { context, excludedWebUrls, version, anchor: bundledAnchor } = inspectedValue && typeof inspectedValue.then === "function"
          ? await inspectedValue : inspectedValue;
        if (disposed || signal?.aborted || generation !== preparationGeneration ||
            active || privateActive || !preparing.has(preparation)) fail("conflict", "State changed");
        const currentActor = service.actor(actorId), currentStatus = connection.status();
        if (!isAccountPrincipal(currentActor) || currentActor.accountId !== actor.accountId ||
            !currentStatus.connected || !currentStatus.planEnabled ||
            !same(status.account ?? null, currentStatus.account ?? null) ||
            !same(identity, connection.accountIdentity?.() ?? null)) fail("conflict", "State changed");
      // Private requests include only their selected messages, never public thread text.
      if (context.coverage.discussionIncluded || context.discussion.length) fail("invalid", "Invalid request");
      const followup = exact(value.followup, ["parentBody", "questionBody"]);
      for (const body of [followup.parentBody, followup.questionBody]) {
        if (typeof body !== "string" || !body.trim() || body.length > 2_000) fail("invalid", "Invalid request");
      }
      let preferences;
      if (Object.hasOwn(value, "preferences")) {
        try { preferences = normalizeInsightPreferences(value.preferences); }
        catch { fail("invalid", "Invalid request"); }
      }
      const anchorValue = bundledAnchor ?? service.insightAnchor(context.topic.id, context.currentSource.id);
      const anchor = anchorValue && typeof anchorValue.then === "function" ? await anchorValue : anchorValue;
      if (disposed || signal?.aborted || generation !== preparationGeneration ||
          active || privateActive || !preparing.has(preparation)) fail("conflict", "State changed");
      const dispatchActor = service.actor(actorId), dispatchStatus = connection.status();
      if (!isAccountPrincipal(dispatchActor) || dispatchActor.accountId !== actor.accountId ||
          !dispatchStatus.connected || !dispatchStatus.planEnabled ||
          !same(status.account ?? null, dispatchStatus.account ?? null) ||
          !same(identity, connection.accountIdentity?.() ?? null)) fail("conflict", "State changed");
      if (!same(anchor.version, version)) fail("conflict", "State changed");
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener("abort", cancel, { once: true });
      const invocation = { actorId, controller };
      privateActive = invocation;
      try {
        const result = await insights.createInsight({ model: value.model, context,
          articleText: value.articleText, allowWebResearch: value.allowWebResearch,
          followup: { ...followup }, excludedWebUrls,
          ...(preferences ? { preferences } : {}) }, { signal: controller.signal, suppressDebug: true });
        if (disposed || controller.signal.aborted) fail("conflict", "State changed");
        const currentActor = service.actor(actorId);
        const currentStatus = connection.status();
        const currentBundleValue = typeof service.insightJobBundle === "function"
          ? service.insightJobBundle({ sourceId: context.currentSource.id, topicId: context.topic.id,
            destinationTopicId: null }) : null;
        const currentBundle = currentBundleValue && typeof currentBundleValue.then === "function"
          ? await currentBundleValue : currentBundleValue;
        const currentAnchorValue = currentBundle?.anchor ?? service.insightAnchor(context.topic.id, context.currentSource.id);
        const currentAnchor = currentAnchorValue && typeof currentAnchorValue.then === "function"
          ? await currentAnchorValue : currentAnchorValue;
        if (!isAccountPrincipal(currentActor) || currentActor.accountId !== actor.accountId ||
            !currentStatus.connected || !currentStatus.planEnabled ||
            !same(identity, connection.accountIdentity?.() ?? null) ||
            !same(status.account ?? null, currentStatus.account ?? null) ||
            currentAnchor.version.generation !== anchor.version.generation ||
            !same({ ...anchor, version: null }, { ...currentAnchor, version: null })) {
          fail("conflict", "State changed");
        }
        let body;
        try { body = formatInsightCitations(result.body, result.citations); }
        catch { fail("invalid", "Invalid request"); }
        return Object.freeze({ body, citations: result.citations, model: result.model });
      } finally {
        signal?.removeEventListener("abort", cancel);
        if (privateActive === invocation) privateActive = null;
      }
      } finally { preparing.delete(preparation); }
    },
    result(value, actorId, { isCurrent = null } = {}) {
      exact(value, ["operationId"]); const job = owned(value.operationId, actorId);
      if (!requestAuthorityCurrent(isCurrent)) fail("unavailable", "Request unavailable");
      return mapResult(currentJobContext(job), context => {
        if (!requestAuthorityCurrent(isCurrent)) fail("unavailable", "Request unavailable");
        if (!context && job.error !== "stale-context") {
          cancelJob(job); job.error = "stale-context";
        }
        if (job.state === "completed") return { operationId: job.operationId, state: job.state, result: job.result,
          ...(job.authorScope?{authorScope:job.authorScope}:{}),
          ...(job.semanticTarget?{semanticPublication:publicationFor(job)}:{}) };
        if (job.state === "failed") return { operationId: job.operationId, state: job.state, error: job.error,
          ...(job.detail ? { detail: job.detail } : {}) };
        return { operationId: job.operationId, state: "running" };
      });
    },
    resumable(actorId, { isCurrent = null } = {}) {
      service.actor(actorId);
      if (!requestAuthorityCurrent(isCurrent)) fail("unavailable", "Request unavailable");
      const entries = [...jobs.values()].reverse();
      const visit = index => {
        if (!requestAuthorityCurrent(isCurrent)) fail("unavailable", "Request unavailable");
        if (index >= entries.length) return { job: null };
        const job = entries[index];
        if (job.actorId !== actorId) return visit(index + 1);
        const contextValue = expired(job) ? null : currentJobContext(job);
        return mapResult(contextValue, context => {
          if (!requestAuthorityCurrent(isCurrent)) fail("unavailable", "Request unavailable");
          if (!context) { removeJob(job); return visit(index + 1); }
          if (job.state !== "running" && job.state !== "completed") return visit(index + 1);
          return { job: { operationId: job.operationId, state: job.state,
            expected: context.version, topicId: job.topicId, originSourceId: job.originSourceId,
            ...(job.destinationTopicId !== job.topicId ? { followupTopicId: job.destinationTopicId } : {}),
            rootId: job.rootId, replyToId: job.replyToId, discussionId: job.discussionId,
            ...(job.authorScope?{authorScope:job.authorScope}:{}),
            ...(job.semanticTarget?{semanticPublication:publicationFor(job)}:{}) } };
        });
      };
      return visit(0);
    },
    share(value, actorId, persist, { isCurrent = null } = {}) {
      exact(value, ["expected", "command"]);
      if (typeof persist !== "function") fail("invalid", "Invalid request");
      const command = value.command;
      if (!command || typeof command !== "object" || Array.isArray(command) ||
          !["share-insight", "share-insight-reply"].includes(command.type)) fail("invalid", "Invalid request");
      const job = owned(command.operationId, actorId);
      if(job.authorScope?!same(authoredScope(command.authorScope),job.authorScope):Object.hasOwn(command,'authorScope'))
        fail('conflict','Completed result topic changed');
      if (!requestAuthorityCurrent(isCurrent)) fail("unavailable", "Request unavailable");
      return mapResult(currentJobContext(job), context => {
        if (!requestAuthorityCurrent(isCurrent)) fail("unavailable", "Request unavailable");
        if (job.state !== "completed" || !job.result || !context ||
            !sameOrLaterVersion(value.expected, job.expected) ||
            !sameOrLaterVersion(context.version, value.expected) ||
            command.topicId !== job.destinationTopicId ||
            command.originSourceId !== job.originSourceId ||
            (job.semanticTarget ? !same(command.semanticPublication,publicationFor(job)) : Object.hasOwn(command,'semanticPublication')) ||
            (job.replyToId === null ? command.type !== "share-insight" :
              command.type !== "share-insight-reply" ||
              command.rootId !== job.rootId || command.replyToId !== job.replyToId ||
              command.discussionId !== job.discussionId)) fail("conflict", "State changed");
        let body;
        try { body = formatInsightCitations(job.result.body, job.result.citations); }
        catch { fail("invalid", "Invalid request"); }
        if (command.body !== body) fail("invalid", "Invalid request");
        const proof = Object.freeze({ kind: "generated-insight", operationId: job.operationId,
          actorId, topicId: job.destinationTopicId, originSourceId: job.originSourceId, body,
          rootId: job.rootId, replyToId: job.replyToId, discussionId: job.discussionId,
          ...(job.authorScope?{authorScope:job.authorScope}:{}),
          ...(job.semanticTarget?{semanticPublication:publicationFor(job)}:{}) });
        const accepted = outcome => {
          clearTimeout(job.expiry); job.result = null; jobs.delete(job.operationId);
          return outcome;
        };
        const attempt = (current, retries) => {
          if (!requestAuthorityCurrent(isCurrent)) fail("unavailable", "Request unavailable");
          if (!currentJobAuthority(job)) fail("conflict", "State changed");
          const recover = error => {
            if (!(error instanceof ServiceError) || error.code !== "conflict" || retries < 1) throw error;
            return mapResult(currentJobContext(job), refreshed => {
              if (!requestAuthorityCurrent(isCurrent)) fail("unavailable", "Request unavailable");
              if (!refreshed || refreshed.version.generation !== current.version.generation ||
                  refreshed.version.revision < current.version.revision) fail("conflict", "State changed");
              return attempt(refreshed, retries - 1);
            });
          };
          let persisted;
          try { persisted = persist(proof, current.version); }
          catch (error) { return recover(error); }
          if (persisted && typeof persisted.then === "function")
            return persisted.then(accepted).catch(recover);
          return accepted(persisted);
        };
        return attempt(context, 1);
      });
    },
    cancel(value, actorId) { exact(value, ["operationId"]); const job = owned(value.operationId, actorId);
      if (job.state === "completed") { clearTimeout(job.expiry); job.result = null; jobs.delete(job.operationId); }
      else cancelJob(job);
      return { cancelled: true }; },
    reset() { stopJobs(); },
    cancelAccount(actorId) {
      if (privateActive?.actorId === actorId) privateActive.controller.abort();
      for (const job of [...jobs.values()]) if (job.actorId === actorId) removeJob(job);
    },
    dispose() { disposed = true; callbackGeneration += 1; callbackPending = false;
      stopJobs(); diagnosticEvents.length = 0; insights.dispose(); connection.dispose(); },
  });
}
