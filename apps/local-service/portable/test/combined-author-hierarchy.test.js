import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createAutomaticAuthorContextRepository as authors} from '../canonical-v4/automatic-author-context-repository.js';
import {createCanonicalV4SemanticDiscussionRepository} from '../canonical-v4/semantic-discussion-repository.js';
import {createCanonicalV4ReadFacade} from '../canonical-v4/read-facade.js';
import {createAutomaticTopicFeedRepository} from '../canonical-v4/automatic-topic-feed-repository.js';
import {readAuthoredTopicScope,readPublicTopicScope} from '../../../../spikes/topic-resolution/browser/core/local-service-contract.js';
import {numericMatcher} from './semantic-native-assertions.js';
import {classifyRootedHierarchyMatcher} from '../../src/domain/hierarchy-rooted-matcher.js';
import {combinedHierarchyFixtureRows} from './combined-author-hierarchy-fixture.js';
import {describeRootedHierarchyMatcher} from '../../src/domain/hierarchy-rooted-matcher.js';
import {planAutomaticNamedSubjectsV2,GENERAL_SUBJECT_POLICY_V2_HASH} from '../../src/application/automatic-named-subject-plan.js';
import {createHash} from 'node:crypto';
import {combinedGenerationCollisionProbe} from './combined-author-hierarchy-native-assertions.js';
const generation='invented-generation',sourceId='invented-source',topicId='invented-topic';
const scope={kind:'semantic',id:'games',caption:'Games',sourceId,materialDigest:'a'.repeat(64)};
const code=c=>e=>e?.code===c;
test('semantic author scope traverses the existing browser wire without weakening its material fields',()=>{
 assert.deepEqual(readAuthoredTopicScope(scope),scope);assert.deepEqual(readPublicTopicScope({kind:scope.kind,id:scope.id,caption:scope.caption}),{kind:scope.kind,id:scope.id,caption:scope.caption});
 for(const id of ['subject-forged','page-forged','legacy-forged',' x ','x'.repeat(161)])assert.throws(()=>readAuthoredTopicScope({...scope,id}));
 assert.equal(readAuthoredTopicScope({...scope,id:'x'.repeat(160)}).id.length,160);
});
test('combined editor explicitly requires owner grouping and forwards the exact semantic scope',async()=>{
 let calls=0;const db={async query(sql,args){calls++;assert(sql.includes('combined_read_editor'));assert.deepEqual(args,[generation,sourceId]);return {rows:[{result:{generation,topicId,scope,pageScope:{...scope,kind:'page',id:sourceId,caption:'Current webpage'}}}]};}};
 assert.throws(()=>authors({database:db,combinedHierarchy:true}),TypeError);
 const r=await authors({database:db,ownerGrouping:true,combinedHierarchy:true}).editor(JSON.stringify({generation,sourceId}));assert.deepEqual(r.scope,scope);assert.equal(calls,1);
});
test('semantic publication retains the ordinary original Topic command and separate exact author scope',async()=>{
 const request={actorId:'demo-alex',requestId:'invented-request',expected:{generation,revision:0},command:{type:'create-root',topicId,body:'A broad question',originSourceId:sourceId},scope};
 const repo=authors({database:{async query(sql,args){assert(sql.includes('named_append_root'));assert.equal(args[5],topicId);assert.deepEqual(JSON.parse(args[10]),scope);return {rows:[{result:JSON.stringify({version:{generation,revision:1},discussionVersion:1,result:{contributionId:'invented-root'}})}]};}},nextId:()=> 'invented-root'});
 assert.equal((await repo.appendRoot(JSON.stringify(request))).result.contributionId,'invented-root');
});
test('public semantic captions use the batch context port without inventing page routes',async()=>{
 const result=[{rootId:'invented-root',scope:{kind:'semantic',id:'games',caption:'Games'}}];
 const repo=createAutomaticTopicFeedRepository({database:{async query(){return {rows:[{result}]};}}});assert.deepEqual(await repo.rootContexts(JSON.stringify({generation,rootIds:['invented-root']})),result);
});
test('combined fixed feeds explicitly select the union port and retain original canonical references',async()=>{
 const repo=createCanonicalV4SemanticDiscussionRepository({combinedHierarchy:true,database:{async query(sql,args){assert(sql.includes('combined_read_fixed_feed'));assert.deepEqual(args,[generation,'games',null,20]);return {rows:[{root_id:'root',discussion_id:'original-discussion',topic_id:topicId,root_ordinal:'9',generation}]};}}});
 assert.equal((await repo.feedReferences({generation,nodeId:'games',beforeOrdinal:null,limit:20})).references[0].topicId,topicId);
 const database={query(){assert.fail('Construction is inert');},transaction(){assert.fail('Construction is inert');}};
 assert.throws(()=>createCanonicalV4ReadFacade({database,automaticTopics:true,combinedHierarchy:true}),TypeError);
 assert(createCanonicalV4ReadFacade({database,automaticTopics:true,unifiedTopicSearch:true,combinedHierarchy:true}));
});
test('distinct fixture vectors really classify in Games and meet existing cohort novelty and cohesion',()=>{
 const matcher=numericMatcher('one'),rows=combinedHierarchyFixtureRows();
 for(const row of rows)assert.equal(classifyRootedHierarchyMatcher(matcher,{sourceId:row.id,sourceVersion:'invented',bodyVector:row.values,titleVector:row.values}).semanticPath[0],'games');
 for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const dot=rows[i].values.reduce((n,v,k)=>n+v*rows[j].values[k],0);assert(dot>=.8-1e-12&&dot<.995);}
});
test('the real general-web planner forms fixed-anchored broad and specific topics from those distinct fixtures',()=>{
 const matcher=numericMatcher('one'),identity=describeRootedHierarchyMatcher(matcher),sha=v=>createHash('sha256').update(v).digest('hex'),rows=combinedHierarchyFixtureRows();
 const sourceWitnesses=rows.map(r=>({sourceId:r.id,sourceVersion:'1',operationId:'operation-'+r.id,operationDigest:sha('digest-'+r.id),sourceStamp:sha('stamp-'+r.id)}));
 const observations=rows.map((r,i)=>({sourceId:r.id,inputHash:sha(JSON.stringify(Object.values(sourceWitnesses[i]))),materialHash:sha(r.title),title:r.title,publisherKey:'general.example.org',
  acceptedPath:classifyRootedHierarchyMatcher(matcher,{sourceId:r.id,sourceVersion:'invented',bodyVector:r.values,titleVector:r.values}).semanticPath,vector:r.values}));
 const p=planAutomaticNamedSubjectsV2(JSON.stringify({generation,policyHash:GENERAL_SUBJECT_POLICY_V2_HASH,representationHash:identity.representationHash,matcherHash:sha(JSON.stringify(identity)),minimumSimilarity:.8,observations,sourceWitnesses,candidates:[]}));
 assert.deepEqual(p.updates.map(u=>u.label).sort(),['Zenith Gamepad','Zenith Gamepad Mini','Zenith Gamepad Pro']);assert(p.updates.every(u=>u.contextRootId==='games'&&u.acceptedAncestorPath[0]==='games'));
});
test('combined search changes only the proved fixed-activity lookup',async()=>{
 const old=await readFile(new URL('../canonical-v4/drafts/unified-topic-search.sql',import.meta.url),'utf8'),all=await readFile(new URL('../canonical-v4/drafts/combined-author-hierarchy.sql',import.meta.url),'utf8');
 const extract=s=>s.match(/CREATE(?: OR REPLACE)? FUNCTION canonical_v4\.unified_search_topics\([\s\S]*?\$search\$;/u)[0].replace('CREATE OR REPLACE FUNCTION','CREATE FUNCTION').replaceAll('\r\n','\n');
 const before=extract(old),after=extract(all),replacement='   LEFT JOIN LATERAL canonical_v4.combined_fixed_activity(p_generation,n.node_id)a ON true';
 const original=before.match(/   LEFT JOIN LATERAL\(SELECT d\.human[\s\S]*?\)a ON true/u)[0];assert.equal(after.replace(replacement,original),before);
});
test('the collision probe uses exactly the actual fixed feed generation predicate',async()=>{
 const sql=await readFile(new URL('../canonical-v4/drafts/combined-author-hierarchy.sql',import.meta.url),'utf8'),fixed=combinedGenerationCollisionProbe(sql),broken=combinedGenerationCollisionProbe(sql,true);
 assert(fixed.includes('DECLARE generation text'));assert.equal(fixed.replace('runtime_state r WHERE r.singleton AND r.generation','runtime_state WHERE singleton AND generation'),broken);
 assert.throws(()=>combinedGenerationCollisionProbe(sql.replace('runtime_state r WHERE r.singleton AND r.generation','runtime_state WHERE singleton AND generation')),TypeError);
});
