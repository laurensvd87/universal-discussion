import assert from "node:assert/strict";
import test from "node:test";
import { AccountRepository } from "../src/accounts/account-repository.js";
import { AccountService } from "../src/accounts/account-service.js";
import { createAccountLifecycle } from "../src/accounts/account-lifecycle.js";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
import { createMemoryRepository } from "../src/adapters/memory-repository.js";
import { createDiscussionService } from "../src/application/discussion-service.js";
import { createFixtureRankingAdapter } from "../src/adapters/fixture-ranking.js";
import { createDemoState, IMPORTED_INSIGHT_AUTHOR_ID } from "../src/domain/demo-state.js";
import { createRequestHandler } from "../src/http/request-handler.js";
import { deterministicDependencies } from "./helpers.js";

const DATE="2026-10-12T00:00:00.000Z", TOPIC="my-topic";
function contribution(id,actorId,{rootId=null,replyToId=rootId,agent=false,body=id,withdrawn=false,createdAt=DATE,sourceId="public-source"}={}) {
  return {id,discussionId:`discussion-${TOPIC}`,rootId,replyToId,authorId:withdrawn?null:agent?IMPORTED_INSIGHT_AUTHOR_ID:actorId,
    actorType:agent?"agent":"human",visibility:"local-public",withdrawn,createdAt,
    ...(agent&&!withdrawn?{insight:{kind:"generated",operatorId:actorId}}:{}),
    ...(!withdrawn&&sourceId?{originSourceId:sourceId}:{}),
    ...(rootId===null?{anchor:{kind:"topic",topicId:TOPIC},originalTopicId:TOPIC,learnedOrigin:false}:{}),
    revisions:withdrawn?[]:[{body,createdAt}]};
}
function fixture(t,{normalized=true,extra=()=>[]}={}) {
  let identity={issuer:"https://auth.openai.com",clientId:"oaiapp_my_chats_fixture",subject:"alice"};
  const accountRepository=new AccountRepository({filename:":memory:"});
  const accounts=new AccountService({repository:accountRepository,hmacKey:Buffer.alloc(32,45),mailSink:null,fixtureOnly:false,chatgptIdentity:()=>identity});
  function login(subject,username) {
    identity={...identity,subject};const result=accounts.signInChatGPT({});
    accounts.setUsername(result.session.accessToken,{username});
    return {actorId:`account-${result.account.id}`,token:result.session.accessToken};
  }
  const alice=login("alice","Alice"),bob=login("bob","Bob");
  const seed=createDemoState({generation:"my-chats-generation",createdAt:DATE,topicSeeds:[{id:TOPIC,title:"Topic fallback",kind:"general"},{id:"moved-topic",title:"Moved",kind:"general"}],
    sources:[{id:"public-source",url:"https://example.org/my-chats",title:"Public source",embedding:null,provenance:"fixture",topicId:TOPIC},
      {id:"unsafe-source",url:"http://127.0.0.1/private",title:"Never emit",embedding:null,provenance:"fixture",topicId:TOPIC}]});
  seed.schema="demo-state/v3";
  seed.contributions=[
    contribution("own-root",alice.actorId,{body:"Own opening\nquestion"}),
    contribution("other-reply",bob.actorId,{rootId:"own-root"}),
    contribution("other-root",bob.actorId),
    contribution("own-human-reply",alice.actorId,{rootId:"other-root"}),
    contribution("bot-root",alice.actorId,{agent:true,createdAt:"2026-10-12T01:00:00.000Z"}),
    contribution("other-bot-root",bob.actorId,{agent:true}),
    contribution("foreign-root",bob.actorId),
    contribution("own-bot-reply",alice.actorId,{agent:true,rootId:"foreign-root",createdAt:"2026-10-12T02:00:00.000Z"}),
    contribution("legacy-root","demo-alex"),
    contribution("legacy-bot","demo-alex",{agent:true}),
    contribution("deleted-root",bob.actorId,{withdrawn:true}),
    contribution("dead-parent",bob.actorId,{rootId:"deleted-root",withdrawn:true}),
    contribution("surviving-child",alice.actorId,{rootId:"deleted-root",replyToId:"dead-parent"}),
    contribution("dead-leaf",bob.actorId,{rootId:"deleted-root",withdrawn:true}),
    contribution("dead-chain",bob.actorId,{rootId:"deleted-root",replyToId:"dead-leaf",withdrawn:true}),
    contribution("withdrawn-own",alice.actorId,{withdrawn:true}),
    contribution("unsafe-own",alice.actorId,{sourceId:"unsafe-source"}),
    ...extra(alice,bob),
  ];
  const raw=normalized?createNormalizedSqliteRepository(":memory:",seed):createMemoryRepository(seed);
  let loads=0,allowLoads=false;
  const repository=normalized?{...raw,load(){loads++;if(!allowLoads)throw new Error("whole-state read forbidden");return raw.load();},
    accountContributions(){throw new Error("account-wide revisions read forbidden");}}:raw;
  const service=createDiscussionService({repository,ranking:createFixtureRankingAdapter(),sources:[],topicSeeds:[],...deterministicDependencies(),
    resolveAccountActor:id=>accounts.principalForAccountId(id)});
  const lifecycle=createAccountLifecycle({accounts,service});
  const config={hostHeader:"127.0.0.1:4174",origin:`chrome-extension://${"b".repeat(32)}`,capability:"my-chats-fixture-pairing"};
  const handle=createRequestHandler({service,accounts,config,accountWrites:true,accountLifecycle:lifecycle});
  async function request(path,body,token=alice.token,extra={}) {
    const response=await handle({method:"POST",url:path,headers:{host:config.hostHeader,origin:config.origin,
      authorization:`Bearer ${config.capability}`,"content-type":"application/json",...(token?{"x-account-session":token}:{}),...extra},body:JSON.stringify(body)});
    return {status:response.status,value:JSON.parse(response.body)};
  }
  t.after(()=>{raw.close?.();accountRepository.close();});
  return {alice,bob,accounts,raw,service,request,loads:()=>loads,allowLoads:()=>{allowLoads=true;},
    identity:subject=>{identity={...identity,subject};},
    list:(after=null,limit=25,actorId=alice.actorId)=>service.accountPublicChats(actorId,{after,limit}),
    read:(rootId,after=null,limit=25,actorId=alice.actorId)=>service.accountPublicChat(actorId,{rootId,after,limit})};
}

for(const normalized of [true,false]) test(`public My chats has strict human/bot/reply ownership and whitelisted display DTOs (${normalized?"normalized":"legacy"})`,t=>{
  const f=fixture(t,{normalized});
  const result=f.list();
  assert.deepEqual(new Set(result.chats.map(chat=>chat.id)),new Set(["own-root","other-root","bot-root","foreign-root","deleted-root","unsafe-own"]));
  assert.equal(result.chats[0].id,"foreign-root","latest bot reply activity orders the root first");
  const own=result.chats.find(chat=>chat.id==="own-root");assert.equal(own.title,"Own opening question");
  assert.equal(own.ownedHuman,true);assert.equal(own.ownedAgent,false);
  const bot=result.chats.find(chat=>chat.id==="bot-root");assert.equal(bot.ownedHuman,false);assert.equal(bot.ownedAgent,true);
  const foreign=result.chats.find(chat=>chat.id==="foreign-root");assert.equal(foreign.ownedHuman,false);assert.equal(foreign.ownedAgent,true);
  assert.equal(result.chats.find(chat=>chat.id==="unsafe-own").sourceUrl,null);
  assert.equal(result.chats.find(chat=>chat.id==="unsafe-own").sourceId,null);
  assert.equal(result.chats.find(chat=>chat.id==="deleted-root").title,"Topic fallback");
  assert.deepEqual(Object.keys(own).sort(),["id","visibility","topicId","discussionId","title","sourceId","sourceUrl","createdAt","updatedAt","actorType","ownedHuman","ownedAgent"].sort());
  const conversation=f.read("own-root");assert.deepEqual(conversation.messages.map(message=>message.id),["other-reply","own-root"]);
  const human=conversation.messages.find(message=>message.id==="own-root");assert.equal(human.authorLabel,"Alice");assert.equal(human.body,"Own opening\nquestion");
  assert.equal(f.read("bot-root").messages[0].authorLabel,"Alice","agent provenance uses its actual public operator handle");
  assert.deepEqual(Object.keys(human).sort(),["id","replyToId","actorType","state","body","createdAt","authorLabel","sourceUrl"].sort());
  const tombstones=f.read("deleted-root");assert.deepEqual(new Set(tombstones.messages.map(message=>message.id)),new Set(["deleted-root","dead-parent","surviving-child"]));
  for(const deleted of tombstones.messages.filter(message=>message.state==="deleted")) {assert.equal(deleted.body,"");assert.equal(deleted.sourceUrl,null);assert.equal(deleted.authorLabel,"Deleted by user");}
  for(const id of ["other-bot-root","legacy-root","legacy-bot","withdrawn-own","own-human-reply","private-fixture-id"])
    assert.throws(()=>f.read(id),error=>error.code==="not-found");
  assert.throws(()=>f.list(null,25,"demo-alex"),error=>error.code==="forbidden");
  assert.equal(f.loads(),0);
});

test("signed pages bind account, canonical revision, route, root and limit with no gaps",t=>{
  const f=fixture(t);const ids=[];let after=null;
  do {const page=f.list(after,2);ids.push(...page.chats.map(chat=>chat.id));after=page.next;} while(after!==null);
  assert.equal(ids.length,6);assert.equal(new Set(ids).size,6);assert.deepEqual(ids,f.list().chats.map(chat=>chat.id));
  const cursor=f.list(null,1).next;
  assert.throws(()=>f.list(cursor,1,f.bob.actorId),error=>error.code==="conflict");
  assert.throws(()=>f.list(cursor,2),error=>error.code==="conflict");
  assert.throws(()=>f.read("own-root",cursor,1),error=>error.code==="conflict");
  const readCursor=f.read("own-root",null,1).next;
  assert.throws(()=>f.read("other-root",readCursor,1),error=>error.code==="conflict");
  const first=f.read("own-root",null,1),second=f.read("own-root",first.next,1);
  assert.deepEqual([...first.messages,...second.messages],f.read("own-root").messages);assert.equal(second.next,null);
  const malformed=cursor.slice(0,-1)+(cursor.endsWith("A")?"B":"A");
  assert.throws(()=>f.list(malformed,1),error=>["invalid","conflict"].includes(error.code));
  f.service.command(f.service.version(),{type:"edit",contributionId:"own-root",body:"Current edited body"},f.alice.actorId);
  assert.throws(()=>f.list(cursor,1),error=>error.code==="conflict");
  assert.throws(()=>f.read("own-root",readCursor,1),error=>error.code==="conflict");
  assert.equal(f.read("own-root").messages.find(message=>message.id==="own-root").body,"Current edited body");assert.equal(f.loads(),0);
});

test("paired exact-Origin named sessions gate public My chats and cannot inject owner IDs",async t=>{
  const f=fixture(t),path="/v1/account/public-chats/list",body={after:null,limit:25};
  assert.equal((await f.request(path,body)).status,200);
  assert.notEqual((await f.request(path,body,null)).status,200);
  assert.notEqual((await f.request(path,body,f.alice.token,{origin:"https://evil.example"})).status,200);
  assert.notEqual((await f.request(path,body,f.alice.token,{origin:undefined})).status,200);
  assert.notEqual((await f.request(path,body,f.alice.token,{authorization:"Bearer wrong-pairing"})).status,200);
  assert.notEqual((await f.request(path,body,f.alice.token,{"x-demo-actor":"demo-alex"})).status,200);
  assert.notEqual((await f.request(path,{...body,actorId:f.bob.actorId})).status,200);
  assert.equal((await f.request("/v1/account/public-chats/read",{rootId:"bot-root",after:null,limit:25},f.bob.token)).status,404);
  f.identity("pending-name");const pending=f.accounts.signInChatGPT({});
  assert.notEqual((await f.request(path,body,pending.session.accessToken)).status,200);
  f.accounts.logout(f.alice.token);
  assert.notEqual((await f.request(path,body)).status,200);
  assert.equal(f.loads(),0);assert.ok(pending.session.accessToken);
});

test("withdrawal removes ownership, regroup derives current destination, erasure revokes old account",async t=>{
  const f=fixture(t);const before=f.list(null,1).next;
  f.service.command(f.service.version(),{type:"withdraw",contributionId:"own-human-reply"},f.alice.actorId);
  assert.equal(f.list().chats.some(chat=>chat.id==="other-root"),false);
  assert.throws(()=>f.read("other-root"),error=>error.code==="not-found");
  assert.throws(()=>f.list(before,1),error=>error.code==="conflict");
  // Trusted fixture regroup exercises existing canonical successor rules.
  const state=f.raw.load(),next=structuredClone(state);
  for(const entry of next.contributions.filter(entry=>entry.id==="own-root"||entry.rootId==="own-root")) {
    entry.discussionId="discussion-moved-topic";
    if(entry.rootId===null)entry.anchor={kind:"topic",topicId:"moved-topic"};
  }
  next.revision++;f.raw.save(f.raw.version(),next);
  const moved=f.read("own-root").conversation;assert.equal(moved.topicId,"moved-topic");assert.equal(moved.discussionId,"discussion-moved-topic");
  f.allowLoads();
  const removed=await f.request("/v1/account/delete",{confirmation:"DELETE MY ACCOUNT"});assert.equal(removed.status,200);
  assert.notEqual((await f.request("/v1/account/public-chats/list",{after:null,limit:25})).status,200);
  assert.equal(f.list().chats.length,0,"withdrawn human and bot bodies no longer provide membership");
  assert.ok(f.read("own-root",null,25,f.bob.actorId).messages.some(message=>message.id==="other-reply"));
});

test("normalized large inventory pages current bodies without whole snapshots or historical revision reads",t=>{
  const f=fixture(t,{extra:(alice,bob)=>Array.from({length:75},(_,i)=>[
    contribution(`scale-root-${String(i).padStart(3,"0")}`,alice.actorId,{createdAt:`2026-10-12T03:${String(i%60).padStart(2,"0")}:00.000Z`}),
    ...Array.from({length:20},(_,j)=>contribution(`scale-reply-${i}-${j}`,bob.actorId,{rootId:`scale-root-${String(i).padStart(3,"0")}`,body:"x".repeat(7000)})),
  ]).flat()});
  const ids=[];let after=null;
  do {const page=f.list(after);assert.ok(page.chats.length<=25);ids.push(...page.chats.map(chat=>chat.id));after=page.next;}while(after!==null);
  assert.equal(ids.length,81);assert.equal(new Set(ids).size,81);
  const selected="scale-root-000";const messages=[];after=null;
  do {const page=f.read(selected,after,7);assert.ok(page.messages.length<=7);messages.push(...page.messages);after=page.next;}while(after!==null);
  assert.equal(messages.length,21);assert.equal(new Set(messages.map(message=>message.id)).size,21);
  assert.ok(messages.every(message=>!Object.hasOwn(message,"insight")&&!Object.hasOwn(message,"authorId")&&!Object.hasOwn(message,"revisions")));
  assert.equal(f.loads(),0);assert.ok(f.raw.counts().contributions>1500);
});
