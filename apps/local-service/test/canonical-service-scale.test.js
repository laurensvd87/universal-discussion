import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
import { createSqliteRepository } from "../src/adapters/sqlite-repository.js";
import { createFixtureRankingAdapter } from "../src/adapters/fixture-ranking.js";
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from "../src/adapters/fixture-catalog.js";
import { createDiscussionService } from "../src/application/discussion-service.js";
import { createSqliteDemoService } from "../src/application/create-sqlite-demo-service.js";
import { DatabaseSync } from "node:sqlite";
import { createDemoState, IMPORTED_INSIGHT_AUTHOR_ID } from "../src/domain/demo-state.js";
import { sourceStamp } from "../src/domain/source-threads.js";
import { BROWSER_MODEL_ID, EXTRACTOR_VERSION } from "../src/domain/learned-sources.js";
import { createRequestHandler } from "../src/http/request-handler.js";
import { deterministicDependencies } from "./helpers.js";

const ACCOUNT = "account-11111111-1111-4111-8111-111111111111";
const OTHER_ACCOUNT = "account-22222222-2222-4222-8222-222222222222";
const principal = {id:ACCOUNT,accountId:ACCOUNT.slice(8),type:"human",demo:false,displayName:"Scale_owner"};
const code = expected => error => error.code === expected;
const id = (prefix, index) => `${prefix}-${String(index).padStart(5,"0")}`;

function directory(t) {
  const value=mkdtempSync(path.join(tmpdir(),"udl-service-scale-"));
  const closers=[];
  t.after(() => {for(const close of closers) close();rmSync(value,{recursive:true,force:true});});
  return {value,closers};
}

function serviceFor(repository, deps = deterministicDependencies()) {
  return createDiscussionService({repository,ranking:createFixtureRankingAdapter(),sources:SYNTHETIC_SOURCES,
    topicSeeds:SYNTHETIC_TOPIC_SEEDS,...deps,resolveAccountActor:accountId => accountId === principal.accountId ? principal : null,
    readAccountActors:() => [principal]});
}

function scaleState() {
  const state={schema:"demo-state/v3",generation:"synthetic-scale",revision:0,topics:[],discussions:[],
    sources:[],sourceLinks:[],contributions:[]};
  const date="2026-10-12T00:00:00Z";
  for(let i=0;i<1200;i++) {
    const topicId=id("topic",i);
    state.topics.push({id:topicId,title:`Synthetic scale discussion ${i}`,kind:"general",createdAt:date});
    state.discussions.push({id:`discussion-${topicId}`,topicId});
    state.contributions.push({id:id("post",i),discussionId:`discussion-${topicId}`,rootId:null,replyToId:null,
      authorId:i === 0 || i === 999 ? ACCOUNT : "demo-alex",actorType:"human",visibility:"local-public",withdrawn:false,
      createdAt:date,anchor:{kind:"topic",topicId},originalTopicId:topicId,learnedOrigin:false,
      revisions:[{body:`Earlier synthetic revision ${i} `+"x".repeat(4000),createdAt:date},
        {body:`Current synthetic revision ${i} `+"y".repeat(4000),createdAt:date}]});
  }
  const embedding=SYNTHETIC_SOURCES.find(source => source.embedding).embedding;
  for(let i=0;i<2600;i++) {
    state.sources.push({id:id("source",i),url:`https://example.org/synthetic-scale-${i}`,
      title:`Synthetic Source ${i} `+"s".repeat(470),embedding:i === 2199 || i === 2198 ? structuredClone(embedding) : null,
      provenance:"project-created-hand-authored-demo/1"});
    state.sourceLinks.push({sourceId:id("source",i),topicId:id("topic",i%1200),method:"fixture-confirmed"});
  }
  const source=state.sources[2199];
  const current=state.contributions[999];
  current.originSourceId=source.id;
  current.anchor={kind:"source",sourceId:source.id,stamp:sourceStamp(source)};
  // This pinned historical root preserves a Source link after its current Topic
  // changes. Its root anchor remains the older destination, as in canonical data.
  state.contributions[0].originSourceId=source.id;
  const generated=state.contributions[1199];
  generated.actorType="agent";
  generated.authorId=IMPORTED_INSIGHT_AUTHOR_ID;
  generated.insight={kind:"generated",operatorId:ACCOUNT};
  return state;
}

test("normal service paths work beyond legacy aggregate limits without loading the canonical snapshot", async t => {
  const dir=directory(t),seed=scaleState();
  assert.ok(seed.contributions.length>1000);
  assert.ok(Buffer.byteLength(JSON.stringify(seed))>8*1024*1024);
  assert.ok(Buffer.byteLength(JSON.stringify({topics:seed.topics,sources:seed.sources}))>1024*1024);
  const raw=createNormalizedSqliteRepository(path.join(dir.value,"canonical.sqlite"),seed);
  dir.closers.push(() => raw.close());
  let fullLoads=0;
  const repository={...raw,load() {fullLoads++;throw new Error("full canonical loads are forbidden for normal scoped operations");}};
  const service=serviceFor(repository);
  const topicId=id("topic",999),sourceId=id("source",2199),rootId=id("post",999);
  const initial=service.version();
  assert.deepEqual(initial,{generation:seed.generation,revision:0});
  assert.equal(service.exactSource(sourceId).url,seed.sources[2199].url);
  assert.equal(service.insightAnchor(topicId,sourceId).sourceStamp,sourceStamp(seed.sources[2199]));
  assert.equal(service.discussion(topicId).roots[0].id,rootId);
  assert.equal(service.discussionForContribution(topicId,rootId).roots[0].body,seed.contributions[999].revisions.at(-1).body);
  assert.throws(() => service.discussionForContribution(id("topic",998),rootId),code("not-found"));
  assert.deepEqual(service.priorDiscussions(sourceId).topics.map(topic => topic.id),[id("topic",0)]);
  assert.ok(service.related(sourceId,5).results.some(source => source.id === id("source",2198)));
  assert.deepEqual(service.accountContributions(ACCOUNT).map(entry => entry.id),[id("post",0),rootId,id("post",1199)]);
  assert.deepEqual(service.accountContributions(OTHER_ACCOUNT),[]);
  const context=service.catalogContext({sourceId,topicId});
  assert.ok(context.sources.some(source => source.id === sourceId));
  assert.ok(!context.topics.some(topic => topic.id === id("topic",0)),"fast canonical context omits optional historical metadata");
  const enriched=service.enrichment({sourceId,topicId,includeAlternate:false});
  assert.ok(enriched.catalog.topics.some(topic => topic.id === id("topic",0)),"same-Source historical metadata is available through enrichment");
  assert.ok(Buffer.byteLength(JSON.stringify(context))<1024*1024);
  const bootstrap=service.catalogContext({sourceId:null,topicId:null});
  assert.ok(bootstrap.sources.length<=100);
  assert.ok(Buffer.byteLength(JSON.stringify(bootstrap))<1024*1024);
  assert.throws(() => service.catalogContext({sourceId,topicId:id("topic",998)}),code("conflict"));
  const first=service.catalogPage({kind:"sources",limit:100,cursor:null});
  assert.equal(first.catalog.sources.length,100);
  assert.ok(!first.catalog.sources.some(source => source.id === sourceId),"exact Source is outside first catalog page");
  const second=service.catalogPage({kind:"sources",limit:100,cursor:first.nextCursor});
  assert.equal(second.catalog.sources.length,100);
  assert.equal(new Set([...first.catalog.sources,...second.catalog.sources].map(source => source.id)).size,200);
  for(const kind of ["topics","sources"]) {
    const received=[];
    let cursor=null;
    do {
      const page=service.catalogPage({kind,limit:100,cursor});
      assert.ok(page.catalog[kind].length<=100);
      assert.ok(Buffer.byteLength(JSON.stringify(page))<1024*1024);
      received.push(...page.catalog[kind].map(entry => entry.id));
      cursor=page.nextCursor;
    } while(cursor);
    assert.equal(received.length,seed[kind].length);
    assert.equal(new Set(received).size,seed[kind].length,"full paged catalog has no duplicates or gaps");
  }
  assert.throws(() => service.catalogPage({kind:"topics",limit:100,cursor:first.nextCursor}),code("invalid"));
  for(const input of [{kind:"sources",limit:101,cursor:null},{kind:"sources",limit:0,cursor:null},
    {kind:"contributions",limit:10,cursor:null},{kind:"topics",limit:10,cursor:"!"}])
    assert.throws(() => service.catalogPage(input),code("invalid"));
  const created=service.command(initial,{type:"create-root",topicId,originSourceId:sourceId,body:"New scoped root after 1200 retained messages"},ACCOUNT);
  const newId=created.result.contributionId;
  assert.equal(raw.counts().contributions,1201);
  assert.throws(() => service.catalogPage({kind:"sources",limit:100,cursor:first.nextCursor}),code("conflict"));
  assert.throws(() => service.command(initial,{type:"create-root",topicId,body:"Stale version"},ACCOUNT),code("conflict"));
  const reply=service.command(service.version(),{type:"reply",discussionId:`discussion-${topicId}`,rootId:newId,replyToId:null,
    originSourceId:sourceId,body:"Scoped human reply"},ACCOUNT);
  service.command(service.version(),{type:"edit",contributionId:newId,body:"Edited scoped root"},ACCOUNT);
  assert.equal(service.discussionForContribution(topicId,reply.result.contributionId).roots.find(root => root.id === newId).body,"Edited scoped root");
  service.command(service.version(),{type:"withdraw",contributionId:newId},ACCOUNT);
  const withdrawn=service.discussion(topicId).roots.find(root => root.id === newId);
  assert.equal(withdrawn.state,"deleted");
  assert.equal(withdrawn.replies[0].body,"Scoped human reply");
  assert.ok(service.accountContributions(ACCOUNT).every(entry => entry.id !== newId));
  const collision=serviceFor(repository,{nextId:() => id("source",5),now:() => "2026-10-12T01:00:00Z"});
  const beforeCollision=service.version();
  assert.throws(() => collision.command(beforeCollision,{type:"create-root",topicId,body:"Cross-collection identifier collision"},ACCOUNT),code("conflict"));
  assert.deepEqual(service.version(),beforeCollision);
  const incomplete=structuredClone(raw.readTopicState(topicId));
  const after=structuredClone(incomplete);
  incomplete.contributions=incomplete.contributions.filter(entry => entry.id !== reply.result.contributionId);
  after.contributions=after.contributions.filter(entry => entry.id !== reply.result.contributionId);
  after.contributions.find(entry => entry.id === rootId).revisions.push({body:"Incomplete closure must not commit",createdAt:"2026-10-12T02:00:00Z"});
  after.revision++;
  assert.throws(() => raw.saveScoped(service.version(),incomplete,after),code("conflict"));
  assert.deepEqual(service.version(),beforeCollision);

  const config={hostHeader:"127.0.0.1:4174",origin:`chrome-extension://${"b".repeat(32)}`,capability:"synthetic-scale-pairing-token-long-enough"};
  const handle=createRequestHandler({service,config,ai:{status:() => ({connected:false})}});
  const request=async (method,url,value,extra={}) => {
    const response=await handle({method,url,headers:{host:config.hostHeader,origin:config.origin,
      authorization:`Bearer ${config.capability}`,...(value===undefined?{}:{"content-type":"application/json"}),...extra},
      body:value===undefined?null:JSON.stringify(value)});
    return {status:response.status,value:JSON.parse(response.body)};
  };
  assert.deepEqual((await request("GET","/v1/version")).value,{version:service.version()});
  const routed=await request("POST","/v1/catalog/context",{sourceId,topicId});
  assert.equal(routed.status,200);
  assert.ok(routed.value.sources.some(source => source.id === sourceId));
  assert.equal((await request("POST","/v1/catalog/page",{kind:"sources",limit:100,cursor:null})).status,200);
  assert.equal((await request("POST","/v1/catalog/page",{kind:"sources",limit:100,cursor:first.nextCursor})).status,409);
  assert.equal((await request("POST","/v1/catalog/page",{kind:"topics",limit:100,cursor:first.nextCursor})).status,400);
  for(const route of ["/v1/version","/v1/catalog/context","/v1/catalog/page"]) {
    const method=route.endsWith("version")?"GET":"POST";
    const value=method==="GET"?undefined:route.endsWith("context")?{sourceId,topicId}:{kind:"sources",limit:10,cursor:null};
    assert.notEqual((await request(method,route,value,{authorization:"Bearer wrong"})).status,200);
    assert.notEqual((await request(method,route,value,{origin:"https://attacker.invalid"})).status,200);
  }
  assert.equal(fullLoads,0,"all selected public reads/posts remain independent of whole canonical serialization");
  // Exact vector ranking remains a paged vector scan. Ingest, learned regroup,
  // alternate whole-collection planning and global account erasure intentionally
  // keep separate full-state workflows; this test makes no scalability claim for them.
});

test("normalized exact/context/discussion/related reads preserve legacy service semantics", t => {
  const dir=directory(t),deps=deterministicDependencies();
  const seed=createDemoState({generation:deps.nextId("generation"),createdAt:deps.now(),sources:SYNTHETIC_SOURCES,topicSeeds:SYNTHETIC_TOPIC_SEEDS});
  const legacy=createSqliteRepository(path.join(dir.value,"legacy.sqlite"),seed);
  const normalized=createNormalizedSqliteRepository(path.join(dir.value,"normalized.sqlite"),seed);
  dir.closers.push(() => {legacy.close();normalized.close();});
  const old=serviceFor(legacy),current=serviceFor({...normalized,load() {throw new Error("whole read forbidden");}});
  const topicId="harbor-s2",sourceId=SYNTHETIC_SOURCES.find(source => source.topicId === topicId).id;
  for(const service of [old,current]) service.command({generation:seed.generation,revision:0},
    {type:"create-root",topicId,originSourceId:sourceId,body:"Equivalent synthetic post"},"demo-alex");
  assert.deepEqual(current.version(),old.version());
  assert.deepEqual(current.exactSource(sourceId),old.exactSource(sourceId));
  assert.deepEqual(current.insightAnchor(topicId,sourceId),old.insightAnchor(topicId,sourceId));
  assert.deepEqual(current.discussion(topicId),old.discussion(topicId));
  const contributionId=old.discussion(topicId).roots[0].id;
  assert.deepEqual(current.discussionForContribution(topicId,contributionId),old.discussionForContribution(topicId,contributionId));
  assert.deepEqual(current.priorDiscussions(sourceId),old.priorDiscussions(sourceId));
  assert.deepEqual(current.related(sourceId,5),old.related(sourceId,5));
  const context=current.catalogContext({sourceId,topicId}),catalog=old.catalogContext({sourceId,topicId});
  assert.deepEqual(context.version,catalog.version);
  assert.deepEqual(context.actors,catalog.actors);
  for(const source of context.sources) assert.deepEqual(source,catalog.sources.find(entry => entry.id === source.id));
  for(const topic of context.topics) assert.deepEqual(topic,catalog.topics.find(entry => entry.id === topic.id));
});

test("oversize discussions fall back to bounded public pages including tombstones and off-page references", async t => {
  const dir=directory(t),deps=deterministicDependencies();
  const seed=createDemoState({generation:deps.nextId("generation"),createdAt:deps.now(),sources:SYNTHETIC_SOURCES,topicSeeds:SYNTHETIC_TOPIC_SEEDS});
  const topicId="reserved-domain-demo",date="2026-10-12T00:00:00Z",discussionId=`discussion-${topicId}`;
  for(let i=0;i<145;i++) seed.contributions.push({id:id("root",i),discussionId,rootId:null,replyToId:null,
    authorId:"demo-alex",actorType:"human",visibility:"local-public",withdrawn:false,createdAt:date,
    anchor:{kind:"topic",topicId},originalTopicId:topicId,learnedOrigin:false,
    revisions:[{body:"界".repeat(8000),createdAt:date}]});
  Object.assign(seed.contributions[0],{withdrawn:true,authorId:null,revisions:[]});
  seed.contributions.push({id:"reply-offpage",discussionId,rootId:id("root",144),replyToId:id("root",144),
    authorId:"demo-alex",actorType:"human",visibility:"local-public",withdrawn:false,createdAt:date,
    revisions:[{body:"Visible reply with parent beyond the first page",createdAt:date}]});
  const raw=createNormalizedSqliteRepository(path.join(dir.value,"dense.sqlite"),seed);
  dir.closers.push(() => raw.close());
  const service=serviceFor({...raw,load() {throw new Error("whole load forbidden");}});
  assert.throws(() => service.discussion(topicId),code("capacity"));
  const first=service.discussionPage({topicId,limit:100,cursor:null});
  assert.ok(first.items.length<100,"UTF-8 byte budget reduces a count-bounded page");
  assert.ok(first.nextCursor);
  assert.ok(first.items.some(entry => entry.id === "reply-offpage"));
  assert.ok(!first.items.some(entry => entry.id === id("root",144)));
  const tombstone=first.items.find(entry => entry.id === id("root",0));
  assert.equal(tombstone.state,"deleted");
  assert.equal(Object.hasOwn(tombstone,"body"),false);
  const received=[];
  let cursor=null;
  do {
    const page=service.discussionPage({topicId,limit:100,cursor});
    assert.ok(Buffer.byteLength(JSON.stringify(page))<=1024*1024-4096);
    assert.ok(page.items.length<=100);
    assert.equal(JSON.stringify(page).includes('"embedding"'),false);
    assert.equal(JSON.stringify(page).includes('"anchor"'),false);
    assert.equal(JSON.stringify(page).includes('"revisions"'),false);
    received.push(...page.items.map(entry => entry.id));
    cursor=page.nextCursor;
  } while(cursor);
  assert.equal(received.length,seed.contributions.length);
  assert.equal(new Set(received).size,seed.contributions.length);
  assert.throws(() => service.discussionPage({topicId:"harbor-s2",limit:100,cursor:first.nextCursor}),code("conflict"));
  assert.throws(() => service.discussionPage({topicId,limit:99,cursor:first.nextCursor}),code("conflict"));
  for(const input of [{topicId,limit:101,cursor:null},{topicId,limit:0,cursor:null},{topicId,limit:100,cursor:"!"},
    {topicId,limit:100,cursor:null,actorId:"demo-alex"}]) assert.throws(() => service.discussionPage(input),code("invalid"));
  const config={hostHeader:"127.0.0.1:4174",origin:`chrome-extension://${"b".repeat(32)}`,capability:"synthetic-discussion-pairing-token-long-enough"};
  const handle=createRequestHandler({service,config});
  const request=async (value,extra={}) => handle({method:"POST",url:"/v1/discussions/page",headers:{host:config.hostHeader,
    origin:config.origin,authorization:`Bearer ${config.capability}`,"content-type":"application/json",...extra},body:JSON.stringify(value)});
  const response=await request({topicId,limit:100,cursor:null});
  assert.equal(response.status,200);
  assert.ok(Buffer.byteLength(response.body)<=1024*1024);
  assert.equal((await request({topicId,limit:101,cursor:null})).status,400);
  for(const extra of [{origin:"https://attacker.invalid"},{origin:""},{authorization:"Bearer wrong"}])
    assert.notEqual((await request({topicId,limit:100,cursor:null},extra)).status,200);
  service.command(service.version(),{type:"edit",contributionId:id("root",1),body:"Changed canonical revision"},"demo-alex");
  assert.throws(() => service.discussionPage({topicId,limit:100,cursor:first.nextCursor}),code("conflict"));
  assert.equal((await request({topicId,limit:100,cursor:first.nextCursor})).status,409);
});

test("catalog UTF-8 byte-adaptive pages retain every valid long Unicode Source without whole reads", t => {
  const dir=directory(t),deps=deterministicDependencies();
  const seed=createDemoState({generation:deps.nextId("generation"),createdAt:deps.now(),sources:SYNTHETIC_SOURCES,topicSeeds:SYNTHETIC_TOPIC_SEEDS});
  seed.sources=[];seed.sourceLinks=[];
  for(let i=0;i<125;i++) {
    seed.sources.push({id:id("unicode-source",i),url:`https://example.org/${"界".repeat(7800)}?item=${i}`,
      title:"界".repeat(512),embedding:null,provenance:"project-created-hand-authored-demo/1"});
    seed.sourceLinks.push({sourceId:id("unicode-source",i),topicId:"reserved-domain-demo",method:"fixture-confirmed"});
  }
  assert.ok(Buffer.byteLength(JSON.stringify(seed.sources.slice(0,100)))>1024*1024);
  const raw=createNormalizedSqliteRepository(path.join(dir.value,"unicode.sqlite"),seed);
  dir.closers.push(() => raw.close());
  const service=serviceFor({...raw,load() {throw new Error("whole read forbidden");}});
  const first=service.catalogPage({kind:"sources",limit:100,cursor:null});
  assert.ok(first.catalog.sources.length<100);
  assert.ok(first.nextCursor);
  assert.throws(() => service.catalogPage({kind:"sources",limit:99,cursor:first.nextCursor}),code("invalid"));
  const received=[];
  let cursor=null;
  do {
    const page=service.catalogPage({kind:"sources",limit:100,cursor});
    assert.ok(Buffer.byteLength(JSON.stringify(page))<=1024*1024-4096);
    assert.ok(page.catalog.sources.length>0);
    assert.ok(!JSON.stringify(page).includes('"embedding"'));
    received.push(...page.catalog.sources.map(source => source.id));cursor=page.nextCursor;
  } while(cursor);
  assert.deepEqual(received,seed.sources.map(source => source.id));
});

test("factory auto mode preserves legacy storage and opens already normalized files without conversion", t => {
  const dir=directory(t),legacyPath=path.join(dir.value,"legacy-auto.sqlite"),normalizedPath=path.join(dir.value,"normalized-auto.sqlite");
  let app=createSqliteDemoService({databasePath:legacyPath,...deterministicDependencies()});
  app.close();
  assert.throws(() => createSqliteDemoService({databasePath:legacyPath,storageMode:"normalized",...deterministicDependencies()}),code("storage-migration-required"));
  const legacyCheck=new DatabaseSync(legacyPath,{readOnly:true});
  assert.ok(legacyCheck.prepare("SELECT 1 FROM sqlite_master WHERE name='demo_state'").get());
  assert.equal(legacyCheck.prepare("SELECT 1 FROM sqlite_master WHERE name='canonical_meta'").get(),undefined);
  legacyCheck.close();
  app=createSqliteDemoService({databasePath:normalizedPath,storageMode:"normalized",...deterministicDependencies()});
  const version=app.service.version();app.close();
  app=createSqliteDemoService({databasePath:normalizedPath,...deterministicDependencies()});
  dir.closers.push(() => app.close());
  assert.deepEqual(app.service.version(),version);
  assert.ok(app.service.catalogPage({kind:"topics",limit:100,cursor:null}).catalog.topics.length>0);
});

test("normalized global ingest/regroup/forget/clear and account erasure retain their canonical semantics beyond old aggregate limits", t => {
  const dir=directory(t),seed=scaleState();
  const raw=createNormalizedSqliteRepository(path.join(dir.value,"global.sqlite"),seed);
  dir.closers.push(() => raw.close());
  let fullLoads=0;
  const service=serviceFor({...raw,load() {fullLoads++;return raw.load();}});
  const vector=angle => {const values=Array(384).fill(0);values[0]=Math.cos(angle);values[1]=Math.sin(angle);return values;};
  const input=(suffix,angle=0,extra={}) => ({expected:service.version(),operationId:`global-operation-${suffix}`,
    url:`https://example.org/synthetic-global-${suffix}`,title:`Synthetic global ${suffix}`,
    embedding:{modelId:BROWSER_MODEL_ID,values:vector(angle)},extractorVersion:EXTRACTOR_VERSION,...extra});
  const firstRequest=input("first"),first=service.ingest(firstRequest);
  assert.deepEqual(service.ingest(firstRequest),first,"operation receipts remain idempotent");
  const second=service.ingest(input("second",0.1));
  assert.equal(second.topicId,first.topicId);
  const root=service.command(service.version(),{type:"create-root",topicId:first.topicId,originSourceId:first.sourceId,
    body:"Learned source root retained through regrouping"},"demo-alex").result.contributionId;
  const reply=service.command(service.version(),{type:"reply",discussionId:service.discussion(first.topicId).discussionId,
    rootId:root,replyToId:root,originSourceId:second.sourceId,body:"Reply retains its own Source link"},"demo-alex").result.contributionId;
  const destination=id("topic",999);
  service.command(service.version(),{type:"correct-source",sourceId:first.sourceId,topicId:destination},"demo-alex");
  const moved=service.discussionForContribution(destination,root).roots.find(entry => entry.id === root);
  assert.equal(moved.id,root);
  assert.equal(moved.regrouped,true);
  assert.equal(moved.origin.sourceId,first.sourceId);
  assert.equal(moved.replies[0].id,reply);
  assert.equal(moved.replies[0].replyToId,root);
  assert.equal(moved.replies[0].origin.sourceId,second.sourceId,"reply origin does not select regroup destination");
  assert.equal(raw.readContribution(root).originalTopicId,first.topicId);
  const updated=service.ingest(input("first",Math.PI/2,{operationId:"global-operation-first-update"}));
  assert.equal(updated.sourceId,first.sourceId);
  assert.equal(updated.topicId,destination,"manual Source destination remains confirmed on representation replacement");
  assert.equal(raw.readContribution(root).anchor.kind,"topic","changed source representation pins the historical root");
  service.command(service.version(),{type:"forget-source",sourceId:first.sourceId},"demo-alex");
  assert.throws(() => service.exactSource(first.sourceId),code("not-found"));
  const forgotten=service.discussionForContribution(destination,root).roots.find(entry => entry.id === root);
  assert.equal(Object.hasOwn(forgotten,"origin"),false);
  assert.equal(forgotten.replies[0].origin.sourceId,second.sourceId);
  assert.equal(forgotten.replies[0].body,"Reply retains its own Source link");
  service.command(service.version(),{type:"clear-learned-data",confirmation:"CLEAR LEARNED DATA"},"demo-alex");
  assert.equal(raw.readContribution(root),null);
  assert.equal(raw.readContribution(reply),null);
  assert.throws(() => service.exactSource(second.sourceId),code("not-found"));
  assert.equal(raw.counts().contributions,1200,"clear removes learned-origin threads even after moving to a fixture Topic");
  assert.equal(raw.counts().sources,2600);
  assert.equal(raw.counts().topics,1200);
  assert.equal(raw.readContribution(id("post",500)).revisions.at(-1).body,seed.contributions[500].revisions.at(-1).body);
  const erased=service.withdrawAccountContributions(ACCOUNT);
  assert.equal(erased.withdrawn,3);
  assert.deepEqual(service.accountContributions(ACCOUNT),[]);
  for(const contributionId of [id("post",0),id("post",999),id("post",1199)]) {
    const entry=raw.readContribution(contributionId);
    assert.equal(entry.withdrawn,true);
    assert.equal(entry.authorId,null);
    assert.deepEqual(entry.revisions,[]);
    assert.equal(Object.hasOwn(entry,"insight"),false);
    assert.equal(Object.hasOwn(entry,"originSourceId"),false);
  }
  assert.equal(raw.readContribution(id("post",500)).withdrawn,false);
  assert.ok(Buffer.byteLength(JSON.stringify(raw.load()))>8*1024*1024);
  assert.ok(fullLoads>=7,"these global workflows deliberately use normalized full-state transitions, not scoped-read claims");
});

test("more than 500 historical Source destinations batch metadata while selected-only Insight headers omit dense roots and actor identity", t => {
  const dir=directory(t),date="2026-10-12T00:00:00Z",current=id("history-topic",620),sourceId="historical-shared-source";
  const seed={schema:"demo-state/v3",generation:"historical-source-batching",revision:0,
    topics:[],discussions:[],sources:[{id:sourceId,url:"https://example.org/synthetic-shared-history",title:"Synthetic Source history",
      embedding:null,provenance:"project-created-hand-authored-demo/1"}],
    sourceLinks:[{sourceId,topicId:current,method:"fixture-confirmed"}],contributions:[]};
  for(let i=0;i<=620;i++) {
    const topicId=id("history-topic",i),discussionId=`discussion-${topicId}`;
    seed.topics.push({id:topicId,title:`Historical discussion ${i}`,kind:"general",createdAt:date});
    seed.discussions.push({id:discussionId,topicId});
    if(i<620) seed.contributions.push({id:id("historical-root",i),discussionId,rootId:null,replyToId:null,
      authorId:"demo-alex",actorType:"human",visibility:"local-public",withdrawn:false,createdAt:date,
      anchor:{kind:"topic",topicId},originalTopicId:topicId,learnedOrigin:false,originSourceId:sourceId,
      revisions:[{body:`Earlier same-Source discussion ${i}`,createdAt:date}]});
  }
  for(let i=0;i<145;i++) seed.contributions.push({id:id("dense-current-root",i),discussionId:`discussion-${current}`,
    rootId:null,replyToId:null,authorId:"demo-alex",actorType:"human",visibility:"local-public",withdrawn:false,createdAt:date,
    anchor:{kind:"topic",topicId:current},originalTopicId:current,learnedOrigin:false,originSourceId:sourceId,
    revisions:[{body:"界".repeat(7900),createdAt:date}]});
  const raw=createNormalizedSqliteRepository(path.join(dir.value,"historical-many.sqlite"),seed);
  dir.closers.push(() => raw.close());
  const batches=[];
  let fullLoads=0,topicReads=0;
  const service=serviceFor({...raw,load() {fullLoads++;throw new Error("whole load forbidden");},
    readMetadataScope(input) {
      batches.push({topics:input.topicIds?.length??0,sources:input.sourceIds?.length??0});
      assert.ok((input.topicIds?.length??0)<=500);
      assert.ok((input.sourceIds?.length??0)<=500);
      return raw.readMetadataScope(input);
    },readTopicState(topicId) {topicReads++;return raw.readTopicState(topicId);}});
  assert.equal(service.priorDiscussions(sourceId).topics.length,620);
  const context=service.catalogContext({sourceId,topicId:current});
  assert.equal(context.topics.length,1,"fast context remains selected-Topic scoped");
  // Keep the dense canonical fixture intact for the separate Insight/body-cap
  // assertions. A second exact store exercises historical enrichment when its
  // mandatory canonical discussion fits the existing response budget.
  const boundedSeed={...seed,contributions:seed.contributions.filter(entry=>entry.discussionId!==`discussion-${current}`)};
  const bounded=createNormalizedSqliteRepository(path.join(dir.value,"historical-enrichment.sqlite"),boundedSeed);
  dir.closers.push(()=>bounded.close());
  const enrichmentService=serviceFor({...bounded,readMetadataScope(input) {
    batches.push({topics:input.topicIds?.length??0,sources:input.sourceIds?.length??0});
    assert.ok((input.topicIds?.length??0)<=500);assert.ok((input.sourceIds?.length??0)<=500);
    return bounded.readMetadataScope(input);
  }});
  const enriched=enrichmentService.enrichment({sourceId,topicId:current,includeAlternate:false});
  assert.equal(enriched.catalog.topics.length,621);
  assert.equal(new Set(enriched.catalog.topics.map(topic=>topic.id)).size,621);
  assert.ok(batches.some(batch => batch.topics === 500));
  assert.ok(batches.some(batch => batch.topics === 121));
  assert.ok(Buffer.byteLength(JSON.stringify(context))<1024*1024-4096);
  for(const actor of context.actors) assert.deepEqual(Object.keys(actor).sort(),["displayName","id","type"]);
  assert.equal(JSON.stringify(context).includes('"accountId"'),false);
  const selectedOnly=service.insightDiscussion(current,false);
  assert.deepEqual(selectedOnly.roots,[]);
  assert.equal(topicReads,0,"selected-only header reads exact metadata without any discussion bodies");
  assert.equal(JSON.stringify(selectedOnly).includes(ACCOUNT),false,"unrelated account actor identity is absent from Insight header");
  assert.equal(JSON.stringify(selectedOnly).includes(principal.displayName),false);
  assert.equal(JSON.stringify(selectedOnly).includes("Earlier same-Source discussion"),false);
  const included=service.insightDiscussion(current,true);
  assert.equal(topicReads,1);
  assert.equal(included.roots.length,145);
  assert.deepEqual({version:included.version,topic:included.topic,discussionId:included.discussionId},
    {version:selectedOnly.version,topic:selectedOnly.topic,discussionId:selectedOnly.discussionId});
  assert.ok(Buffer.byteLength(JSON.stringify(included))>1024*1024,"internal opt-in view has a stable header despite an oversize full HTTP DTO");
  assert.throws(() => service.discussion(current),code("capacity"));
  assert.equal(fullLoads,0);
});
