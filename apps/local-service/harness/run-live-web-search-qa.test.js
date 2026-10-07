import test from "node:test";
import assert from "node:assert/strict";
import { buildRequest, oneResponseFetch, parseArgs, readEvents, summarizeEvents } from "./run-live-web-search-qa.js";

test("live probe requires explicit fixed case and creates a SIWC-compatible request", () => {
  assert.throws(() => parseArgs([]));
  assert.throws(() => parseArgs(["--run-live", "--case", "other", "--model", "gpt-5.5"]));
  const { caseName, model } = parseArgs(["--run-live", "--case", "control", "--model", "gpt-5.5"]);
  const request = buildRequest(caseName, model);
  assert.equal(request.store, false);
  assert.equal(request.stream, true);
  assert.equal(request.tools[0].type, "web_search");
  assert.equal(request.tool_choice, "required");
  assert.ok(Array.isArray(request.input));
});

test("stream summary counts calls and removes unapproved citation URLs", async () => {
  const event = { type: "response.completed", response: { output: [
    { id: "ws1", type: "web_search_call", action: { type: "search", sources: [
      { url: "https://peps.python.org/pep-0008/" },
    ] } },
    { type: "message", content: [{ annotations: [
      { type: "url_citation", url: "https://peps.python.org/pep-0008/" },
      { type: "url_citation", url: "https://other.example/public" },
      { type: "url_citation", url: "https://bad.example/?token=secret" },
    ] }] },
  ] } };
  const frame = `data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`;
  const events = await readEvents(new Response(new TextEncoder().encode(frame)));
  const result = summarizeEvents(events, "control");
  assert.equal(result.status, "completed");
  assert.equal(result.searchCalls, 1);
  assert.deepEqual(result.citedUrlsOrHosts, ["https://peps.python.org/pep-0008/", "other.example"]);
  assert.deepEqual(result.sourceHosts, ["peps.python.org"]);
});

test("provider wrapper prevents a second Responses request", async () => {
  let sent = 0;
  const provider = oneResponseFetch(() => { sent++; return Promise.resolve(new Response()); });
  await provider.fetch("https://api.openai.com/v1/responses", { method: "POST" });
  assert.throws(() => provider.fetch("https://api.openai.com/v1/responses", { method: "POST" }));
  assert.equal(sent, 1);
  assert.equal(provider.responsesSent(), 2);
});
