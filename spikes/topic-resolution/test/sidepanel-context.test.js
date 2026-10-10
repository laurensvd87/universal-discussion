import assert from "node:assert/strict";
import test from "node:test";
import { authenticatedSidePanelWindow } from "../browser/chromium/sidepanel-context.js";

const id = "a".repeat(32);
const base = `chrome-extension://${id}/chromium/sidepanel.html`;
const url = `${base}?windowId=17&instance=00000000-0000-4000-8000-000000000001`;
const sender = { id, url, origin: `chrome-extension://${id}` };
const context = { contextType: "SIDE_PANEL", documentUrl: url, documentId: "document-a",
  frameId: 0, tabId: -1, windowId: -1, incognito: false };
function runtime(contexts = [context]) {
  return { id, getURL: (path) => `chrome-extension://${id}/${path}`,
    async getContexts(filter) {
      assert.deepEqual(filter, { contextTypes: ["SIDE_PANEL"], documentUrls: [url] });
      return contexts;
    } };
}

test("only one exact live side-panel document establishes its containing window", async () => {
  assert.equal(await authenticatedSidePanelWindow(runtime(), sender), 17);
  for (const bad of [{ ...sender, id: "b".repeat(32) }, { ...sender, url: url + "&x=1" },
    { ...sender, tab: { id: 7 } }, { ...sender, frameId: 4 },
    { ...sender, origin: "https://example.com" },
    { ...sender, url: base }, { ...sender, url: url.replace("windowId=17", "windowId=018") }])
    assert.equal(await authenticatedSidePanelWindow(runtime(), bad), null);
  for (const bad of [{ ...context, contextType: "TAB" }, { ...context, documentUrl: base },
    { ...context, documentId: undefined },
    { ...context, windowId: 17 }, { ...context, frameId: -1 },
    { ...context, tabId: 7 }, { ...context, incognito: true }])
    assert.equal(await authenticatedSidePanelWindow(runtime([bad]), sender), null);
  assert.equal(await authenticatedSidePanelWindow({ ...runtime(), getContexts: async () => [{ ...context, documentId: "other" }] },
    { ...sender, documentId: "document-a" }), null);
  assert.equal(await authenticatedSidePanelWindow(runtime([context, context]), sender), null);
  assert.equal(await authenticatedSidePanelWindow(runtime([]), sender), null);
  assert.equal(await authenticatedSidePanelWindow({ ...runtime(), getContexts: async () => { throw Error("closed"); } }, sender), null);
});
