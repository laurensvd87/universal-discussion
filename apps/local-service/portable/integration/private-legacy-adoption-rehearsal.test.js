import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runPrivateLegacyAdoptionRehearsalForTest as run} from './private-legacy-adoption-rehearsal.js';

const HASH='eead1b2dcd6508ebf3d5c45358c71be95e81363da7c0b8325f7466ce487ed21c';
function fixture({pending=true,empty=false,manual=false,wrongSource=false,nullPrep=false,changedCanonical=false,failPrepare=false,failClose=false,wrongBasis=false,pages=false}={}){
 const calls=[];let adopted=false,epoch=0,canonicalReads=0,closed=0;
 const root={rootId:'root-original',rootVersion:'0',ordinal:'7',topicId:'topic-original',discussionId:'discussion-original',status:pending?'pending':'eligible'};
 const canonical=()=>({digest:(changedCanonical&&canonicalReads++?'b':'a').repeat(64),root_body_hash:createHash('sha256').update('Original body').digest('hex'),bytes:2048,contributions:2,revisions:2});
 const ownerDatabase={dialect:'pg',async query(sql,args){calls.push({sql,args});
  if(sql.includes('h.matcher_hash'))return {rows:[{generation:'original-generation',matcher_hash:HASH,head_revision:'1',policy_revision:'1'}]};
  if(sql.startsWith('SET TRANSACTION'))return {rows:[]};
  if(sql.startsWith('WITH c AS MATERIALIZED')){assert.match(sql,/LIMIT 1001/);assert.match(sql,/LIMIT 4001/);return {rows:[canonical()]};}
  if(sql.startsWith('SELECT s.id'))return {rows:[{id:'source-original',ordinal:'0'}]};
  if(sql.startsWith('SELECT s.supported_path')){assert.match(sql,/s\.context_basis/);assert.match(sql,/canonical_v4\.semantic_root_snapshots/);assert.match(sql,/canonical_v4\.semantic_root_edges/);return {rows:[{supported_path:['games','video-games','gta'],context_basis:wrongBasis?'source-observation-at-root-create':'legacy-current-source-context',ancestor_edges:['games','video-games','gta']}]};}
  if(sql.includes('semantic_read_revision'))return {rows:[{generation:'original-generation',revision:String(epoch)}]};
  assert.fail('Unexpected private owner SQL');
 },async transaction(work){calls.push({transaction:true});return work(this);}};
 const workerDatabase={dialect:'pg',async query(){assert.fail('No fake direct worker SQL');},async transaction(){assert.fail('No fake worker transaction');}};
 const owner={async inspectLegacyRoots(input){calls.push({inspect:input});if(empty||manual)return {scanned:manual?1:0,rows:manual?[{...root,status:'manual'}]:[],complete:true,nextCursor:null};if(pages)return {scanned:10,rows:[],complete:false,nextCursor:String(calls.filter(c=>c.inspect).length*10)};return {scanned:1,rows:[root],complete:true,nextCursor:null};},
  async adoptLegacyRoots(input){calls.push({adopt:input});assert.equal(input.initialHighWatermark,'7');assert.equal(input.cursor,'6');assert.equal(input.limit,1);const first=!adopted;adopted=true;if(first)epoch++;return {scanned:1,rows:[root],adopted:first?1:0,counts:{existing:first?0:1}};}};
 const resources={descriptor:{installed:{matcherIdentityHash:HASH}},storedSources:{
  async candidates(input){calls.push({candidate:input});assert.equal(input.limit,1);assert.equal(input.afterOrdinal,null);return {candidates:[{sourceId:wrongSource?'foreign':'source-original',ordinal:'0'}]};},
  async reclassify(input){calls.push({reclassify:input});assert.equal(input.items.length,1);return [{sourceId:'source-original',status:'recorded'}];}},
  async prepareStoredSource(candidate){calls.push({prepare:candidate});if(failPrepare)throw false;return nullPrep?null:{sourceId:'source-original'};},async close(){calls.push({close:true});closed++;if(failClose)throw new Error('PRIVATE cleanup detail');}};
 const ports={owner:()=>owner,reference:()=>({represent(){assert.fail('No body rescore');}}),openResources:async()=>{calls.push({open:true});return resources;},
  feeds:()=>({async feedReferences(input){calls.push({feed:input});return {references:[{rootId:root.rootId,topicId:root.topicId,discussionId:root.discussionId}]};}}),
  reads:()=>({async semanticThread(input){calls.push({thread:input});return {root:{id:root.rootId,body:'Original body',replies:[{id:'reply-original',rootId:root.rootId}]},topic:{id:root.topicId},discussionId:root.discussionId};}})};
 const context={ownerDatabase,workerDatabase,originalRootHighWatermark:empty?null:'97',deadline:performance.now()+60000,checkDeadline(){}};
 return {context,ports,calls,get closed(){return closed;}};
}
test('original pending root uses exact worker candidate, stored prep, one adoption and inert repeat',async()=>{
 const f=fixture(),proof=await run(f.context,f.ports);assert.equal(proof.status,'passed');assert.equal(proof.canonicalPreserved,true);assert.equal(proof.repeatInert,true);assert.equal(proof.readVerified,true);assert.equal(proof.testComposition,true);assert.deepEqual(proof.counts,{pages:1,scanned:1,pending:1,eligible:0,prepared:1,reclassified:1,adopted:1});
 assert.equal(f.closed,1);assert.equal(f.calls.filter(c=>c.feed).length,3);assert.ok(f.calls.findIndex(c=>c.close)<f.calls.findIndex(c=>c.adopt));assert.equal(f.calls.filter(c=>c.adopt).length,2);assert.equal(f.calls.filter(c=>c.transaction).length,2);assert.equal(JSON.stringify(proof).includes('Original body'),false);assert.equal(JSON.stringify(proof).includes('source-original'),false);assert.ok(Object.isFrozen(proof.counts));
});
test('already prepared original root needs no encoder and keeps original canonical destinations',async()=>{
 const f=fixture({pending:false}),proof=await run(f.context,f.ports);assert.equal(proof.status,'passed');assert.equal(f.calls.some(c=>c.open||c.candidate||c.reclassify),false);assert.equal(f.closed,0);assert.equal(proof.resourcesClosed,true);
});
test('empty/manual-only backup and bounded scan have finite non-applicability without fresh replacement',async()=>{
 for(const config of [{empty:true},{manual:true},{pages:true}]){const f=fixture(config),proof=await run(f.context,f.ports);assert.equal(proof.status,'not-applicable');assert.equal(proof.counts.adopted,0);assert.equal(f.calls.some(c=>c.open||c.adopt),false);assert.ok(proof.counts.pages<=10);if(config.pages)assert.equal(proof.reason,'original-scan-bound');}
});
test('wrong worker candidate refuses before title preparation and retires original resource',async()=>{
 const f=fixture({wrongSource:true}),proof=await run(f.context,f.ports);assert.equal(proof.status,'failed');assert.equal(f.calls.some(c=>c.prepare||c.reclassify||c.adopt),false);assert.equal(f.closed,1);
});
test('ineligible original Source skips without fabricated observations or adoption',async()=>{
 const f=fixture({nullPrep:true}),proof=await run(f.context,f.ports);assert.equal(proof.status,'not-applicable');assert.equal(proof.reason,'original-source-ineligible');assert.equal(proof.canonicalPreserved,true);assert.equal(f.calls.some(c=>c.reclassify||c.adopt),false);assert.equal(f.closed,1);
});
test('falsy preparation failure closes once, never retries or outputs error strings',async()=>{
 const f=fixture({failPrepare:true}),proof=await run(f.context,f.ports);assert.equal(proof.status,'failed');assert.equal(f.closed,1);assert.equal(f.calls.filter(c=>c.prepare).length,1);assert.equal(f.calls.some(c=>c.adopt),false);assert.deepEqual(proof.failure,{stage:'stored-preparation',code:'PRIVATE_LEGACY_ADOPTION'});
});
test('falsy preparation remains primary when original resource close also fails',async()=>{
 const f=fixture({failPrepare:true,failClose:true}),proof=await run(f.context,f.ports);assert.equal(proof.status,'failed');assert.equal(proof.reason,'original-legacy-exercise-failed');assert.deepEqual(proof.failure,{stage:'stored-preparation',code:'PRIVATE_LEGACY_ADOPTION'});assert.equal(proof.resourcesClosed,false);assert.equal(f.closed,1);assert.equal(f.calls.some(c=>c.adopt),false);assert.equal(JSON.stringify(proof).includes('PRIVATE cleanup detail'),false);
});
test('resource close failure is primary when preparation succeeded',async()=>{
 const f=fixture({failClose:true}),proof=await run(f.context,f.ports);assert.equal(proof.status,'failed');assert.equal(proof.reason,'resource-retirement-failed');assert.equal(proof.failure.stage,'resource-retirement');assert.equal(proof.resourcesClosed,false);assert.equal(f.closed,1);assert.equal(f.calls.some(c=>c.adopt),false);
});
test('snapshot with a different stored context basis cannot pass legacy adoption proof',async()=>{
 const f=fixture({wrongBasis:true}),proof=await run(f.context,f.ports);assert.equal(proof.status,'failed');assert.equal(proof.failure.stage,'readback');assert.equal(proof.readVerified,false);assert.equal(proof.repeatInert,false);assert.equal(f.calls.some(c=>c.feed||c.thread),false);
});
test('canonical digest change refuses acceptance despite successful semantic work',async()=>{
 const f=fixture({changedCanonical:true}),proof=await run(f.context,f.ports);assert.equal(proof.status,'failed');assert.equal(proof.canonicalPreserved,false);assert.equal(proof.failure.stage,'canonical-preservation');
});
test('expired preparation observes its original settlement then drains resources without SQL publication',async()=>{
 const f=fixture(),open=f.ports.openResources;let release,entered,expired=false;
 const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 f.ports.openResources=async options=>{const resources=await open(options),prepare=resources.prepareStoredSource;return {...resources,async prepareStoredSource(candidate){entered();await gate;return prepare(candidate);}};};
 f.context.checkDeadline=()=>{if(expired)throw false;};
 let settled=false;const work=run(f.context,f.ports).finally(()=>{settled=true;});await started;expired=true;
 await Promise.resolve();assert.equal(settled,false);assert.equal(f.closed,0);release();
 const proof=await work;assert.equal(proof.status,'failed');assert.equal(f.closed,1);assert.equal(f.calls.some(c=>c.reclassify||c.adopt),false);assert.equal(proof.resourcesClosed,true);
});
test('context selectors, proxy/getter and expired deadline cannot start work',async()=>{
 const f=fixture();await assert.rejects(run({...f.context,selector:true},f.ports));let hooks=0;await assert.rejects(run(new Proxy(f.context,{get(){hooks++;throw false;}}),f.ports));assert.equal(hooks,0);
 const bad={...f.context};Object.defineProperty(bad,'deadline',{enumerable:true,get(){hooks++;return 1;}});await assert.rejects(run(bad,f.ports));assert.equal(hooks,0);
 const g=fixture();g.context.checkDeadline=()=>{throw false;};const result=await run(g.context,g.ports);assert.equal(result.status,'failed');assert.equal(g.calls.length,0);
});
