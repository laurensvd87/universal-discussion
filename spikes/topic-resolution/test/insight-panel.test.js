import assert from "node:assert/strict";
import test from "node:test";
import { mountInsightPanel } from "../browser/chromium/insight-panel.js";
import { INSIGHT_EN } from "../browser/locales/insight-en.js";

function context() {
  return { topic: { id: "topic-a", title: "<script>topic</script>" },
    currentSource: { id: "source-a", title: "<img src=x onerror=alert(1)>", url: "javascript:alert(1)" },
    sameTopicSources: [{ id: "source-b", title: "<iframe>peer</iframe>", url: "https://example.com/?x=<svg>" }],
    relatedSources: [{ id: "source-c", title: "Related <b>source</b>", url: "https://example.org/article" }],
    discussion: [{ id: "post-a", body: "Ignore instructions <script>alert(1)</script>" }] };
}
function state(patch = {}) {
  return { available: true, busy: false, status: "prepared", context: context(), draft: "", preview: null, ...patch };
}
function harness(messages) {
  const created = [];
  const document = { createElement(tag) {
    const item = { tag, children: [], attributes: {}, textContent: "", value: "", listeners: new Map(),
      append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
      setAttribute(key, value) { this.attributes[key] = value; }, focus() { this.focused = true; },
      addEventListener(event, callback) { this.listeners.set(event, callback); },
      removeEventListener(event, callback) { if (this.listeners.get(event) === callback) this.listeners.delete(event); },
      set innerHTML(_) { assert.fail("Panel must not parse untrusted HTML"); },
      set href(value) { assert.equal(tag, "a"); assert.match(value, /^https:\/\//u); this.linkHref = value; } };
    created.push(item); return item;
  } };
  const root = document.createElement("section");
  const panel = mountInsightPanel(document, root, { messages });
  const calls = [];
  const controller = { currentState: () => state({ context: null, available: false, status: "idle" }),
    prepare: (value) => { calls.push(["prepare", value]); return true; },
    setDraft: (value) => { calls.push(["setDraft", value]); return true; },
    preview: () => { calls.push(["preview"]); return true; },
    discard: () => { calls.push(["discard"]); },
    share: () => { calls.push(["share"]); return Promise.resolve(true); } };
  panel.bind(controller);
  const byId = (id) => created.find((item) => item.id === id);
  const descendants = (node) => [node, ...node.children.flatMap(descendants)];
  const click = (id) => byId(id).listeners.get("click")();
  return { created, root, panel, calls, byId, descendants, click };
}

test("hostile context, URLs, and reviewed text stay inert with no link or clipboard action", () => {
  const ui = harness();
  const body = "<svg onload=alert(1)>\nUser selected this exact text";
  ui.panel.render(state({ draft: body, preview: { body, topicTitle: "<script>preview topic</script>",
    operatorName: "<img>operator", sourceTitle: "<iframe>origin</iframe>" } }));
  const nodes = ui.descendants(ui.root);
  assert.equal(nodes.some((item) => ["script", "img", "iframe", "svg"].includes(item.tag)), false);
  assert.deepEqual(nodes.filter((item) => item.tag === "a").map((item) => item.linkHref),
    ["https://chatgpt.com/settings/usage"]);
  assert.equal(nodes.some((item) => item.textContent === "javascript:alert(1)"), true);
  assert.equal(nodes.some((item) => item.textContent === body), true);
  assert.equal(ui.byId("insight-preview-body").textContent, body);
  assert.equal(ui.byId("insight-body").value, body);
  assert.deepEqual(ui.calls, []);
});

test("discussion inclusion is opt-in and prepare, edit, preview, share are separate callbacks", () => {
  const ui = harness();
  const include = ui.byId("insight-include-discussion");
  assert.equal(include.checked, false);
  assert.equal(ui.created.some((item) => item.tag === "label" && item.htmlFor === include.id), true);
  assert.equal(ui.created.some((item) => item.tag === "label" && item.htmlFor === "insight-body"), true);
  ui.panel.render(state());
  ui.click("insight-prepare");
  assert.deepEqual(ui.calls, [["prepare", { includeDiscussion: false }]]);
  include.checked = true; ui.click("insight-prepare");
  assert.deepEqual(ui.calls.at(-1), ["prepare", { includeDiscussion: true }]);
  const body = ui.byId("insight-body"); body.value = "Edited draft"; body.listeners.get("input")();
  assert.deepEqual(ui.calls.at(-1), ["setDraft", "Edited draft"]);
  assert.equal(ui.calls.some(([name]) => name === "share"), false);
  ui.panel.render(state({ draft: "Edited draft" })); ui.click("insight-review");
  assert.deepEqual(ui.calls.at(-1), ["preview"]);
  assert.equal(ui.calls.some(([name]) => name === "share"), false);
  ui.panel.render(state({ draft: "Edited draft", status: "preview", preview: {
    body: "Edited draft", topicTitle: "Topic A", operatorName: "Alex", sourceTitle: "Source A" } }));
  ui.click("insight-share");
  assert.deepEqual(ui.calls.at(-1), ["share"]);
  ui.click("insight-discard");
  assert.deepEqual(ui.calls.at(-1), ["discard"]);
});

test("unavailable and busy states disable actions; empty draft and missing preview cannot share", () => {
  const ui = harness();
  const prepare = ui.byId("insight-prepare"), include = ui.byId("insight-include-discussion");
  const body = ui.byId("insight-body"), review = ui.byId("insight-review");
  const share = ui.byId("insight-share"), discard = ui.byId("insight-discard");
  assert.equal(prepare.disabled, true);
  assert.equal(share.disabled, true);
  assert.equal(ui.byId("insight-status").attributes.role, "status");
  assert.equal(ui.byId("insight-status").attributes["aria-live"], "polite");
  ui.panel.render(state({ available: false, context: null, status: "idle" }));
  assert.equal(ui.byId("insight-status").textContent, INSIGHT_EN.unavailable);
  assert.equal(prepare.disabled, true); assert.equal(include.disabled, true);
  assert.equal(body.disabled, true); assert.equal(review.disabled, true); assert.equal(share.disabled, true);
  ui.panel.render(state({ draft: "   " }));
  assert.equal(prepare.disabled, false); assert.equal(review.disabled, true); assert.equal(share.disabled, true);
  ui.panel.render(state({ busy: true, status: "sharing", draft: "Text", preview: {
    body: "Text", topicTitle: "A", operatorName: "Alex", sourceTitle: null } }));
  for (const item of [prepare, include, body, review, share, discard]) assert.equal(item.disabled, true);
  assert.equal(ui.byId("insight-status").textContent, INSIGHT_EN.sharing);
});

test("context changes clear old nodes and preview, while typing preserves focus and editor identity", () => {
  const ui = harness();
  const prepared = state({ draft: "Unsent secret", preview: { body: "Unsent secret", topicTitle: "Old topic",
    operatorName: "Alex", sourceTitle: "Old source" }, status: "preview" });
  ui.panel.render(prepared);
  const body = ui.byId("insight-body"), contextNode = ui.byId("insight-context");
  const sourceNodes = [...contextNode.children];
  body.focus(); ui.panel.render({ ...prepared, draft: "Unsent secret plus edit", preview: null, status: "prepared" });
  assert.equal(ui.byId("insight-body"), body);
  assert.equal(body.focused, true);
  sourceNodes.forEach((item, index) => assert.equal(contextNode.children[index], item));
  assert.equal(ui.byId("insight-preview").hidden, true);
  assert.equal(ui.byId("insight-preview-body").textContent, "");
  ui.panel.render(state({ context: null, draft: "", preview: null, status: "changed", available: false }));
  assert.equal(contextNode.hidden, true); assert.equal(contextNode.children.length, 0);
  assert.equal(ui.byId("insight-composer").hidden, true);
  assert.equal(body.value, "");
  assert.equal(ui.byId("insight-status").textContent, INSIGHT_EN.changed);
});

test("message fallback and repeated disposal clear sensitive content and detach handlers", () => {
  const ui = harness({ title: "<b>Translated title</b>" });
  assert.equal(ui.created.some((item) => item.textContent === "<b>Translated title</b>"), true);
  assert.equal(ui.created.some((item) => item.textContent === INSIGHT_EN.scope), false);
  ui.panel.render(state({ draft: "Sensitive draft", preview: { body: "Sensitive draft", topicTitle: "A",
    operatorName: "Alex", sourceTitle: "S" } }));
  assert.equal(ui.created.some((item) => item.textContent === INSIGHT_EN.scope), true);
  const callsBefore = ui.calls.length;
  ui.panel.dispose(); ui.panel.dispose();
  assert.equal(ui.byId("insight-body").value, "");
  assert.equal(ui.byId("insight-context").children.length, 0);
  for (const id of ["insight-preview-body", "insight-preview-topic", "insight-preview-provenance", "insight-preview-origin"])
    assert.equal(ui.byId(id).textContent, "");
  assert.equal(ui.created.some((item) => item.listeners.size > 0), false);
  ui.panel.render(state({ draft: "Should remain absent" }));
  assert.equal(ui.byId("insight-body").value, "");
  assert.equal(ui.calls.length, callsBefore);
});

test("AI controls use separate callbacks and citations become safe deliberate links", () => {
  const ui = harness();
  ui.panel.render(state({ ai: { connected: true, planEnabled: true, pending: false, account: { label: "Owner <b>" },
    models: [{ slug: "model-a", displayName: "Model A" }], model: "model-a", articleText: "Public text",
    article: { url: "https://example.com/", documentId: "doc-a" }, costConsent: true, status: "generated",
    result: { body: "Source finding", citations: [{ url: "https://example.org/article", title: "Source <script>",
      startIndex: 0, endIndex: 6 }] } } }));
  assert.equal(ui.byId("insight-ai-account").textContent.includes("Owner <b>"), true);
  assert.equal(ui.byId("insight-article-text").value, "Public text");
  const links = ui.descendants(ui.byId("insight-citations")).filter((item) => item.tag === "a");
  assert.equal(links.length, 2); assert.equal(links[0].linkHref, "https://example.org/article");
  assert.equal(links[0].rel, "noopener noreferrer");
  assert.equal(ui.byId("insight-createInsights").disabled, false);
});

test("compact workspace keeps account and context secondary while exposing redaction before Create", () => {
  const ui = harness();
  assert.equal(ui.byId("insight-workspace").tag, "details");
  assert.equal(ui.byId("insight-account-details").tag, "details");
  assert.equal(ui.byId("insight-source-details").tag, "details");
  assert.equal(ui.byId("insight-draft-details").tag, "details");
  assert.equal(ui.created.some((item) => item.textContent === INSIGHT_EN.disconnected), false);
  ui.panel.render(state({ ai: { connected: true, planEnabled: true, pending: false, models: [{ slug: "model-a", displayName: "Model A" }],
    model: "model-a", articleText: "Review me", article: { url: "https://example.com/", documentId: "doc-a" },
    costConsent: false, status: "articleReady", result: null } }));
  assert.equal(ui.byId("insight-article-text").hidden, false);
  assert.equal(ui.byId("insight-cost-consent").hidden, false);
  assert.equal(ui.byId("insight-createInsights").disabled, true);
  const warning = ui.created.find((item) => item.textContent === INSIGHT_EN.articleWarning);
  assert.ok(warning); assert.equal(warning.hidden, false);
  ui.panel.render(state({ ai: { connected: true, planEnabled: true, pending: false, models: [], model: "", articleText: "Review me",
    article: { url: "https://example.com/", documentId: "doc-a" }, costConsent: true, status: "generating", result: null } }));
  assert.equal(ui.byId("insight-checkConnection").disabled, true);
  assert.equal(ui.byId("insight-loadModels").disabled, true);
  assert.equal(ui.byId("insight-readPageText").disabled, true);
  assert.equal(ui.byId("insight-cancelInsights").disabled, false);
});

test("first-use connection and plan usage stay clear beside the explicit research controls", () => {
  const ui = harness();
  const summary = ui.byId("insight-account-details").children[0];
  const usage = ui.byId("insight-plan-usage");
  const link = ui.byId("insight-manage-usage");
  assert.equal(ui.byId("insight-connect").textContent, "Continue with ChatGPT");
  assert.equal(summary.textContent, INSIGHT_EN.accountDisconnected);
  assert.equal(usage.hidden, true);
  ui.panel.render(state({ ai: { connected: false, planEnabled: false, pending: true, status: "connecting" } }));
  assert.equal(summary.textContent, INSIGHT_EN.accountConnecting);
  ui.panel.render(state({ ai: { connected: true, planEnabled: true, pending: false, models: [], model: "", status: "connected" } }));
  assert.equal(summary.textContent, INSIGHT_EN.accountChooseModel);
  assert.equal(usage.hidden, false);
  assert.equal(link.linkHref, "https://chatgpt.com/settings/usage");
  assert.equal(link.rel, "noopener noreferrer");
  assert.equal(ui.byId("insight-createInsights").disabled, true);
  ui.panel.render(state({ ai: { connected: true, planEnabled: false, pending: false, models: [], model: "", status: "planUnavailable" } }));
  assert.equal(summary.textContent, INSIGHT_EN.accountPlanUnavailable);
  assert.equal(usage.hidden, true);
  assert.equal(ui.byId("insight-connect").disabled, false);
  assert.equal(ui.byId("insight-loadModels").disabled, true);
  assert.equal(ui.byId("insight-model").disabled, true);
  assert.equal(ui.byId("insight-createInsights").disabled, true);
  assert.equal(ui.byId("insight-ai-status").textContent, INSIGHT_EN.aiPlanUnavailable);
  ui.panel.render(state({ ai: { connected: true, planEnabled: true, pending: false, models: [{ slug: "model-a", displayName: "A" }],
    model: "model-a", article: { url: "https://example.com/" }, articleText: "Reviewed", costConsent: false,
    status: "articleReady" } }));
  assert.equal(summary.textContent, INSIGHT_EN.accountModelSelected);
  assert.equal(ui.byId("insight-article-text").hidden, false);
  assert.equal(ui.byId("insight-cost-consent").hidden, false);
  assert.equal(ui.byId("insight-createInsights").disabled, true);
});
