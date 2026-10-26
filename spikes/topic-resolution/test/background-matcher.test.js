import assert from "node:assert/strict";
import test from "node:test";
import { createBackgroundMatcher } from "../browser/core/background-matcher.js";
import { createInferenceHost } from "../browser/chromium/inference-host.js";
import { createLocalServiceClient, LocalServiceClientError } from "../browser/core/local-service-client.js";
import { inputText } from "../browser/embedding/embedding-contract.js";

const url = "https://example.com/article";
const origin = "https://example.com";
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise((done) => setImmediate(done));
test("version-only capture reuses an accepted exact document and invalidates on canonical version change", async () => {
  let revision = 4, ingestions = 0, versionReads = 0;
  const base = fixture({ client: {
    async catalog() { throw new Error("Full catalog must not be read"); },
    async version() { versionReads++; return { version: { generation: "g", revision } }; },
    async ingest(payload) {
      assert.equal(payload.expected.revision, revision); ingestions++; revision++;
      return { version: { generation: "g", revision }, sourceId: "source-late", topicId: "topic-late", assignment: "provisional" };
    },
  } });
  await base.matcher.refresh(); await base.matcher.refresh();
  assert.equal(versionReads, 2); assert.equal(ingestions, 1);
  assert.equal(base.matcher.currentState().sourceId, "source-late");
  revision++;
  await base.matcher.refresh();
  assert.equal(ingestions, 2);
  base.dependencies.reader.read = async () => ({ documentId: "replacement-document", result: {
    status: "collected", url, title: "Synthetic article", text: "Different document", extractorVersion: "main-text-prefix/v1",
  } });
  await base.matcher.refresh(); assert.equal(ingestions, 3);
});
function fixture(overrides = {}) {
  const calls = [];
  const state = { enabled: true, sessionWindowId: 1, sessionRevision: 1, blockedOrigins: [],
    tab: { tabId: 1, windowId: 1, url }, paired: true, permitted: true };
  const capture = { documentId: "document-a", result: { status: "collected", url, title: "Synthetic article",
    text: "Project-created bounded article text.", extractorVersion: "main-text-prefix/v1" } };
  const result = { sourceId: "source-a", topicId: "topic-a", assignment: "provisional" };
  const dependencies = {
    getPreferences: async () => ({ enabled: state.enabled, sessionWindowId: state.sessionWindowId,
      sessionRevision: state.sessionRevision, blockedOrigins: [...state.blockedOrigins] }),
    readForeground: async () => state.tab, hasPermission: async () => state.permitted,
    isPaired: async () => state.paired,
    reader: { read: async () => { calls.push("read"); return capture; }, attest: async () => ({ status: "attested", url }) },
    embed: async () => { calls.push("embed"); return { modelId: "browser", values: [1] }; },
    client: { catalog: async () => ({ version: { generation: "g", revision: 4 } }),
      ingest: async (payload) => { calls.push(payload); return result; } },
    nextOperationId: () => "operation-a", ...overrides,
  };
  const matcher = createBackgroundMatcher(dependencies);
  return { matcher, state, calls, dependencies, capture };
}
test("background matching sends only explicit fields and resolves delayed Topic", async () => {
  const { matcher, calls } = fixture();
  await matcher.refresh();
  assert.equal(matcher.currentState().phase, "ready");
  assert.equal(matcher.currentState().topicId, "topic-a");
  const payload = calls[2];
  assert.deepEqual(Object.keys(payload).sort(), ["embedding", "expected", "extractorVersion", "operationId", "title", "url"]);
  assert.deepEqual(payload.expected, { generation: "g", revision: 4 });
  assert.ok(!JSON.stringify(matcher.currentState()).includes("bounded article text"));
  assert.ok(!JSON.stringify(payload).includes("bounded article text"));
});
test("a successful ingestion followed by a local witness failure is never automatically replayable", async () => {
  let ingestions = 0;
  const base = fixture({ readForeground: async () => {
    if (ingestions > 0) throw Object.assign(new Error("synthetic local witness failure"), { code: "unavailable" });
    return { tabId: 1, windowId: 1, url };
  } });
  const ingest = base.dependencies.client.ingest;
  base.dependencies.client.ingest = async payload => { ingestions++; return ingest(payload); };
  await base.matcher.refresh();
  assert.equal(ingestions, 1);
  assert.equal(base.matcher.currentState().phase, "error");
  assert.equal(base.matcher.currentState().reason, "unavailable");
  assert.equal(base.matcher.canRetry(), false);
});
test("session/tracking URLs keep an exact document witness but ingest only the public Source", async () => {
  const base = fixture();
  const canonical = `${url}?id=product-2`;
  const documentUrl = `${canonical}&sid=synthetic-session&utm_source=fixture`;
  base.state.tab.url = documentUrl;
  base.dependencies.reader.read = async (tabId, sourceUrl, witness) => {
    assert.equal(tabId, 1); assert.equal(sourceUrl, canonical); assert.equal(witness, documentUrl);
    base.calls.push("read");
    return { documentId: "document-a", result: { status: "collected", url: sourceUrl,
      title: "Synthetic article", text: "Owned synthetic text", extractorVersion: "main-text-prefix/v1" } };
  };
  base.dependencies.reader.attest = async (tabId, id, sourceUrl, witness) => {
    assert.equal(id, "document-a"); assert.equal(sourceUrl, canonical); assert.equal(witness, documentUrl);
    return { status: "attested", url: sourceUrl };
  };
  await base.matcher.refresh();
  assert.equal(base.matcher.currentState().phase, "ready");
  assert.equal(base.matcher.currentState().url, documentUrl);
  const payload = base.calls.find(call => typeof call === "object");
  assert.equal(payload.url, canonical);
  assert.ok(!JSON.stringify(payload).includes("synthetic-session"));
  assert.ok(!JSON.stringify(payload).includes("utm_source"));
});
for (const stage of ["catalog", "read", "embed", "attest", "ingest"]) {
  test(`changing only a stripped session during ${stage} rejects late matching`, async () => {
    const pending = deferred(), entered = deferred();
    const base = fixture(stage === "embed" ? { embed: async () => {
      entered.resolve(); await pending.promise; return { modelId: "browser", values: [1] };
    } } : {});
    base.state.tab.url = `${url}?sid=synthetic-first`;
    const target = stage === "catalog" || stage === "ingest" ? base.dependencies.client :
      stage === "read" || stage === "attest" ? base.dependencies.reader : base.dependencies;
    const original = target[stage];
    if (stage !== "embed") target[stage] = async (...args) => { entered.resolve(); await pending.promise; return original(...args); };
    const work = base.matcher.refresh(); await entered.promise;
    base.state.tab.url = `${url}?sid=synthetic-second`;
    pending.resolve(); await work;
    assert.notEqual(base.matcher.currentState().phase, "ready");
    assert.equal(base.matcher.currentState().sourceId, null);
    const payloads = base.calls.filter(call => typeof call === "object");
    assert.equal(payloads.length, stage === "ingest" ? 1 : 0);
    for (const payload of payloads) assert.equal(payload.url, url);
  });
}
test("Source reuse requires the same original document witness, not just the minimized URL", async () => {
  const base = fixture(); let revision = 4;
  base.state.tab.url = `${url}?sid=synthetic-first`;
  base.dependencies.client.catalog = async () => ({ version: { generation: "g", revision },
    sources: revision === 4 ? [] : [{ id: "source-a", url, topicId: "topic-a" }] });
  base.dependencies.client.ingest = async payload => {
    base.calls.push(payload); revision++;
    return { sourceId: "source-a", topicId: "topic-a", assignment: "provisional",
      version: { generation: "g", revision } };
  };
  await base.matcher.refresh(); await base.matcher.refresh();
  assert.equal(revision, 5);
  base.state.tab.url = `${url}?sid=synthetic-second`;
  await base.matcher.refresh();
  assert.equal(revision, 6);
  assert.equal(base.matcher.currentState().phase, "ready");
  for (const call of base.calls.filter(call => typeof call === "object")) assert.equal(call.url, url);
});
test("fallback capture provenance reaches ingestion but raw sample never does", async () => {
  const base = fixture();
  const original = base.dependencies.reader.read;
  base.dependencies.reader.read = async () => {
    const capture = await original();
    capture.result.extractorVersion = "article-container-prefix/v1";
    return capture;
  };
  await base.matcher.refresh();
  const payload = base.calls[2];
  assert.equal(payload.extractorVersion, "article-container-prefix/v1");
  assert.deepEqual(Object.keys(payload).sort(), ["embedding", "expected", "extractorVersion", "operationId", "title", "url"]);
  assert.equal(base.matcher.currentState().phase, "ready");
});
test("identical attested refresh reuses the current source without another write", async () => {
  const base = fixture();
  let revision = 4;
  let attestations = 0;
  base.dependencies.client.catalog = async () => ({ version: { generation: "g", revision },
    sources: revision === 4 ? [] : [{ id: "source-a", url, topicId: "topic-a" }] });
  base.dependencies.client.ingest = async (payload) => {
    base.calls.push(payload); revision++;
    return { sourceId: "source-a", topicId: "topic-a", assignment: "provisional",
      version: { generation: "g", revision } };
  };
  base.dependencies.reader.attest = async () => { attestations++; return { status: "attested" }; };
  await base.matcher.refresh();
  await base.matcher.refresh();
  assert.equal(revision, 5);
  assert.equal(attestations, 2);
  assert.deepEqual(base.calls.map((call) => typeof call === "string" ? call : "ingest"),
    ["read", "embed", "ingest", "read"]);
  assert.equal(base.matcher.currentState().phase, "ready");
  assert.equal(base.matcher.currentState().topicId, "topic-a");
});

test("changed vector, catalog or session requires ingestion again", async () => {
  for (const change of ["vector", "version", "link", "session"]) {
    let vector = 1;
    const base = fixture({ embed: async () => { base.calls.push("embed"); return { modelId: "browser", values: [vector] }; } });
    let revision = 4;
    let linkedTopic = "topic-a";
    base.dependencies.client.catalog = async () => ({ version: { generation: "g", revision },
      sources: revision === 4 ? [] : [{ id: "source-a", url, topicId: linkedTopic }] });
    base.dependencies.client.ingest = async (payload) => {
      base.calls.push(payload); revision++;
      return { sourceId: "source-a", topicId: "topic-a", assignment: "provisional",
        version: { generation: "g", revision } };
    };
    await base.matcher.refresh();
    if (change === "vector") { vector = 0.9; base.capture.result.text += ' Changed fixed-model input.'; }
    if (change === "version") revision++;
    if (change === "link") linkedTopic = "topic-b";
    if (change === "session") base.state.sessionRevision++;
    await base.matcher.refresh();
    assert.equal(base.calls.filter((call) => typeof call === "object").length, 2, change);
  }
});

function computationFixture(overrides={}) {
  let revision=4,operation=0;
  const base=fixture({...overrides,nextOperationId:()=>`operation-${++operation}`,client:{
    async version(){return{version:{generation:'g',revision}};},
    async ingest(payload){base.calls.push(payload);revision++;return{version:{generation:'g',revision},sourceId:'source-a',topicId:'topic-a',assignment:'provisional'};},
  }});
  return {...base,advanceRevision(){revision++;}};
}
const embedCalls = base => base.calls.filter(call=>call==='embed').length;
const writes = base => base.calls.filter(call=>typeof call==='object');

test('same-document computation reuse keeps fresh capture and native attestation and current-revision write flow', async () => {
  const base=computationFixture();let attestations=0;
  base.dependencies.reader.attest=async()=>{attestations++;return{status:'attested'};};
  await base.matcher.refresh();await base.matcher.refresh();
  assert.equal(embedCalls(base),1);assert.equal(base.calls.filter(call=>call==='read').length,2);assert.equal(attestations,2);assert.equal(writes(base).length,1);
  base.advanceRevision();await base.matcher.refresh();
  assert.equal(embedCalls(base),1,'new revision reuses computation, never old Ready authority');
  assert.equal(writes(base).length,2);assert.notEqual(writes(base)[0].operationId,writes(base)[1].operationId);
  assert.ok(writes(base)[1].expected.revision>writes(base)[0].expected.revision);
  assert.deepEqual(Object.keys(writes(base)[1]).sort(),['embedding','expected','extractorVersion','operationId','title','url']);
  assert.equal(JSON.stringify(base.matcher.currentState()).includes('inputDigest'),false);
});

test('computation reuse requires exact tab/window/document URL/document/session/title/extractor/input witnesses', async () => {
  for(const change of ['tab','window','url','document','session','title','extractor','input','surrogate']){
    const base=computationFixture();
    if(change==='surrogate')base.capture.result.text='Synthetic \ud800';
    await base.matcher.refresh();
    if(change==='tab')base.state.tab.tabId++;
    if(change==='window'){base.state.tab.windowId++;base.state.sessionWindowId++;}
    if(change==='url')base.state.tab.url+='?sid=different-native-document';
    if(change==='document')base.capture.documentId='replacement-document';
    if(change==='session')base.state.sessionRevision++;
    if(change==='title')base.capture.result.title='Changed title';
    if(change==='extractor')base.capture.result.extractorVersion='article-container-prefix/v1';
    if(change==='input')base.capture.result.text+=' Changed input.';
    if(change==='surrogate')base.capture.result.text='Synthetic \ud801';
    await base.matcher.refresh();assert.equal(embedCalls(base),2,change);
  }
});

test('digest rejection or invalid digest disables reuse and falls back to ordinary embedding', async () => {
  for(const digestInput of [async()=>{throw new Error('synthetic unavailable digest');},async()=>null,async()=>'',async()=>new Uint8Array(32)]){
    const base=computationFixture({digestInput});await base.matcher.refresh();await base.matcher.refresh();
    assert.equal(embedCalls(base),2);assert.equal(writes(base).length,1);assert.equal(base.matcher.currentState().phase,'ready');
  }
});

test('default digest input bounds agree with the fixed embedding contract without importing its runtime into core', async t => {
  const digest=crypto.subtle.digest.bind(crypto.subtle);let hashes=0;
  t.mock.method(crypto.subtle,'digest',async(...args)=>{hashes++;return digest(...args);});
  for(const text of ['ordinary text','main\ntext\tregion','x'.repeat(4096),'','  ','x'.repeat(4097),null,1,'x\u0000y','x\u007fy']){
    let accepted=true;try{inputText(text);}catch{accepted=false;}
    const before=hashes;
    const base=computationFixture({embed:async value=>{inputText(value);return{modelId:'synthetic',values:[1]};}});
    base.capture.result.text=text;await base.matcher.refresh();
    assert.equal(hashes-before,accepted?1:0);assert.equal(base.matcher.currentState().phase,accepted?'ready':'error');
    base.matcher.dispose();
  }
});

test('delayed hashing cannot reuse computation after invalidation or permission loss', async () => {
  for(const action of ['invalidate','permission']){
    const pending=deferred();let digests=0;
    const base=computationFixture({digestInput:async()=>++digests===1?'a'.repeat(64):pending.promise});
    await base.matcher.refresh();const refresh=base.matcher.refresh();await tick();
    if(action==='invalidate')base.matcher.invalidate();else base.state.permitted=false;
    pending.resolve('a'.repeat(64));await refresh;
    assert.notEqual(base.matcher.currentState().phase,'ready');assert.equal(embedCalls(base),1);assert.equal(writes(base).length,1);
  }
});

test('cached computation never bypasses failed native attestation and failure clears subsequent reuse', async () => {
  const base=computationFixture();await base.matcher.refresh();
  base.dependencies.reader.attest=async()=>({status:'document-changed'});
  await base.matcher.refresh();assert.equal(base.matcher.currentState().phase,'unsupported');assert.equal(writes(base).length,1);assert.equal(embedCalls(base),1);
  base.dependencies.reader.attest=async()=>({status:'attested'});
  await base.matcher.refresh();assert.equal(embedCalls(base),2);assert.equal(writes(base).length,2);
});

test('an uncertain write never seeds computation reuse or automatic retry authority', async () => {
  const base=computationFixture();const ingest=base.dependencies.client.ingest;let failed=false;
  base.dependencies.client.ingest=async payload=>{if(!failed){failed=true;throw Object.assign(new Error('synthetic lost acknowledgement'),{code:'unavailable'});}return ingest(payload);};
  await base.matcher.refresh();assert.equal(base.matcher.canRetry(),false);assert.equal(base.matcher.currentState().phase,'error');
  await base.matcher.refresh();assert.equal(embedCalls(base),2);assert.equal(base.matcher.currentState().phase,'ready');
});

test("a permission interruption clears reuse even after permission returns", async () => {
  const base = fixture();
  let revision = 4;
  base.dependencies.client.catalog = async () => ({ version: { generation: "g", revision },
    sources: revision === 4 ? [] : [{ id: "source-a", url, topicId: "topic-a" }] });
  base.dependencies.client.ingest = async (payload) => {
    base.calls.push(payload); revision++;
    return { sourceId: "source-a", topicId: "topic-a", assignment: "provisional",
      version: { generation: "g", revision } };
  };
  await base.matcher.refresh();
  base.state.permitted = false;
  await base.matcher.refresh();
  base.state.permitted = true;
  await base.matcher.refresh();
  assert.equal(base.calls.filter((call) => typeof call === "object").length, 2);
});

for (const [label, setup, phase] of [
  ["off", s => { s.enabled = false; }, "off"],
  ["site blocked", s => { s.blockedOrigins = [origin]; }, "not-enabled"],
  ["different window", s => { s.tab.windowId = 2; }, "not-enabled"],
  ["no lease", s => { s.sessionWindowId = null; }, "not-enabled"],
  ["permission removed", s => { s.permitted = false; }, "not-enabled"],
  ["unpaired", s => { s.paired = false; }, "unpaired"],
  ["no focused page", s => { s.tab = null; }, "unsupported"],
  ["sensitive query", s => { s.tab.url += "?token=private"; }, "unsupported"],
]) test(`no extraction while ${label}`, async () => {
  const { matcher, state, calls } = fixture(); setup(state); await matcher.refresh();
  assert.equal(matcher.currentState().phase, phase); assert.deepEqual(calls, []);
});
for (const label of ["navigate", "pause", "permission", "close", "invalidate", "other-window", "block"]) {
  test(`${label} during inference never ingests or renders stale output`, async () => {
    const pending = deferred();
    const { matcher, state, calls } = fixture({ embed: () => pending.promise });
    const work = matcher.refresh(); await tick();
    assert.equal(matcher.currentState().phase, "processing");
    if (label === "navigate") state.tab = { tabId: 1, url: "https://example.org/other" };
    if (label === "pause") state.enabled = false;
    if (label === "permission") state.permitted = false;
    if (label === "close") state.tab = null;
    if (label === "invalidate") matcher.invalidate();
    if (label === "other-window") state.tab = { ...state.tab, windowId: 2 };
    if (label === "block") state.blockedOrigins = [origin];
    pending.resolve({ modelId: "browser", values: [1] }); await work;
    assert.deepEqual(calls, ["read"]); assert.notEqual(matcher.currentState().phase, "ready");
  });
}
test("document attestation rejects same-URL replacement before ingestion", async () => {
  const base = fixture();
  base.dependencies.reader.attest = async () => ({ status: "unsupported", reason: "document-mismatch" });
  await base.matcher.refresh();
  assert.equal(base.matcher.currentState().phase, "unsupported");
  assert.deepEqual(base.calls, ["read", "embed"]);
});

test("failed post-read foreground check leaves a bounded unavailable state without rereading", async () => {
  const h = fixture();
  h.dependencies.reader.read = async () => {
    h.calls.push("read"); h.state.tab = null;
    return { documentId: "document-a", result: { status: "collected", title: "Synthetic", text: "Synthetic bounded text", extractorVersion: "main-text-prefix/v1" } };
  };
  await h.matcher.refresh();
  assert.equal(h.matcher.currentState().phase, "not-enabled");
  assert.deepEqual(h.calls, ["read"]);
});

test("missing foreground has a precise reason before any page read", async () => {
  const { matcher, state, calls } = fixture();
  state.tab = null;
  await matcher.refresh();
  assert.equal(matcher.currentState().phase, "unsupported");
  assert.equal(matcher.currentState().reason, "no-focused-page");
  assert.equal(matcher.currentState().tabId, null);
  assert.equal(matcher.currentState().url, null);
  assert.deepEqual(calls, []);
});
test("stale backend response cannot appear after invalidation", async () => {
  const pending = deferred(); const base = fixture();
  base.dependencies.client.ingest = () => pending.promise;
  const work = base.matcher.refresh(); await tick(); base.matcher.invalidate();
  pending.resolve({ sourceId: "late-source", topicId: "late-topic", assignment: "provisional" }); await work;
  assert.equal(base.matcher.currentState().topicId, null);
});
test("a conflicting ingestion is not retried or reported as a match", async () => {
  let count = 0; const base = fixture();
  base.dependencies.client.ingest = async () => { count++; throw { code: "conflict" }; };
  await base.matcher.refresh();
  assert.equal(count, 1); assert.equal(base.matcher.currentState().reason, "conflict");
  assert.equal(base.matcher.currentState().topicId, null);
  assert.equal(base.matcher.canRetry(), false);
});

async function confirmedConflict() {
  const client = createLocalServiceClient({ getToken: () => "synthetic-test-capability-for-client-only",
    fetchImpl: async () => new Response('{"error":"conflict"}', { status: 409, headers: { "content-type": "application/json" } }) });
  try {
    await client.ingest({ expected: { generation: "g", revision: 4 }, operationId: "operation-a", url,
      title: "Synthetic", extractorVersion: "main-text-prefix/v1",
      embedding: { modelId: "e5-small-q8-browser-main-prefix-v1", values: [1, ...Array(383).fill(0)] } });
  } catch (error) { return error; }
  assert.fail("Expected transport conflict");
}
async function confirmedCapacity() {
  const client = createLocalServiceClient({ getToken: () => "synthetic-test-capability-for-client-only",
    fetchImpl: async () => new Response('{"error":"capacity"}', { status: 413, headers: { "content-type": "application/json" } }) });
  try {
    await client.ingest({ expected: { generation: "g", revision: 4 }, operationId: "operation-a", url,
      title: "Synthetic", extractorVersion: "main-text-prefix/v1",
      embedding: { modelId: "e5-small-q8-browser-main-prefix-v1", values: [1, ...Array(383).fill(0)] } });
  } catch (error) { return error; }
  assert.fail("Expected transport capacity");
}
function recoveryFixture({ legacy = false, fresh = { generation: "g", revision: 6 } } = {}) {
  const base = fixture();
  const events = [];
  let reads = 0, revision = 4, operations = 0;
  const payloads = [];
  const version = async () => {
    events.push("version"); reads++;
    return { version: reads === 2 ? fresh : { generation: "g", revision } };
  };
  base.dependencies.client = {
    ...(legacy ? { catalog: version } : { version, catalog: async () => { throw new Error("Unexpected catalog read"); } }),
    async ingest(payload) {
      events.push("ingest"); payloads.push(payload);
      if (payloads.length === 1) throw await confirmedConflict();
      revision = payload.expected.revision + 1;
      return { version: { generation: "g", revision }, sourceId: "source-a", topicId: "topic-a", assignment: "provisional" };
    },
  };
  base.dependencies.nextOperationId = () => { operations++; return "operation-a"; };
  // Capture is also a same-document witness: its attestation must renew on retry.
  base.dependencies.reader.attest = async (...args) => {
    events.push("attest"); assert.deepEqual(args, [1, "document-a", url, url]);
    return { status: "attested" };
  };
  // Recreate after replacement of client (the matcher captures dependency references).
  base.matcher = createBackgroundMatcher(base.dependencies);
  return { ...base, events, payloads, operations: () => operations };
}
for (const legacy of [false, true]) test(`confirmed matching conflict renews version and document once (${legacy ? "catalog fallback" : "version only"})`, async () => {
  const base = recoveryFixture({ legacy });
  await base.matcher.refresh();
  assert.equal(base.matcher.currentState().phase, "ready");
  assert.deepEqual(base.events, ["version", "attest", "ingest", "version", "attest", "ingest"]);
  assert.deepEqual(base.calls, ["read", "embed"]);
  assert.equal(base.operations(), 1);
  assert.equal(base.payloads.length, 2);
  const [first, second] = base.payloads;
  assert.deepEqual(first.expected, { generation: "g", revision: 4 });
  assert.deepEqual(second.expected, { generation: "g", revision: 6 });
  const withoutVersion = ({ expected, ...rest }) => JSON.stringify(rest);
  assert.equal(withoutVersion(first), withoutVersion(second));
  assert.strictEqual(first.embedding, second.embedding);
  assert.ok(Object.isFrozen(first.embedding.values));
  assert.ok(!withoutVersion(first).includes("bounded article text"));
  if (!legacy) {
    await base.matcher.refresh();
    assert.equal(base.payloads.length, 2, "cache uses accepted revision seven rather than renewed revision six");
  }
});
for (const fresh of [null, {}, { generation: "replacement", revision: 6 }, { generation: "g", revision: 4 },
  { generation: "g", revision: 3 }, { generation: "g", revision: -1 }, { generation: "g", revision: 5.1 },
  { generation: "g", revision: Number.MAX_SAFE_INTEGER + 1 }, { generation: "g", revision: 6, extra: true }]) {
  test(`matching conflict rejects malformed/replaced/non-increasing version ${JSON.stringify(fresh)}`, async () => {
    const base = recoveryFixture({ fresh }); await base.matcher.refresh();
    assert.equal(base.payloads.length, 1); assert.equal(base.matcher.currentState().reason, "conflict");
    assert.equal(base.events.filter(event => event === "attest").length, 1);
  });
}
for (const error of [new LocalServiceClientError("conflict"), { code: "conflict", confirmedIngestionConflict: true },
  ...["unavailable", "invalid-request", "unauthorized", "invalid-response", "capacity", "unknown"].map(code => {
    const failure = new LocalServiceClientError(code); failure.confirmedIngestionConflict = true; return failure;
  })]) test(`unconfirmed or uncertain ${error.code} cannot recover`, async () => {
  const base = recoveryFixture();
  base.dependencies.client.ingest = async payload => { base.payloads.push(payload); throw error; };
  await base.matcher.refresh();
  assert.equal(base.payloads.length, 1);
  assert.deepEqual(base.events, ["version", "attest"]);
  assert.notEqual(base.matcher.currentState().phase, "ready");
  assert.equal(base.matcher.canRetry(), false);
});
test("a second confirmed matching conflict ends the inline attempt but permits fenced backoff", async () => {
  const base = recoveryFixture();
  base.dependencies.client.ingest = async payload => { base.payloads.push(payload); throw await confirmedConflict(); };
  await base.matcher.refresh();
  assert.equal(base.payloads.length, 2); assert.equal(base.operations(), 1);
  assert.equal(base.matcher.currentState().reason, "conflict");
  assert.equal(base.matcher.canRetry(), true);
});
test("a confirmed matching capacity rejection permits fenced backoff without an inline replay", async () => {
  const base = recoveryFixture();
  base.dependencies.client.ingest = async payload => { base.payloads.push(payload); throw await confirmedCapacity(); };
  await base.matcher.refresh();
  assert.equal(base.payloads.length, 1); assert.equal(base.operations(), 1);
  assert.equal(base.matcher.currentState().reason, "capacity");
  assert.equal(base.matcher.canRetry(), true);
});
for (const stage of ["conflict", "version", "attest", "result"]) {
  for (const change of ["navigate", "document", "stop", "session", "window", "tab", "close", "permission", "block", "unpaired", "invalidate", "dispose"]) {
    test(`${change} during recovery ${stage} prevents late matching`, async () => {
      const base = recoveryFixture();
      let documentChanged = false;
      const mutate = () => {
        if (change === "navigate") base.state.tab.url += "?sid=replacement";
        if (change === "document") { documentChanged = true; if (stage === "result") base.matcher.invalidate(); }
        if (change === "stop") base.state.enabled = false;
        if (change === "session") base.state.sessionRevision++;
        if (change === "window") base.state.tab.windowId++;
        if (change === "tab") base.state.tab.tabId++;
        if (change === "close") base.state.tab = null;
        if (change === "permission") base.state.permitted = false;
        if (change === "block") base.state.blockedOrigins = [origin];
        if (change === "unpaired") base.state.paired = false;
        if (change === "invalidate") base.matcher.invalidate();
        if (change === "dispose") base.matcher.dispose();
      };
      const ingest = base.dependencies.client.ingest;
      base.dependencies.client.ingest = async payload => {
        if (stage === "conflict" && base.payloads.length === 0) mutate();
        const result = await ingest(payload);
        if (stage === "result") mutate();
        return result;
      };
      const version = base.dependencies.client.version;
      let versions = 0;
      base.dependencies.client.version = async () => {
        const result = await version(); if (++versions === 2 && stage === "version") mutate(); return result;
      };
      const attest = base.dependencies.reader.attest;
      let attestations = 0;
      base.dependencies.reader.attest = async (...args) => {
        const result = await attest(...args); if (++attestations === 2 && stage === "attest") mutate();
        return documentChanged ? { status: "unsupported", reason: "document-mismatch" } : result;
      };
      await base.matcher.refresh();
      assert.notEqual(base.matcher.currentState().phase, "ready");
      assert.equal(base.matcher.currentState().topicId, null);
      assert.equal(base.payloads.length, stage === "result" ? 2 : 1);
      assert.deepEqual(base.calls, ["read", "embed"]);
    });
  }
}
test("offscreen host reuses packaged document and closes it on abort", async () => {
  let exists = false; let closed = 0; const message = deferred();
  const host = createInferenceHost({ runtime: { getURL: x => `chrome-extension://test/${x}`,
    getContexts: async () => exists ? [{}] : [], sendMessage: () => message.promise },
    offscreen: { createDocument: async ({ url, reasons }) => { assert.equal(url, "embedding/offscreen.html"); assert.deepEqual(reasons, ["WORKERS"]); exists = true; },
      closeDocument: async () => { closed++; exists = false; } } });
  const controller = new AbortController();
  const work = host.embed("Synthetic local sample", { signal: controller.signal });
  await tick(); controller.abort();
  await assert.rejects(work, /cancelled/u);
  await tick();
  assert.equal(closed, 1); assert.equal(exists, false);
});
test("offscreen creation cannot retain a queue of raw text and abort covers initialization", async () => {
  const creation = deferred(); let created = false; let closes = 0;
  const host = createInferenceHost({ runtime: { getURL: x => `chrome-extension://test/${x}`,
    getContexts: async () => created ? [{}] : [], sendMessage: async () => { throw new Error("must not run"); } },
    offscreen: { createDocument: async () => { await creation.promise; created = true; },
      closeDocument: async () => { created = false; closes++; } } });
  const controller = new AbortController(); const work = host.embed("First synthetic sample", { signal: controller.signal });
  await tick();
  await assert.rejects(host.embed("Second synthetic sample"), /cancelled/u);
  controller.abort(); await assert.rejects(work, /cancelled/u);
  creation.resolve(); await tick(); assert.equal(closes, 1);
});
test("rejected backend pairing invokes session cleanup before more capture", async () => {
  let cleared = 0; const base = fixture({ onUnauthorized: async () => { cleared++; } });
  base.dependencies.client.catalog = async () => { throw { code: "unauthorized" }; };
  await base.matcher.refresh(); assert.equal(cleared, 1); assert.deepEqual(base.calls, []);
});
