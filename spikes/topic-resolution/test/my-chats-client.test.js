import assert from "node:assert/strict";
import test from "node:test";
import { createLocalServiceClient } from "../browser/core/local-service-client.js";
import { readAccountPublicChatsRequest, readAccountPublicChatsResponse } from "../browser/core/community-contract.js";

const actor = "account-11111111-1111-4111-8111-111111111111";
const token = "synthetic-my-chats-device-pairing-only";
const appToken = "a".repeat(43);
const version = {generation:"synthetic",revision:1};
const chat = {id:"root-a",visibility:"public",topicId:"topic-a",discussionId:"discussion-a",title:"A public conversation",
  sourceId:"source-a",sourceUrl:"https://example.com/article",createdAt:"2026-10-12T12:00:00.000Z",
  updatedAt:"2026-10-12T12:01:00.000Z",actorType:"human",ownedHuman:true,ownedAgent:true};
const message = {id:"root-a",replyToId:null,actorType:"human",state:"visible",body:"A public comment",
  createdAt:chat.createdAt,authorLabel:"Alex",sourceUrl:chat.sourceUrl};
const list = () => ({version,chats:[structuredClone(chat)],next:null});
const read = () => ({version,conversation:structuredClone(chat),messages:[structuredClone(message)],next:null});
const response = (url,value) => ({url,status:200,headers:{get:key=>key.toLowerCase()==="content-type" ? "application/json" : null},
  body:new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(JSON.stringify(value)));controller.close();}})});

test("My chats transport uses fixed read-only account routes with pairing and account credentials",async()=>{
  const calls=[];
  const client=createLocalServiceClient({getToken:()=>token,getAccountToken:()=>appToken,
    fetchImpl:async(url,options)=>{calls.push({url,options});return response(url,url.endsWith("/list")?list():read());}});
  assert.deepEqual(await client.accountPublicChats("list",{after:null,limit:25},actor),list());
  assert.deepEqual(await client.accountPublicChats("read",{rootId:"root-a",after:null,limit:25},actor),read());
  for (const [index,call] of calls.entries()) {
    assert.equal(call.url,`http://127.0.0.1:4174/v1/account/public-chats/${index===0?"list":"read"}`);
    assert.equal(call.options.method,"POST");
    assert.equal(call.options.headers.Authorization,`Bearer ${token}`);
    assert.equal(call.options.headers["X-Account-Session"],appToken);
    assert.equal(call.options.headers["X-Demo-Actor"],undefined);
    assert.equal(call.options.credentials,"omit");assert.equal(call.options.redirect,"error");assert.equal(call.options.referrerPolicy,"no-referrer");
  }
});

test("My chats rejects caller-selected account/author and writes before any fetch",async()=>{
  let calls=0;
  const client=createLocalServiceClient({getToken:()=>token,getAccountToken:()=>appToken,fetchImpl:async()=>{calls++;}});
  for(const [action,input,who] of [
    ["list",{after:null,limit:25},"demo-alex"], ["send",{after:null,limit:25},actor],
    ["list",{after:null,limit:25,actorId:actor},actor], ["read",{rootId:"root-a",after:null,limit:26},actor],
    ["read",{rootId:"https://example.com/",after:null,limit:25},actor],
    ["list",{after:"untrusted-cursor",limit:25},actor],
  ]) await assert.rejects(async()=>client.accountPublicChats(action,input,who),{code:"invalid-request"});
  assert.equal(calls,0);
  await assert.rejects(client.accountPublicChats("list",{after:null,limit:25},actor,{beforeDispatch:()=>false}),{code:"conflict"});
  assert.equal(calls,0);
});

test("public chat DTO rejects export secrets, unsafe URLs, impostor ownership and wrong destinations",()=>{
  assert.deepEqual(readAccountPublicChatsResponse("list",list()),list());
  assert.deepEqual(readAccountPublicChatsResponse("read",read(),"root-a"),read());
  for(const bad of [
    {...list(),accessToken:"secret"}, {...list(),version:{...version,subject:"private"}},
    {...list(),chats:[{...chat,email:"not-public@example.com"}]},
    {...list(),chats:[{...chat,ownedHuman:false,ownedAgent:false}]},
    {...list(),chats:[{...chat,sourceUrl:"https://example.com/account"}]},
    {...list(),chats:[{...chat,sourceUrl:"https://example.com/article?token=secret"}]},
    {...list(),chats:[{...chat,sourceUrl:null}]},
    {...list(),chats:[chat,chat]}, {...list(),chats:Array.from({length:26},(_,i)=>({...chat,id:`root-${i}`}))},
    {...list(),next:"x".repeat(2049)},
  ]) assert.throws(()=>readAccountPublicChatsResponse("list",bad));
  assert.throws(()=>readAccountPublicChatsResponse("read",read(),"other-root"));
  for(const bad of [
    {...message,body:"x".repeat(8001)}, {...message,actorType:"bot"}, {...message,replyToId:message.id},
    {...message,state:"deleted"}, {...message,credentials:{}},
  ]) assert.throws(()=>readAccountPublicChatsResponse("read",{...read(),messages:[bad]},"root-a"));
  const deleted={...message,state:"deleted",body:"",sourceUrl:null};
  assert.deepEqual(readAccountPublicChatsResponse("read",{...read(),messages:[deleted]},"root-a").messages,[deleted]);
});

test("public request/response projectors never execute unknown getters or sparse arrays",()=>{
  const request={after:null,limit:25};Object.defineProperty(request,"authorId",{enumerable:true,get(){assert.fail("Getter invoked");}});
  assert.throws(()=>readAccountPublicChatsRequest("list",request));
  const bad={...chat};Object.defineProperty(bad,"title",{enumerable:true,get(){assert.fail("Getter invoked");}});
  assert.throws(()=>readAccountPublicChatsResponse("list",{...list(),chats:[bad]}));
  const array=[chat];Object.defineProperty(array,"0",{enumerable:true,get(){assert.fail("Array getter invoked");}});
  assert.throws(()=>readAccountPublicChatsResponse("list",{...list(),chats:array}));
  assert.throws(()=>readAccountPublicChatsResponse("list",{...list(),chats:Array(1)}));
});

test("malformed successful My chats response fails closed without credential clearing",async()=>{
  let clears=0;
  const client=createLocalServiceClient({getToken:()=>token,getAccountToken:()=>appToken,onAccountUnauthorized:()=>{clears++;},
    fetchImpl:async url=>response(url,{...list(),chats:[{...chat,sourceUrl:"javascript:alert(1)"}]})});
  await assert.rejects(client.accountPublicChats("list",{after:null,limit:25},actor),{code:"invalid-response"});
  assert.equal(clears,0);
});
