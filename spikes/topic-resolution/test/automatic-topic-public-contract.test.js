import test from 'node:test';import assert from 'node:assert/strict';
import {readSemanticFeed,readSemanticTarget,readSemanticSearch,readSemanticSearchRequest,readSemanticCapabilities,readPublicTopicScope} from '../browser/core/local-service-contract.js';
const version={generation:'invented-generation',revision:1},scope={kind:'named',id:'12345678-1234-4123-8123-123456789abc',caption:'Kapsalon'},nodeId='subject-'+scope.id;
const root={id:'root-a',rootId:null,replyToId:null,state:'visible',authorId:'demo-alex',actorType:'human',body:'Exact public root',createdAt:'2026-10-29T00:00:00.000Z',edited:false};
const card={topic:{id:'original-topic',title:'Original canonical destination',kind:'general'},discussionId:'original-discussion',root,scope};
const actors=[{id:'demo-alex',displayName:'Alex',type:'human'}];

test('public author captions accompany rather than replace canonical destinations in feeds and exact reply targets',()=>{
 const feed=readSemanticFeed({version,policyRevision:0,nodeId,roots:[card],nextCursor:null,actors});assert.deepEqual(feed.roots[0].scope,scope);assert.equal(feed.roots[0].topic.id,'original-topic');
 const target=readSemanticTarget({version,policyRevision:0,nodeId,...card,root:{...root,replies:[]},actors,targetId:root.id,rootRevision:1,targetRevision:1});
 assert.deepEqual(target.scope,scope);assert.equal(target.discussionId,'original-discussion');assert.equal(target.root.id,'root-a');
 const {scope:unused,...legacy}=card;assert(!Object.hasOwn(readSemanticFeed({version,policyRevision:0,nodeId:'games',roots:[legacy],actors,nextCursor:null}).roots[0],'scope'));
});

test('public captions cannot carry private Source snapshots material digests arbitrary fields or invalid named IDs',()=>{
 for(const change of [{sourceId:'source-a'},{materialDigest:'a'.repeat(64)},{id:'not-a-named-uuid'},{caption:'\u202eunsafe'},{caption:''}])assert.throws(()=>readPublicTopicScope({...scope,...change}),TypeError);
});

test('search requests and bounded results are global and contain only public navigation metadata',()=>{
 assert.deepEqual(readSemanticSearchRequest({query:'',limit:20,cursor:null}),{query:'',limit:20,cursor:null});
 const response={version,topics:[{nodeId,label:'Kapsalon',path:[nodeId],occupied:true,human:true}],nextCursor:null};assert.deepEqual(readSemanticSearch(response),response);
 for(const query of [{query:'x',limit:0,cursor:null},{query:'x',limit:51,cursor:null},{query:'\u0000',limit:20,cursor:null},{query:'x',limit:20,cursor:null,sourceId:'page-a'}])assert.throws(()=>readSemanticSearchRequest(query),TypeError);
 for(const change of [r=>r.topics.push({...r.topics[0]}),r=>r.topics[0].occupied=false,r=>r.topics[0].path=['other'],r=>r.topics[0].sourceId='private-source']){
  const copy=structuredClone(response);change(copy);assert.throws(()=>readSemanticSearch(copy),TypeError);
 }
 assert.equal(readSemanticCapabilities({protocol:'semantic-topics/v1',topicSearch:'named-topics/v1'}).topicSearch,'named-topics/v1');
 assert.throws(()=>readSemanticCapabilities({protocol:'semantic-topics/v1',topicSearch:'unknown'}),TypeError);
});
