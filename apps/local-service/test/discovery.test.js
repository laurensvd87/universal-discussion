import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createPublicDiscoveryIndex } from "../src/discovery/public-index.js";
import { createSqliteDemoService } from "../src/application/create-sqlite-demo-service.js";
import { createSqliteRepository } from "../src/adapters/sqlite-repository.js";
import { createDemoState } from "../src/domain/demo-state.js";
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from "../src/adapters/fixture-catalog.js";
import { deterministicDependencies } from "./helpers.js";

function directory(t) {
  const dir = mkdtempSync(path.join(tmpdir(),"udl-discovery-"));
  t.discoveryClosers = [];
  t.after(() => { for (const close of t.discoveryClosers) close(); rmSync(dir,{recursive:true,force:true}); });
  return dir;
}
const code = expected => error => error.code === expected;

test("discovery searches public current text, edits/withdrawals, safe sources and persists", t => {
  const databasePath = path.join(directory(t),"canonical.sqlite");
  let app = createSqliteDemoService({databasePath,...deterministicDependencies()});
  t.discoveryClosers.push(() => { if (app) app.close(); });
  const service = app.service;
  assert.equal(service.discover.search().results.length,0);
  const result = service.command(service.catalog().version,{type:"create-root",topicId:"harbor-s2",body:"Orchid boats on the harbor"},"demo-alex");
  assert.equal(service.discover.search({query:"orchid"}).results[0].topicId,"harbor-s2");
  assert.equal(service.discover.search().results[0].visibleCount,1);
  assert.ok(service.discover.search({query:"orchid"}).results[0].sources.every(source => source.url.startsWith("https://")));
  const contributionId = result.result.contributionId;
  service.command(service.catalog().version,{type:"edit",contributionId,body:"Violet boats"},"demo-alex");
  assert.equal(service.discover.search({query:"orchid"}).results.length,0);
  app.close();
  app = null;
  app = createSqliteDemoService({databasePath,...deterministicDependencies()});
  assert.equal(app.service.discover.search({query:"violet"}).results.length,1);
  app.service.command(app.service.catalog().version,{type:"withdraw",contributionId},"demo-alex");
  assert.equal(app.service.discover.search({query:"violet"}).results.length,0);
  assert.equal(app.service.discover.search().results.length,0);
  app.close();
  app = null;
});

test("malformed inputs and cursors fail; FTS grammar is only literal words", t => {
  const app = createSqliteDemoService({databasePath:path.join(directory(t),"canonical.sqlite"),...deterministicDependencies()});
  t.discoveryClosers.push(() => app.close());
  for (const input of [null,[],{query:null},{limit:null},{query:"a".repeat(257)},{query:"a ".repeat(17)},{query:"\u0000"},{query:"***"},{limit:0},{limit:51},{cursor:"!"},{cursor:Buffer.from("{}").toString("base64url")},{unknown:true}])
    assert.throws(() => app.service.discover.search(input),code("invalid"));
  assert.doesNotThrow(() => app.service.discover.search({query:'"harbor" OR title:boom* NOT boat'}));
});

test("discovery refuses the canonical database instead of modifying its strict schema", t => {
  const databasePath = path.join(directory(t),"canonical.sqlite");
  assert.throws(() => createSqliteDemoService({databasePath,discoveryDatabasePath:databasePath,...deterministicDependencies()}),code("storage-schema"));
  const app = createSqliteDemoService({databasePath,...deterministicDependencies()});
  t.discoveryClosers.push(() => app.close());
  assert.equal(app.service.catalog().version.revision,0);
});

test("external canonical deletion reconciles stale index and failed reconciliation never exposes text", t => {
  const dir = directory(t);
  const deps = deterministicDependencies();
  const seed = createDemoState({generation:deps.nextId("generation"),createdAt:deps.now(),sources:SYNTHETIC_SOURCES,topicSeeds:SYNTHETIC_TOPIC_SEEDS});
  const repo = createSqliteRepository(path.join(dir,"canonical.sqlite"),seed);
  const other = createSqliteRepository(path.join(dir,"canonical.sqlite"),seed);
  let loads = 0;
  let broken = false;
  const index = createPublicDiscoveryIndex({databasePath:path.join(dir,"index.sqlite"),repository:{
    version:() => repo.version(), subscribe:fn => repo.subscribe(fn), load() { loads++; if (broken) throw new Error("read failed"); return repo.load(); },
  }});
  t.discoveryClosers.push(() => {index.close();repo.close();other.close();});
  const snapshot = structuredClone(other.load());
  snapshot.topics[0].title = "Secretorchid public topic";
  snapshot.sources[0].url = "https://example.org/publicsourceorchid";
  snapshot.sources[1].url = "https://example.org/account/privatesourceneedle";
  snapshot.revision++;
  other.save(other.version(),snapshot);
  assert.equal(index.search({query:"secretorchid"}).results.length,1);
  assert.equal(index.search({query:"publicsourceorchid"}).results.length,1);
  assert.equal(index.search({query:"privatesourceneedle"}).results.length,0);
  assert.equal(index.search({query:"publicsourceorchid"}).results[0].sources[0].url,"https://example.org/publicsourceorchid");
  const initialLoads = loads;
  index.search({query:"secretorchid"});
  index.search({query:"secretorchid"});
  assert.equal(loads,initialLoads,"unchanged reads do not deserialize canonical snapshot");
  const next = structuredClone(other.load());
  next.topics[0].title = "Changed title";
  next.revision++;
  other.save(other.version(),next);
  broken = true;
  assert.throws(() => index.search({query:"secretorchid"}),code("unavailable"));
  broken = false;
  assert.equal(index.search({query:"secretorchid"}).results.length,0);
});

test("large synthetic derived index uses bounded pages with revision/query bound cursors and excludes private history", t => {
  const state = {generation:"synthetic",revision:0,topics:[],discussions:[],sources:[],sourceLinks:[],contributions:[]};
  for (let i=0;i<12000;i++) {
    const id = `topic-${String(i).padStart(5,"0")}`;
    state.topics.push({id,title:`Orchid ${i}`,kind:"general",createdAt:"2026-10-11T00:00:00Z"});
    state.discussions.push({id:`discussion-${id}`,topicId:id});
    state.contributions.push({id:`post-${i}`,discussionId:`discussion-${id}`,visibility:"local-public",withdrawn:false,
      revisions:[{body:"Oldgone",createdAt:"2026-10-10"},{body:`Orchid public ${i}`,createdAt:"2026-10-11"}]});
  }
  state.contributions.push({id:"private",discussionId:"discussion-topic-00000",visibility:"private",withdrawn:false,revisions:[{body:"Privateneedle",createdAt:"2026-10-11"}]});
  let loads = 0;
  const index = createPublicDiscoveryIndex({databasePath:path.join(directory(t),"large.sqlite"),repository:{
    version:() => ({generation:state.generation,revision:state.revision}),load() {loads++;return state;}, subscribe:() => () => {},
  }});
  t.discoveryClosers.push(() => index.close());
  const page = index.search({query:"orchid",limit:50});
  assert.equal(page.results.length,50);
  assert.ok(page.nextCursor);
  assert.ok(page.results.every(row => row.snippet.length<=320));
  const second = index.search({query:"orchid",limit:50,cursor:page.nextCursor});
  assert.equal(second.results.length,50);
  assert.equal(new Set([...page.results,...second.results].map(row => row.topicId)).size,100);
  assert.equal(index.search({query:"privateneedle"}).results.length,0);
  assert.equal(index.search({query:"oldgone"}).results.length,0);
  assert.equal(loads,1);
  assert.throws(() => index.search({query:"public",limit:50,cursor:page.nextCursor}),code("conflict"));
  state.revision++;
  assert.throws(() => index.search({query:"orchid",limit:50,cursor:page.nextCursor}),code("conflict"));
});
