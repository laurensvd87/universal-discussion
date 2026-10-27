import test from 'node:test';
import assert from 'node:assert/strict';
import {openInstalledHierarchyRuntimeForTest} from '../src/application/installed-hierarchy-runtime.js';
import {loadInstalledHierarchyMatcher} from '../src/application/installed-hierarchy-matcher.js';
import {readCanonicalV4MigrationManifest} from '../portable/canonical-v4/index.js';

const generation='runtime-generation',defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function fixture(profile='hierarchy17'){
 const installed=await loadInstalledHierarchyMatcher(),manifest=await readCanonicalV4MigrationManifest(profile),calls=[];let changed=false,badRights=false,badSchema=false,held=null;
 const nodes=installed.descriptor.matcherIdentity.nodes,byId=new Map(nodes.map(n=>[n.id,n]));
 const topology=()=>({generation,matcherIdentityHash:changed?'b'.repeat(64):installed.descriptor.matcherIdentityHash,
  nodes:nodes.map(n=>{const path=[];let cursor=n;while(cursor){path.unshift(cursor.id);cursor=byId.get(cursor.parentId);}return {...n,path};})});
 const database={async query(sql,args){calls.push(['query',sql,args]);
  if(sql==='SELECT version,hash FROM canonical_v4.schema_migrations ORDER BY version')return {rows:(badSchema?manifest.slice(0,9):manifest).map(({version,hash})=>({version,hash}))};
  if(sql.includes('AS container_installed'))return {rows:[{container_installed:!badRights,semantic_execute:true,container_execute:badRights,legacy_execute:false}]};
  if(sql==='SELECT * FROM canonical_v4.semantic_read_revision()')return {rows:[{generation,revision:'a'.repeat(64)}]};
  if(sql==='SELECT canonical_v4.semantic_read_topic_nodes($1) AS metadata')return {rows:[{metadata:topology()}]};
  assert.fail('Unexpected SQL');
 }};
 const resource={descriptor:{installed:installed.descriptor,productionBinding:false},
  async health(){calls.push(['health']);},startWorker(options){calls.push(['start-worker',options]);},
  async close(){calls.push(['resources-close']);},
  async prepareStoredSource(){assert.fail('Empty candidate list');},
  storedSources:{async candidates(input){calls.push(['candidates',input]);if(held)await held.promise;return {generation:input.generation,matcherIdentityHash:input.matcherIdentityHash,candidates:[]};},async reclassify(){assert.fail('No candidates');}},
 };
 const options={database,referenceMatcher:{represent:()=>[]},nextId:kind=>'runtime-'+kind,now:()=> '2026-10-27T00:00:00.000Z'};
 const openResources=async value=>{assert.equal(value.database,database);calls.push(['open-resources']);return resource;};
 return {calls,resource,options,openResources,setChanged:v=>{changed=v;},setBadRights:v=>{badRights=v;},setBadSchema:v=>{badSchema=v;},holdCandidates:()=>{held=defer();return held;}};
}
test('explicit runtime checks installed model and worker privileges before assets, then starts the worker and real coordinator',async()=>{
 const f=await fixture(),runtime=await openInstalledHierarchyRuntimeForTest(f.options,{openResources:f.openResources});
 await Promise.resolve();await Promise.resolve();
 const open=f.calls.findIndex(c=>c[0]==='open-resources'),health=f.calls.findIndex(c=>c[0]==='health'),worker=f.calls.findIndex(c=>c[0]==='start-worker');
 assert.ok(open>0&&health>open&&worker>health);assert.equal(f.calls.slice(0,open).filter(c=>c[0]==='query').length,4);
 assert.deepEqual(f.calls[worker][1],{});assert.equal(runtime.describe().testComposition,true);
 assert.equal(runtime.describe().initialGeneration,generation);await runtime.close();await runtime.close();
 assert.equal(f.calls.filter(c=>c[0]==='resources-close').length,1);
});
test('missing migration, excess worker authority or mismatched active model stops before allocating an encoder or claiming',async()=>{
 for(const bad of ['schema','rights','model']){
  const f=await fixture();if(bad==='rights')f.setBadRights(true);else if(bad==='schema')f.setBadSchema(true);else f.setChanged(true);
  await assert.rejects(openInstalledHierarchyRuntimeForTest(f.options,{openResources:f.openResources}),{code:'unavailable'});
  assert.equal(f.calls.some(c=>c[0]==='open-resources'||c[0]==='start-worker'),false);
 }
});
test('a model change during encoder initialization is rechecked and drains resources without claiming',async()=>{
 const f=await fixture();
 await assert.rejects(openInstalledHierarchyRuntimeForTest(f.options,{openResources:async value=>{const resource=await f.openResources(value);f.setChanged(true);return resource;}}),{code:'unavailable'});
 assert.equal(f.calls.filter(c=>c[0]==='resources-close').length,1);assert.equal(f.calls.some(c=>c[0]==='start-worker'),false);
});
test('runtime closes the coordinator original SQL call before releasing resources/database ownership',async()=>{
 const f=await fixture(),held=f.holdCandidates(),runtime=await openInstalledHierarchyRuntimeForTest(f.options,{openResources:f.openResources});
 while(!f.calls.some(c=>c[0]==='candidates'))await new Promise(resolve=>setImmediate(resolve));
 let closed=false;const closing=runtime.close().then(()=>{closed=true;});await Promise.resolve();await Promise.resolve();
 assert.equal(closed,false);assert.equal(f.calls.some(c=>c[0]==='resources-close'),false);
 held.resolve();await closing;assert.equal(closed,true);assert.equal(f.calls.filter(c=>c[0]==='resources-close').length,1);
});
test('malformed configuration and database errors expose no sensitive startup details',async()=>{
 const f=await fixture();
 await assert.rejects(openInstalledHierarchyRuntimeForTest({...f.options,ownerPassword:'not-an-allowed-option'},{openResources:f.openResources}));
 const bad={...f.options,database:{query:async()=>{throw Error('private connection material');}}};
 await assert.rejects(openInstalledHierarchyRuntimeForTest(bad,{openResources:f.openResources}),error=>error.code==='unavailable'&&!error.message.includes('private'));
 assert.equal(f.calls.some(c=>c[0]==='open-resources'),false);
});

test('standalone hierarchy17 runtime refuses an exact hierarchy16 installation before allocating resources',async()=>{
 const f=await fixture('hierarchy16');await assert.rejects(openInstalledHierarchyRuntimeForTest(f.options,{openResources:f.openResources}),{code:'unavailable'});
 assert.equal(f.calls.filter(call=>call[0]==='query').length,1);assert.equal(f.calls.some(call=>call[0]==='open-resources'||call[0]==='start-worker'),false);
});
