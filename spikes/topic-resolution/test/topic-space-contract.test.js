import test from "node:test";
import assert from "node:assert/strict";
import {parseTopicSpacePolicy,parseTopicSpacesResponse,parseTopicSpaceOwnerResponse,parseTopicSpacePolicyRequest,parseTopicSpaceQueryRequest} from "../browser/core/topic-space-contract.js";

export const policy=()=>({schema:"topic-space-policy/v1",revision:0,defaultSpecificity:0,topicOverrides:[]});
export const page=()=>({schema:"topic-spaces/v1",version:{generation:"test-generation",revision:2},policy:policy(),state:"ready",total:1,groups:[{
  id:"space-one",parentId:null,policyTopicId:"base-one",title:"<script>Public topic</script>",specificity:0,threadCount:1,humanCount:1,aiCount:0,score:0.9,
  threads:[{rootId:"root-one",topicId:"topic-one",discussionId:"discussion-one",sourceId:"source-one",title:"Public discussion",snippet:"<img src=x>",url:"https://example.org/article",humanCount:1,aiCount:0,updatedAt:null}],
}]});

test("topic space DTOs are copied, frozen and preserve canonical destinations",()=>{
  const original=page(),parsed=parseTopicSpacesResponse(original);original.groups[0].threads[0].topicId="changed";
  assert.equal(parsed.groups[0].threads[0].topicId,"topic-one");assert.ok(Object.isFrozen(parsed.groups[0].threads));
  assert.equal(parseTopicSpaceOwnerResponse({policy:policy(),canManage:false}).canManage,false);
  assert.equal(parseTopicSpaceQueryRequest({sourceId:null,query:"",offset:0,limit:20}).sourceId,null);
  assert.equal(parseTopicSpacePolicyRequest({expectedRevision:0,defaultSpecificity:100,topicOverrides:[]}).defaultSpecificity,100);
});
test("malformed groups, unsafe links, extra authority and duplicate roots fail closed",()=>{
  for(const mutate of [
    p=>{p.groups[0].threads[0].url="javascript:alert(1)";},
    p=>{p.groups[0].threads[0].url="http://127.0.0.1/private";},
    p=>{p.groups[0].threads[0].snippet="secret\u0000";},
    p=>{p.groups[0].authority=true;},p=>{p.groups[0].specificity=101;},
    p=>{p.groups[0].threads.push({...p.groups[0].threads[0]});},
    p=>{p.groups=Array.from({length:21},()=>p.groups[0]);},
    p=>{p.groups[0].score=NaN;},p=>{p.groups[0].policyTopicId=null;},
    p=>{p.groups[0].threads[0].updatedAt="2026-02-30T00:00:00.000Z";},
    p=>{p.groups[0].threads[0].updatedAt="2026-01-01";},
  ]){const value=page();mutate(value);assert.throws(()=>parseTopicSpacesResponse(value),TypeError);}
});
test("owner policy accepts only bounded explicit per-topic settings",()=>{
  const value=policy();value.topicOverrides=[{spaceId:"base",specificity:50,title:null}];assert.equal(parseTopicSpacePolicy(value).topicOverrides.length,1);
  value.topicOverrides.push({...value.topicOverrides[0]});assert.throws(()=>parseTopicSpacePolicy(value));
  assert.throws(()=>parseTopicSpaceOwnerResponse({policy:policy(),canManage:"true"}));
  assert.throws(()=>parseTopicSpacePolicyRequest({expectedRevision:0,defaultSpecificity:50,topicOverrides:[],personal:true}));
  assert.throws(()=>parseTopicSpaceQueryRequest({sourceId:"bad id",query:"",offset:0,limit:20}));
});
test("canonical punctuation IDs and UTC dates round trip; override bound is 256",()=>{
  const value=page();value.groups[0].threads[0].rootId="legacy.root:id-1_2";value.groups[0].threads[0].updatedAt="2026-10-18T00:00:00.000Z";
  assert.equal(parseTopicSpacesResponse(value).groups[0].threads[0].rootId,"legacy.root:id-1_2");
  const settings=policy();settings.topicOverrides=Array.from({length:256},(_,i)=>({spaceId:`base:${i}`,specificity:25,title:null}));
  assert.equal(parseTopicSpacePolicy(settings).topicOverrides.length,256);
  settings.topicOverrides.push({spaceId:"overflow",specificity:25,title:null});assert.throws(()=>parseTopicSpacePolicy(settings));
});
