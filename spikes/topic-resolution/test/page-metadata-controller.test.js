import assert from "node:assert/strict";
import test from "node:test";

import {
  PAGE_METADATA_CONTROLLER_LIMITS,
  createPageMetadataController,
} from "../browser/core/page-metadata-controller.js";

const NOW = Date.parse("2026-09-22T12:00:00.000Z");
const EXPIRY = Date.parse("2026-10-23T00:00:00.000Z");
const LOCAL_URL = "http://127.0.0.1:4173/p1-5c.html";
const MDN_URL =
  "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta";
const LOCAL_TAB = Object.freeze({ tabId: 7, url: LOCAL_URL });

function deferred() {
  let reject;
  let resolve;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  return { promise, reject, resolve };
}

function sequenceReader(snapshots) {
  const calls = [];
  return {
    calls,
    async read() {
      const value = snapshots[calls.length];
      calls.push(calls.length);
      if (value instanceof Error) throw value;
      return value;
    },
  };
}

function metadataResult(overrides = {}) {
  return {
    candidates: {
      canonical: [
        { source: "link-rel-canonical", value: LOCAL_URL },
      ],
      description: [
        {
          source: "meta-name-description",
          value: "Synthetic description",
        },
      ],
      publishedAtHint: [
        {
          source: "meta-property-article-published-time",
          value: "2026-01-15T10:30:00Z",
        },
      ],
      robots: [],
      tdmReservation: [],
      title: [{ source: "title-element", value: "Synthetic title" }],
      ...overrides.candidates,
    },
    contractVersion: "page-metadata-candidates/1.0.0",
    documentUrl: LOCAL_URL,
    isTopLevel: true,
    status: "collected",
    ...Object.fromEntries(
      Object.entries(overrides).filter(([key]) => key !== "candidates"),
    ),
  };
}

function attestation(url = LOCAL_URL) {
  return {
    contractVersion: "page-document-attestation/1.0.0",
    documentUrl: url,
    isTopLevel: true,
    status: "attested",
  };
}

function receipt(result = metadataResult(), documentId = "document-123") {
  return { documentId, result };
}

function assertEmptyTerminal(state, outcome) {
  assert.equal(state.phase, "ready");
  assert.equal(state.outcome, outcome);
  assert.equal(state.envelope, null);
  assert.ok(Object.isFrozen(state));
  assert.doesNotMatch(JSON.stringify(state), /Synthetic title|secret/u);
}

test("controller binds collection and attestation between two fresh tab reads", async () => {
  const reader = sequenceReader([
    { tabId: 7, url: `${LOCAL_URL}#before` },
    { tabId: 7, url: `${LOCAL_URL}#after` },
  ]);
  const calls = [];
  const transitions = [];
  const controller = createPageMetadataController({
    async attestPageDocument(tabId, documentId, expectedUrl) {
      calls.push(["attest", tabId, documentId, expectedUrl]);
      return attestation(`${LOCAL_URL}#attested`);
    },
    now: () => NOW,
    onStateChange(state) {
      transitions.push(state);
    },
    readActiveTab: reader.read,
    async readPageMetadata(tabId, expectedUrl) {
      calls.push(["read", tabId, expectedUrl]);
      return receipt(metadataResult({ documentUrl: `${LOCAL_URL}#inside` }));
    },
  });

  assert.equal(controller.currentState().phase, "idle");
  const result = await controller.activate();
  assert.equal(result.applied, true);
  assert.equal(result.state.outcome, "resolved");
  assert.equal(result.state.envelope.title, "Synthetic title");
  assert.equal(result.state.envelope.context.observedUrl, LOCAL_URL);
  assert.equal(result.state.envelope.scope.matchingUse, "none");
  assert.equal(result.state.requestToken, "metadata-000001");
  assert.deepEqual(calls, [
    ["read", 7, LOCAL_URL],
    ["attest", 7, "document-123", LOCAL_URL],
  ]);
  assert.equal(reader.calls.length, 2);
  assert.deepEqual(
    transitions.map(({ outcome, phase }) => outcome ?? phase),
    ["loading", "resolved"],
  );
  assert.ok(Object.isFrozen(result.state.envelope));
});

test("unsupported and expired contexts make zero scripting calls", async () => {
  const cases = [
    {
      now: NOW,
      snapshot: { tabId: 1, url: "https://example.com/" },
    },
    {
      now: EXPIRY,
      snapshot: { tabId: 1, url: MDN_URL },
    },
    {
      now: NOW,
      snapshot: { tabId: 1, url: `${LOCAL_URL}?secret=1` },
    },
  ];
  for (const item of cases) {
    let scriptingCalls = 0;
    const controller = createPageMetadataController({
      async attestPageDocument() {
        scriptingCalls += 1;
      },
      now: () => item.now,
      async readActiveTab() {
        return item.snapshot;
      },
      async readPageMetadata() {
        scriptingCalls += 1;
      },
    });
    const result = await controller.activate();
    assertEmptyTerminal(result.state, "unsupported");
    assert.equal(scriptingCalls, 0);
    assert.doesNotMatch(JSON.stringify(result.state), /secret/u);
  }
});

test("negative in-head control metadata stops generically after collection", async () => {
  let attestCalls = 0;
  let readCalls = 0;
  const controller = createPageMetadataController({
    async attestPageDocument() {
      attestCalls += 1;
    },
    now: () => NOW,
    async readActiveTab() {
      readCalls += 1;
      return LOCAL_TAB;
    },
    async readPageMetadata() {
      return receipt(
        metadataResult({
          candidates: {
            robots: [
              { source: "meta-name-robots", value: "noindex secret" },
            ],
          },
        }),
      );
    },
  });
  const result = await controller.activate();
  assertEmptyTerminal(result.state, "unsupported");
  assert.equal(readCalls, 1);
  assert.equal(attestCalls, 0);
});

test("collection, schema, attestation, navigation, and permission failures are generic", async () => {
  const cases = [
    {
      attest: async () => attestation(),
      label: "initial read failure",
      metadata: async () => receipt(),
      snapshots: [new Error("secret read")],
    },
    {
      attest: async () => attestation(),
      label: "collection failure",
      metadata: async () => { throw new Error("secret script"); },
      snapshots: [LOCAL_TAB],
    },
    {
      attest: async () => attestation(),
      label: "malformed receipt",
      metadata: async () => ({ secret: "receipt" }),
      snapshots: [LOCAL_TAB],
    },
    {
      attest: async () => attestation(),
      label: "wrong in-document URL",
      metadata: async () =>
        receipt(metadataResult({ documentUrl: "https://example.com/" })),
      snapshots: [LOCAL_TAB],
    },
    {
      attest: async () => { throw new Error("secret reload"); },
      label: "same-url reload invalidates document ID",
      metadata: async () => receipt(),
      snapshots: [LOCAL_TAB],
    },
    {
      attest: async () => attestation("https://example.com/"),
      label: "attestation URL mismatch",
      metadata: async () => receipt(),
      snapshots: [LOCAL_TAB],
    },
    {
      attest: async () => attestation(),
      label: "tab changed",
      metadata: async () => receipt(),
      snapshots: [LOCAL_TAB, { tabId: 8, url: LOCAL_URL }],
    },
    {
      attest: async () => attestation(),
      label: "URL changed",
      metadata: async () => receipt(),
      snapshots: [LOCAL_TAB, { tabId: 7, url: MDN_URL }],
    },
    {
      attest: async () => attestation(),
      label: "final permission loss",
      metadata: async () => receipt(),
      snapshots: [LOCAL_TAB, new Error("secret permission")],
    },
  ];
  for (const item of cases) {
    const reader = sequenceReader(item.snapshots);
    const controller = createPageMetadataController({
      attestPageDocument: item.attest,
      now: () => NOW,
      readActiveTab: reader.read,
      readPageMetadata: item.metadata,
    });
    const result = await controller.activate();
    assert.equal(result.applied, true, item.label);
    assertEmptyTerminal(result.state, "unavailable");
  }
});

test("rights expiry during the operation blocks the final state", async () => {
  const clocks = [NOW, EXPIRY];
  const reader = sequenceReader([
    { tabId: 3, url: MDN_URL },
    { tabId: 3, url: MDN_URL },
  ]);
  const mdnMetadata = metadataResult({
    candidates: { canonical: [], publishedAtHint: [] },
    documentUrl: MDN_URL,
  });
  const controller = createPageMetadataController({
    async attestPageDocument() {
      return attestation(MDN_URL);
    },
    now: () => clocks.shift(),
    readActiveTab: reader.read,
    async readPageMetadata() {
      return receipt(mdnMetadata);
    },
  });
  const result = await controller.activate();
  assertEmptyTerminal(result.state, "unsupported");
});

test("reset during collection suppresses attestation and later publication", async () => {
  const pending = deferred();
  let attestCalls = 0;
  const transitions = [];
  const controller = createPageMetadataController({
    async attestPageDocument() {
      attestCalls += 1;
      return attestation();
    },
    now: () => NOW,
    onStateChange(state) {
      transitions.push(state);
    },
    async readActiveTab() {
      return LOCAL_TAB;
    },
    readPageMetadata: () => pending.promise,
  });
  const activation = controller.activate();
  await Promise.resolve();
  const idle = controller.reset();
  pending.resolve(receipt());
  const late = await activation;
  assert.equal(late.applied, false);
  assert.equal(late.state, idle);
  assert.equal(attestCalls, 0);
  assert.deepEqual(
    transitions.map(({ outcome, phase }) => outcome ?? phase),
    ["loading", "idle"],
  );
});

test("reset during attestation suppresses the final tab read and publication", async () => {
  const pending = deferred();
  const started = deferred();
  let reads = 0;
  const controller = createPageMetadataController({
    attestPageDocument() {
      started.resolve();
      return pending.promise;
    },
    now: () => NOW,
    async readActiveTab() {
      reads += 1;
      return LOCAL_TAB;
    },
    async readPageMetadata() {
      return receipt();
    },
  });
  const activation = controller.activate();
  await started.promise;
  const idle = controller.reset();
  pending.resolve(attestation());
  const late = await activation;
  assert.equal(late.applied, false);
  assert.equal(late.state, idle);
  assert.equal(reads, 1);
});

test("reset during the final tab read suppresses a resolved envelope", async () => {
  const pending = deferred();
  const started = deferred();
  let reads = 0;
  const controller = createPageMetadataController({
    async attestPageDocument() {
      return attestation();
    },
    now: () => NOW,
    readActiveTab() {
      reads += 1;
      if (reads === 1) return Promise.resolve(LOCAL_TAB);
      started.resolve();
      return pending.promise;
    },
    async readPageMetadata() {
      return receipt();
    },
  });
  const activation = controller.activate();
  await started.promise;
  const idle = controller.reset();
  pending.resolve(LOCAL_TAB);
  const late = await activation;
  assert.equal(late.applied, false);
  assert.equal(late.state, idle);
  assert.equal(reads, 2);
});

test("a newer activation wins with fresh document IDs and request tokens", async () => {
  const firstRead = deferred();
  let activeReads = 0;
  let metadataReads = 0;
  const controller = createPageMetadataController({
    async attestPageDocument(tabId, documentId) {
      assert.equal(documentId, `document-${metadataReads}`);
      return attestation();
    },
    now: () => NOW,
    readActiveTab() {
      activeReads += 1;
      if (activeReads === 1) return firstRead.promise;
      return Promise.resolve(LOCAL_TAB);
    },
    async readPageMetadata() {
      metadataReads += 1;
      return receipt(metadataResult(), `document-${metadataReads}`);
    },
  });
  const first = controller.activate();
  const second = await controller.activate();
  firstRead.resolve(LOCAL_TAB);
  const stale = await first;
  assert.equal(second.state.outcome, "resolved");
  assert.equal(second.state.requestToken, "metadata-000002");
  assert.equal(stale.applied, false);
  assert.equal(stale.state, second.state);
  assert.equal(metadataReads, 1);
});

test(
  "an unresolved scripting operation times out without publishing page data",
  { timeout: 5_000 },
  async () => {
    let attestCalls = 0;
    const controller = createPageMetadataController({
      async attestPageDocument() {
        attestCalls += 1;
      },
      now: () => NOW,
      async readActiveTab() {
        return LOCAL_TAB;
      },
      readPageMetadata() {
        return new Promise(() => {});
      },
    });
    const started = Date.now();
    const result = await controller.activate();
    const elapsed = Date.now() - started;
    assertEmptyTerminal(result.state, "unavailable");
    assert.equal(attestCalls, 0);
    assert.ok(
      elapsed >= PAGE_METADATA_CONTROLLER_LIMITS.scriptingTimeoutMilliseconds - 100,
    );
    assert.ok(elapsed < 4_500);
  },
);

test("controller constructor and fixed scripting timeout are explicit", () => {
  const valid = {
    attestPageDocument: async () => attestation(),
    readActiveTab: async () => LOCAL_TAB,
    readPageMetadata: async () => receipt(),
  };
  for (const options of [
    {},
    { ...valid, attestPageDocument: null },
    { ...valid, now: null },
    { ...valid, onStateChange: "not-a-function" },
    { ...valid, readActiveTab: null },
    { ...valid, readPageMetadata: null },
  ]) {
    assert.throws(
      () => createPageMetadataController(options),
      /requires function adapters/u,
    );
  }
  assert.equal(PAGE_METADATA_CONTROLLER_LIMITS.scriptingTimeoutMilliseconds, 3_000);
});
