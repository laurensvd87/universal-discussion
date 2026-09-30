import { readActorId, readPairingToken } from "./local-service-contract.js";
import { inspectPageUrl } from "./page-content-policy.js";

const BASE = "http://127.0.0.1:4174/v1/ai";
const encoder = new TextEncoder();
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const FAILURE_STAGES = new Set(["callback-invalid", "callback-expired", "callback-busy", "token-exchange-rejected",
  "token-exchange-failed", "token-response-invalid", "discovery-failed",
  "identity-verification-failed", "registration-failed"]);
const UNSAFE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
function invalid() { throw new TypeError("Invalid local AI response"); }
function record(value) { if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid(); return value; }
function keys(value, allowed, required = allowed) {
  record(value);
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(value, key))) invalid();
}
function text(value, max) { if (typeof value !== "string" || !value.trim() || value.length > max || UNSAFE.test(value)) invalid(); return value; }
function id(value) { if (typeof value !== "string" || !ID.test(value)) invalid(); return value; }
function publicUrl(value) {
  const url = text(value, 2048);
  const inspected = inspectPageUrl(url);
  if (!inspected.supported || inspected.url !== url || !url.startsWith("https://")) invalid();
  return url;
}
function projectStatus(value) {
  keys(value, ["connected", "planEnabled", "pending", "account", "error", "failureStage"], ["connected", "planEnabled", "pending", "account"]);
  if (typeof value.connected !== "boolean" || typeof value.planEnabled !== "boolean" || typeof value.pending !== "boolean" ||
      value.planEnabled && !value.connected) invalid();
  if (value.error !== undefined && value.error !== "connection-failed") invalid();
  if (value.failureStage !== undefined &&
      (value.error !== "connection-failed" || !FAILURE_STAGES.has(value.failureStage))) invalid();
  const account = value.account === null || value.account === undefined ? null : record(value.account);
  if (account) keys(account, ["clientId", "label"]);
  if (account && (typeof account.clientId !== "string" || account.clientId.length > 256 || typeof account.label !== "string" || account.label.length > 320 || UNSAFE.test(account.label))) invalid();
  return { connected: value.connected, planEnabled: value.planEnabled, pending: value.pending,
    account: account && { clientId: account.clientId, label: account.label },
    error: value.error ?? null, failureStage: value.failureStage ?? null };
}
function projectModels(value) {
  keys(value, ["models"]);
  if (!Array.isArray(value.models) || value.models.length > 100) invalid();
  const seen = new Set();
  return value.models.map((item) => {
    keys(item, ["slug", "displayName"]); const slug = id(item.slug); const displayName = text(item.displayName, 200);
    if (seen.has(slug)) invalid(); seen.add(slug); return { slug, displayName };
  });
}
function projectResult(value) {
  keys(value, ["operationId", "state", "result", "error"], ["operationId", "state"]); id(value.operationId);
  if (!["running", "completed", "failed"].includes(value.state)) invalid();
  if (value.state === "running" && (value.result !== undefined || value.error !== undefined) ||
      value.state === "failed" && (value.result !== undefined || typeof value.error !== "string" || !/^[a-z-]{1,64}$/u.test(value.error))) invalid();
  if (value.state !== "completed") return { operationId: value.operationId, state: value.state, error: typeof value.error === "string" ? value.error.slice(0, 100) : null };
  if (value.error !== undefined) invalid();
  const answer = value.result; keys(answer, ["body", "model", "citations"]);
  const body = text(answer.body, 8000);
  const model = id(answer.model);
  if (!Array.isArray(answer.citations) || answer.citations.length > 50) invalid();
  const citations = answer.citations.map((item) => {
    keys(item, ["startIndex", "endIndex", "url", "title"]);
    const start = item.startIndex, end = item.endIndex;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > body.length) invalid();
    return { startIndex: start, endIndex: end, url: publicUrl(item.url), title: text(item.title, 512) };
  });
  return { operationId: value.operationId, state: value.state, result: { body, model, citations } };
}

export function createLocalAiClient({ fetchImpl, getToken, timeoutMs = 10000 }) {
  if (typeof fetchImpl !== "function" || typeof getToken !== "function" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError("Invalid local AI client");
  async function request(path, body, actorId, signal) {
    const url = BASE + path;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    if (payload !== undefined && encoder.encode(payload).length > 32768) throw new TypeError("Invalid local AI request");
    const controller = new AbortController();
    let rejectInterrupted;
    const interrupted = new Promise((_, reject) => { rejectInterrupted = reject; });
    let reader;
    const interrupt = () => { controller.abort(); void reader?.cancel().catch(() => {}); rejectInterrupted(new TypeError("Local AI request unavailable")); };
    const timeout = setTimeout(interrupt, timeoutMs);
    const abort = () => interrupt();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) interrupt();
    try {
      const token = readPairingToken(await Promise.race([getToken(), interrupted]));
      if (controller.signal.aborted) throw new TypeError("Local AI request unavailable");
      const headers = { Authorization: `Bearer ${token}` };
      if (payload !== undefined) headers["Content-Type"] = "application/json";
      if (actorId !== undefined) headers["X-Demo-Actor"] = readActorId(actorId);
      const response = await Promise.race([fetchImpl(url, { method: payload === undefined ? "GET" : "POST", headers,
        ...(payload === undefined ? {} : { body: payload }), credentials: "omit", redirect: "error", cache: "no-store",
        referrerPolicy: "no-referrer", signal: controller.signal }), interrupted]);
      if (!response || response.redirected || response.url && response.url !== url || response.status !== 200 ||
          !/^application\/json(?:;|$)/iu.test(response.headers?.get("content-type") ?? "")) invalid();
      if (!response.body?.getReader) invalid();
      reader = response.body.getReader();
      const chunks = []; let size = 0;
      while (true) {
        const part = await Promise.race([reader.read(), interrupted]);
        if (part.done) break;
        if (!(part.value instanceof Uint8Array)) invalid();
        size += part.value.byteLength;
        if (size > 65536) invalid();
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return record(JSON.parse(raw));
    } finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); void reader?.cancel().catch(() => {}); }
  }
  return Object.freeze({
    status: async (options = {}) => projectStatus(await request("/status", undefined, undefined, options.signal)),
    connect: async (options = {}) => {
      const value = await request("/connect", {}, undefined, options.signal); keys(value, ["authorizationUrl"]);
      const authorizationUrl = new URL(text(value.authorizationUrl, 4096));
      if (authorizationUrl.origin !== "https://auth.openai.com" || authorizationUrl.pathname !== "/api/accounts/authorize" ||
          authorizationUrl.hash || authorizationUrl.username || authorizationUrl.password || authorizationUrl.port) invalid();
      return { authorizationUrl: authorizationUrl.toString() };
    },
    disconnect: async (options = {}) => {
      const value = await request("/disconnect", {}, undefined, options.signal); keys(value, ["revocationConfirmed"]);
      if (typeof value.revocationConfirmed !== "boolean") invalid();
      return { revocationConfirmed: value.revocationConfirmed };
    },
    models: async (options = {}) => projectModels(await request("/models", undefined, undefined, options.signal)),
    start: async (value, actorId, options = {}) => {
      id(value?.operationId); id(value?.model); readActorId(actorId);
      if (typeof value.articleText !== "string" || !value.articleText.trim() || value.articleText.length > 4096 || value.allowWebResearch !== true) invalid();
      const started = await request("/insights", value, actorId, options.signal);
      keys(started, ["operationId", "state"]);
      if (started.operationId !== value.operationId || started.state !== "running") invalid();
      return { operationId: started.operationId, state: started.state };
    },
    result: async (operationId, actorId, options = {}) => {
      const result = projectResult(await request("/insights/result", { operationId: id(operationId) }, readActorId(actorId), options.signal));
      if (result.operationId !== operationId) invalid(); return result;
    },
    cancel: async (operationId, actorId, options = {}) => {
      const value = await request("/insights/cancel", { operationId: id(operationId) }, readActorId(actorId), options.signal);
      keys(value, ["cancelled"]);
      if (value.cancelled !== true) invalid(); return true;
    },
  });
}
