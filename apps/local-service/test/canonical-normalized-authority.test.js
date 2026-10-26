import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { AccountRepository } from "../src/accounts/account-repository.js";
import { AccountService } from "../src/accounts/account-service.js";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
import { createFixtureRankingAdapter } from "../src/adapters/fixture-ranking.js";
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from "../src/adapters/fixture-catalog.js";
import { createDiscussionService } from "../src/application/discussion-service.js";
import { createDemoState } from "../src/domain/demo-state.js";
import { createChatGPTRuntime } from "../src/ai/chatgpt-runtime.js";
import { createPrivateDiscussionService } from "../src/private/private-service.js";
import { createRequestHandler } from "../src/http/request-handler.js";
import { buildInsightContext } from "../../../spikes/topic-resolution/browser/core/insight-context.js";
import { deterministicDependencies } from "./helpers.js";

const TOPIC="reserved-domain-demo",SOURCE="extra-source-119",URL="https://example.org/normalized-authority-119";

test("normalized accounts, public off-page target proof and private one-shot replies compose without whole reads", async t => {
  const dir=mkdtempSync(path.join(tmpdir(),"murmingle-normalized-authority-"));
  const deps=deterministicDependencies();
  const seed=createDemoState({generation:deps.nextId("generation"),createdAt:deps.now(),sources:SYNTHETIC_SOURCES,topicSeeds:SYNTHETIC_TOPIC_SEEDS});
  for(let i=0;i<120;i++) {
    const sourceId=`extra-source-${String(i).padStart(3,"0")}`;
    seed.sources.push({id:sourceId,url:`https://example.org/normalized-authority-${i}`,title:`Synthetic authority Source ${i}`,
      embedding:null,provenance:"project-created-hand-authored-demo/1"});
    seed.sourceLinks.push({sourceId,topicId:TOPIC,method:"fixture-confirmed"});
  }
  const date="2026-10-12T00:00:00Z";
  for(let i=0;i<145;i++) seed.contributions.push({id:`offpage-root-${String(i).padStart(3,"0")}`,
    discussionId:`discussion-${TOPIC}`,rootId:null,replyToId:null,authorId:"demo-alex",actorType:"human",
    visibility:"local-public",withdrawn:false,createdAt:date,anchor:{kind:"topic",topicId:TOPIC},
    originalTopicId:TOPIC,learnedOrigin:false,originSourceId:SOURCE,revisions:[{body:`Selected public root ${i} `+"界".repeat(7900),createdAt:date}]});
  let identity={issuer:"https://auth.openai.com",clientId:"oaiapp_normalized_fixture",subject:"alice-fixture"};
  const accountRepo=new AccountRepository({filename:path.join(dir,"accounts.sqlite")});
  const accounts=new AccountService({repository:accountRepo,hmacKey:Buffer.alloc(32,24),mailSink:null,fixtureOnly:false,
    chatgptIdentity:() => identity});
  const raw=createNormalizedSqliteRepository(path.join(dir,"canonical.sqlite"),seed);
  let loads=0;
  const service=createDiscussionService({repository:{...raw,load() {loads++;throw new Error("whole canonical read forbidden");}},
    ranking:createFixtureRankingAdapter(),sources:SYNTHETIC_SOURCES,topicSeeds:SYNTHETIC_TOPIC_SEEDS,...deps,
    resolveAccountActor:accountId => accounts.principalForAccountId(accountId),readAccountActors:() => accounts.publicActors()});
  const providerCalls=[];
  const ai=createChatGPTRuntime({service,connectionAdapter:{accountIdentity:() => identity,
    status:() => ({connected:true,planEnabled:true,account:{clientId:identity.clientId,label:"Synthetic identity"}}),dispose() {}},
    insightsAdapter:{async createInsight(value,options) {providerCalls.push({value,options});return {body:"Synthetic exact generated answer",citations:[],model:"fixture"};},
      cancel() {},dispose() {},async listModels() {return [];}}});
  let privateService=createPrivateDiscussionService({databasePath:path.join(dir,"private.sqlite"),ai,publicService:service,
    canGenerate:() => true,...deterministicDependencies()});
  t.after(() => {privateService.close();ai.dispose();raw.close();accountRepo.close();rmSync(dir,{recursive:true,force:true});});
  const config={hostHeader:"127.0.0.1:4174",origin:`chrome-extension://${"b".repeat(32)}`,capability:"synthetic-normalized-authority-pairing"};
  const handle=createRequestHandler({service,accounts,ai,config,accountWrites:true,privateDiscussions:privateService});
  const request=async (url,body,token,extra={}) => {
    const response=await handle({method:"POST",url,headers:{host:config.hostHeader,origin:config.origin,
      authorization:`Bearer ${config.capability}`,"content-type":"application/json",...(token?{"x-account-session":token}:{}),...extra},
      body:JSON.stringify(body)});
    return {status:response.status,value:JSON.parse(response.body)};
  };
  const login=async (subject,username) => {
    identity={...identity,subject};
    const signed=await request("/v1/account/chatgpt",{});assert.equal(signed.status,200);
    const token=signed.value.session.accessToken;
    assert.equal((await request("/v1/account/username",{username},token)).status,200);
    return {token,actorId:`account-${signed.value.account.id}`,principal:accounts.resolvePrincipal(token)};
  };
  const command=(token,command) => request("/v1/commands",{expected:service.version(),command},token);
  const alice=await login("alice-fixture","Alice");
  const created=await command(alice.token,{type:"create-root",topicId:TOPIC,originSourceId:SOURCE,body:"Account-owned public message"});
  assert.equal(created.status,200);
  const ownId=created.value.result.contributionId;
  const bob=await login("bob-fixture","Bob");
  for(const change of [{type:"edit",contributionId:ownId,body:"Foreign edit"},{type:"withdraw",contributionId:ownId}])
    assert.notEqual((await command(bob.token,change)).status,200);
  assert.equal(service.accountContributions(alice.actorId)[0].id,ownId);
  assert.deepEqual(service.accountContributions(bob.actorId),[]);
  identity={...identity,subject:"alice-fixture"};
  const catalog=service.catalogContext({sourceId:SOURCE,topicId:TOPIC});
  assert.ok(catalog.sources.some(source => source.id === SOURCE));
  assert.ok(!service.catalogPage({kind:"sources",limit:100,cursor:null}).catalog.sources.some(source => source.id === SOURCE));
  const target="offpage-root-144";
  const page=service.discussionPage({topicId:TOPIC,limit:25,cursor:null});
  assert.ok(!page.items.some(entry => entry.id === target));
  const contextInputs={catalog,discussion:service.discussionForContribution(TOPIC,target),related:service.related(SOURCE,20),
    sourceId:SOURCE,topicId:TOPIC,includeDiscussion:false};
  const choices=buildInsightContext({...contextInputs,sourceLimit:21});
  const context=buildInsightContext({...contextInputs,sourceLimit:6,
    allowedRelatedSourceIds:[...choices.sameTopicSources,...choices.relatedSources].map(source => source.id)});
  const generation={operationId:"normalized-offpage",model:"fixture",context,articleText:"Eligible bounded public page",
    allowWebResearch:false,expected:service.version(),followupQuestionId:target};
  assert.equal((await request("/v1/ai/insights",generation,alice.token)).status,200);
  for(let i=0;i<5;i++) await Promise.resolve();
  assert.equal(ai.result({operationId:generation.operationId},alice.actorId).state,"completed");
  assert.equal(providerCalls.length,1);
  assert.equal(providerCalls[0].value.followup.questionBody.length,2000);
  assert.equal(providerCalls[0].value.followup.parentBody.length,2000);
  assert.ok(!JSON.stringify(providerCalls[0]).includes("Selected public root 143"));
  const share={type:"share-insight-reply",operationId:generation.operationId,topicId:TOPIC,originSourceId:SOURCE,
    discussionId:`discussion-${TOPIC}`,rootId:target,replyToId:target,body:"Synthetic exact generated answer"};
  assert.notEqual((await command(bob.token,share)).status,200);
  assert.notEqual((await command(alice.token,{...share,body:"Changed generated text"})).status,200);
  assert.notEqual((await command(alice.token,{...share,replyToId:"offpage-root-143"})).status,200);
  assert.notEqual((await command(alice.token,{...share,originSourceId:"extra-source-118"})).status,200);
  const accepted=await command(alice.token,share);assert.equal(accepted.status,200);
  assert.notEqual((await command(alice.token,share)).status,200);
  const generated=service.discussionForContribution(TOPIC,accepted.value.result.contributionId).roots.find(root => root.id === target).replies[0];
  assert.equal(generated.insight.operatorId,alice.actorId);
  assert.equal(generated.actorType,"agent");
  const invalidated={...generation,operationId:"normalized-target-edit",expected:service.version()};
  assert.equal((await request("/v1/ai/insights",invalidated,alice.token)).status,200);
  for(let i=0;i<5;i++) await Promise.resolve();
  const oldBody=service.discussionForContribution(TOPIC,target).roots[0].body;
  service.command(service.version(),{type:"edit",contributionId:target,body:oldBody.slice(0,-1)+"A"},"demo-alex");
  assert.equal(ai.result({operationId:invalidated.operationId},alice.actorId).error,"stale-context",
    "full target body edit beyond the bounded provider prefix invalidates generated proof");
  assert.notEqual((await command(alice.token,{...share,operationId:invalidated.operationId})).status,200);

  const privateRoot=privateService.create(alice.principal,{operationId:"private-normalized",body:"PRIVATE_NOT_PUBLIC",
    sourceId:SOURCE,sourceUrl:URL});
  const privateGeneration={model:"fixture",context,articleText:"Eligible bounded public page",allowWebResearch:false,expected:service.version()};
  privateService.generate(alice.principal,{conversationId:privateRoot.conversationId,messageId:privateRoot.messageId,
    expectedRevision:privateRoot.revision,generation:privateGeneration});
  await privateService.whenIdle();
  const first=privateService.read(alice.principal,{conversationId:privateRoot.conversationId,after:null,limit:25});
  const parent=first.messages.find(message => message.actorType === "agent");
  assert.ok(parent);
  const reply={operationId:"private-one-shot",conversationId:privateRoot.conversationId,replyToId:parent.id,
    expectedRevision:first.conversation.revision,body:"Q".repeat(3000),generation:privateGeneration};
  privateService.send(alice.principal,reply);
  assert.equal(privateService.send(alice.principal,reply).replayed,true);
  await privateService.whenIdle();
  assert.equal(providerCalls.length,4,"two deliberate public, one initial private and one automatic own-AI follow-up only");
  assert.equal(providerCalls[3].value.followup.questionBody.length,2000);
  assert.equal(providerCalls[3].options.suppressDebug,true);
  assert.equal(JSON.stringify(providerCalls[3]).includes("PRIVATE_NOT_PUBLIC"),false);
  assert.throws(() => privateService.read(bob.principal,{conversationId:privateRoot.conversationId,after:null,limit:25}),
    error => error.code === "not-found");
  assert.equal(JSON.stringify(service.accountContributions(alice.actorId)).includes("PRIVATE_NOT_PUBLIC"),false);
  assert.equal(raw.counts().contributions,147,"private data never changes canonical public counts");
  privateService.close();
  privateService=createPrivateDiscussionService({databasePath:path.join(dir,"private.sqlite"),ai,publicService:service,
    canGenerate:() => true,...deterministicDependencies()});
  await privateService.whenIdle();
  assert.equal(privateService.read(alice.principal,{conversationId:privateRoot.conversationId,after:null,limit:25}).messages.length,4);
  assert.equal(providerCalls.length,4,"reopening private storage never redispatches durable generation claims");
  assert.equal(loads,0);
});
