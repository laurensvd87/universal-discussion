import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createPublicDiscoveryIndex } from "../src/discovery/public-index.js";
import { createSqliteDemoService } from "../src/application/create-sqlite-demo-service.js";
import { createSqliteRepository } from "../src/adapters/sqlite-repository.js";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
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

function rankedFixture() {
  const state = {generation:"ranked",revision:0,topics:[],discussions:[],sources:[],sourceLinks:[],contributions:[]};
  function topic(id, title, roots, replies, date = "2026-10-11") {
    state.topics.push({id,title,kind:"general",createdAt:date});
    state.discussions.push({id:`discussion-${id}`,topicId:id});
    for (let i=0;i<roots+replies;i++) state.contributions.push({id:`post-${id}-${i}`,discussionId:`discussion-${id}`,
      rootId:i<roots?null:`post-${id}-0`,visibility:"local-public",withdrawn:false,
      revisions:[{body:"Neutral discussion contribution",createdAt:date}]});
  }
  topic("many-roots","Orchid garden",8,0,"2026-10-13");
  topic("more-replies","Orchid garden",1,3,"2026-10-10");
  topic("fewer-replies","Orchid garden",1,1,"2026-10-12");
  topic("weaker-busy","Orchid " + "unrelated ".repeat(60),1,20,"2026-10-14");
  state.contributions.push({id:"withdrawn",discussionId:"discussion-many-roots",rootId:"post-many-roots-0",
    visibility:"local-public",withdrawn:true,revisions:[{body:"Withdrawnneedle",createdAt:"2026-10-15"}]},
  {id:"private",discussionId:"discussion-many-roots",rootId:"post-many-roots-0",visibility:"private",withdrawn:false,
    revisions:[{body:"Privateneedle",createdAt:"2026-10-16"}]});
  return state;
}

function streamingFixture() {
  const state = rankedFixture();
  const calls = {loads:0,streams:0,reads:[],brokenStream:false,brokenRead:false};
  let listener;
  const version = () => ({generation:state.generation,revision:state.revision});
  const selected = id => {
    if (!state.topics.some(topic => topic.id === id)) return null;
    const discussionId = `discussion-${id}`;
    return {...state,discussions:state.discussions.filter(discussion => discussion.id === discussionId),
      contributions:state.contributions.filter(entry => entry.discussionId === discussionId)};
  };
  return {state,calls,repository:{version,load() {calls.loads++;throw new Error("whole state reads forbidden");},
    subscribe() {throw new Error("whole state subscription forbidden");},
    subscribeChanges(fn) {listener=fn;return () => {};},
    forEachPublicDiscoveryTopic(fn) {
      calls.streams++;
      for (const topic of state.topics) {
        fn(topic.id,selected(topic.id));
        if (calls.brokenStream) throw new Error("stream failure after partial projection");
      }
    },
    readPublicDiscoveryTopic(id) {
      calls.reads.push(id);
      if (calls.brokenRead) throw new Error("scoped read failure");
      const result=selected(id);
      if (!result) throw Object.assign(new Error("missing"),{code:"not-found"});
      return result;
    }},publish(topicIds,deletedTopicIds=[],reset=false) {
      state.revision++;
      listener({version:version(),topicIds,deletedTopicIds,reset});
    }};
}

test("streamed discovery isolates selected Topic closures and updates scoped text/reply counts without whole loads", t => {
  const fixture = streamingFixture();
  const {state,calls,repository} = fixture;
  const index = createPublicDiscoveryIndex({databasePath:path.join(directory(t),"stream.sqlite"),repository});
  t.discoveryClosers.push(() => index.close());
  assert.equal(index.search({query:"orchid"}).results[0].topicId,"more-replies");
  assert.equal(index.search().results.find(row => row.topicId === "many-roots").visibleCount,8,
    "other closure Topic metadata never overwrites that Topic's complete projection");
  const edited=state.contributions.find(entry => entry.id === "post-more-replies-1");
  edited.revisions.push({body:"Scopededitneedle",createdAt:"2026-10-17"});
  fixture.publish(["more-replies"]);
  assert.deepEqual(calls.reads,["more-replies"]);
  assert.equal(calls.streams,1,"ordinary scoped write does not rebuild the index");
  assert.equal(index.search({query:"scopededitneedle"}).results[0].topicId,"more-replies");
  for (const entry of state.contributions.filter(entry => entry.discussionId === "discussion-more-replies" && entry.rootId)) entry.withdrawn=true;
  fixture.publish(["more-replies"]);
  assert.equal(index.search({query:"scopededitneedle"}).results.length,0);
  assert.equal(index.search({query:"orchid"}).results[0].topicId,"fewer-replies");
  assert.equal(index.search().results.find(row => row.topicId === "many-roots").visibleCount,8);
  assert.equal(calls.loads,0);
  assert.equal(calls.streams,1);
});

test("streamed discovery deletes missing Topics, handles explicit deletion/reset and fails closed on partial rebuilds", t => {
  const fixture = streamingFixture();
  const {state,calls,repository} = fixture;
  const databasePath=path.join(directory(t),"stream-recovery.sqlite");
  const index = createPublicDiscoveryIndex({databasePath,repository});
  t.discoveryClosers.push(() => index.close());
  state.topics=state.topics.filter(topic => topic.id !== "more-replies");
  fixture.publish(["more-replies"]);
  assert.ok(!index.search({query:"orchid"}).results.some(row => row.topicId === "more-replies"));
  state.topics=state.topics.filter(topic => topic.id !== "fewer-replies");
  fixture.publish([], ["fewer-replies"]);
  assert.deepEqual(calls.reads,["more-replies"],"explicit deletion needs no canonical Topic read");
  assert.ok(!index.search({query:"orchid"}).results.some(row => row.topicId === "fewer-replies"));
  state.generation="replacement";
  state.topics=state.topics.filter(topic => topic.id === "many-roots");
  fixture.publish([],[],true);
  assert.deepEqual(index.search({query:"orchid"}).results.map(row => row.topicId),["many-roots"]);
  assert.equal(calls.streams,2);
  const before = new DatabaseSync(databasePath);
  const oldWatermark=before.prepare("SELECT value FROM watermark").get().value;
  before.close();
  state.topics[0].title="Externalchangedneedle";
  state.revision++; // another canonical connection has no local notification
  calls.brokenStream=true;
  assert.throws(() => index.search({query:"orchid"}),code("unavailable"));
  const failed = new DatabaseSync(databasePath);
  assert.equal(failed.prepare("SELECT value FROM watermark").get().value,oldWatermark,"failed rebuild never advances watermark");
  assert.equal(failed.prepare("SELECT title FROM topics WHERE id='many-roots'").get().title,"Orchid garden",
    "partial streamed writes are rolled back atomically");
  failed.close();
  calls.brokenStream=false;
  assert.equal(index.search({query:"externalchangedneedle"}).results.length,1);
  assert.equal(index.search({query:"orchid"}).results.length,0);
  calls.brokenRead=true;
  assert.throws(() => fixture.publish(["many-roots"]),code("unavailable"));
  calls.brokenStream=true;
  assert.throws(() => index.search({query:"externalchangedneedle"}),code("unavailable"));
  calls.brokenRead=false;
  calls.brokenStream=false;
  assert.equal(index.search({query:"externalchangedneedle"}).results.length,1);
  assert.equal(calls.loads,0);
});

test("real normalized repository streams startup and emits only scoped discovery updates", t => {
  const dir=directory(t);
  const deps=deterministicDependencies();
  const seed=createDemoState({generation:deps.nextId("generation"),createdAt:deps.now(),sources:SYNTHETIC_SOURCES,topicSeeds:SYNTHETIC_TOPIC_SEEDS});
  const repo=createNormalizedSqliteRepository(path.join(dir,"normalized.sqlite"),seed);
  let streams=0;
  const reads=[];
  const index=createPublicDiscoveryIndex({databasePath:path.join(dir,"normalized-index.sqlite"),repository:{
    version:() => repo.version(),load() {throw new Error("whole catalog read forbidden");},
    subscribeChanges:fn => repo.subscribeChanges(fn),
    forEachPublicDiscoveryTopic(fn) {streams++;return repo.forEachPublicDiscoveryTopic(fn);},
    readPublicDiscoveryTopic(id) {reads.push(id);return repo.readPublicDiscoveryTopic(id);},
  }});
  t.discoveryClosers.push(() => {index.close();repo.close();});
  const topicId=seed.topics[0].id;
  const before=repo.readPublicDiscoveryTopic(topicId);
  const after=structuredClone(before);
  after.topics.find(topic => topic.id === topicId).title="Normalizedscopedneedle";
  after.revision++;
  repo.saveScoped(repo.version(),before,after);
  assert.deepEqual(reads,[topicId]);
  assert.equal(streams,1);
  assert.equal(index.search({query:"normalizedscopedneedle"}).results[0].topicId,topicId);
});

test("Discover ranks best document relevance before visible replies, not roots or recency", t => {
  const state = rankedFixture();
  let listener;
  const index = createPublicDiscoveryIndex({databasePath:path.join(directory(t),"ranked.sqlite"),repository:{
    version:() => ({generation:state.generation,revision:state.revision}),load:() => state,
    subscribe(fn) { listener=fn;return () => {}; },
  }});
  t.discoveryClosers.push(() => index.close());
  const expected = ["more-replies","fewer-replies","many-roots","weaker-busy"];
  assert.deepEqual(index.search({query:"orchid"}).results.map(row => row.topicId),expected);
  const received = [];
  let cursor = null;
  do {
    const page = index.search({query:"orchid",limit:1,cursor});
    received.push(...page.results.map(row => row.topicId));
    cursor=page.nextCursor;
    if (cursor) assert.equal(Object.hasOwn(JSON.parse(Buffer.from(cursor,"base64url")),"offset"),false);
  } while(cursor);
  assert.deepEqual(received,expected,"keyset pages retain complete relevance/reply order without duplicates");
  const recent = [];
  cursor=null;
  do {
    const page = index.search({limit:1,cursor});
    recent.push(...page.results.map(row => row.topicId));
    cursor=page.nextCursor;
  } while(cursor);
  assert.deepEqual(recent,["weaker-busy","many-roots","fewer-replies","more-replies"],
    "blank-query keyset browsing keeps existing recent-first ordering");
  assert.equal(index.search({query:"withdrawnneedle"}).results.length,0);
  assert.equal(index.search({query:"privateneedle"}).results.length,0);
  for (const entry of state.contributions.filter(entry => entry.discussionId === "discussion-more-replies" && entry.rootId)) entry.withdrawn=true;
  state.revision++;
  listener(state);
  assert.deepEqual(index.search({query:"orchid"}).results.map(row => row.topicId),
    ["fewer-replies","many-roots","more-replies","weaker-busy"],"withdrawn replies no longer count");
});

test("old derived schema rebuilds reply counts despite an unchanged watermark and persists them", t => {
  const state = rankedFixture();
  const databasePath = path.join(directory(t),"old-index.sqlite");
  let loads = 0;
  const repository = {version:() => ({generation:state.generation,revision:state.revision}),
    load() {loads++;return state;},subscribe:() => () => {}};
  let index = createPublicDiscoveryIndex({databasePath,repository});
  index.close();
  const old = new DatabaseSync(databasePath);
  old.exec("ALTER TABLE topics DROP COLUMN reply_count");
  old.close();
  index = createPublicDiscoveryIndex({databasePath,repository});
  assert.equal(loads,2,"schema migration invalidates even a matching canonical watermark");
  assert.equal(index.search({query:"orchid"}).results[0].topicId,"more-replies");
  index.close();
  const persisted = new DatabaseSync(databasePath);
  assert.equal(persisted.prepare("SELECT reply_count FROM topics WHERE id='more-replies'").get().reply_count,3);
  persisted.close();
  index = createPublicDiscoveryIndex({databasePath,repository});
  t.discoveryClosers.push(() => index.close());
  assert.equal(loads,2,"unchanged restart uses derived persisted counts");
  assert.equal(index.search({query:"orchid"}).results[0].topicId,"more-replies");
});

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
