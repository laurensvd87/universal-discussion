import assert from 'node:assert/strict';
import test from 'node:test';
import {createCanonicalV4SemanticDiscussionRepository} from '../canonical-v4/semantic-discussion-repository.js';

const request={generation:'semantic-generation',nodeId:'games',beforeOrdinal:null,limit:20};
const row=(ordinal='9007199254740993')=>({root_id:'root-one',discussion_id:'discussion-original',topic_id:'topic-original',root_ordinal:ordinal,generation:request.generation});
const repository=query=>createCanonicalV4SemanticDiscussionRepository({database:{query}});

test('bounded feed preserves original canonical reply IDs and lossless bigint keyset positions',async()=>{
 const calls=[],repo=repository(async(text,values)=>{calls.push({text,values});return {rows:[row(),{...row('9007199254740992'),root_id:'root-two',discussion_id:'another-discussion',topic_id:'another-topic'}]};});
 const result=await repo.feedReferences(request);
 assert.equal(result.references[0].discussionId,'discussion-original');assert.equal(result.references[0].topicId,'topic-original');
 assert.equal(result.references[0].ordinal,'9007199254740993');assert.equal(result.references[1].ordinal,'9007199254740992');
 assert.deepEqual(calls[0].values,['semantic-generation','games',null,20]);assert.equal(calls.length,1);
 assert.ok(Object.isFrozen(result.references));assert.ok(Object.isFrozen(result.references[0]));
});

test('generation, strict descending order and bounded rows prevent cross-feed or duplicate references',async()=>{
 for(const rows of [[{...row(),generation:'another-generation'}],[row(),row('1')],
  [row('1'),{...row('2'),root_id:'root-two'}],[row('01')],[row('9223372036854775808')],Array.from({length:21},()=>row())]){
  await assert.rejects(repository(async()=>({rows})).feedReferences(request),e=>e.code==='storage-corrupt');
 }
 await assert.rejects(repository(async()=>({rows:[row('10')]})).feedReferences({...request,beforeOrdinal:'10'}),e=>e.code==='storage-corrupt');
});

test('policy read yields a detached safe-number revision and bounded owner rules',async()=>{
 const input={revision:'7',default_max_depth:1,overrides:[{nodeId:'games',maxDepth:3}]},repo=repository(async()=>({rows:[input]}));
 const result=await repo.ownerPolicy();input.overrides[0].maxDepth=8;
 assert.deepEqual(result,{revision:7,defaultMaxDepth:1,overrides:[{nodeId:'games',maxDepth:3}]});
 await assert.rejects(repository(async()=>({rows:[{...input,revision:'9007199254740993'}]})).ownerPolicy(),e=>e.code==='storage-corrupt');
});

test('owner policy update uses one CAS and reports conflict without silently retrying or changing the request',async()=>{
 let calls=0;
 const repo=repository(async(text,values)=>{calls++;assert.match(text,/semantic_set_owner_policy/u);assert.deepEqual(values,[3,1,'[{"nodeId":"games","maxDepth":3}]']);throw Object.assign(Error('private SQL details'),{code:'P1221'});});
 await assert.rejects(repo.setOwnerPolicy({expectedRevision:3,defaultMaxDepth:1,overrides:[{nodeId:'games',maxDepth:3}]}),e=>e.code==='conflict'&&!e.message.includes('private'));
 assert.equal(calls,1);
 const accepted=repository(async()=>({rows:[{revision:'4'}]}));
 assert.equal((await accepted.setOwnerPolicy({expectedRevision:3,defaultMaxDepth:1,overrides:[]})).revision,4);
});

test('invalid client values and getters cannot reach SQL or execute caller hooks',async()=>{
 let calls=0,hooks=0;const repo=repository(async()=>{calls++;throw Error('must not query');});
 for(const input of [{...request,limit:101},{...request,beforeOrdinal:1},{...request,beforeOrdinal:'1e2'},
  {...request,beforeOrdinal:'-1'},new Proxy(request,{get(){hooks++;throw Error('hook');}})])await assert.rejects(repo.feedReferences(input),TypeError);
 const policy={expectedRevision:0,defaultMaxDepth:1,overrides:[]};Object.defineProperty(policy,'overrides',{get(){hooks++;throw Error('hook');}});
 await assert.rejects(repo.setOwnerPolicy(policy),TypeError);
 await assert.rejects(repo.setOwnerPolicy({expectedRevision:0,defaultMaxDepth:1,overrides:[{nodeId:'games',maxDepth:2},{nodeId:'games',maxDepth:3}]}),TypeError);
 assert.equal(calls,0);assert.equal(hooks,0);
});
