import assert from "node:assert/strict";
import test from "node:test";

import { createActiveTabReader } from "../browser/chromium/active-tab-reader.js";

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
