import test from "node:test";
import assert from "node:assert/strict";
import {createLocalServiceClient} from "../browser/core/local-service-client.js";

const policy={schema:"topic-space-policy/v1",revision:0,defaultSpecificity:0,topicOverrides:[]};
const page={schema:"topic-spaces/v1",version:{generation:"test",revision:0},policy,state:"building",total:0,groups:[]};
const ACTOR="account-00000000-0000-4000-8000-000000000001";
test("topic space transport uses strict POST contracts and named account sessions only for owner routes",async()=>{
  const calls=[],accountCalls=[];
  const client=createLocalServiceClient({getToken:()=>"synthetic-topic-space-pairing-token",getAccountToken:actor=>{accountCalls.push(actor);return "a".repeat(43);},
    fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.endsWith("/query")?page:{policy,canManage:true}),{headers:{"content-type":"application/json"}});}});
  await client.topicSpaces({sourceId:null,query:"",offset:0,limit:20});
  await client.topicSpaceOwner(ACTOR);await client.updateTopicSpacePolicy({expectedRevision:0,defaultSpecificity:25,topicOverrides:[]},ACTOR);
  assert.equal(calls[0].url,"http://127.0.0.1:4174/v1/topic-spaces/query");assert.equal(calls[0].options.headers["X-Account-Session"],undefined);
  assert.deepEqual(accountCalls,[ACTOR,ACTOR]);assert.equal(calls[1].options.body,"{}");
  for(const call of calls){assert.equal(call.options.method,"POST");assert.equal(call.options.credentials,"omit");assert.equal(call.options.cache,"no-store");}
  assert.equal(calls[2].options.headers["X-Account-Session"],"a".repeat(43));
  assert.throws(()=>client.topicSpaceOwner("demo-alex"),{code:"authentication-required"});
  assert.throws(()=>client.topicSpaces({sourceId:null,query:"",offset:0,limit:100}),{code:"invalid-request"});assert.equal(calls.length,3);
});
test("owner dispatch fence prevents a save after its session changes",async()=>{
  let fetches=0;const client=createLocalServiceClient({getToken:()=>"synthetic-topic-space-pairing-token",getAccountToken:()=>"a".repeat(43),fetchImpl:async()=>{fetches++;}});
  await assert.rejects(client.updateTopicSpacePolicy({expectedRevision:0,defaultSpecificity:25,topicOverrides:[]},ACTOR,{beforeDispatch:()=>false}),{code:"conflict"});assert.equal(fetches,0);
});
