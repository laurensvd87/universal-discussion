// Isolated packaged Chrome; synthetic canonical state, no owner browser/store,
// page capture, external network, credentials or provider calls.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromiumPipe } from "./chromium-pipe.js";
import { createDemoState } from "../../../apps/local-service/src/domain/demo-state.js";
import { migrateReferenceTopicState } from "../../../apps/local-service/src/domain/reference-state-migration.js";
import { createFixedReferenceMatcher } from "../../../apps/local-service/src/domain/fixed-reference-topic-integration.js";
import { createNormalizedSqliteRepository } from "../../../apps/local-service/src/adapters/normalized-sqlite-repository.js";
import { createDiscussionService } from "../../../apps/local-service/src/application/discussion-service.js";
import { createFixtureRankingAdapter } from "../../../apps/local-service/src/adapters/fixture-ranking.js";

const profileRoot = mkdtempSync(path.join(os.tmpdir(), "reference-topic-chrome-"));
let browser, sessionId, serial = 0;
const now = () => "2026-10-13T00:00:00.000Z";
const nextId = kind => `${kind}-${++serial}`;
const seed = migrateReferenceTopicState(createDemoState({ generation: "generation-chrome-reference", createdAt: now(), sources: [], topicSeeds: [] }), { represent: () => null });
const repository = createNormalizedSqliteRepository(":memory:", seed);
const service = createDiscussionService({ repository, nextId, now, sources: [], topicSeeds: [], ranking: createFixtureRankingAdapter(),
  referenceMatcher: createFixedReferenceMatcher({ transform: values => values }) });
const ingest = (label, angle) => service.ingest({ expected: service.version(), operationId: `operation-${label}`,
  url: `https://example.org/article-${label}`, title: `Article ${label}`, extractorVersion: "main-text-prefix/v1",
  embedding: { modelId: "e5-small-q8-browser-main-prefix-v1", values: [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)] } });
const a = ingest("a", -.4), b = ingest("b", .4);
service.command(service.version(), { type: "create-root", topicId: a.topicId, originSourceId: a.sourceId, body: "Original discussion A" }, "demo-alex");
service.command(service.version(), { type: "create-root", topicId: b.topicId, originSourceId: b.sourceId, body: "Original discussion B" }, "demo-blair");
const c = ingest("middle", 0);
const selection = { sourceId: c.sourceId, topicId: c.topicId, includeAlternate: true };
const bundle = service.enrichment(selection);
const exceptions = [];
async function evaluate(expression) {
  const result = await browser.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (result.exceptionDetails) throw new Error("Reference membership Chrome evaluation failed");
  return result.result.value;
}
try {
  browser = launchChromiumPipe({ executable: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", profileDirectory: path.join(profileRoot, "profile") });
  await browser.send("Browser.getVersion");
  const loaded = await browser.send("Extensions.loadUnpacked", { path: fileURLToPath(new URL("../browser/", import.meta.url)) });
  const target = await browser.send("Target.createTarget", { url: `chrome-extension://${loaded.id}/chromium/popup.html` });
  ({ sessionId } = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true }));
  browser.on("Runtime.exceptionThrown", ({ exceptionDetails }, session) => { if (session === sessionId) exceptions.push(exceptionDetails.text); });
  await browser.send("Runtime.enable", {}, sessionId); await browser.send("Page.enable", {}, sessionId);
  await browser.send("Page.reload", { ignoreCache: true }, sessionId);
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate("document.readyState === 'complete' && !!document.querySelector('#discussion-composer')").catch(() => false)) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const prepared = await evaluate(`(async () => {
    window.dispatchEvent(new Event('pagehide'));
    const {readEnrichment} = await import('../core/local-service-contract.js');
    const {mountDiscussionPanel} = await import('./discussion-panel.js');
    const bundle = readEnrichment(${JSON.stringify(bundle)}, ${JSON.stringify(selection)});
    document.body.replaceChildren();
    const host = document.createElement('section'); document.body.append(host);
    const state = {phase:'ready',busy:false,error:null,needsFreshRead:false,actorId:'demo-alex',
      topicViewMode:'classic',sourceId:${JSON.stringify(c.sourceId)},topicId:${JSON.stringify(c.topicId)},
      selection:'manual',catalog:bundle.catalog,discussion:bundle.discussion,alternateDiscussion:bundle.alternateDiscussion,
      related:null,priorDiscussions:null,earlierDiscussions:[],relatedDiscussions:[],alternateError:null,
      draft:{body:'',detached:false,mode:'root',targetId:null}};
    const panel = mountDiscussionPanel(document,host); panel.bind({currentState:()=>state}); panel.render(state);
    window.referenceSmoke={panel,state,host};
    return {memberships:bundle.catalog.sources.find(source=>source.id===state.sourceId).topicIds,
      messages:[...host.querySelectorAll('[data-thread-root-id]')].map(node=>node.dataset.threadRootId)};
  })()`);
  assert.equal(prepared.memberships.length, 2); assert.equal(prepared.messages.length, 2);
  const result = await evaluate(`(() => {
    const {host,state,panel}=window.referenceSmoke;
    const cards=[...host.querySelectorAll('[data-thread-root-id]')];
    const foreign=cards.find(card=>card.textContent.includes('Original discussion B'));
    const secondaryActions=[...foreign.querySelectorAll('[data-action]')].map(node=>node.dataset.action);
    panel.render({...state,alternateDiscussion:null,alternateError:'capacity'});
    const incomplete=host.textContent.includes('Not all assigned Topics could load');
    panel.render({...state,sourceId:null});
    return {secondaryActions,incomplete,remaining:host.querySelectorAll('[data-thread-root-id]').length};
  })()`);
  assert.equal(result.secondaryActions.some(action => ["reply", "getinsights", "edit", "withdraw"].includes(action)), false);
  assert.equal(result.incomplete, true); assert.equal(result.remaining, 1);
  assert.deepEqual(exceptions, []);
  process.stdout.write("Packaged Chrome: two canonical membership discussions, no duplicate or secondary write authority; incomplete and navigation fences pass.\n");
} finally {
  await browser?.close(); repository.close();
  assert.equal(path.dirname(path.resolve(profileRoot)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(profileRoot).startsWith("reference-topic-chrome-"));
  rmSync(profileRoot, { recursive: true, force: true });
}
