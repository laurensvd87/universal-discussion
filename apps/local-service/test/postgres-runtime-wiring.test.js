import assert from "node:assert/strict";
import test from "node:test";
import { ServiceError } from "../src/domain/errors.js";
import { createPostgresInteractiveIngestion } from "../src/application/postgres-interactive-ingestion.js";
import { startPostgresIngestionWorkerLoop } from "../src/application/postgres-ingestion-worker-loop.js";
import { createPostgresCanonicalService } from "../src/application/create-postgres-canonical-service.js";
import { createRequestHandler } from "../src/http/request-handler.js";

const version = Object.freeze({ generation: "generation-pg", revision: 7 });
const input = Object.freeze({ expected: version, operationId: "operation-pg", url: "https://example.com/article",
  title: "PostgreSQL article", embedding: { modelId: "e5-small-q8-browser-main-prefix-v1",
    values: Object.freeze(Array.from({ length: 384 }, (_, index) => index === 0 ? 1 : 0)) },
  extractorVersion: "main-text-prefix/v1" });
const receipt = Object.freeze({ version: { generation: version.generation, revision: 8 }, sourceId: "source-pg",
  topicId: "topic-pg", topicIds: ["topic-pg"], assignment: "provisional",
  policyVersion: "fixed-reference-radius-overlap/v1" });

function ingestionRepository(overrides = {}) {
  return {
    async enqueueInteractive() { return { state: "pending" }; },
    async status() { return { state: "complete", result: receipt }; },
    async receipt() { return receipt; },
    async renewAuthority() { return true; },
    async revokeAuthority() { return true; },
    ...overrides,
  };
}

test("interactive PostgreSQL ingestion uses only its lane and returns the exact durable receipt", async () => {
  const calls = [], times = [0, 1_001, 1_002];
  const repository = ingestionRepository({
    async enqueueInteractive(value, options) {
      calls.push(["enqueue", value, options]); return { state: "pending" };
    },
    async status() {
      calls.push(["status"]); return calls.filter(([name]) => name === "status").length < 2
        ? { state: "pending" } : { state: "complete", result: receipt };
    },
    async receipt(value) { calls.push(["receipt", value]); return receipt; },
    async renewAuthority(value) { calls.push(["renew", value]); return true; },
    async revokeAuthority() { assert.fail("completed work must not be revoked"); },
    async enqueueCrawler() { assert.fail("interactive HTTP must not consume the crawler lane"); },
  });
  const adapter = createPostgresInteractiveIngestion({ repository, authoritySeconds: 1,
    nextAuthorityToken: () => "interactive-authority", now: () => times.shift() ?? 1_002,
    sleep: async () => {} });
  assert.deepEqual(await adapter.ingest(input, { isCurrent: () => true }), receipt);
  assert.equal(calls.filter(([name]) => name === "enqueue").length, 1);
  assert.equal(calls.filter(([name]) => name === "renew").length, 1);
  assert.equal(calls.at(-1)[0], "receipt");
});

test("interactive enqueue ambiguity resolves through durable status without rebasing", async () => {
  let enqueues = 0, versions = 0;
  const repository = ingestionRepository({
    async enqueueInteractive() { enqueues += 1; throw new ServiceError("storage-failure", "hidden"); },
    async status() { return { state: "complete", result: receipt }; },
    async receipt() { return receipt; },
  });
  const adapter = createPostgresInteractiveIngestion({ repository,
    nextAuthorityToken: () => "ambiguous-authority" });
  assert.deepEqual(await adapter.ingest(input, { isCurrent() { versions += 1; return true; } }), receipt);
  assert.equal(enqueues, 1); assert.ok(versions >= 1);

  const stale = createPostgresInteractiveIngestion({ repository: ingestionRepository({
    async enqueueInteractive() { throw new ServiceError("conflict", "State changed"); },
  }), nextAuthorityToken: () => "stale-authority" });
  await assert.rejects(stale.ingest(input, { isCurrent: () => true }), error => error.code === "conflict");
});

test("interactive cancellation revokes accepted authority without returning queued material", async () => {
  const controller = new AbortController(); let revoked = null;
  const adapter = createPostgresInteractiveIngestion({ repository: ingestionRepository({
    async status() { controller.abort(); return { state: "pending" }; },
    async revokeAuthority(value) { revoked = value; return true; },
  }), nextAuthorityToken: () => "cancel-authority", sleep: async () => {} });
  await assert.rejects(adapter.ingest(input, { signal: controller.signal, isCurrent: () => true }),
    error => error.code === "unavailable");
  assert.equal(revoked.authorityToken, "cancel-authority");
});

function claim() {
  return { operationId: "operation-pg", operationDigest: "a".repeat(64), requestMaterial: "{}",
    input, jobClass: "interactive", ordinal: 0, attempts: 1, leaseToken: "lease-pg",
    leaseUntil: "2026-10-13T00:00:30.000Z", authorityUntil: "2026-10-13T00:00:30.000Z" };
}

test("worker idle means the admitted queue drained, while its polling lifetime remains active", async () => {
  let claims = 0, applied = 0, failed = 0;
  const worker = startPostgresIngestionWorkerLoop({ idleDelayMs: 5, nextLeaseToken: () => "lease-token",
    repository: {
      async claim() { claims += 1; return claims === 1 ? claim() : null; },
      async apply(selected, value) { assert.equal(selected.operationId, input.operationId);
        assert.deepEqual(value, { representedValues: [1, 0] }); applied += 1; return receipt; },
      async failClaim() { failed += 1; },
    }, referenceMatcher: { represent: () => [1, 0] } });
  await worker.whenIdle();
  assert.equal(applied, 1); assert.equal(failed, 0); assert.ok(claims >= 2);
  await worker.close();
});

test("worker terminalizes deterministic representation rejection but leaves uncertain apply reclaimable", async () => {
  for (const mode of ["representation", "apply"]) {
    let claims = 0, failureCode = null; const outcomes = [];
    const worker = startPostgresIngestionWorkerLoop({ idleDelayMs: 5, nextLeaseToken: () => "lease-token",
      repository: {
        async claim() { claims += 1; return claims === 1 ? claim() : null; },
        async apply() { throw new ServiceError("storage-failure", "ambiguous"); },
        async failClaim(selected, value) { failureCode = value.code; return true; },
      }, referenceMatcher: { represent() {
        if (mode === "representation") throw new TypeError("bad ridge output");
        return [1, 0];
      } }, onOutcome: value => outcomes.push(value) });
    await worker.whenIdle(); await worker.close();
    assert.equal(failureCode, mode === "representation" ? "representation-failed" : null);
    assert.equal(outcomes[0].outcome, mode === "representation" ? "representation-failed" : "apply-uncertain");
  }
});

test("coherent PostgreSQL public snapshots survive unrelated crawler revision advancement", async () => {
  const config = { hostHeader: "127.0.0.1:4174", origin: `chrome-extension://${"a".repeat(32)}`,
    capability: "postgres-pairing" };
  let revision = 10, release;
  const handle = createRequestHandler({ config, service: {
    coherentSnapshotReads: true,
    async version() { return { generation: "generation-pg", revision }; },
    readPublic() { const snapshot = revision; return new Promise(resolve => {
      release = () => resolve(Object.freeze({ version: { generation: "generation-pg", revision: snapshot },
        topics: [], sources: [] }));
    }); },
  } });
  const pending = handle({ method: "GET", url: "/v1/catalog", body: null, headers: {
    host: config.hostHeader, origin: config.origin, authorization: `Bearer ${config.capability}`,
  } });
  revision += 1; release();
  const response = await pending;
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).version.revision, 10);
});

test("exact URL recovery uses an isolated read facade while the general read pool is saturated", async () => {
  const sourceUrl = "https://example.com/article";
  const topic = Object.freeze({ id: "topic-pg", title: "PostgreSQL topic", kind: "semantic" });
  const catalog = Object.freeze({ version, catalogVersion: 4,
    truncated: Object.freeze({ topics: false, sources: false }),
    topics: Object.freeze([topic]), sources: Object.freeze([Object.freeze({
      id: "source-pg", url: sourceUrl, title: "PostgreSQL article",
      provenance: "owner-local-page-embedding/v1", topicId: topic.id,
    })]) });
  const discussion = Object.freeze({ version, discussionVersion: 2, topic,
    discussionId: "discussion-pg", items: Object.freeze([]) });
  let releaseGeneral, isolatedCalls = 0;
  const reads = {
    async version() { return version; },
    catalogContext() { return new Promise(resolve => { releaseGeneral = () => resolve(catalog); }); },
    async catalogPage() { assert.fail("unexpected catalog page read"); },
    async discussionPage() { assert.fail("unexpected discussion page read"); },
    async exactSource() { assert.fail("unexpected exact Source read"); },
  };
  const service = createPostgresCanonicalService({ reads,
    urlSelectionReads: { async urlSelection(value) {
      isolatedCalls += 1;
      assert.deepEqual(value, { url: sourceUrl });
      return { catalog, discussion };
    } },
    runtime: { async command() { assert.fail("read recovery cannot invoke a command"); } },
  });

  const occupied = service.readPublic("catalogContext", { sourceId: null, topicId: topic.id });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof releaseGeneral, "function");
  const recovered = await service.readPublic("urlSelection", { url: sourceUrl });
  assert.equal(isolatedCalls, 1);
  assert.deepEqual(recovered.catalog.version, recovered.discussion.version);
  assert.equal(recovered.discussion.topic.id, topic.id);

  releaseGeneral();
  assert.deepEqual((await occupied).version, version);
});
