import test from 'node:test';
import assert from 'node:assert/strict';
import {assertValidPersistedState} from '../src/domain/persisted-state.js';
import {operationDigestFor} from '../src/domain/source-threads.js';
import {HIERARCHY_SOURCE_POLICY,readIngestionOutcome,readOutcome} from '../../../spikes/topic-resolution/browser/core/local-service-contract.js';

const version={generation:'container-policy-generation',revision:1};
function fixture(){
 const input={url:'https://example.org/public-article',title:'Public article',
  embedding:{modelId:'e5-small-q8-browser-main-prefix-v1',values:Array.from({length:384},(_,i)=>i===0?1:0)},extractorVersion:'crawler-static-html-prefix/v1'};
 return {schema:'demo-state/v4',generation:version.generation,revision:1,
  topics:[{id:'topic-container',title:input.title,kind:'general',createdAt:'2026-10-27T00:00:00.000Z',provenance:'owner-local-learned-topic/v1',retainTight:false,reference:null}],
  discussions:[{id:'discussion-container',topicId:'topic-container'}],contributions:[],
  sources:[{id:'source-one',...input,provenance:'owner-local-page-embedding/v1',operationId:'operation-one',operationDigest:operationDigestFor(input),
   policyVersion:HIERARCHY_SOURCE_POLICY,topicIds:['topic-container']}],sourceLinks:[{sourceId:'source-one',topicId:'topic-container',method:'learned-provisional'}]};
}
test('source-local policy is accepted only in a v4 membership-bearing snapshot with unchanged material checks',()=>{
 assert.equal(HIERARCHY_SOURCE_POLICY,'hierarchy-source-container/v1');
 const state=fixture(),before=structuredClone(state);assertValidPersistedState(state);assert.deepEqual(state,before);
 for(const change of [v=>{v.sources[0].policyVersion='hierarchy-source-container/v2';},v=>{v.sources[0].operationDigest='a'.repeat(64);},
  v=>{v.sources[0].topicIds=[];},v=>{v.sources[0].embedding.values[0]=0;},v=>{v.schema='demo-state/v2';delete v.sources[0].topicIds;}]){
  const bad=fixture();change(bad);assert.throws(()=>assertValidPersistedState(bad));
 }
});
test('new receipt and manual correction name container policy separately from semantic classification',()=>{
 const receipt={version,sourceId:'source-one',topicId:'topic-container',topicIds:['topic-container'],assignment:'provisional',policyVersion:HIERARCHY_SOURCE_POLICY};
 assert.deepEqual(readIngestionOutcome(receipt),receipt);
 const correction={version,result:{sourceId:receipt.sourceId,topicId:receipt.topicId,topicIds:receipt.topicIds,previousTopicId:'old-container',assignment:'confirmed',policyVersion:HIERARCHY_SOURCE_POLICY}};
 assert.deepEqual(readOutcome(correction,'correct-source'),correction);
 for(const change of [v=>{delete v.topicIds;},v=>{v.topicIds=['other-container'];},v=>{v.topicIds=['topic-container','topic-container'];},
  v=>{v.policyVersion='hierarchy-source-container/v1-extra';},v=>{v.semanticPath=['games'];},v=>{v.assignmentAuthority=true;}]){
  const bad=structuredClone(receipt);change(bad);assert.throws(()=>readIngestionOutcome(bad),TypeError);
 }
 const bad=structuredClone(correction);delete bad.result.topicIds;assert.throws(()=>readOutcome(bad,'correct-source'),TypeError);
});
