// Explicit one-shot public-product diagnostic; no I/O occurs on import.
// Stop the normal service first, then:
// node harness/run-listing-citation-diagnostic.js --run-live
// This uses synthetic product context, not a replay of a browser extraction.
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createChatGPTRegistrationStore } from "../src/ai/chatgpt-runtime.js";
import { createChatGPTConnection } from "../src/ai/chatgpt-connection.js";
import { createProtectedRefreshStore } from "../src/ai/protected-refresh-store.js";
import { createChatGptInsights } from "../src/ai/chatgpt-insights.js";
import { chooseListedModel, oneResponseFetch } from "./run-live-insight-qa.js";

export function listingCitationFixture() {
  const source = { id: "qa-public-meross", url: "https://smattex.de/products/meross-rolladenschalter-mrs105ma",
    title: "Meross MRS105MA Matter roller-shutter switch" };
  return { context: { schema: "insight-context/v1", topic: { id: "qa-meross", title: source.title },
    currentSource: source, sameTopicSources: [], relatedSources: [], discussion: [],
    coverage: { sameTopicTotal: 0, relatedTotal: 0, discussionIncluded: false },
    limitations: ["grouping-provisional", "title-url-only", "sources-unverified"] },
  articleText: "Product listing for Meross MRS105MA, a Matter-compatible in-wall roller shutter switch. No current prices or delivery conditions are included in this synthetic diagnostic extract.",
  followup: { parentBody: "Comparing Meross MRS105MA switches.",
    questionBody: "Where can I buy four Meross MRS105MA switches at a low delivered price in Germany? Link the actual listings and distinguish new from B-stock." },
  allowWebResearch: true };
}

export function listingCitationCounts(raw) {
  let nativeMarkers = 0;
  let annotationEvents = 0;
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 262_144)
    return { nativeMarkers, annotationEvents };
  for (const frame of raw.replace(/\r\n/gu, "\n").split("\n\n")) {
    const data = frame.split("\n").filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart()).join("\n");
    let event;
    try { event = JSON.parse(data); } catch { continue; }
    if (event?.type === "response.output_text.annotation.added")
      annotationEvents = Math.min(annotationEvents + 1, 101);
    if (event?.type === "response.output_text.done" && typeof event.text === "string")
      nativeMarkers = Math.min(nativeMarkers + (event.text.match(/\uE200cite\uE202/gu) ?? []).length, 101);
  }
  return { nativeMarkers, annotationEvents };
}

export async function runListingCitationDiagnostic(args, { fetchImpl = fetch, print = console.log } = {}) {
  if (args.length !== 1 || args[0] !== "--run-live") throw new Error("Explicit --run-live required");
  const dataDir = fileURLToPath(new URL("../data/", import.meta.url));
  if (!existsSync(path.join(dataDir, "chatgpt-registration.json")))
    throw new Error("Existing registration unavailable");
  // Bind before restoring the owner's rotating credential; never race the CLI.
  const claim = createServer((socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    claim.once("error", reject);
    claim.listen({ host: "127.0.0.1", port: 4174, exclusive: true }, resolve);
  });
  let connection, insights;
  let streamCounts = null;
  let trace = null;
  const provider = oneResponseFetch(fetchImpl);
  try {
    const store = createChatGPTRegistrationStore(dataDir);
    const refreshStore = createProtectedRefreshStore({ hostId: store.hostId });
    if (!refreshStore) throw new Error("Protected connection unavailable");
    connection = createChatGPTConnection({ hostId: store.hostId, agentName: "Universal Discussion Layer",
      readRegistration: store.readRegistration, writeRegistration: store.writeRegistration,
      fetchImpl: provider.fetch, refreshStore });
    if (!await connection.restore() || !connection.status().planEnabled)
      throw new Error("Connected plan unavailable");
    insights = createChatGptInsights({ fetchImpl: provider.fetch, getAccessToken: connection.getAccessToken,
      onTrace: (value) => { trace = { outcome: value.outcome, detail: value.detail,
        urlAnnotationCounts: value.urlAnnotationCounts }; },
      onDebug: (event) => {
        if (event?.phase === "response") streamCounts = listingCitationCounts(event.body);
      } });
    const model = chooseListedModel(await insights.listModels(), "auto");
    const result = await insights.createInsight({ model, ...listingCitationFixture() });
    print(JSON.stringify({ status: "completed", model, responsesSent: provider.responsesSent(),
      bodyCharacters: result.body.length, citationCount: result.citations.length, trace, streamCounts }));
    return result.citations.length;
  } catch (error) {
    print(JSON.stringify({ status: "failed", responsesSent: provider.responsesSent(), trace, streamCounts,
      code: typeof error?.code === "string" && /^[a-z-]{1,40}$/u.test(error.code) ? error.code : "unavailable" }));
    throw new Error("Listing diagnostic failed");
  } finally {
    insights?.dispose();
    connection?.dispose();
    await new Promise((resolve) => claim.close(resolve));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runListingCitationDiagnostic(process.argv.slice(2)).catch(() => {
    console.error("Listing citation diagnostic failed; no automatic retry.");
    process.exitCode = 1;
  });
}
