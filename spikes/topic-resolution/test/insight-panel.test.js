import assert from "node:assert/strict";
import test from "node:test";
import { mountInsightPanel } from "../browser/chromium/insight-panel.js";
import { INSIGHT_EN } from "../browser/locales/insight-en.js";
import { formatInsightCitations } from "../browser/core/insight-citations.js";

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
function harness(messages, uiMode) {
  const created = [];
  const document = { body: { dataset: { uiMode } }, createElement(tag) {
    const item = { tag, children: [], attributes: {}, textContent: "", value: "", listeners: new Map(),
      append(...items) { for (const child of items) { if (child.parentElement) child.parentElement.children = child.parentElement.children.filter((item) => item !== child); this.children.push(child); child.parentElement = this; } },
      replaceChildren(...items) { this.children = []; this.append(...items); },
      insertBefore(item, sibling) { if (item.parentElement) item.parentElement.children = item.parentElement.children.filter((child) => child !== item); const index = this.children.indexOf(sibling); assert.notEqual(index, -1); this.children.splice(index, 0, item); item.parentElement = this; },
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
    setRelatedSourceIncluded: (id, included) => { calls.push(["setRelatedSourceIncluded", id, included]); return true; },
    createInsights: (options) => { calls.push(["createInsights", options]); return Promise.resolve(true); },
    loadDiagnostics: () => { calls.push(["loadDiagnostics"]); },
    share: () => { calls.push(["share"]); return Promise.resolve(true); } };
  panel.bind(controller);
  const byId = (id) => created.find((item) => item.id === id);
  const descendants = (node) => [node, ...node.children.flatMap(descendants)];
  const click = (id) => byId(id).listeners.get("click")();
  return { created, document, root, panel, calls, byId, descendants, click };
}

test("hostile context, URLs, and generated text stay inert with no link or clipboard action", () => {
  const ui = harness();
  const body = "<svg onload=alert(1)>\nUser selected this exact text";
  ui.panel.render(state({ draft: body, ai: { result: { body, citations: [] }, status: "generated" } }));
  const nodes = ui.descendants(ui.root);
  assert.equal(nodes.some((item) => ["script", "img", "iframe", "svg"].includes(item.tag)), false);
  assert.deepEqual(nodes.filter((item) => item.tag === "a").map((item) => item.linkHref),
    ["https://chatgpt.com/settings/usage"]);
  assert.equal(nodes.some((item) => item.textContent === "javascript:alert(1)"), true);
  assert.equal(nodes.some((item) => item.textContent === body), true);
  assert.equal(ui.byId("insight-citations").textContent, body);
  assert.equal(ui.byId("insight-share").disabled, false);
  assert.deepEqual(ui.calls, []);
});

test("discussion inclusion is opt-in and a generated insight has Share and Discard actions", () => {
  const ui = harness();
  const include = ui.byId("insight-include-discussion");
  assert.equal(include.checked, false);
  assert.equal(ui.created.some((item) => item.tag === "label" && item.htmlFor === include.id), true);
  assert.equal(ui.byId("insight-review"), undefined);
  assert.equal(ui.byId("insight-body"), undefined);
  assert.equal(ui.byId("insight-preview"), undefined);
  ui.panel.render(state());
  ui.click("insight-prepare");
  assert.deepEqual(ui.calls, [["prepare", { includeDiscussion: false }]]);
  include.checked = true; ui.click("insight-prepare");
  assert.deepEqual(ui.calls.at(-1), ["prepare", { includeDiscussion: true }]);
  ui.panel.render(state({ draft: "Generated insight", ai: { result: { body: "Generated insight", citations: [] }, status: "generated" } }));
  assert.equal(ui.byId("insight-share").disabled, false);
  ui.click("insight-share");
  assert.deepEqual(ui.calls.at(-1), ["share"]);
  ui.click("insight-discard");
  assert.deepEqual(ui.calls.at(-1), ["discard"]);
});

test("one generic share label applies to both opener and follow-up results", () => {
  const ui = harness();
  const result = { body: "A short answer", citations: [] };
  ui.panel.render(state({ draft: result.body, ai: { result, status: "generated" }, preview: { replyToId: "own-question" } }));
  assert.equal(ui.byId("insight-share-scope").textContent, INSIGHT_EN.shareScope);
  assert.equal(ui.byId("insight-share").textContent, INSIGHT_EN.share);
});
test("User follow-up shows progress inline and keeps the generated reply available", () => {
  const ui = harness(undefined, "user");
  const followup = { discussionId: "discussion-a", rootId: "root-a", replyToId: "question-a" };
  const progress = ui.byId("insight-followup-progress");
  for (const [status, label] of [["preparingArticle", INSIGHT_EN.creatingInsights],
    ["fetchingRelated", INSIGHT_EN.aiFetchingRelated], ["generating", INSIGHT_EN.creatingInsights],
    ["resuming", INSIGHT_EN.resumingInsights]]) {
    ui.panel.render(state({ followup, ai: { status, result: null } }));
    assert.equal(progress.hidden, false);
    assert.equal(progress.textContent, label);
    assert.equal(ui.byId("insight-workspace").open, true);
  }
  const result = { body: "Follow-up answer", citations: [] };
  ui.panel.render(state({ followup, draft: result.body, ai: { status: "generated", result } }));
  assert.equal(progress.hidden, true);
  assert.equal(progress.textContent, "");
  assert.equal(ui.byId("insight-composer").hidden, false);
  assert.equal(ui.byId("insight-citations").textContent, result.body);
  ui.panel.render(state({ followup, busy: true, status: "sharing", draft: result.body,
    ai: { status: "generated", result } }));
  assert.equal(progress.hidden, false);
  assert.equal(progress.textContent, INSIGHT_EN.sharing);
  assert.equal(ui.byId("insight-composer").hidden, true);
  ui.panel.render(state({ followup, status: "failed", draft: result.body,
    ai: { status: "generated", result } }));
  assert.equal(progress.hidden, true);
  assert.equal(ui.byId("insight-composer").hidden, false);
  ui.panel.render(state({ ai: { status: "idle", result: null } }));
  assert.equal(progress.hidden, true);
});
test("User root write shows posting progress until a private result needs review", () => {
  const ui = harness(undefined, "user");
  const result = { body: "Opening insight", citations: [] };
  ui.panel.render(state({ status: "sharing", busy: true, draft: result.body,
    ai: { status: "generated", result } }));
  assert.equal(ui.byId("insight-followup-progress").hidden, false);
  assert.equal(ui.byId("insight-followup-progress").textContent, INSIGHT_EN.sharing);
  assert.equal(ui.byId("insight-workspace").open, true);
  assert.equal(ui.byId("insight-composer").hidden, true);
  ui.panel.render(state({ status: "failed", draft: result.body,
    ai: { status: "generated", result } }));
  assert.equal(ui.byId("insight-followup-progress").hidden, true);
  assert.equal(ui.byId("insight-composer").hidden, false);
});

test("User insight preview contains only the generated message, citation links, and separate actions", () => {
  const ui = harness(undefined, "user");
  const marker = "\uE200cite\uE202turn0search0\uE201";
  const result = { body: `A concise finding ${marker}`, citations: [{
    url: "https://example.org/article", title: "Source", startIndex: 18, endIndex: 18 + marker.length }] };
  ui.panel.render(state({ draft: formatInsightCitations(result.body, result.citations),
    relatedExcerptCount: 2, ai: { status: "generated", result } }));
  const card = ui.byId("insight-composer");
  assert.equal(ui.byId("insight-workspace").attributes["data-has-result"], "true");
  assert.deepEqual(card.children.filter((item) => !item.hidden).map((item) => item.id),
    ["insight-private-label", "insight-citations", "insight-share", "insight-discard"]);
  assert.equal(ui.byId("insight-private-label").textContent, "Only you");
  assert.equal(ui.byId("insight-related-excerpt-indicator").hidden, true);
  assert.equal(ui.byId("insight-current-page-only").hidden, true);
  assert.equal(ui.byId("insight-related-excerpt-summary").textContent, "Linked pages read: 2");
  assert.equal(ui.descendants(ui.byId("insight-citations")).filter((item) => item.tag === "a").length, 1);
  assert.equal(ui.byId("insight-draft-details").children[0].hidden, true);
  assert.equal(ui.byId("insight-share").disabled, false);
  assert.equal(ui.byId("insight-discard").disabled, false);
});

test("generated insight without outside citations shows a separate current-page note only for the exact draft", () => {
  const ui = harness(undefined, "user");
  const note = ui.byId("insight-current-page-only");
  const result = { body: "A concise finding", citations: [] };
  ui.panel.render(state({ draft: result.body, ai: { status: "generated", result } }));
  assert.equal(note.hidden, false);
  assert.equal(note.textContent, INSIGHT_EN.currentPageOnly);
  assert.equal(note.attributes.role, undefined);
  assert.equal(ui.byId("insight-citations").textContent, result.body);
  assert.equal(ui.byId("insight-share").disabled, false);
  ui.panel.render(state({ draft: "Pasted manual text", ai: { status: "generated", result: null } }));
  assert.equal(note.hidden, true);
  ui.panel.render(state({ draft: "Edited finding", ai: { status: "generated", result } }));
  assert.equal(note.hidden, true);
  ui.panel.render(state({ draft: result.body, ai: { status: "generated", result } }));
  assert.equal(note.hidden, false);
  ui.panel.render(state({ context: null, draft: result.body, ai: { status: "generated", result } }));
  assert.equal(note.hidden, true);
});

test("off-catalog provider citation hides the no-outside-sources cue", () => {
  const ui = harness(undefined, "user");
  const marker = "\uE200cite\uE202turn0search0\uE201";
  const body = `Lowest found offer ${marker}`;
  const startIndex = body.indexOf(marker);
  const result = { body, citations: [{ url: "https://prices.example.net/item",
    title: "Public offer", startIndex, endIndex: startIndex + marker.length }] };
  ui.panel.render(state({ draft: formatInsightCitations(body, result.citations),
    ai: { status: "generated", result } }));
  assert.equal(ui.byId("insight-current-page-only").hidden, true);
  assert.deepEqual(ui.descendants(ui.byId("insight-citations"))
    .filter((item) => item.tag === "a").map((item) => item.linkHref),
  ["https://prices.example.net/item"]);
  assert.deepEqual(ui.calls, []);
});

test("poll renders preserve a generated preview, citation focus, and one-click Share", () => {
  const ui = harness(undefined, "user");
  const marker = "\uE200cite\uE202turn0search0\uE201";
  const result = { body: `Finding ${marker}`, citations: [{
    url: "https://example.org/article", title: "Source", startIndex: 8, endIndex: 8 + marker.length }] };
  const draft = formatInsightCitations(result.body, result.citations);
  const initial = state({ draft, ai: { status: "generated", result } });
  ui.panel.render(initial);
  const citations = ui.byId("insight-citations");
  const children = [...citations.children];
  const link = ui.descendants(citations).find((item) => item.tag === "a");
  const workspace = ui.byId("insight-workspace");
  const draftDetails = ui.byId("insight-draft-details");
  const share = ui.byId("insight-share");
  link.focus();
  for (const aiStatus of ["generated", "idle", "generated", "idle"]) {
    ui.panel.render(state({ draft, ai: { status: aiStatus, result: { ...result } } }));
    assert.equal(citations.children.length, children.length);
    children.forEach((child, index) => assert.equal(citations.children[index], child,
      "unchanged citation nodes retain selection and focus"));
    assert.equal(link.focused, true);
    assert.equal(workspace.children.indexOf(draftDetails) + 1,
      workspace.children.indexOf(ui.byId("insight-quick-actions")), "preview does not move on status polls");
    assert.equal(share.disabled, false);
  }
  ui.click("insight-share");
  assert.deepEqual(ui.calls.filter(([name]) => name === "share"), [["share"]]);
});

test("only a newly generated private result in the same open popup gets entrance motion", () => {
  const ui = harness(undefined, "user");
  const generated = state({ draft: "A concise finding", ai: { status: "generated",
    result: { body: "A concise finding", citations: [] } } });
  ui.panel.render(generated);
  assert.notEqual(ui.byId("insight-composer").className, "is-new", "a recovered result is not replayed");
  ui.panel.render(state({ ai: { status: "generating", result: null } }));
  ui.panel.render(generated);
  assert.equal(ui.byId("insight-composer").className, "is-new");
  ui.panel.render(generated);
  assert.equal(ui.byId("insight-composer").className, "is-new", "ordinary rerender does not restart motion");
  ui.panel.render(state({ ai: { status: "idle", result: null } }));
  assert.equal(ui.byId("insight-composer").className, "");
});

test("resumed research has concise visible progress and cannot create another request", () => {
  const ui = harness(undefined, "user");
  ui.panel.render(state({ ai: { connected: true, planEnabled: true, pending: false,
    models: [{ slug: "model-a", displayName: "A" }], model: "model-a",
    article: null, articleText: "", status: "resuming", result: null } }));
  assert.equal(ui.byId("insight-createInsights").textContent, INSIGHT_EN.resumingInsights);
  assert.equal(ui.byId("insight-createInsights").disabled, true);
  assert.equal(ui.byId("insight-quick-actions").attributes["data-phase"], "generating");
  assert.equal(ui.byId("insight-quick-actions").attributes["aria-busy"], "true");
  assert.equal(ui.byId("insight-ai-status").textContent, INSIGHT_EN.aiResuming);
});

test("unavailable, busy, manual, and altered results cannot share", () => {
  const ui = harness();
  const prepare = ui.byId("insight-prepare"), include = ui.byId("insight-include-discussion");
  const share = ui.byId("insight-share"), discard = ui.byId("insight-discard");
  assert.equal(prepare.disabled, true);
  assert.equal(share.disabled, true);
  assert.equal(ui.byId("insight-status").attributes.role, "status");
  assert.equal(ui.byId("insight-status").attributes["aria-live"], "polite");
  ui.panel.render(state({ available: false, context: null, status: "idle" }));
  assert.equal(ui.byId("insight-status").textContent, INSIGHT_EN.unavailable);
  assert.equal(prepare.disabled, true); assert.equal(include.disabled, true);
  assert.equal(share.disabled, true);
  ui.panel.render(state({ draft: "   " }));
  assert.equal(prepare.disabled, false); assert.equal(share.disabled, true);
  ui.panel.render(state({ draft: "Pasted robot text", ai: { status: "generated", result: null } }));
  assert.equal(share.disabled, true);
  ui.panel.render(state({ draft: "Altered", ai: { status: "generated", result: { body: "Original", citations: [] } } }));
  assert.equal(share.disabled, true);
  ui.panel.render(state({ busy: true, status: "sharing", draft: "Text",
    ai: { status: "generated", result: { body: "Text", citations: [] } } }));
  for (const item of [prepare, include, share, discard]) assert.equal(item.disabled, true);
  assert.equal(ui.byId("insight-status").textContent, INSIGHT_EN.sharing);
});

test("context changes clear the single formatted insight", () => {
  const ui = harness();
  const prepared = state({ draft: "Unsent secret", ai: { status: "generated",
    result: { body: "Unsent secret", citations: [] } } });
  ui.panel.render(prepared);
  const formatted = ui.byId("insight-citations"), contextNode = ui.byId("insight-context");
  const sourceNodes = [...contextNode.children];
  ui.panel.render({ ...prepared, draft: "Unsent secret plus edit", status: "prepared" });
  assert.equal(ui.byId("insight-citations"), formatted);
  sourceNodes.forEach((item, index) => assert.equal(contextNode.children[index], item));
  assert.equal(formatted.textContent, "");
  assert.equal(ui.byId("insight-draft-details").hidden, true);
  ui.panel.render(state({ context: null, draft: "", preview: null, status: "changed", available: false }));
  assert.equal(contextNode.hidden, true); assert.equal(contextNode.children.length, 0);
  assert.equal(ui.byId("insight-composer").hidden, true);
  assert.equal(formatted.textContent, "");
  assert.equal(ui.byId("insight-status").textContent, INSIGHT_EN.changed);
});

test("message fallback and repeated disposal clear sensitive content and detach handlers", () => {
  const ui = harness({ title: "<b>Translated title</b>" });
  assert.equal(ui.created.some((item) => item.textContent === "<b>Translated title</b>"), true);
  assert.equal(ui.created.some((item) => item.textContent === INSIGHT_EN.scope), false);
  ui.panel.render(state({ draft: "Sensitive draft", ai: { result: { body: "Sensitive draft", citations: [] }, status: "generated" } }));
  assert.equal(ui.created.some((item) => item.textContent === INSIGHT_EN.scope), true);
  const callsBefore = ui.calls.length;
  ui.panel.dispose(); ui.panel.dispose();
  assert.equal(ui.byId("insight-context").children.length, 0);
  for (const id of ["insight-citations", "insight-preview-topic", "insight-preview-origin"])
    assert.equal(ui.byId(id).textContent, "");
  assert.equal(ui.created.some((item) => item.listeners.size > 0), false);
  ui.panel.render(state({ draft: "Should remain absent" }));
  assert.equal(ui.byId("insight-citations").textContent, "");
  assert.equal(ui.calls.length, callsBefore);
});

test("AI controls use separate callbacks and one formatted insight has one safe citation link", () => {
  const ui = harness();
  const marker = "citeturn0search0";
  const result = { body: `Finding ${marker}`, citations: [{ url: "https://example.org/article",
    title: "Source <script>", startIndex: 8, endIndex: 8 + marker.length }] };
  const draft = formatInsightCitations(result.body, result.citations);
  ui.panel.render(state({ draft, ai: { connected: true, planEnabled: true, pending: false, account: { label: "Owner <b>" },
    models: [{ slug: "model-a", displayName: "Model A" }], model: "model-a", articleText: "Public text",
    article: { url: "https://example.com/", documentId: "doc-a" }, costConsent: true, status: "generated",
    result } }));
  assert.equal(ui.byId("insight-ai-account").textContent.includes("Owner <b>"), true);
  assert.equal(ui.byId("insight-article-text").value, "Public text");
  const links = ui.descendants(ui.byId("insight-citations")).filter((item) => item.tag === "a");
  assert.equal(links.length, 1); assert.equal(links[0].linkHref, "https://example.org/article");
  assert.equal(links[0].rel, "noopener noreferrer");
  assert.equal(ui.byId("insight-createInsights").disabled, true);
  assert.equal(ui.descendants(ui.root).filter((item) => item.tag === "a" &&
    item.linkHref === "https://example.org/article").length, 1);
  assert.equal(ui.byId("insight-share").disabled, false);
});

test("compact workspace keeps account and context secondary while exposing redaction before Create", () => {
  const ui = harness();
  assert.equal(ui.byId("insight-workspace").tag, "details");
  assert.equal(ui.byId("insight-account-details").tag, "details");
  assert.equal(ui.byId("insight-source-details").tag, "details");
  assert.equal(ui.byId("insight-draft-details").tag, "details");
  const quickActions = ui.byId("insight-quick-actions");
  assert.equal(ui.byId("insight-workspace").children.includes(quickActions), true);
  assert.deepEqual(quickActions.children.map((item) => item.id),
    [undefined, "insight-model", "insight-model-status", "insight-createInsights", "insight-quick-status", "insight-plan-usage"]);
  assert.equal(ui.byId("insight-account-details").children.includes(ui.byId("insight-model")), false);
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

test("model listing keeps answer workspace hidden until a generated answer arrives", () => {
  const ui = harness();
  const next = ui.byId("insight-next-step");
  const hint = ui.byId("insight-draft-hint");
  const summary = ui.byId("insight-draft-details").children[0];
  const baseAi = { connected: true, planEnabled: true, pending: false,
    models: [{ slug: "model-a", displayName: "A" }], model: "", articleText: "", article: null,
    costConsent: false, status: "chooseModel", result: null };
  ui.panel.render(state({ ai: baseAi }));
  assert.equal(next.textContent, INSIGHT_EN.nextChooseModel);
  assert.equal(ui.byId("insight-draft-details").hidden, true);
  assert.equal(summary.textContent, INSIGHT_EN.draftWorkspace);
  assert.equal(hint.textContent, INSIGHT_EN.draftManualHint);
  assert.equal(ui.byId("insight-share").disabled, true);
  ui.panel.render(state({ draft: "Own draft", ai: baseAi }));
  assert.equal(summary.textContent, INSIGHT_EN.draftWorkspace);
  assert.equal(ui.byId("insight-share").disabled, true);
  ui.panel.render(state({ ai: { ...baseAi, model: "model-a" } }));
  assert.equal(next.textContent, INSIGHT_EN.nextReadPage);
  ui.panel.render(state({ ai: { ...baseAi, model: "model-a", article: { url: "https://example.com/" },
    articleText: "Public text", status: "articleReady" } }));
  assert.equal(next.textContent, INSIGHT_EN.nextReviewConsent);
  ui.panel.render(state({ ai: { ...baseAi, model: "model-a", article: { url: "https://example.com/" },
    articleText: "Public text", costConsent: true, status: "articleReady" } }));
  assert.equal(next.textContent, INSIGHT_EN.nextCreateInsights);
  assert.equal(ui.byId("insight-createInsights").disabled, false);
});

test("research progress, failure, and completed insight have distinct guidance", () => {
  const ui = harness();
  const hint = ui.byId("insight-draft-hint");
  const next = ui.byId("insight-next-step");
  const formatted = ui.byId("insight-citations");
  const summary = ui.byId("insight-draft-details").children[0];
  const ai = { connected: true, planEnabled: true, pending: false,
    models: [{ slug: "model-a", displayName: "A" }], model: "model-a", articleText: "Public text",
    article: { url: "https://example.com/" }, costConsent: true, result: null };
  ui.panel.render(state({ ai: { ...ai, status: "generating" } }));
  assert.equal(hint.textContent, INSIGHT_EN.draftGenerating);
  assert.equal(next.textContent, INSIGHT_EN.nextGenerating);
  assert.equal(formatted.textContent, "");
  assert.equal(ui.byId("insight-quick-status").hidden, true);
  ui.panel.render(state({ ai: { ...ai, status: "generationFailed" } }));
  assert.equal(hint.textContent, INSIGHT_EN.draftResearchFailed);
  assert.equal(next.textContent, INSIGHT_EN.nextResearchFailed);
  assert.equal(ui.byId("insight-ai-status").textContent, INSIGHT_EN.aiGenerationFailed);
  assert.equal(ui.byId("insight-quick-status").textContent, INSIGHT_EN.aiGenerationFailed);
  assert.equal(ui.byId("insight-quick-status").hidden, false);
  assert.equal(summary.textContent, INSIGHT_EN.draftWorkspace);
  ui.panel.render(state({ draft: "Generated finding", ai: { ...ai, status: "generated",
    result: { body: "Generated finding", citations: [] } } }));
  assert.equal(summary.textContent, INSIGHT_EN.draftWorkspaceGenerated);
  assert.equal(ui.byId("insight-draft-details").hidden, false);
  assert.equal(hint.textContent, INSIGHT_EN.hint);
  assert.equal(next.textContent, INSIGHT_EN.nextReviewDraft);
  assert.equal(formatted.textContent, "Generated finding");
  assert.equal(ui.byId("insight-share").disabled, false);
  assert.equal(ui.byId("insight-quick-status").hidden, true);
});

test("User usage-limit summary comes from locale with English fallback", () => {
  const ai = { connected: true, planEnabled: true, pending: false, models: [], model: "",
    articleText: "", article: null, costConsent: false, result: null, status: "usageLimit" };
  const localized = harness({ usageLimitBrief: "Localized usage limit" }, "user");
  localized.panel.render(state({ ai }));
  assert.equal(localized.byId("insight-quick-status").textContent, "Localized usage limit");
  assert.equal(localized.byId("insight-plan-usage").hidden, false);
  const fallback = harness({}, "user");
  fallback.panel.render(state({ ai }));
  assert.equal(fallback.byId("insight-quick-status").textContent, INSIGHT_EN.usageLimitBrief);
});

test("User Mode shows a refreshed-model retry cue without a false failure", () => {
  const ui = harness(undefined, "user");
  ui.panel.render(state({ ai: { connected: true, planEnabled: true, pending: false,
    models: [{ slug: "model-a", displayName: "A" }], model: "model-a",
    articleText: "", article: null, costConsent: false, result: null,
    status: "modelRefreshed" } }));
  const quick = ui.byId("insight-quick-status");
  assert.equal(quick.hidden, false);
  assert.equal(quick.textContent, INSIGHT_EN.aiModelRefreshed);
  assert.equal(quick.attributes["data-state"], "ready");
  assert.equal(ui.byId("insight-createInsights").disabled, false);
});

test("User Mode keeps model refresh progress and failure visible after recovery", () => {
  const ui = harness(undefined, "user");
  const ai = { connected: true, planEnabled: true, pending: false,
    models: [], model: "", articleText: "", article: null, costConsent: false,
    result: null };
  for (const [status, message, phase] of [
    ["loadingModels", INSIGHT_EN.aiLoadingModels, "preparing"],
    ["modelListProviderUnavailable", INSIGHT_EN.aiModelListProviderUnavailable, "failed"],
    ["noModels", INSIGHT_EN.aiNoModels, "failed"],
  ]) {
    ui.panel.render(state({ ai: { ...ai, status } }));
    const quick = ui.byId("insight-quick-status");
    assert.equal(quick.hidden, false);
    assert.equal(quick.textContent, message);
    assert.equal(quick.attributes["data-state"], phase);
    assert.equal(ui.byId("insight-quick-actions").hidden, false);
    assert.equal(ui.byId("insight-model-status").hidden, true);
    assert.equal(ui.byId("insight-createInsights").disabled, true);
  }
});

test("User Create click uses current page automatically and related-source settings stay local", () => {
  const ui = harness(undefined, "user");
  const ai = { connected: true, planEnabled: true, pending: false,
    models: [{ slug: "model-a", displayName: "A" }], model: "model-a", articleText: "", article: null,
    costConsent: false, status: "connected", result: null };
  ui.panel.render(state({ ai }));
  assert.equal(ui.byId("insight-createInsights").disabled, false);
  const settings = ui.byId("insight-related-settings");
  const choices = ui.byId("insight-related-choices");
  assert.equal(settings.hidden, false);
  assert.equal(ui.byId("insight-allow-web-research"), undefined);
  assert.equal(ui.byId("insight-related-page-text").checked, true);
  assert.equal(ui.created.some((item) => item.textContent === INSIGHT_EN.aiScope &&
    item.textContent.includes("ChatGPT web search is off")), true);
  assert.equal(choices.children.length, 2);
  const sameTopicCheckbox = choices.children[0].children[0];
  assert.equal(sameTopicCheckbox.value, "source-b");
  assert.equal(sameTopicCheckbox.checked, true);
  sameTopicCheckbox.checked = false;
  choices.listeners.get("change")({ target: sameTopicCheckbox });
  assert.deepEqual(ui.calls.at(-1), ["setRelatedSourceIncluded", "source-b", false]);
  const checkbox = choices.children[1].children[0];
  assert.equal(checkbox.value, "source-c");
  assert.equal(checkbox.checked, true);
  checkbox.checked = false;
  choices.listeners.get("change")({ target: checkbox });
  assert.deepEqual(ui.calls.at(-1), ["setRelatedSourceIncluded", "source-c", false]);
  ui.panel.render(state({ ai, excludedRelatedSourceIds: ["source-c"] }));
  assert.equal(checkbox.checked, false);
  assert.equal(sameTopicCheckbox.checked, true);
  ui.click("insight-createInsights");
  assert.deepEqual(ui.calls.at(-1), ["createInsights", { automatic: true }]);
  assert.equal(ui.calls.some(([name]) => name === "share"), false);
});

test("related-page settings remain available when no related pages are listed", () => {
  const ui = harness(undefined, "user");
  ui.panel.render(state({ context: { ...context(), sameTopicSources: [], relatedSources: [] } }));
  assert.equal(ui.byId("insight-related-settings").hidden, false);
  assert.equal(ui.byId("insight-related-page-text").checked, true);
  assert.equal(ui.byId("insight-related-choices").children.length, 0);
});

test("linked-page choices cannot appear editable during article or related-text preparation", () => {
  const ui = harness(undefined, "user");
  const checkbox = () => ui.byId("insight-related-choices").children[0].children[0];
  for (const status of ["preparingArticle", "fetchingRelated", "generating", "resuming"]) {
    ui.panel.render(state({ ai: { ...state().ai, status } }));
    assert.equal(checkbox().disabled, true, status);
    assert.equal(ui.byId("insight-related-page-text").disabled, false, `${status}: global opt-out remains available`);
  }
  ui.panel.render(state());
  assert.equal(checkbox().disabled, false);
});

test("related source choices render with browser-style children lacking forEach", () => {
  const ui = harness(undefined, "user");
  const choices = ui.byId("insight-related-choices");
  // HTMLCollection is iterable and indexable, but has no Array.forEach method.
  choices.children.forEach = undefined;
  choices.replaceChildren = function (...items) { this.children.length = 0; this.append(...items); };
  ui.panel.render(state());
  const checkbox = choices.children[1].children[0];
  assert.equal(checkbox.checked, true);
  ui.panel.render(state({ excludedRelatedSourceIds: ["source-c"] }));
  assert.equal(checkbox.checked, false);
});

test("research failure exposes only allowlisted fixed detail and clears it on success", () => {
  const ui = harness();
  const ai = { connected: true, planEnabled: true, pending: false, models: [], model: "",
    articleText: "", article: null, status: "generationFailed", researchFailureDetail: "response-http-400" };
  ui.panel.render(state({ ai }));
  assert.equal(ui.byId("insight-quick-status").textContent.includes("Code: response-http-400"), true);
  for (const [detail, key] of [
    ["response-content-json", "aiResearchContentJson"],
    ["response-content-html", "aiResearchContentHtml"],
    ["response-content-text", "aiResearchContentText"],
    ["response-content-missing", "aiResearchContentMissing"],
    ["response-content-other", "aiResearchContentOther"],
    ["response-content-type", "aiResearchContentType"],
  ]) {
    ui.panel.render(state({ ai: { ...ai, researchFailureDetail: detail } }));
    const message = ui.byId("insight-quick-status").textContent;
    assert.equal(message.includes(INSIGHT_EN[key]), true, detail);
    assert.equal(message.includes(`Code: ${detail}`), true, detail);
  }
  ui.panel.render(state({ ai: { ...ai, researchFailureDetail: "private-provider-body" } }));
  assert.equal(ui.byId("insight-quick-status").textContent.includes("private-provider-body"), false);
  for (const detail of ["response-output-empty", "response-search-only", "response-reasoning-only",
    "response-final-item-missing", "response-item-identity", "response-item-conflict",
    "response-item-prefix", "response-item-text", "response-stream-text-unfinalized", "response-excerpt-citation",
    "response-web-citation", "response-web-evidence", "response-unsafe-url"]) {
    ui.panel.render(state({ ai: { ...ai, researchFailureDetail: detail } }));
    assert.equal(ui.byId("insight-quick-status").textContent.includes(`Code: ${detail}`), true, detail);
  }
  ui.panel.render(state({ ai: { ...ai, status: "generated", researchFailureDetail: null } }));
  assert.equal(ui.byId("insight-quick-status").hidden, true);
});

test("first-use connection and plan usage stay clear beside the explicit research controls", () => {
  const ui = harness();
  const summary = ui.byId("insight-account-details").children[0];
  const usage = ui.byId("insight-plan-usage");
  const link = ui.byId("insight-manage-usage");
  assert.equal(ui.byId("insight-connect").textContent, "Continue with ChatGPT");
  assert.equal(summary.textContent, INSIGHT_EN.accountDisconnected);
  assert.equal(ui.byId("insight-account-switch-hint").hidden, true);
  assert.equal(usage.hidden, true);
  ui.panel.render(state({ ai: { connected: false, planEnabled: false, pending: true, status: "connecting" } }));
  assert.equal(summary.textContent, INSIGHT_EN.accountConnecting);
  ui.panel.render(state({ ai: { connected: true, planEnabled: true, pending: false, models: [], model: "", status: "connected" } }));
  assert.equal(summary.textContent, INSIGHT_EN.accountChooseModel);
  assert.equal(ui.byId("insight-account-switch-hint").hidden, false);
  assert.equal(ui.byId("insight-disconnect").textContent, INSIGHT_EN.disconnect);
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
  assert.equal(ui.byId("insight-account-switch-hint").textContent, INSIGHT_EN.accountSwitchHint);
  assert.equal(ui.byId("insight-article-text").hidden, false);
  assert.equal(ui.byId("insight-cost-consent").hidden, false);
  assert.equal(ui.byId("insight-createInsights").disabled, true);
});

test("model-list feedback stays beside the always-visible model selector", () => {
  const ui = harness();
  const details = ui.byId("insight-account-details");
  const quickActions = ui.byId("insight-quick-actions");
  const model = ui.byId("insight-model");
  const feedback = ui.byId("insight-model-status");
  const general = ui.byId("insight-ai-status");
  details.open = false;
  assert.equal(quickActions.children[quickActions.children.indexOf(model) + 1], feedback);
  assert.equal(ui.descendants(details).includes(model), false);
  assert.equal(ui.descendants(details).includes(general), false);
  assert.equal(ui.descendants(ui.byId("insight-workspace")).includes(general), true);
  assert.equal(feedback.attributes.role, "status");
  assert.equal(feedback.attributes["aria-live"], "polite");
  for (const [status, message] of [
    ["loadingModels", INSIGHT_EN.aiLoadingModels],
    ["noModels", INSIGHT_EN.aiNoModels],
    ["modelListUnavailable", INSIGHT_EN.aiModelListUnavailable],
    ["modelListAccessRejected", INSIGHT_EN.aiModelListAccessRejected],
    ["modelListRateLimited", INSIGHT_EN.aiModelListRateLimited],
    ["modelListTimedOut", INSIGHT_EN.aiModelListTimedOut],
    ["modelListInvalidResponse", INSIGHT_EN.aiModelListInvalidResponse],
    ["modelListProviderUnavailable", INSIGHT_EN.aiModelListProviderUnavailable],
    ["modelListBusy", INSIGHT_EN.aiModelListBusy],
  ]) {
    ui.panel.render(state({ ai: { connected: true, planEnabled: true, pending: false,
      models: [], model: "", status, providerDetail: "private provider response" } }));
    assert.equal(model.disabled, true);
    assert.equal(feedback.hidden, false);
    assert.equal(feedback.textContent, message);
    assert.equal(feedback.textContent.includes("private provider response"), false);
  }
  assert.equal(ui.byId("insight-loadModels").disabled, false);
  ui.panel.render(state({ ai: { connected: true, planEnabled: true, pending: false,
    models: [], model: "", status: "unavailable" } }));
  assert.equal(feedback.hidden, true);
  assert.equal(general.textContent, INSIGHT_EN.aiUnavailable);
  ui.panel.render(state({ ai: { connected: true, planEnabled: true, pending: false,
    models: [{ slug: "model-a", displayName: "A" }], model: "model-a", status: "generating" } }));
  assert.equal(details.open, false);
  assert.equal(feedback.hidden, true);
  assert.equal(feedback.textContent, "");
  assert.equal(general.textContent, INSIGHT_EN.aiGenerating);
});

test("diagnostics require an explicit click and render only fixed codes in Developer disclosure", () => {
  const ui = harness();
  const details = ui.byId("insight-diagnostics");
  assert.equal(details.className.includes("developer-only"), true);
  assert.equal(ui.calls.length, 0);
  ui.click("insight-loadDiagnostics");
  assert.deepEqual(ui.calls, [["loadDiagnostics"]]);
  ui.panel.render(state({ ai: { connected: true, planEnabled: true, pending: false,
    models: [], model: "", status: "modelListInvalidResponse", modelFailureDetail: "catalog-entry",
    diagnostics: { status: "ready", localEvents: [
      { kind: "models", outcome: "invalid-response", detail: "catalog-json" },
      { kind: "models", outcome: "local-error" },
      { kind: "models", outcome: "secret-token", detail: "private response" }], events: [
      { kind: "models", outcome: "invalid-response", detail: "catalog-entry" },
      { kind: "models", outcome: "success", detail: "private response" },
      { kind: "insight", outcome: "invalid-response", detail: "response-http-400" },
      { kind: "insight", outcome: "secret-token", detail: "private response" }] } } }));
  assert.equal(ui.byId("insight-model-status").textContent.includes("Code: catalog-entry"), true);
  assert.deepEqual(ui.byId("insight-local-diagnostics-events").children.map((item) => item.textContent),
    ["models · invalid-response · catalog-json", "models · local-error"]);
  assert.deepEqual(ui.byId("insight-diagnostics-events").children.map((item) => item.textContent),
    ["models · invalid-response · catalog-entry", "models · success", "insight · invalid-response · response-http-400"]);
});

test("Developer diagnostics show only fixed related-excerpt totals and clear with local state", () => {
  const ui = harness();
  const output = ui.byId("insight-related-excerpt-diagnostics");
  assert.equal(output.hidden, true);
  const diagnostic = { eligible: 4, attempted: 3, accepted: 1,
    failures: { noHostAccess: 0, fetchHttpRedirect: 1, sizeType: 1, parseShort: 0,
      url: "https://secret.example/page" }, text: "private article" };
  ui.panel.render(state({ ai: { status: "generated", diagnostics: { status: "idle", events: [],
    localEvents: [], relatedExcerpts: diagnostic } } }));
  assert.equal(output.hidden, false);
  assert.equal(output.textContent,
    "Related excerpts · eligible 4 · attempted 3 · accepted 1 · no host access 0 · network/http/redirect 1 · size/type 1 · parse/short 0");
  assert.equal(output.textContent.includes("secret.example"), false);
  assert.equal(output.textContent.includes("private article"), false);
  ui.panel.render(state({ ai: { status: "idle", diagnostics: { status: "idle", events: [],
    localEvents: [], relatedExcerpts: null } } }));
  assert.equal(output.hidden, true);
  assert.equal(output.textContent, "");
  ui.panel.render(state({ ai: { status: "generated", diagnostics: { status: "idle", events: [],
    localEvents: [], relatedExcerpts: { ...diagnostic, attempted: "3" } } } }));
  assert.equal(output.hidden, true);
  assert.equal(output.textContent, "");
});

test("User Mode never renders related-excerpt diagnostic text", () => {
  const ui = harness(undefined, "user");
  ui.panel.render(state({ ai: { status: "generated", diagnostics: { status: "idle", events: [],
    localEvents: [], relatedExcerpts: { eligible: 1, attempted: 1, accepted: 0,
      failures: { noHostAccess: 0, fetchHttpRedirect: 0, sizeType: 0, parseShort: 1 } } } } }));
  assert.equal(ui.byId("insight-diagnostics").className.includes("developer-only"), true);
  assert.equal(ui.byId("insight-related-excerpt-diagnostics").hidden, true);
  assert.equal(ui.byId("insight-related-excerpt-diagnostics").textContent, "");
});

test("User Mode explains incomplete related research without showing raw provider data", () => {
  const ui = harness(undefined, "user");
  ui.panel.render(state({ ai: { connected: true, planEnabled: true, pending: false, models: [], model: "",
    article: null, articleText: "", result: null, status: "generationFailed",
    researchFailureDetail: "response-web-evidence" } }));
  const message = ui.byId("insight-ai-status").textContent;
  assert.match(message, /could not complete research/u);
  assert.match(message, /turn off related research/u);
  assert.equal(message.includes("provider output"), false);
});

test("related-excerpt diagnostic wording comes from the locale template", () => {
  const ui = harness({ ...INSIGHT_EN,
    relatedExcerptDiagnostics: "E {eligible}; T {attempted}; A {accepted}; H {noHostAccess}; N {fetchHttpRedirect}; S {sizeType}; P {parseShort}" });
  ui.panel.render(state({ ai: { status: "generated", diagnostics: { status: "idle", events: [],
    localEvents: [], relatedExcerpts: { eligible: 2, attempted: 2, accepted: 1,
      failures: { noHostAccess: 0, fetchHttpRedirect: 0, sizeType: 1, parseShort: 0 } } } } }));
  assert.equal(ui.byId("insight-related-excerpt-diagnostics").textContent, "E 2; T 2; A 1; H 0; N 0; S 1; P 0");
});

test("connected account identity is Developer-only while User setup remains available", () => {
  const ui = harness();
  ui.panel.render(state({ ai: { connected: true, planEnabled: true, pending: false,
    models: [], model: "", status: "connected", account: { label: "private@example.com" } } }));
  assert.equal(ui.byId("insight-ai-account").className, "developer-only");
  assert.equal(ui.byId("insight-account-details").children.includes(ui.byId("insight-connect")), true);
  assert.equal(ui.byId("insight-quick-actions").children.includes(ui.byId("insight-model")), true);
});

test("connection failure renders only fixed stage guidance and clears it on a new state", () => {
  const ui = harness();
  for (const [stage, key] of [
    ["callback-invalid", "aiFailureCallbackInvalid"],
    ["callback-expired", "aiFailureCallbackExpired"],
    ["callback-busy", "aiFailureCallbackBusy"],
    ["token-exchange-rejected", "aiFailureTokenExchangeRejected"],
    ["token-exchange-failed", "aiFailureTokenExchangeFailed"],
    ["token-response-invalid", "aiFailureTokenResponseInvalid"],
    ["discovery-failed", "aiFailureDiscoveryFailed"],
    ["identity-verification-failed", "aiFailureIdentityVerificationFailed"],
    ["registration-failed", "aiFailureRegistrationFailed"],
  ]) {
    ui.panel.render(state({ ai: { connected: false, planEnabled: false, pending: false,
      status: "connectionFailed", failureStage: stage } }));
    assert.equal(ui.byId("insight-ai-status").textContent, INSIGHT_EN[key]);
    assert.match(INSIGHT_EN[key], new RegExp(stage));
  }
  ui.panel.render(state({ ai: { connected: false, planEnabled: false, pending: false,
    status: "connectionFailed", failureStage: "provider-secret-detail" } }));
  assert.equal(ui.byId("insight-ai-status").textContent, INSIGHT_EN.aiConnectionFailed);
  ui.panel.render(state({ ai: { connected: false, planEnabled: false, pending: true,
    status: "connecting", failureStage: null } }));
  assert.equal(ui.byId("insight-ai-status").textContent, INSIGHT_EN.aiConnecting);
});

test("identity failure displays only fixed reportable substage guidance", () => {
  const ui = harness();
  for (const [substage, key] of [
    ["jwks-request-failed", "aiFailureJwksRequestFailed"],
    ["jwks-invalid", "aiFailureJwksInvalid"],
    ["token-header-invalid", "aiFailureTokenHeaderInvalid"],
    ["matching-key-invalid", "aiFailureMatchingKeyInvalid"],
    ["signature-invalid", "aiFailureSignatureInvalid"],
    ["claims-invalid", "aiFailureClaimsInvalid"],
  ]) {
    ui.panel.render(state({ ai: { connected: false, planEnabled: false, pending: false,
      status: "connectionFailed", failureStage: "identity-verification-failed", failureSubstage: substage } }));
    assert.equal(ui.byId("insight-ai-status").textContent, INSIGHT_EN[key]);
    assert.match(INSIGHT_EN[key], new RegExp(substage));
  }
  for (const [failureStage, failureSubstage] of [
    ["identity-verification-failed", "raw-token-data"],
    ["registration-failed", "claims-invalid"],
  ]) {
    ui.panel.render(state({ ai: { connected: false, planEnabled: false, pending: false,
      status: "connectionFailed", failureStage, failureSubstage } }));
    assert.equal(ui.byId("insight-ai-status").textContent,
      failureStage === "registration-failed" ? INSIGHT_EN.aiFailureRegistrationFailed : INSIGHT_EN.aiFailureIdentityVerificationFailed);
    assert.equal(ui.byId("insight-ai-status").textContent.includes("raw-token-data"), false);
  }
  ui.panel.render(state({ ai: { connected: false, planEnabled: false, pending: false,
    status: "disconnected", failureStage: "identity-verification-failed", failureSubstage: "claims-invalid" } }));
  assert.equal(ui.byId("insight-ai-status").textContent, INSIGHT_EN.aiDisconnected);
});
