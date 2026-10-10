import assert from "node:assert/strict";
import test from "node:test";

import {
  createActiveTabReader,
  createTabLifecycleObserver,
  createWindowBoundActiveTabReader,
  createWindowBoundTabLifecycleObserver,
} from "../browser/chromium/active-tab-reader.js";

test("reader issues the exact active/current-window query and projects only tabId and URL", async () => {
  const queries = [];
  const reader = createActiveTabReader({
    async query(query) {
      queries.push(query);
      return [{
        active: true,
        id: 17,
        incognito: true,
        pendingUrl: "https://sensitive.example/pending",
        title: "Sensitive title",
        url: "https://example.com/#fragment",
        windowId: 99,
      }];
    },
  });

  const snapshot = await reader.read();

  assert.deepEqual(queries, [{ active: true, currentWindow: true }]);
  assert.deepEqual(snapshot, {
    tabId: 17,
    url: "https://example.com/#fragment",
  });
  assert.deepEqual(Object.keys(snapshot), ["tabId", "url"]);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(reader));
});

test("window-bound reader proves the same focused normal window and active completed tab twice", async () => {
  const queries = [];
  let tab = { id: 7, windowId: 3, active: true, incognito: false, status: "complete", url: "https://example.com/a" };
  let window = { id: 3, type: "normal", incognito: false, focused: true };
  const reader = createWindowBoundActiveTabReader({ windowId: 3,
    windowsApi: { get: async () => ({ ...window }) },
    tabsApi: { query: async (query) => { queries.push(query); return [{ ...tab }]; } } });
  assert.deepEqual(await reader.read(), { tabId: 7, url: tab.url, windowId: 3 });
  assert.deepEqual(queries, [{ active: true, windowId: 3 }, { active: true, windowId: 3 }]);
  window.focused = false;
  await assert.rejects(reader.read(), /Window-bound active tab unavailable/);
  window.focused = true; tab.status = "loading";
  await assert.rejects(reader.read(), /Window-bound active tab unavailable/);
  tab.status = "complete"; tab.windowId = 4;
  await assert.rejects(reader.read(), /Window-bound active tab unavailable/);
});

test("window-bound observer invalidates selected tab on activation and global window on focus", () => {
  const tabsApi = { onUpdated: lifecycleEvent(), onRemoved: lifecycleEvent(),
    onReplaced: lifecycleEvent(), onActivated: lifecycleEvent() };
  const windowsApi = { onFocusChanged: lifecycleEvent(), onRemoved: lifecycleEvent() };
  const observer = createWindowBoundTabLifecycleObserver({ tabsApi, windowsApi, windowId: 3 });
  let selected = 0, global = 0;
  observer.observe(7, () => { selected++; });
  observer.observeWindow(() => { global++; });
  tabsApi.onUpdated.emit(8, { status: "complete" }, { windowId: 4 });
  tabsApi.onUpdated.emit(8, { status: "complete" }, { windowId: 3, active: false });
  tabsApi.onActivated.emit({ tabId: 8, windowId: 4 });
  assert.equal(selected, 0); assert.equal(global, 0);
  tabsApi.onUpdated.emit(8, { status: "complete" }, { windowId: 3, active: true });
  assert.equal(selected, 0); assert.equal(global, 1);
  observer.observeWindow(() => { global++; });
  tabsApi.onActivated.emit({ tabId: 8, windowId: 3 });
  assert.equal(selected, 1); assert.equal(global, 2);
  observer.observeWindow(() => { global++; });
  windowsApi.onFocusChanged.emit(4);
  assert.equal(global, 3);
});

test("reader never accesses Tab fields outside the two-field projection", async () => {
  const accessed = [];
  const tab = new Proxy(
    { id: 23, url: "https://example.org/" },
    {
      get(target, property, receiver) {
        accessed.push(property);
        if (!["id", "url"].includes(property)) {
          throw new Error(`unexpected Tab field: ${String(property)}`);
        }
        return Reflect.get(target, property, receiver);
      },
    },
  );
  const reader = createActiveTabReader({ query: async () => [tab] });

  assert.deepEqual(await reader.read(), {
    tabId: 23,
    url: "https://example.org/",
  });
  assert.deepEqual(accessed, ["id", "url"]);
});

test("every read performs a fresh active/current-window query", async () => {
  const calls = [];
  const tabs = [
    { id: 1, url: "https://example.com/" },
    { id: 2, url: "https://example.org/" },
  ];
  const reader = createActiveTabReader({
    async query(query) {
      calls.push({ ...query });
      return [tabs[calls.length - 1]];
    },
  });

  assert.deepEqual(await reader.read(), {
    tabId: 1,
    url: "https://example.com/",
  });
  assert.deepEqual(await reader.read(), {
    tabId: 2,
    url: "https://example.org/",
  });
  assert.deepEqual(calls, [
    { active: true, currentWindow: true },
    { active: true, currentWindow: true },
  ]);
});

test("constructor rejects missing query capability", () => {
  for (const tabsApi of [undefined, null, {}, { query: true }, () => true]) {
    assert.throws(
      () => createActiveTabReader(tabsApi),
      (error) =>
        error instanceof TypeError &&
        error.message === "Active tab reader requires a query function",
    );
  }
});

test("query failures and malformed result cardinality become the same generic error", async () => {
  const cases = [
    async () => { throw new Error("secret browser failure details"); },
    async () => null,
    async () => [],
    async () => [
      { id: 1, url: "https://example.com/" },
      { id: 2, url: "https://example.org/" },
    ],
    async () => [null],
    async () => ["not a Tab"],
  ];

  for (const query of cases) {
    const reader = createActiveTabReader({ query });
    await assert.rejects(
      reader.read(),
      (error) =>
        error instanceof TypeError && error.message === "Active tab read failed",
    );
  }
});

test("reader leaves value validation to the policy without retaining browser objects", async () => {
  const sourceTab = { id: -1, url: undefined };
  const reader = createActiveTabReader({ query: async () => [sourceTab] });
  const snapshot = await reader.read();

  sourceTab.id = 88;
  sourceTab.url = "https://changed.example/";
  assert.deepEqual(snapshot, { tabId: -1, url: undefined });
  assert.notEqual(snapshot, sourceTab);
});

function lifecycleEvent() {
  const listeners = new Set();
  return {
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
    emit: (...args) => [...listeners].forEach((listener) => listener(...args)),
    count: () => listeners.size,
  };
}

test("lifecycle observation only inspects source tab IDs and releases all listeners", () => {
  const tabsApi = {
    onUpdated: lifecycleEvent(),
    onRemoved: lifecycleEvent(),
    onReplaced: lifecycleEvent(),
  };
  const forbiddenPayload = new Proxy({}, {
    get() { throw new Error("Event payload must not be inspected"); },
    ownKeys() { throw new Error("Event payload must not be enumerated"); },
  });
  let invalidations = 0;
  const observer = createTabLifecycleObserver(tabsApi);
  assert.ok(Object.isFrozen(observer));
  const dispose = observer.observe(7, () => { invalidations += 1; });
  tabsApi.onUpdated.emit(8, forbiddenPayload, forbiddenPayload);
  tabsApi.onRemoved.emit(8, forbiddenPayload);
  tabsApi.onReplaced.emit(7, 8);
  assert.equal(invalidations, 0);
  tabsApi.onUpdated.emit(7, forbiddenPayload, forbiddenPayload);
  tabsApi.onRemoved.emit(7, forbiddenPayload);
  assert.equal(invalidations, 1);
  for (const event of Object.values(tabsApi)) assert.equal(event.count(), 0);
  dispose();
  dispose();
});

test("lifecycle observer rejects missing adapters and cleans up partial registration", () => {
  for (const tabsApi of [undefined, null, {}, { onUpdated: {} }]) {
    assert.throws(() => createTabLifecycleObserver(tabsApi), TypeError);
  }
  const tabsApi = {
    onUpdated: lifecycleEvent(),
    onRemoved: lifecycleEvent(),
    onReplaced: lifecycleEvent(),
  };
  const observer = createTabLifecycleObserver(tabsApi);
  assert.throws(() => observer.observe(-1, () => {}), TypeError);
  assert.throws(() => observer.observe(7, null), TypeError);
  tabsApi.onRemoved.addListener = () => { throw new Error("secret details"); };
  assert.throws(
    () => observer.observe(7, () => {}),
    { message: "Tab lifecycle observation failed" },
  );
  for (const event of Object.values(tabsApi)) assert.equal(event.count(), 0);
});
