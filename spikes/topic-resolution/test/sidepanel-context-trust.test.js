import assert from "node:assert/strict";
import test from "node:test";
import { authenticatedSidePanelWindow } from "../browser/chromium/sidepanel-context.js";

const extensionId = "a".repeat(32);
const baseUrl = `chrome-extension://${extensionId}/chromium/sidepanel.html`;
const panelUrl = `${baseUrl}?windowId=29&instance=00000000-0000-4000-8000-000000000029`;
const panelSender = Object.freeze({ id: extensionId, url: panelUrl,
  origin: `chrome-extension://${extensionId}` });
const livePanel = Object.freeze({ contextType: "SIDE_PANEL", documentUrl: panelUrl,
  documentId: "panel-document", frameId: 0, tabId: -1, windowId: -1, incognito: false });

function runtime(getContexts) {
  return { id: extensionId, getURL: (path) => `chrome-extension://${extensionId}/${path}`,
    getContexts };
}

test("side panel authentication queries the exact live instance URL on every request", async () => {
  let queries = 0;
  const api = runtime(async (filter) => {
    queries++;
    assert.deepEqual(filter, { contextTypes: ["SIDE_PANEL"], documentUrls: [panelUrl],
    });
    return queries === 1 ? [livePanel] : [];
  });
  assert.equal(await authenticatedSidePanelWindow(api, panelSender), 29);
  assert.equal(await authenticatedSidePanelWindow(api, panelSender), null);
  assert.equal(queries, 2);
});

test("an extension tab and forged sender fields cannot inherit panel authority", async () => {
  const api = runtime(async () => [livePanel]);
  const impostors = [
    { ...panelSender, tab: { id: 7, windowId: 29 } },
    { ...panelSender, id: "b".repeat(32) },
    { ...panelSender, url: baseUrl },
    { ...panelSender, url: panelUrl + "&extra=1" },
    { ...panelSender, url: panelUrl + "#other" },
    { ...panelSender, url: panelUrl.replace("windowId=29", "windowId=029") },
    { ...panelSender, url: panelUrl.replace("000000000029", "not-a-uuid") },
    { ...panelSender, origin: "https://example.com" },
    { ...panelSender, frameId: 1 },
    { ...panelSender, documentId: "" },
    { ...panelSender, documentId: null },
  ];
  for (const sender of impostors)
    assert.equal(await authenticatedSidePanelWindow(api, sender), null);
});

test("only a unique normal non-incognito side-panel context supplies its window", async () => {
  const badContexts = [
    { ...livePanel, contextType: "TAB" },
    { ...livePanel, documentUrl: panelUrl + "#other" },
    { ...livePanel, frameId: 1 },
    { ...livePanel, tabId: 7 },
    { ...livePanel, incognito: true },
    { ...livePanel, windowId: 29 },
    { ...livePanel, windowId: 1.5 },
    { ...livePanel, windowId: Number.MAX_SAFE_INTEGER + 1 },
  ];
  for (const context of badContexts)
    assert.equal(await authenticatedSidePanelWindow(runtime(async () => [context]), panelSender), null);
  assert.equal(await authenticatedSidePanelWindow(runtime(async () => [livePanel, livePanel]), panelSender), null);
  assert.equal(await authenticatedSidePanelWindow(runtime(async () => [livePanel]),
    { ...panelSender, documentId: "other-document" }), null);
  assert.equal(await authenticatedSidePanelWindow(runtime(async () => { throw new Error("closed"); }), panelSender), null);
});
