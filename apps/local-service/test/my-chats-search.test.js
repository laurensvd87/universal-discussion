import assert from "node:assert/strict";
import test from "node:test";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
import { createMemoryRepository } from "../src/adapters/memory-repository.js";
import { createAccountPublicChats, normalizeMyChatsQuery } from "../src/application/account-public-chats.js";
import { createPrivateDiscussionService } from "../src/private/private-service.js";
import { createDemoState, IMPORTED_INSIGHT_AUTHOR_ID } from "../src/domain/demo-state.js";
import { readAccountPublicChatsRequest } from "../../../spikes/topic-resolution/browser/core/community-contract.js";

const ALICE={id:"account-11111111-1111-4111-8111-111111111111",accountId:"11111111-1111-4111-8111-111111111111",displayName:"Alice",type:"human",demo:false};
const BOB={...ALICE,id:"account-22222222-2222-4222-8222-222222222222",accountId:"22222222-2222-4222-8222-222222222222",displayName:"Bob"};
const DATE="2026-10-12T00:00:00.000Z", conflict=error=>error.code==="conflict";
function contribution(id,authorId,body,{rootId=null,agent=false,withdrawn=false,history=[],sourceId="source"}={}) {
  return {id,discussionId:"discussion-topic",rootId,replyToId:rootId,authorId:withdrawn?null:agent?IMPORTED_INSIGHT_AUTHOR_ID:authorId,
    actorType:agent?"agent":"human",visibility:"local-public",withdrawn,createdAt:DATE,
    ...(agent&&!withdrawn?{insight:{kind:"generated",operatorId:authorId}}:{}),
    ...(!withdrawn?{originSourceId:sourceId}:{}),
    ...(rootId===null?{anchor:{kind:"topic",topicId:"topic"},originalTopicId:"topic",learnedOrigin:false}:{}),
    revisions:withdrawn?[]:[...history.map(body=>({body,createdAt:DATE})),{body,createdAt:DATE}]};
}
function publicFixture(t,normalized=true) {
  const seed=createDemoState({generation:"search-generation",createdAt:DATE,topicSeeds:[{id:"topic",title:"Astronomy",kind:"general"}],sources:[
    {id:"source",url:"https://example.com/",title:"Telescope guide",embedding:null,provenance:"fixture",topicId:"topic"},
    {id:"unsafe-source",url:"http://127.0.0.1/private",title:"unsafe_metadata_secret",embedding:null,provenance:"fixture",topicId:"topic"}]});
  seed.schema="demo-state/v3";
  seed.contributions=[contribution("own",ALICE.id,"Solar OR %_* literal",{history:["obsolete_history_secret"]}),
    contribution("foreign",BOB.id,"foreign_only_secret"),contribution("legacy","demo-alex","legacy_only_secret"),
    contribution("participated",BOB.id,"Other opener"),contribution("reply",ALICE.id,"Mars replyneedle",{rootId:"participated"}),
    contribution("bot",ALICE.id,"Venus botneedle",{agent:true}),
    contribution("bot-participated",BOB.id,"Alien"),contribution("bot-reply",ALICE.id,"Jupiter assistantneedle",{rootId:"bot-participated",agent:true}),
    contribution("withdrawn",ALICE.id,"withdrawn_secret",{withdrawn:true}),
    contribution("unsafe",ALICE.id,"Safe body",{sourceId:"unsafe-source"}),
    ...Array.from({length:61},(_,index)=>contribution(`page-${String(index).padStart(3,"0")}`,ALICE.id,"paginationneedle"))];
  const raw=normalized?createNormalizedSqliteRepository(":memory:",seed):createMemoryRepository(seed);
  t.after(()=>raw.close?.());
  const repository=normalized?{...raw,load(){throw Error("snapshot forbidden");},accountContributions(){throw Error("history forbidden");}}:raw;
  const chats=createAccountPublicChats({repository,authorLabel:()=>"Alice"});
  return {raw,chats,list:(query,after=null,limit=25,actor=ALICE.id)=>chats.list(actor,{after,limit,...(query===undefined?{}:{query})})};
}
for(const normalized of [true,false]) test(`search finds current own root/reply/operator across full inventory (${normalized})`,t=>{
  const f=publicFixture(t,normalized);
  for(const [query,id] of [["Solar","own"],["Mars replyneedle","participated"],["Venus botneedle","bot"],["Jupiter assistantneedle","bot-participated"],["%_* OR","own"]])
    assert.deepEqual(f.list(query).chats.map(chat=>chat.id),[id]);
  for(const query of ["foreign_only_secret","legacy_only_secret","obsolete_history_secret","withdrawn_secret","unsafe_metadata_secret","Solar unrelated","*","%","OR"])
    assert.equal(f.list(query).chats.length,["*","%","OR"].includes(query)?1:0,query);
  assert.ok(f.list("Astronomy").chats.length);assert.ok(f.list("Telescope").chats.length);
  assert.deepEqual(f.list(" \u2003\t\n").chats,f.list().chats);
  const ids=[];let after=null;
  do {const page=f.list("paginationneedle",after);ids.push(...page.chats.map(chat=>chat.id));after=page.next;}while(after);
  assert.equal(ids.length,61);assert.equal(new Set(ids).size,61);
  const cursor=f.list("paginationneedle",null,1).next;
  assert.throws(()=>f.list("different",cursor,1),conflict);assert.throws(()=>f.list("paginationneedle",cursor,2),conflict);
  assert.throws(()=>f.list("paginationneedle",cursor,1,BOB.id),conflict);
  assert.throws(()=>f.chats.read(ALICE.id,{rootId:"own",after:cursor,limit:1}),conflict);
  const state=structuredClone(f.raw.load());state.revision++;f.raw.save(f.raw.version?.()??{generation:state.generation,revision:state.revision-1},state);
  assert.throws(()=>f.list("paginationneedle",cursor,1),conflict);
});

test("query optional packet, whitespace, strict objects and Unicode boundaries",t=>{
  const f=publicFixture(t);
  assert.deepEqual(readAccountPublicChatsRequest("list",{after:null,limit:25}),{after:null,limit:25});
  assert.equal(normalizeMyChatsQuery("  Mars\u2003reply\tneedle  "),"Mars reply needle");
  assert.equal(normalizeMyChatsQuery("🌞"),"🌞");
  for(const query of [undefined,null,42,"a".repeat(257),"\ud800","\udfff","bad\u202etext","bad\u0000text"]){
    assert.throws(()=>f.chats.list(ALICE.id,{after:null,limit:25,query}));
    assert.throws(()=>readAccountPublicChatsRequest("list",{after:null,limit:25,query}));
  }
  const getter={after:null,limit:25,get query(){throw Error("getter executed");}};
  assert.throws(()=>f.chats.list(ALICE.id,getter),error=>error.code==="invalid");
  assert.throws(()=>readAccountPublicChatsRequest("list",getter),TypeError);
  assert.throws(()=>f.chats.list(ALICE.id,{after:null,limit:25,query:"Solar",ownerId:BOB.id}));
});

test("private search is own-only SQL, literal, fully paged and owner-version fenced",t=>{
  let sequence=0;
  const service=createPrivateDiscussionService({databasePath:":memory:",nextId:prefix=>`${prefix}-${String(++sequence).padStart(5,"0")}`,
    publicService:{actor:id=>id===ALICE.id?ALICE:BOB,exactSource:()=>({id:"source",topicId:"topic",url:"https://example.com/"}),insightAnchor:()=>({})}});
  t.after(()=>service.close());
  const create=(owner,body)=>service.create(owner,{operationId:`operation-${++sequence}`,body,sourceId:"source",sourceUrl:"https://example.com/"});
  const list=(query,after=null,limit=25,owner=ALICE)=>service.list(owner,{after,limit,...(query===undefined?{}:{query})});
  const root=create(ALICE,"Original private title"),other=create(BOB,"private_crossowner_secret");
  service.send(ALICE,{operationId:"reply",conversationId:root.conversationId,replyToId:root.messageId,body:"Deep private reply %_* OR",expectedRevision:1});
  assert.deepEqual(list("Deep reply").conversations.map(chat=>chat.id),[root.conversationId]);
  assert.equal(list("private_crossowner_secret").conversations.length,0);
  assert.equal(list("%_* OR").conversations.length,1);assert.equal(list("missing").conversations.length,0);
  for(let index=0;index<61;index++)create(ALICE,"privatepaginationneedle");
  const ids=[];let after=null;
  do {const page=list("privatepaginationneedle",after);ids.push(...page.conversations.map(chat=>chat.id));after=page.next;}while(after);
  assert.equal(ids.length,61);assert.equal(new Set(ids).size,61);
  const cursor=list("privatepaginationneedle",null,1).next;
  for(const [query,limit,owner] of [["different",1,ALICE],["",1,ALICE],["privatepaginationneedle",2,ALICE],["privatepaginationneedle",1,BOB]])
    assert.throws(()=>list(query,cursor,limit,owner),conflict);
  create(BOB,"unrelated owner write");assert.ok(list("privatepaginationneedle",cursor,1).conversations.length);
  create(ALICE,"owner write");assert.throws(()=>list("privatepaginationneedle",cursor,1),conflict);
  const ordinary=list(undefined,null,1).next;assert.match(ordinary,/^private-conversation-/u);
  assert.throws(()=>list("privatepaginationneedle",ordinary,1),conflict);
  service.remove(ALICE,{conversationId:root.conversationId});assert.equal(list("Deep reply").conversations.length,0);
  assert.equal(list("private_crossowner_secret",null,25,BOB).conversations[0].id,other.conversationId);
});
