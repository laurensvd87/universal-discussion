import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createChatGptInsights } from "../src/ai/chatgpt-insights.js";
import { createChatGPTRuntime } from "../src/ai/chatgpt-runtime.js";
import { createSqliteDemoService } from "../src/application/create-sqlite-demo-service.js";
import { buildInsightContext } from "../../../spikes/topic-resolution/browser/core/insight-context.js";
import { appendInsightCitationNodes, formatInsightCitations } from
  "../../../spikes/topic-resolution/browser/core/insight-citations.js";
import { deterministicDependencies } from "./helpers.js";

const actorId = "demo-alex";
const sourceId = "reserved-example-com";
const topicId = "reserved-domain-demo";
const urls = [
  "https://retailer.example.net/products/fixture-variant-a",
  "https://market.example.org/listings/fixture-variant-a",
];
const claims = [
  "Retailer A lists the fixture variant for 100 units, but its delivered total is unknown",
  "Retailer B lists the same variant for 110 units before delivery",
];
const answer = `${claims[0]}. ${claims[1]}. Ask for the delivery country before comparing totals.`;
const annotations = claims.map((claim, index) => ({ type: "url_citation", url: urls[index],
  title: `Synthetic listing ${index + 1}`, start_index: answer.indexOf(claim),
  end_index: answer.indexOf(claim) + claim.length }));

function sse(type, fields) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`;
}
function providerResponse(fallback) {
  const responseId = `resp_fixture_${fallback ? "fallback" : "normal"}`;
  const search = { id: "call_fixture_search", type: "web_search_call", status: "completed" };
  const message = { id: "msg_fixture_answer", type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: answer, annotations }] };
  if (!fallback) return sse("response.completed", { response: {
    id: responseId, status: "completed", output: [search, message] } });
  return sse("response.created", { response: { id: responseId, status: "in_progress", output: [] } }) +
    sse("response.output_item.added", { output_index: 0,
      item: { ...search, status: "in_progress" } }) +
    sse("response.output_item.done", { output_index: 0, item: search }) +
    sse("response.output_item.added", { output_index: 1,
      item: { id: message.id, type: "message", role: "assistant", status: "in_progress", content: [] } }) +
    sse("response.output_text.done", { item_id: message.id, output_index: 1,
      content_index: 0, text: answer }) +
    sse("response.output_item.done", { output_index: 1, item: message }) +
    sse("response.completed", { response: { id: responseId, status: "completed", output: [] } });
}
function element(tag) {
  return { tag, children: [], textContent: "", attributes: {},
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    setAttribute(name, value) { this.attributes[name] = value; },
    set href(value) { this.linkHref = value; },
    set innerHTML(_) { assert.fail("Citation rendering must not parse HTML"); } };
}

for (const fallback of [false, true]) {
  test(`cited retailer reply survives proof, SQLite reopen and rendering (${fallback ? "strict fallback" : "normal stream"})`, async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "discussion-cited-reply-"));
    const databasePath = path.join(directory, "discussion.sqlite");
    let opened;
    let runtime;
    try {
      opened = createSqliteDemoService({ databasePath, ...deterministicDependencies() });
      const { service } = opened;
      const rootId = service.command(service.catalog().version,
        { type: "create-root", topicId, body: "Where is this fixture variant sold?" },
        actorId).result.contributionId;
      const discussionId = service.discussion(topicId).discussionId;
      let providerCalls = 0;
      const adapter = createChatGptInsights({ fetchImpl: async (endpoint, options) => {
        if (endpoint.endsWith("/models")) return new Response(JSON.stringify({ models: [
          { slug: "synthetic-model", display_name: "Synthetic model", visibility: "list" },
        ] }), { headers: { "content-type": "application/json" } });
        assert.equal(endpoint, "https://api.openai.com/v1/responses");
        providerCalls++;
        const request = JSON.parse(options.body);
        assert.equal(request.tool_choice, "auto");
        assert.deepEqual(request.tools, [{ type: "web_search", external_web_access: true,
          search_context_size: "medium" }]);
        return new Response(providerResponse(fallback), { headers: { "content-type": "text/event-stream" } });
      }, getAccessToken: async () => "synthetic-test-token" });
      await adapter.listModels();
      runtime = createChatGPTRuntime({ service,
        connectionAdapter: { status: () => ({ connected: true, planEnabled: true,
          account: { clientId: "synthetic-account", label: "Fixture account" } }), dispose() {} },
        insightsAdapter: adapter });
      const catalog = service.catalog();
      const context = buildInsightContext({ catalog, discussion: service.discussion(topicId),
        related: service.related(sourceId, 20), sourceId, topicId });
      const operationId = `fixture-cited-reply-${fallback ? "fallback" : "normal"}`;
      assert.equal(runtime.create({ operationId, model: "synthetic-model", context,
        articleText: "Synthetic public fixture article.", allowWebResearch: true,
        followupQuestionId: rootId, expected: catalog.version }, actorId).state, "running");
      let privateResult;
      for (let attempt = 0; attempt < 20; attempt++) {
        privateResult = runtime.result({ operationId }, actorId);
        if (privateResult.state !== "running") break;
        await new Promise((resolve) => setImmediate(resolve));
      }
      assert.equal(privateResult.state, "completed", JSON.stringify(privateResult));
      assert.equal(providerCalls, 1);
      assert.equal(privateResult.result.body, answer);
      assert.deepEqual(privateResult.result.citations.map((citation) => citation.url), urls);
      const exactBody = formatInsightCitations(privateResult.result.body, privateResult.result.citations);
      assert.equal((exactBody.match(/\[↗\]\(/gu) ?? []).length, 2);
      assert.match(exactBody, /delivered total is unknown/u);
      const command = { type: "share-insight-reply", operationId, topicId, discussionId,
        rootId, replyToId: rootId, originSourceId: sourceId, body: exactBody };
      assert.throws(() => runtime.share({ expected: service.catalog().version,
        command: { ...command, body: exactBody.replace(urls[0], "https://other.example.net/offer") } },
      actorId, () => assert.fail("Altered citation must never reach persistence")),
      (error) => error.code === "invalid");
      const outcome = runtime.share({ expected: service.catalog().version, command }, actorId,
        (proof) => service.command(service.catalog().version, command, actorId, proof));
      const replyId = outcome.result.contributionId;
      runtime.dispose(); runtime = null;
      opened.close(); opened = null;

      opened = createSqliteDemoService({ databasePath, ...deterministicDependencies() });
      const persisted = opened.service.discussion(topicId).roots.find((entry) => entry.id === rootId)
        .replies.find((entry) => entry.id === replyId);
      assert.equal(persisted.body, exactBody);
      assert.equal(persisted.replyToId, rootId);
      assert.deepEqual(persisted.insight, { kind: "generated", operatorId: actorId });
      const container = element("p");
      appendInsightCitationNodes({ createElement: element }, container, persisted.body);
      const links = container.children.filter((child) => child.tag === "sup").map((child) => child.children[0]);
      assert.deepEqual(links.map((link) => link.linkHref), urls);
      for (const [index, link] of links.entries()) {
        assert.equal(link.textContent, "↗");
        assert.equal(link.target, "_blank");
        assert.equal(link.rel, "noopener noreferrer");
        assert.equal(link.referrerPolicy, "no-referrer");
        assert.equal(link.attributes["aria-label"], `Open source link ${index + 1}`);
      }
    } finally {
      runtime?.dispose();
      opened?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
