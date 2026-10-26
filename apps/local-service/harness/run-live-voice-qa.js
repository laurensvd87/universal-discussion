// Explicit owner-approved synthetic quality check. No page fetch, web tools,
// writes, retry or raw-response capture. Exactly one attempt per fixed voice.
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createChatGPTRegistrationStore } from "../src/ai/chatgpt-runtime.js";
import { createChatGPTConnection } from "../src/ai/chatgpt-connection.js";
import { createProtectedRefreshStore } from "../src/ai/protected-refresh-store.js";
import { createChatGptInsights } from "../src/ai/chatgpt-insights.js";
import { chooseListedModel } from "./run-live-insight-qa.js";

export const VOICE_QA_TEXT = "Invented product for a synthetic tone test, not a real offer: The NeatDock charging station costs 49 dollars and is advertised as an effortless way to tidy a desk. It holds six devices but includes no charging cables or power adapter. Each device still needs its own cable, threaded through the stand. The stand has no battery or powered hub. It organizes devices but cannot reduce the number of cables or charge them by itself. The article explains that existing chargers must be plugged in separately. No independent durability test is supplied.";
export function voiceQaContext() {
  return { schema: "insight-context/v1", topic: { id: "qa-desk", title: "Charging station tradeoffs" },
    currentSource: { id: "qa-neatdock", url: "https://example.com/neatdock", title: "Invented NeatDock charging station" },
    sameTopicSources: [], relatedSources: [], discussion: [],
    coverage: { sameTopicTotal: 0, relatedTotal: 0, discussionIncluded: false },
    limitations: ["grouping-provisional", "title-url-only", "sources-unverified"] };
}
export function boundedVoiceFetch(fetchImpl) {
  let count = 0;
  return { responsesSent: () => count, fetch: (url, options) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash ||
        !["https://auth.openai.com", "https://api.openai.com"].includes(parsed.origin) ||
        parsed.origin === "https://api.openai.com" && !["/v1/models", "/v1/responses"].includes(parsed.pathname))
      throw new Error("Unexpected provider endpoint");
    if (parsed.origin === "https://api.openai.com" && parsed.pathname === "/v1/responses") {
      if (options?.method !== "POST" || count >= 2) throw new Error("Two response attempts only");
      const packet = JSON.parse(options.body);
      if (packet.tools?.length || packet.tool_choice && packet.tool_choice !== "none") throw new Error("Research forbidden");
      count++;
    }
    return fetchImpl(url, options);
  } };
}

export async function runLiveVoiceQa(args, { fetchImpl = fetch, print = console.log } = {}) {
  if (args.length !== 1 || args[0] !== "--run-live") throw new Error("Explicit --run-live required");
  const server = createServer(socket => socket.destroy());
  await new Promise((resolve, reject) => { server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 4174, exclusive: true }, resolve); });
  let connection, insights;
  try {
    const directory = fileURLToPath(new URL("../data/", import.meta.url));
    const store = createChatGPTRegistrationStore(directory);
    const refreshStore = createProtectedRefreshStore({ hostId: store.hostId });
    if (!refreshStore) throw new Error("Protected sign-in unavailable");
    const provider = boundedVoiceFetch(fetchImpl);
    connection = createChatGPTConnection({ hostId: store.hostId, agentName: "Murmingle",
      readRegistration: store.readRegistration, writeRegistration: store.writeRegistration,
      fetchImpl: provider.fetch, refreshStore });
    if (!await connection.restore() || !connection.status().planEnabled) throw new Error("Connected plan unavailable");
    insights = createChatGptInsights({ fetchImpl: provider.fetch, getAccessToken: connection.getAccessToken });
    const model = chooseListedModel(await insights.listModels(), "auto");
    for (const voice of ["funny", "sarcastic"]) {
      try {
        const result = await insights.createInsight({ model, context: voiceQaContext(), articleText: VOICE_QA_TEXT,
          allowWebResearch: false, preferences: { voice, replyLanguage: "en" } });
        // Only this invented fixture's bounded accepted text is printed for QA;
        // no provider stream, identity, token or ordinary user page is emitted.
        print(JSON.stringify({ voice, model, status: "completed", words: result.body.trim().split(/\s+/u).length,
          body: result.body.slice(0, 2000) }));
      } catch (error) {
        print(JSON.stringify({ voice, model, status: "failed", code:
          /^[a-z-]{1,60}$/u.test(error?.code ?? "") ? error.code : "unavailable" }));
      }
    }
    print(JSON.stringify({ responsesSent: provider.responsesSent(), webResearch: false, posted: false }));
  } finally {
    insights?.dispose(); connection?.dispose();
    await new Promise(resolve => server.close(resolve));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLiveVoiceQa(process.argv.slice(2)).catch(() => { console.error("Voice QA unavailable; no automatic retry."); process.exitCode = 1; });
}
