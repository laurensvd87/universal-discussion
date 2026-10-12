import assert from "node:assert/strict";
import { EventEmitter, getEventListeners } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
  CrawlerApiError,
  createLocalIngestClient,
} from "../src/crawler/local-ingest-client.js";

const TOKEN = "A".repeat(43);
const VERSION = Object.freeze({ generation: "generation-crawler", revision: 10 });

function responseFixture(descriptors) {
  const queue = [...descriptors];
  const calls = [];
  const requestImpl = (options, onResponse) => {
    const call = { options, body: null };
    calls.push(call);
    const outgoing = new EventEmitter();
    outgoing.destroy = () => outgoing;
    outgoing.end = body => {
      call.body = body === undefined ? null : Buffer.from(body);
      const configured = queue.shift();
      if (!configured) throw new Error("Unexpected local API request");
      const descriptor = typeof configured === "function" ? configured(call, calls) : configured;
      queueMicrotask(() => {
        if (descriptor.requestError) { outgoing.emit("error", new Error("synthetic socket detail")); return; }
        const incoming = new PassThrough();
        incoming.statusCode = descriptor.status ?? 200;
        incoming.headers = descriptor.headers ?? { "content-type": "application/json; charset=utf-8" };
        onResponse(incoming);
        if (descriptor.responseError) { incoming.emit("error", new Error("synthetic response detail")); return; }
        const bytes = descriptor.bytes ?? Buffer.from(JSON.stringify(descriptor.value), "utf8");
        incoming.end(bytes);
      });
    };
    return outgoing;
  };
  return { requestImpl, calls, remaining: () => queue.length };
}

function body(call) {
  return call.body === null ? null : JSON.parse(call.body.toString("utf8"));
}

function rejectsCode(code) {
  return error => error instanceof CrawlerApiError && error.code === code && error.message === code;
}

function representation(overrides = {}) {
  const values = Array(384).fill(0);
  values[0] = 1;
  return {
    url: "https://news.alpha.org/world/article",
    title: "Bounded public article",
    embedding: { modelId: "e5-small-q8-browser-main-prefix-v1", values },
    extractorVersion: "crawler-static-html-prefix/v1",
    ...overrides,
  };
}

function ingestResult(version = { generation: VERSION.generation, revision: VERSION.revision + 1 }) {
  return {
    assignment: "provisional",
    policyVersion: "adaptive-topic-policy/v1",
    sourceId: "source-crawler",
    topicId: "topic-crawler",
    version,
  };
}

test("local client uses only the fixed loopback endpoint and bearer-authenticated JSON contract", async () => {
  const fixture = responseFixture([{ value: { version: VERSION } }]);
  const client = createLocalIngestClient({ token: TOKEN, requestImpl: fixture.requestImpl });
  assert.deepEqual(await client.version(), VERSION);
  assert.equal(fixture.calls.length, 1);
  const { options } = fixture.calls[0];
  assert.deepEqual({
    protocol: options.protocol,
    hostname: options.hostname,
    port: options.port,
    path: options.path,
    method: options.method,
    agent: options.agent,
  }, {
    protocol: "http:", hostname: "127.0.0.1", port: 4174, path: "/v1/version", method: "GET", agent: false,
  });
  assert.deepEqual(options.headers, { authorization: `Bearer ${TOKEN}`, accept: "application/json" });
  assert.equal(fixture.calls[0].body, null);
  assert.equal(fixture.remaining(), 0);
  assert.equal(Object.isFrozen(client), true);
});

test("known canonical Sources are read through stable bounded catalogue pages", async () => {
  const fixture = responseFixture([
    { value: { catalog: { version: VERSION, sources: [
      { url: "https://news.alpha.org/one" }, { url: "https://science.beta.net/two" },
    ] }, nextCursor: "cursor-two" } },
    { value: { catalog: { version: VERSION, sources: [{ url: "https://culture.gamma.org/three" }] }, nextCursor: null } },
  ]);
  const client = createLocalIngestClient({ token: TOKEN, requestImpl: fixture.requestImpl });
  assert.deepEqual(await client.knownSourceUrls(), {
    version: VERSION,
    urls: ["https://news.alpha.org/one", "https://science.beta.net/two", "https://culture.gamma.org/three"],
  });
  assert.deepEqual(fixture.calls.map(call => ({ method: call.options.method, path: call.options.path, body: body(call) })), [
    { method: "POST", path: "/v1/catalog/page", body: { kind: "sources", limit: 100, cursor: null } },
    { method: "POST", path: "/v1/catalog/page", body: { kind: "sources", limit: 100, cursor: "cursor-two" } },
  ]);
  assert.equal(fixture.calls.every(call => call.options.headers["content-type"] === "application/json"), true);
  assert.equal(fixture.calls.every(call => call.options.headers["content-length"] === String(call.body.length)), true);
});

test("catalogue paging rejects version drift and malformed Source projections", async () => {
  const drift = responseFixture([
    { value: { catalog: { version: VERSION, sources: [] }, nextCursor: "next" } },
    { value: { catalog: { version: { ...VERSION, revision: 11 }, sources: [] }, nextCursor: null } },
  ]);
  await assert.rejects(createLocalIngestClient({ token: TOKEN, requestImpl: drift.requestImpl }).knownSourceUrls(), rejectsCode("conflict"));

  for (const source of [null, {}, { url: 123 }, { url: "x".repeat(2_049) }]) {
    const malformed = responseFixture([{ value: { catalog: { version: VERSION, sources: [source] }, nextCursor: null } }]);
    await assert.rejects(createLocalIngestClient({ token: TOKEN, requestImpl: malformed.requestImpl }).knownSourceUrls(),
      rejectsCode("invalid-response"));
  }
});

test("catalogue paging rejects malformed and repeated signed cursors", async () => {
  for (const nextCursor of ["", "cursor with spaces", "cursor=padding", "x".repeat(2_049)]) {
    const malformed = responseFixture([{ value: { catalog: { version: VERSION, sources: [] }, nextCursor } }]);
    await assert.rejects(createLocalIngestClient({ token: TOKEN, requestImpl: malformed.requestImpl }).knownSourceUrls(),
      rejectsCode("invalid-response"));
    assert.equal(malformed.calls.length, 1);
  }
  const repeated = responseFixture([
    { value: { catalog: { version: VERSION, sources: [] }, nextCursor: "signed_cursor" } },
    { value: { catalog: { version: VERSION, sources: [] }, nextCursor: "signed_cursor" } },
  ]);
  await assert.rejects(createLocalIngestClient({ token: TOKEN, requestImpl: repeated.requestImpl }).knownSourceUrls(),
    rejectsCode("invalid-response"));
  assert.deepEqual(repeated.calls.map(call => body(call).cursor), [null, "signed_cursor"]);
});

test("ambiguous ingestion retries the exact operation once without changing its expected version", async () => {
  const fixture = responseFixture([
    { requestError: true },
    { value: ingestResult() },
  ]);
  const client = createLocalIngestClient({ token: TOKEN, requestImpl: fixture.requestImpl });
  const result = await client.ingest(representation(), "crawl-operation-one", VERSION);
  assert.deepEqual(result, ingestResult());
  assert.equal(fixture.calls.length, 2);
  assert.deepEqual(body(fixture.calls[1]), body(fixture.calls[0]));
  assert.deepEqual(body(fixture.calls[0]).expected, VERSION);
  assert.equal(body(fixture.calls[0]).operationId, "crawl-operation-one");
});

test("only ingestion uses thirty-second client timers, including exact conflict retry", async t => {
  const periods = [];
  const originalTimer = globalThis.setTimeout;
  t.mock.method(globalThis, "setTimeout", (callback, milliseconds, ...args) => {
    periods.push(milliseconds);
    return originalTimer(callback, milliseconds, ...args);
  });
  const fixture = responseFixture([
    { value: { version: VERSION } },
    { value: { catalog: { version: VERSION, sources: [] }, nextCursor: null } },
    { status: 409, value: {} },
    { value: { version: { ...VERSION, revision: 12 } } },
    { value: ingestResult({ ...VERSION, revision: 13 }) },
  ]);
  const client = createLocalIngestClient({ token: TOKEN, requestImpl: fixture.requestImpl });
  await client.version();
  await client.knownSourceUrls();
  await client.ingest(representation(), "crawl-longer-deadline", VERSION);
  assert.deepEqual(periods, [10_000, 10_000, 30_000, 10_000, 30_000]);
  const first = body(fixture.calls[2]), last = body(fixture.calls[4]);
  delete first.expected; delete last.expected;
  assert.deepEqual(first, last);
});

test("ingestion completing after ten seconds succeeds without a timeout retry", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let respond, destroyed = 0, calls = 0;
  const requestImpl = (_options, onResponse) => {
    calls++;
    const outgoing = new EventEmitter();
    outgoing.destroy = () => { destroyed++; };
    outgoing.end = () => { respond = () => {
      const incoming = new PassThrough();
      incoming.statusCode = 200;
      incoming.headers = { "content-type": "application/json" };
      onResponse(incoming);
      incoming.end(Buffer.from(JSON.stringify(ingestResult())));
    }; };
    return outgoing;
  };
  const pending = createLocalIngestClient({ token: TOKEN, requestImpl }).ingest(representation(), "crawl-slow-success", VERSION);
  t.mock.timers.tick(11_000);
  assert.equal(destroyed, 0);
  assert.equal(calls, 1);
  respond();
  assert.deepEqual(await pending, ingestResult());
  assert.equal(calls, 1);
});

test("complete ingestion timeout remains terminal and does not add retries", async () => {
  const fixture = responseFixture([{ status: 408, value: { error: "invalid-request" } }]);
  await assert.rejects(createLocalIngestClient({ token: TOKEN, requestImpl: fixture.requestImpl })
    .ingest(representation(), "crawl-complete-timeout", VERSION), rejectsCode("response-timeout"));
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.remaining(), 0);
});

test("conflict refreshes the canonical version before retrying the same representation", async () => {
  const refreshed = { generation: VERSION.generation, revision: 12 };
  const final = ingestResult({ generation: VERSION.generation, revision: 13 });
  const fixture = responseFixture([
    { status: 409, value: {} },
    { value: { version: refreshed } },
    { value: final },
  ]);
  const client = createLocalIngestClient({ token: TOKEN, requestImpl: fixture.requestImpl });
  assert.deepEqual(await client.ingest(representation(), "crawl-operation-two", VERSION), final);
  assert.deepEqual(fixture.calls.map(call => [call.options.method, call.options.path]), [
    ["POST", "/v1/sources/ingest"], ["GET", "/v1/version"], ["POST", "/v1/sources/ingest"],
  ]);
  assert.deepEqual(body(fixture.calls[0]).expected, VERSION);
  assert.deepEqual(body(fixture.calls[2]).expected, refreshed);
  const first = body(fixture.calls[0]);
  const last = body(fixture.calls[2]);
  delete first.expected;
  delete last.expected;
  assert.deepEqual(last, first);
});

test("a conflict followed by a different canonical generation never retries ingestion", async () => {
  const fixture = responseFixture([
    { status: 409, value: {} },
    { value: { version: { generation: "replacement-generation", revision: 0 } } },
  ]);
  const client = createLocalIngestClient({ token: TOKEN, requestImpl: fixture.requestImpl });

  await assert.rejects(client.ingest(representation(), "crawl-generation-conflict", VERSION), rejectsCode("conflict"));
  assert.deepEqual(fixture.calls.map(call => [call.options.method, call.options.path]), [
    ["POST", "/v1/sources/ingest"], ["GET", "/v1/version"],
  ]);
  assert.deepEqual(body(fixture.calls[0]).expected, VERSION);
  assert.equal(fixture.remaining(), 0);
});

test("representation fields cannot replace client-owned expected version or operation identity", async () => {
  const fixture = responseFixture([]);
  const client = createLocalIngestClient({ token: TOKEN, requestImpl: fixture.requestImpl });
  await assert.rejects(client.ingest(representation({
    expected: { generation: "forged-generation", revision: 999 },
    operationId: "forged-operation",
  }), "crawl-authoritative-operation", VERSION), /Invalid crawler ingestion/u);
  assert.equal(fixture.calls.length, 0);
});

test("response envelopes, capacity and status failures are fixed and do not echo payloads or token", async () => {
  const invalidResponses = [
    { headers: { "content-type": "text/plain" }, value: { version: VERSION } },
    { headers: { "content-type": "application/json", "content-length": "1048577" }, value: { version: VERSION } },
    { headers: { "content-type": "application/json" }, bytes: Buffer.from([0xff]) },
    { headers: { "content-type": "application/json" }, bytes: Buffer.from("{", "utf8") },
    { value: { version: VERSION, extra: true } },
    { value: { version: { generation: VERSION.generation, revision: -1 } } },
  ];
  for (const descriptor of invalidResponses) {
    const fixture = responseFixture([descriptor]);
    await assert.rejects(createLocalIngestClient({ token: TOKEN, requestImpl: fixture.requestImpl }).version(), error => {
      assert.equal(rejectsCode("invalid-response")(error), true);
      assert.equal(error.message.includes(TOKEN), false);
      return true;
    });
  }

  for (const [status, code] of [[400, "invalid-request"], [401, "unauthorized"], [403, "forbidden"], [408, "response-timeout"],
    [409, "conflict"], [413, "capacity"], [500, "service-error"], [503, "service-unavailable"]]) {
    const fixture = responseFixture([{ status, value: { private: "must-not-echo" } }]);
    await assert.rejects(createLocalIngestClient({ token: TOKEN, requestImpl: fixture.requestImpl }).version(), error => {
      assert.equal(rejectsCode(code)(error), true);
      assert.equal(error.message.includes("must-not-echo"), false);
      return true;
    });
  }

});

test("authentication and ingestion inputs fail before any request", async () => {
  for (const token of [undefined, "short", "!".repeat(43), "A".repeat(44)])
    assert.throws(() => createLocalIngestClient({ token, requestImpl() {} }), /Invalid local crawler authentication/u);
  assert.throws(() => createLocalIngestClient({ token: TOKEN, timeoutMs: 999, requestImpl() {} }), /Invalid local crawler authentication/u);

  const fixture = responseFixture([]);
  const client = createLocalIngestClient({ token: TOKEN, requestImpl: fixture.requestImpl });
  for (const args of [
    [null, "crawl-operation", VERSION],
    [representation(), "bad operation space", VERSION],
    [representation(), "crawl-operation", { generation: VERSION.generation, revision: -1 }],
  ]) await assert.rejects(client.ingest(...args), /Invalid crawler ingestion/u);
  assert.equal(fixture.calls.length, 0);
});

test("pre-aborted crawler operations never dispatch loopback HTTP", async () => {
  const controller = new AbortController();
  controller.abort();
  const fixture = responseFixture([]);
  const client = createLocalIngestClient({ token: TOKEN, requestImpl: fixture.requestImpl });
  for (const operation of [() => client.version({ signal: controller.signal }),
    () => client.knownSourceUrls({ signal: controller.signal }),
    () => client.ingest(representation(), "crawl-operation", VERSION, { signal: controller.signal })])
    await assert.rejects(operation(), rejectsCode("aborted"));
  assert.equal(fixture.calls.length, 0);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("abort destroys an in-flight ingestion and terminates before ambiguous retries or version refresh", async () => {
  const controller = new AbortController();
  let dispatched = 0, destroyed = 0;
  const client = createLocalIngestClient({ token: TOKEN, requestImpl() {
    dispatched++;
    const outgoing = new EventEmitter();
    outgoing.end = () => {};
    outgoing.destroy = () => { destroyed++; outgoing.emit("error", new Error("synthetic abort socket error")); };
    return outgoing;
  } });
  const pending = client.ingest(representation(), "crawl-operation", VERSION, { signal: controller.signal });
  assert.equal(getEventListeners(controller.signal, "abort").length, 1);
  controller.abort();
  await assert.rejects(pending, rejectsCode("aborted"));
  assert.equal(dispatched, 1);
  assert.equal(destroyed, 1);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("abort during conflict version refresh cannot dispatch another ingestion", async () => {
  const controller = new AbortController();
  const fixture = responseFixture([{ status: 409, value: { error: "conflict" } }, () => {
    controller.abort();
    return { value: { version: { ...VERSION, revision: VERSION.revision + 1 } } };
  }]);
  const client = createLocalIngestClient({ token: TOKEN, requestImpl: fixture.requestImpl });
  await assert.rejects(client.ingest(representation(), "crawl-operation", VERSION, { signal: controller.signal }), rejectsCode("aborted"));
  assert.deepEqual(fixture.calls.map(call => call.options.path), ["/v1/sources/ingest", "/v1/version"]);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("completed crawler requests remove their cancellation listeners", async () => {
  const controller = new AbortController();
  const fixture = responseFixture([{ value: { version: VERSION } }, { value: ingestResult() }]);
  const client = createLocalIngestClient({ token: TOKEN, requestImpl: fixture.requestImpl });
  await client.version({ signal: controller.signal });
  await client.ingest(representation(), "crawl-operation", VERSION, { signal: controller.signal });
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  controller.abort();
  assert.equal(fixture.calls.length, 2);
});
