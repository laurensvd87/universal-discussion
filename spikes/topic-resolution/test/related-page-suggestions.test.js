import assert from "node:assert/strict";
import test from "node:test";
import { projectRelatedPages } from "../browser/core/related-page-suggestions.js";

const version = { generation: "generation-demo", revision: 4 };
const source = (id, topicId = "topic-demo", title = id, url = `https://news.public.org/${id}`) =>
  ({ id, url, title, topicId });
function ready() {
  const current = source("source-current"), same = source("source-same"), related = source("source-related", "topic-other");
  return { phase: "ready", error: null, needsFreshRead: false,
    sourceId: current.id, topicId: current.topicId,
    catalog: { version, sources: [current, same, related] },
    related: { version, results: [{ ...related, relationship: "related", method: "vector-similarity" }] },
    discussion: { roots: [] } };
}
function resolution(state) {
  const url = state.catalog.sources[0].url;
  return { phase: "ready", sourceId: state.sourceId, topicId: state.topicId,
    currentUrl: url, url, currentTabId: 7, tabId: 7, enabled: true,
    hostAccess: true, blockedOrigins: [], contextReason: null };
}

test("zero-post current Source projects same-topic and backend-related pages", () => {
  const state = ready();
  const value = projectRelatedPages(state);
  assert.deepEqual(value.pages.map(page => [page.id, page.relationship]), [
    ["source-same", "same-topic"], ["source-related", "related"],
  ]);
  assert.equal(value.loading, false);
  assert.equal(value.pages[0].hostname, "news.public.org");
  assert.ok(Object.isFrozen(value) && Object.isFrozen(value.pages) && Object.isFrozen(value.pages[0]));
  assert.deepEqual(Object.keys(value.pages[0]), ["id", "url", "title", "hostname", "relationship"]);
});

test("legacy ready fixtures need no backend-absent Source field or discussion roots", () => {
  const state = ready();
  delete state.related.version;
  delete state.catalog.version;
  delete state.discussion;
  assert.equal(projectRelatedPages(state).pages.length, 2);
});

test("canonical Ready shows real optional-enrichment activity instead of claiming the library is empty", () => {
  const state = ready();
  state.enrichmentPending = true;
  state.related = null;
  state.catalog.sources = [state.catalog.sources[0]];
  const pending = projectRelatedPages(state);
  assert.ok(pending.contextKey);
  assert.deepEqual(pending.pages, []);
  assert.equal(pending.loading, true);
  state.enrichmentPending = false;
  assert.equal(projectRelatedPages(state).loading, false);
});

test("wrong related Source or version fails closed", () => {
  for (const relatedPatch of [{ sourceId: "source-foreign" }, { version: { ...version, revision: 3 } },
    { version: { ...version, generation: "another-generation" } }, { version: {} }]) {
    const state = ready();
    Object.assign(state.related, relatedPatch);
    assert.deepEqual(projectRelatedPages(state), { contextKey: null, pages: [], loading: false });
  }
});

test("navigation and stale Source/Topic/URL witnesses clear prior pages", () => {
  for (const patch of [{ sourceId: "missing" }, { topicId: "another-topic" },
    { currentUrl: "https://news.public.org/new" }]) {
    assert.equal(projectRelatedPages({ ...ready(), ...patch }).contextKey, null);
  }
  for (const patch of [{ currentUrl: "https://news.public.org/new" }, { sourceId: "source-foreign" },
    { topicId: "topic-other" }, { currentTabId: 8 }, { phase: "unsupported" },
    { sessionWindowId: 1, currentWindowId: 2 },
    { contextReason: "tab-changed" }, { enabled: false }, { hostAccess: false },
    { blockedOrigins: ["https://news.public.org"] }]) {
    const state = ready();
    state.resolution = { ...resolution(state), ...patch };
    assert.equal(projectRelatedPages(state).contextKey, null);
  }
});

test("tracked current navigation matches cleaned Source but remains exact context witness", () => {
  const state = ready();
  const first = projectRelatedPages(state);
  state.resolution = resolution(state);
  state.resolution.url += "?utm_source=campaign&sessionid=temporary";
  state.resolution.currentUrl = state.resolution.url;
  const value = projectRelatedPages(state);
  assert.equal(value.pages.length, 2);
  assert.notEqual(value.contextKey, first.contextKey);
  assert.ok(!JSON.stringify(value.pages).includes("temporary"));
});

test("unsupported/manual contexts settle without indefinite loading", () => {
  for (const patch of [{ phase: "disconnected" }, { phase: "choose-topic", selection: "manual" },
    { error: "unavailable" }, { needsFreshRead: true }, { connected: false }]) {
    assert.deepEqual(projectRelatedPages({ ...ready(), ...patch }), { contextKey: null, pages: [], loading: false });
  }
  for (const phase of ["connecting", "loading"]) {
    assert.deepEqual(projectRelatedPages({ ...ready(), phase }), { contextKey: null, pages: [], loading: true });
  }
  const state = ready();
  state.resolution = { ...resolution(state), phase: "processing" };
  assert.deepEqual(projectRelatedPages(state), { contextKey: null, pages: [], loading: true });
});

test("unsafe, credential, private and noncanonical destination URLs are rejected", () => {
  const state = ready();
  const urls = ["javascript:alert(1)", "http://news.public.org/page", "https://127.0.0.1/page",
    "https://intranet.local/page", "https://user:password@news.public.org/page", "https://news.public.org/account/profile",
    "https://mail.public.org/page", "https://accounts.public.org/page", "https://news.public.org/page?token=secret",
    "https://news.public.org/page#fragment", "https://NEWS.public.org/page", "https://news.public.org/%70rivate/doc"];
  state.catalog.sources = [state.catalog.sources[0], ...urls.map((url, index) => source(`bad-${index}`, "topic-demo", "Bad", url))];
  state.related.results = [];
  assert.deepEqual(projectRelatedPages(state).pages, []);
});

test("current page and duplicate IDs/URLs are excluded", () => {
  const state = ready();
  state.catalog.sources.push(source("duplicate-url", "topic-demo", "Duplicate", state.catalog.sources[0].url),
    source("source-same"), source("duplicate-same-url", "topic-demo", "Duplicate", state.catalog.sources[1].url));
  state.related.results.push(state.related.results[0]);
  assert.deepEqual(projectRelatedPages(state).pages.map(page => page.id), ["source-same", "source-related"]);
});

test("related nominations require exact existing catalog metadata and preserve backend order", () => {
  const state = ready();
  const second = source("source-second", "topic-second");
  state.catalog.sources.push(second);
  state.related.results.unshift({ ...second, relationship: "related" });
  state.related.results.push({ ...source("unknown", "topic-unknown"), relationship: "related" });
  assert.deepEqual(projectRelatedPages(state).pages.map(page => page.id), ["source-same", "source-second", "source-related"]);
  state.related.results[0].url = "https://news.public.org/wrong";
  state.related.results[1].topicId = "topic-wrong";
  assert.deepEqual(projectRelatedPages(state).pages.map(page => page.id), ["source-same"]);
});

test("Unicode/title markup is inert bounded text and blank titles use hostname", () => {
  const state = ready();
  state.catalog.sources[1].title = "  \u202e<img src=x onerror=alert(1)> العربية 中文 " + "a".repeat(500);
  const value = projectRelatedPages(state);
  assert.ok(value.pages[0].title.startsWith("<img src=x onerror=alert(1)> العربية 中文"));
  assert.equal(value.pages[0].title.length, 200);
  state.catalog.sources[1].title = " \u0000\u202e ";
  assert.equal(projectRelatedPages(state).pages[0].title, "news.public.org");
});

test("context key ignores unrelated catalog revisions and all private state", () => {
  const state = ready(), expected = projectRelatedPages(state);
  state.catalog.version = { ...version, revision: 5 };
  state.related.version = state.catalog.version;
  Object.defineProperty(state, "privateChats", { get() { throw new Error("Private state read"); } });
  Object.defineProperty(state.catalog.sources[1], "embedding", { get() { throw new Error("Raw vector read"); } });
  state.catalog.sources.push(source("unrelated", "topic-unrelated"));
  assert.deepEqual(projectRelatedPages(state), expected);
});

test("suggestion count and catalog work use explicit presentation budgets", () => {
  const state = ready();
  state.catalog.sources = [state.catalog.sources[0], ...Array.from({ length: 600 }, (_, index) => source(`page-${index}`))];
  state.related = null;
  assert.equal(projectRelatedPages(state).pages.length, 511);
  state.catalog.sources = [state.catalog.sources[0], ...Array.from({ length: 511 }, (_, index) => source(`other-${index}`, "topic-other")), source("outside-budget")];
  assert.equal(projectRelatedPages(state).pages.length, 0);
});
