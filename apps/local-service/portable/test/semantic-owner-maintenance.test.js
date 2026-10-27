import test from 'node:test';
import assert from 'node:assert/strict';
import {createSemanticOwnerMaintenance,readSemanticOwnerMaintenanceInput} from '../canonical-v4/semantic-owner-maintenance.js';
import {operationDigestFor,sourceStamp} from '../../src/domain/source-threads.js';

const MATCHER='a'.repeat(64);
const request=()=>({expectedGeneration:'owner-generation',expectedMatcherIdentityHash:MATCHER,expectedHeadRevision:1,expectedPolicyRevision:1,cursor:null,initialHighWatermark:null,limit:10});
function row(ordinal=1){
 const values=Array.from({length:384},(_,i)=>i===0?1:0),input={url:'https://owner.example.org/stored',title:'Invented public game page',embedding:{modelId:'e5-small-q8-browser-main-prefix-v1',values},extractorVersion:'crawler-static-html-prefix/v1'};
 const wire=Buffer.alloc(20+384*12);wire.writeInt32BE(1,0);wire.writeInt32BE(701,8);wire.writeInt32BE(384,12);wire.writeInt32BE(1,16);values.forEach((v,i)=>{wire.writeInt32BE(8,20+i*12);wire.writeDoubleBE(v,24+i*12);});
 const sourceId='source-one',operationId='owner-operation',operationDigest=operationDigestFor(input),stamp=sourceStamp(input),policyVersion='ridge1-fixed-reference-radius/v1',provenance='owner-local-page-embedding/v1';
 const candidate={sourceId,ordinal:'0',sourceVersion:'0',generation:'owner-generation',matcherIdentityHash:MATCHER,url:input.url,title:input.title,provenance,extractorVersion:input.extractorVersion,policyVersion,operationId,hasEmbedding:true,
  sourcePayload:JSON.stringify({id:sourceId,...input,provenance,policyVersion,operationId,operationDigest,topicIds:['topic-one']}),
  embedding:{sourceId,modelId:input.embedding.modelId,dimensions:384,payload:JSON.stringify(input.embedding),valuesBase64:wire.toString('base64')},receipt:{sourceId,operationId,operationDigest},stamp:{sourceId,stamp,postable:true},reuse:null};
 return {id:'root-'+ordinal,root_version:'0',ordinal:String(ordinal),discussion_id:'discussion-one',topic_id:'topic-one',topic_kind:'learned',source_link_method:'learned-provisional',withdrawn:false,visibility:'local-public',origin_source_id:sourceId,anchor_source_id:sourceId,anchor_kind:'source',anchor_stamp:stamp,original_topic:'topic-one',learned_origin:true,existing_snapshot:false,current_stamp:stamp,postable:true,observed_source:sourceId,semantic_eligible:true,supported_path:['games'],candidate};
}
function fixture({rows=[row()],role='murmingle_owner',isolation='read committed',head='1',policy='1',generation='owner-generation',queryFailure=null,unknownCommit=false,failAfterFirst=false}={}){
 const calls=[],canonical={body:'UNCHANGED ROOT BODY',reply:'UNCHANGED REPLY',source:'UNCHANGED SOURCE'},original=structuredClone(canonical);let txCount=0,readOnly=false,headValue=head,policyValue=policy;
 const tx={dialect:'pg',async query(sql,args=[]){calls.push({sql,args});
  if(sql.startsWith('SET TRANSACTION')){readOnly=true;return {rows:[]};}
  if(sql.includes('current_user AS role'))return {rows:[{role,isolation:readOnly?'repeatable read':isolation,read_only:readOnly?'on':'off'}]};
  if(sql.includes('FROM canonical_v4.semantic_installation'))return {rows:[{generation,matcher_hash:MATCHER,head_revision:headValue,policy_revision:policyValue}]};
  if(sql.includes('FROM canonical_v4.semantic_owner_policy'))return {rows:[{policy_revision:policyValue}]};
  if(sql.startsWith('SELECT max(ordinal)'))return {rows:[{high_watermark:rows.length?rows.at(-1).ordinal:null}]};
  if(sql.startsWith('WITH roots AS MATERIALIZED')){
   assert.match(sql,/LIMIT \$3/);assert.equal(sql.includes('SELECT c.payload,'),false);assert.equal(sql.includes("->>'body'"),false);
   assert.ok(args[2]<=11);return {rows:structuredClone(rows.filter(r=>(args[0]===null||BigInt(r.ordinal)>BigInt(args[0]))&&BigInt(r.ordinal)<=BigInt(args[1])).slice(0,args[2]))};
  }
  if(sql.includes('semantic_adopt_legacy_roots')){
   assert.equal(readOnly,false);if(queryFailure)throw queryFailure;
   const items=JSON.parse(args[2]);assert.ok(items.length<=10);const head=calls.findIndex(c=>c.sql.includes('FOR SHARE OF i')),policy=calls.findIndex(c=>c.sql.includes('FROM canonical_v4.semantic_owner_policy')&&c.sql.endsWith('FOR SHARE'));assert.ok(head<policy&&policy<calls.indexOf(calls.at(-1)));
   return {rows:items.map(item=>{const found=rows.find(r=>r.id===item.rootId);assert.equal(item.sourceVersion,'0');assert.equal(item.rootVersion,found.root_version);assert.equal(item.topicId,found.topic_id);const status=found.existing_snapshot?'existing':'adopted';found.existing_snapshot=true;if(failAfterFirst)throw Object.assign(new Error('PRIVATE stale root'),{code:'P1231'});return {root_id:found.id,status};})};
  }
  if(sql.includes('semantic_set_owner_policy')){assert.equal(readOnly,false);assert.equal(args[0],Number(policyValue));policyValue=String(Number(policyValue)+1);return {rows:[{revision:policyValue}]};}
  assert.fail('Unexpected owner fake query');
 }};
 const database={dialect:'pg',query:tx.query,async transaction(work){txCount++;readOnly=false;calls.push({sql:'BEGIN'});let committed=false;const snapshot=structuredClone(rows);try{const result=await work(tx);calls.push({sql:'COMMIT'});committed=true;if(unknownCommit)throw false;return result;}catch(error){if(!committed){rows.splice(0,rows.length,...snapshot);calls.push({sql:'ROLLBACK'});}throw error;}}};
 return {owner:createSemanticOwnerMaintenance({database}),calls,rows,canonical,original,get transactions(){return txCount;}};
}
test('owner inspection is a read-only consistent snapshot with no root-body projection or adoption',async()=>{
 const f=fixture(),result=await f.owner.inspectLegacyRoots(request());assert.equal(result.mode,'inspect');assert.equal(result.scanned,1);assert.equal(result.counts.eligible,1);assert.equal(result.adopted,0);assert.equal(result.scope.initialHighWatermark,'1');assert.equal(result.complete,true);
 assert.ok(f.calls.some(c=>c.sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'));assert.equal(f.calls.some(c=>c.sql.includes('semantic_adopt_legacy_roots')),false);assert.equal(JSON.stringify(result).includes('UNCHANGED'),false);assert.equal(JSON.stringify(result).includes('valuesBase64'),false);assert.deepEqual(f.canonical,f.original);
});
test('one explicit owner batch uses real verifier/adoption adapter and is inert on repeated snapshots',async()=>{
 const f=fixture({rows:[row(1),row(2)]}),first=await f.owner.adoptLegacyRoots(request());assert.equal(first.adopted,2);assert.equal(first.counts.adopted,2);assert.equal(first.counts.eligible,0);assert.equal(Object.values(first.counts).reduce((a,b)=>a+b,0),first.scanned);assert.equal(first.contextBasis,'legacy-current-source-context');assert.deepEqual(f.canonical,f.original);
 const before=f.calls.filter(c=>c.sql.includes('semantic_adopt_legacy_roots')).length,second=await f.owner.adoptLegacyRoots(request());assert.equal(second.adopted,0);assert.equal(second.counts.existing,2);assert.equal(f.calls.filter(c=>c.sql.includes('semantic_adopt_legacy_roots')).length,before);
});
test('manual, withdrawn, unpinned, stale, pending, excluded and abstained roots retain reasoned canonical access',async()=>{
 const changes=[r=>{r.learned_origin=false;},r=>{r.withdrawn=true;},r=>{r.anchor_kind='topic';},r=>{r.current_stamp='b'.repeat(64);},r=>{r.observed_source=null;},r=>{r.semantic_eligible=false;},r=>{r.supported_path=[];}];
 const rows=changes.map((change,i)=>{const r=row(i+1);change(r);return r;});const f=fixture({rows}),result=await f.owner.adoptLegacyRoots(request());assert.equal(result.adopted,0);for(const reason of ['manual','withdrawn','unpinned','stale-anchor','pending','excluded','abstained'])assert.equal(result.counts[reason],1);assert.equal(result.unclassifiedCanonicalAccessStillRequired,true);assert.deepEqual(f.canonical,f.original);
});
test('otherwise prepared source-anchored manual routes and manual topics never invoke adoption',async()=>{
 const one=row(1),two=row(2);one.source_link_method='manual-confirmed';two.topic_kind='manual';
 const f=fixture({rows:[one,two]}),result=await f.owner.adoptLegacyRoots(request());assert.equal(result.counts.manual,2);assert.equal(result.adopted,0);assert.equal(f.calls.some(c=>c.sql.includes('semantic_adopt_legacy_roots')),false);assert.deepEqual(f.canonical,f.original);assert.ok(f.rows.every(r=>r.existing_snapshot===false));
});
test('partial keyset pages carry fixed high watermark and never advance past unscanned roots',async()=>{
 const f=fixture({rows:[row(1),row(2),row(3)]}),a={...request(),limit:2};const first=await f.owner.inspectLegacyRoots(a);assert.equal(first.nextCursor,'2');assert.equal(first.scope.initialHighWatermark,'3');assert.equal(first.complete,false);
 f.rows.push(row(4));const second=await f.owner.inspectLegacyRoots({...a,cursor:first.nextCursor,initialHighWatermark:first.scope.initialHighWatermark});assert.deepEqual(second.rows.map(r=>r.rootId),['root-3']);assert.equal(second.complete,true);assert.equal(second.nextCursor,null);
});
test('stale head/policy/generation and wrong owner/isolation fail before material or mutation queries',async()=>{
 for(const config of [{head:'2'},{policy:'2'},{generation:'foreign-generation'},{role:'murmingle_app'},{role:'murmingle_ingest_worker'},{isolation:'repeatable read'}]){
  const f=fixture(config);await assert.rejects(f.owner.adoptLegacyRoots(request()));assert.equal(f.calls.some(c=>c.sql.startsWith('WITH roots')||c.sql.includes('semantic_adopt_legacy_roots')),false);assert.ok(f.calls.some(c=>c.sql==='ROLLBACK'));
 }
});
test('Source/root stale refusal and unknown COMMIT preserve original failure without automatic mutation retry',async()=>{
 const error=Object.assign(new Error('PRIVATE SQL details'),{code:'P1231'}),f=fixture({queryFailure:error});await assert.rejects(f.owner.adoptLegacyRoots(request()),e=>e.code==='conflict');assert.equal(f.transactions,1);assert.equal(f.rows[0].existing_snapshot,false);
 const g=fixture({unknownCommit:true});let caught;try{await g.owner.adoptLegacyRoots(request());}catch(e){caught=e;}assert.equal(caught,false);assert.equal(g.transactions,1);assert.equal(g.calls.filter(c=>c.sql.includes('semantic_adopt_legacy_roots')).length,1);assert.equal(g.rows[0].existing_snapshot,true);
});
test('partially applied fake SQL rolls back the batch and 42501 stays a finite failure without retry',async()=>{
 const f=fixture({rows:[row(1),row(2)],failAfterFirst:true});await assert.rejects(f.owner.adoptLegacyRoots(request()),e=>e.code==='conflict');assert.ok(f.rows.every(r=>r.existing_snapshot===false));assert.equal(f.transactions,1);assert.deepEqual(f.canonical,f.original);
 const g=fixture({queryFailure:Object.assign(new Error('PRIVATE permission context'),{code:'42501'})});await assert.rejects(g.owner.adoptLegacyRoots(request()),e=>e.code==='storage-failure'&&!e.message.includes('PRIVATE'));assert.equal(g.transactions,1);assert.equal(g.calls.filter(c=>c.sql.includes('semantic_adopt_legacy_roots')).length,1);assert.ok(g.calls.some(c=>c.sql==='ROLLBACK'));
});
test('policy-only CAS is copied before awaits, never activates matcher or changes canonical content',async()=>{
 const f=fixture(),policy={defaultMaxDepth:1,overrides:[{nodeId:'games',maxDepth:3}]},input={...request(),policy};delete input.cursor;delete input.initialHighWatermark;delete input.limit;
 const pending=f.owner.setHierarchyPolicy(input);policy.overrides[0].maxDepth=8;const result=await pending;assert.equal(result.policy.revision,2);assert.equal(result.policy.overrides[0].maxDepth,3);assert.equal(result.matcherActivated,false);assert.equal(f.calls.some(c=>/activate|register|migrate/iu.test(c.sql)),false);assert.deepEqual(f.canonical,f.original);
 assert.equal(f.calls.some(c=>c.sql.includes('FROM canonical_v4.semantic_owner_policy')&&c.sql.includes('FOR SHARE')),false);
});
test('malformed selectors, bounds, source material and oversized rows cannot dispatch adoption',async()=>{
 for(const patch of [{limit:11},{limit:0},{cursor:'1',initialHighWatermark:null},{cursor:'01'},{expectedHeadRevision:1.5},{expectedMatcherIdentityHash:'x'},{freePath:'foreign'}]){const f=fixture();await assert.rejects(f.owner.adoptLegacyRoots({...request(),...patch}));assert.equal(f.transactions,0);}
 const f=fixture();f.rows[0].candidate.embedding.payload='not-json';const invalid=await f.owner.adoptLegacyRoots(request());assert.equal(invalid.counts['invalid-material'],1);assert.equal(f.calls.some(c=>c.sql.includes('semantic_adopt_legacy_roots')),false);
 const g=fixture();g.rows[0].candidate.sourcePayload='x'.repeat(4194305);await assert.rejects(g.owner.adoptLegacyRoots(request()));assert.equal(g.calls.some(c=>c.sql.includes('semantic_adopt_legacy_roots')),false);
 assert.throws(()=>readSemanticOwnerMaintenanceInput('activate-model',request()));
});
