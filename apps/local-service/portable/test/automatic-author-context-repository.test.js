import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createAutomaticAuthorContextRepository as repository} from '../canonical-v4/automatic-author-context-repository.js';
import {numericMatcher} from './semantic-native-assertions.js';
import {classifyRootedHierarchyMatcher} from '../../src/domain/hierarchy-rooted-matcher.js';
import {createCanonicalV4SemanticDiscussionRepository} from '../canonical-v4/semantic-discussion-repository.js';
import {withdrawAutomaticAuthorFixtureRoot} from './automatic-author-context-native-assertions.js';
const generation='invented-generation',sourceId='invented-source',topicId='invented-topic';
const scope={kind:'named',id:'12345678-1234-4123-8123-123456789abc',caption:'Steam Deck',sourceId,materialDigest:'a'.repeat(64)};
const request=()=>({actorId:'demo-alex',requestId:'invented-request',expected:{generation,revision:50},
 command:{type:'create-root',topicId,body:'My view',originSourceId:sourceId},scope:{...scope}});
const response={version:{generation,revision:2},discussionVersion:1,result:{contributionId:'original-root'}};
const code=value=>error=>error?.code===value;

test('a replay returns its original revision and canonical root even after the observed catalog advances',async()=>{
 let args;const repo=repository({database:{async query(sql,p){assert(sql.includes('named_append_root'));args=p;return {rows:[{result:JSON.stringify(response)}]};}},nextId:()=> 'unused-new-id',now:()=> 'invented-time'});
 const input=request(),r=await repo.appendRoot(JSON.stringify(input));assert.deepEqual(r,response);assert(Object.isFrozen(r.result));
 assert.equal(args.length,11);assert.equal(args[5],topicId);assert.equal(args[7],sourceId);
 const material=JSON.stringify({generation,command:input.command});assert.equal(args[3],material);assert.equal(args[2],createHash('sha256').update(material).digest('hex'));
 assert.deepEqual(JSON.parse(args[10]),scope);
});

test('malformed scopes and attempts to post under another page cannot reach SQL',async()=>{
 let calls=0;const repo=repository({database:{async query(){calls++;assert.fail('invalid request reached SQL');}}});
 for(const change of [{id:'not-uuid'},{caption:'bad\u202ename'},{sourceId:'different-page'},{materialDigest:'A'.repeat(64)},{revision:'2'},{kind:'static'}]){
  const r=request();r.scope={...r.scope,...change};await assert.rejects(repo.appendRoot(JSON.stringify(r)),code('invalid'));
 }
 const reply=request();reply.command.type='reply';await assert.rejects(repo.appendRoot(JSON.stringify(reply)),code('invalid'));
 assert.equal(calls,0);
});

test('page-only editor context remains usable and contains no evidence-revision dependency',async()=>{
 const page={kind:'page',id:sourceId,caption:'An entirely new webpage',sourceId,materialDigest:scope.materialDigest};
 const repo=repository({database:{async query(sql,p){assert(sql.includes('named_read_editor'));assert.deepEqual(p,[generation,sourceId]);return {rows:[{result:{generation,topicId,pageScope:page,scope:page}}]};}}});
 const r=await repo.editor(JSON.stringify({generation,sourceId}));assert.deepEqual(r.scope,page);assert(Object.isFrozen(r.scope));assert(!Object.hasOwn(r.scope,'revision'));
});
test('owner-wide grouping is an explicit editor composition and preserves the exact captured scope',async()=>{
 let called=0;const page={kind:'page',id:sourceId,caption:'Current page',sourceId,materialDigest:scope.materialDigest};
 const repo=repository({ownerGrouping:true,database:{query:async(sql,args)=>{called++;assert.equal(sql,'SELECT canonical_v4.named_read_grouped_editor($1,$2) AS result');assert.deepEqual(args,[generation,sourceId]);return {rows:[{result:{generation,topicId,pageScope:page,scope}}]};}}});
 assert.deepEqual((await repo.editor(JSON.stringify({generation,sourceId}))).scope,scope);assert.equal(called,1);
 assert.throws(()=>repository({ownerGrouping:1,database:{query:async()=>assert.fail()}}),TypeError);
});
test('the general-web native vectors intentionally have no confident fixed taxonomy ancestor',()=>{
 const values=Array.from({length:384},(_,i)=>i===0?.97:i===5?Math.sqrt(1-.97**2):0),matcher=numericMatcher('one');
 assert.deepEqual(classifyRootedHierarchyMatcher(matcher,{sourceId:'invented-owner-control',sourceVersion:'invented-owner-v1',bodyVector:values,titleVector:values}).semanticPath,[]);
});
test('duplicate owner scopes are a local TypeError before any SQL refusal can occur',async()=>{
 let calls=0;const policy=createCanonicalV4SemanticDiscussionRepository({database:{query:async()=>{calls++;assert.fail('duplicate scopes reached SQL');}}});
 await assert.rejects(policy.setOwnerPolicy({expectedRevision:1,defaultMaxDepth:1,overrides:[{nodeId:'subject-'+scope.id,maxDepth:2},{nodeId:'subject-'+scope.id,maxDepth:2}]}),TypeError);
 assert.equal(calls,0);
});

test('a response for a different Source or generation is never installed as editor context',async()=>{
 for(const change of [{generation:'other'},{scope:{...scope,sourceId:'other'}}]){
  const repo=repository({database:{async query(){return {rows:[{result:{generation,topicId,pageScope:{kind:'page',id:sourceId,sourceId,caption:'Current page',materialDigest:scope.materialDigest},scope,...change}}]};}}});
  await assert.rejects(repo.editor(JSON.stringify({generation,sourceId})),code('storage-corrupt'));
 }
});

test('withdrawn or legacy roots have no invented authored context',async()=>{
 const repo=repository({database:{async query(){return {rows:[{result:null}]};}}});assert.equal(await repo.root(JSON.stringify({generation,rootId:'legacy-root'})),null);
});

test('authored root context has original destinations and excludes Source material from public reads',async()=>{
 const row={rootId:'original-root',topicId,discussionId:'original-discussion',scope:{kind:'named',id:scope.id,caption:scope.caption}};
 const repo=repository({database:{async query(){return {rows:[{result:row}]};}}});assert.deepEqual(await repo.root(JSON.stringify({generation,rootId:row.rootId})),row);
 const bad=repository({database:{async query(){return {rows:[{result:{...row,scope}}]};}}});
 await assert.rejects(bad.root(JSON.stringify({generation,rootId:row.rootId})),code('storage-corrupt'));
});

test('scope conflicts keep a distinct retryable error without revealing database internals',async()=>{
 for(const sqlCode of ['P1291','P1001','40001','23505']){
  const repo=repository({database:{async query(){throw Object.assign(Error('private SQL details'),{code:sqlCode});}}});
  await assert.rejects(repo.appendRoot(JSON.stringify(request())),e=>e.code==='conflict'&&!e.message.includes('SQL details'));
 }
});

test('the actual native withdrawal fixture uses the normal lifecycle port instead of a partial invalid row update',async()=>{
 let called=0;const sentinel=Object.assign(Error('stop before owned SQL'),{code:'P1001'});
 const database={async query(sql,p){called++;assert(sql.includes('runtime_lifecycle_command'));assert.equal(p[0],'demo-alex');
  assert.equal(p[6],'withdraw');assert.equal(p[14],'original-root');assert.deepEqual(JSON.parse(p[3]).command,{type:'withdraw',contributionId:'original-root'});throw sentinel;}};
 await assert.rejects(withdrawAutomaticAuthorFixtureRoot({database,expected:{generation,revision:2},rootId:'original-root'}),code('conflict'));assert.equal(called,1);
});
