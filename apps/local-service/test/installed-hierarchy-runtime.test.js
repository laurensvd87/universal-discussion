import test from 'node:test';
import assert from 'node:assert/strict';
import {openInstalledHierarchyRuntimeForTest} from '../src/application/installed-hierarchy-runtime.js';
import {loadInstalledHierarchyMatcher} from '../src/application/installed-hierarchy-matcher.js';
import {readCanonicalV4MigrationManifest} from '../portable/canonical-v4/index.js';

const generation='runtime-generation',defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function fixture(profile='hierarchy17'){
 const installed=await loadInstalledHierarchyMatcher(),manifest=await readCanonicalV4MigrationManifest(profile),calls=[];let changed=false,badRights=false,badSchema=false,held=null,derivedHeld=null;
 const nodes=installed.descriptor.matcherIdentity.nodes,byId=new Map(nodes.map(n=>[n.id,n]));
 const topology=()=>({generation,matcherIdentityHash:changed?'b'.repeat(64):installed.descriptor.matcherIdentityHash,
  nodes:nodes.map(n=>{const path=[];let cursor=n;while(cursor){path.unshift(cursor.id);cursor=byId.get(cursor.parentId);}return {...n,path};})});
 const database={async query(sql,args){calls.push(['query',sql,args]);
  if(sql==='SELECT version,hash FROM canonical_v4.schema_migrations ORDER BY version')return {rows:(badSchema?manifest.slice(0,9):manifest).map(({version,hash})=>({version,hash}))};
  if(sql.includes('AS container_installed'))return {rows:[{container_installed:!badRights,semantic_execute:true,container_execute:badRights,legacy_execute:false}]};
  if(sql==='SELECT * FROM canonical_v4.semantic_read_revision()')return {rows:[{generation,revision:'a'.repeat(64)}]};
  if(sql==='SELECT canonical_v4.semantic_read_topic_nodes($1) AS metadata')return {rows:[{metadata:topology()}]};
  if(sql.includes('canonical_v4.named_index_tasks(')){if(derivedHeld)await derivedHeld.promise;return {rows:[{result:'[]'}]};}
  if(sql.includes('canonical_v4.named_discovery_tasks('))return {rows:[{result:'[]'}]};
  if(['named_feed_tasks','unified_search_tasks','named_public_tasks'].some(name=>sql.includes('canonical_v4.'+name+'(')))return {rows:[{result:[]}]};
  assert.fail('Unexpected SQL');
 }};
 const resource={descriptor:{installed:installed.descriptor,productionBinding:false},
  async health(){calls.push(['health']);},startWorker(options){calls.push(['start-worker',options]);},
  async stopWorker(){calls.push(['stop-worker']);},
  async close(){calls.push(['resources-close']);},
  async prepareStoredSource(){assert.fail('Empty candidate list');},
  async embedCapturedBody(){assert.fail('No public evidence task');},
  storedSources:{async candidates(input){calls.push(['candidates',input]);if(held)await held.promise;return {generation:input.generation,matcherIdentityHash:input.matcherIdentityHash,candidates:[]};},async reclassify(){assert.fail('No candidates');}},
 };
 const options={database,referenceMatcher:{represent:()=>[]},nextId:kind=>'runtime-'+kind,now:()=> '2026-10-27T00:00:00.000Z'};
 const openResources=async value=>{assert.equal(value.database,database);calls.push(['open-resources',value]);return resource;};
 return {calls,resource,options,openResources,setChanged:v=>{changed=v;},setBadRights:v=>{badRights=v;},setBadSchema:v=>{badSchema=v;},holdCandidates:()=>{held=defer();return held;},holdDerived:()=>{derivedHeld=defer();return derivedHeld;}};
}

test('automatic18 binds bounded discovery, public evidence, feeds and global search to the same resource and database',async()=>{
 const f=await fixture('hierarchy18'),runtime=await openInstalledHierarchyRuntimeForTest({...f.options,automaticTopics:true},{openResources:f.openResources});
 try{
  const deadline=performance.now()+1000;while(!f.calls.some(c=>c[0]==='query'&&c[1].includes('named_discovery_tasks('))&&performance.now()<deadline)await new Promise(resolve=>setImmediate(resolve));
  for(const name of ['named_feed_tasks','unified_search_tasks','named_public_tasks','named_index_tasks','named_discovery_tasks'])assert(f.calls.some(c=>c[0]==='query'&&c[1].includes(name+'(')),name);
  assert.equal(f.calls.filter(c=>c[0]==='open-resources').length,1);assert.equal(f.calls.find(c=>c[0]==='open-resources')[1].schemaProfile,'hierarchy18');
  assert.equal(runtime.describe().automatic.counts.failures,0);assert.equal(runtime.describe().automatic.limits.searchTasks,8);assert.equal(runtime.describe().automatic.limits.publicEvidenceTasks,2);
 }finally{await runtime.close();}
});

test('automatic18 refuses old schemas before any resource allocation and does not silently opt in on18',async()=>{
 for(const profile of ['legacy9','hierarchy16','hierarchy17']){
  const f=await fixture(profile);await assert.rejects(openInstalledHierarchyRuntimeForTest({...f.options,automaticTopics:true},{openResources:f.openResources}),{code:'unavailable'});assert(!f.calls.some(c=>c[0]==='open-resources'));
 }
 const f=await fixture('hierarchy18');await assert.rejects(openInstalledHierarchyRuntimeForTest(f.options,{openResources:f.openResources}),{code:'unavailable'});assert(!f.calls.some(c=>c[0]==='open-resources'));
});

test('automatic shutdown joins its original derived SQL before releasing the shared encoder resources',async()=>{
 const f=await fixture('hierarchy18'),held=f.holdDerived(),runtime=await openInstalledHierarchyRuntimeForTest({...f.options,automaticTopics:true},{openResources:f.openResources});
 while(!f.calls.some(c=>c[0]==='query'&&c[1].includes('named_index_tasks(')))await new Promise(resolve=>setImmediate(resolve));
 let closed=false;const closing=runtime.close().then(()=>{closed=true;});await Promise.resolve();await Promise.resolve();
 assert.equal(closed,false);assert(!f.calls.some(c=>c[0]==='resources-close'));assert.equal(f.calls.filter(c=>c[0]==='stop-worker').length,1);held.resolve();await closing;assert.equal(f.calls.filter(c=>c[0]==='resources-close').length,1);
 assert(!f.calls.some(c=>c[0]==='query'&&c[1].includes('named_discovery_tasks(')),'closing prevents the next derived phase');
});
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
 for(const automaticTopics of [null,undefined,'true',1])await assert.rejects(openInstalledHierarchyRuntimeForTest({...f.options,automaticTopics},{openResources:f.openResources}),{code:'unavailable'});
 const bad={...f.options,database:{query:async()=>{throw Error('private connection material');}}};
 await assert.rejects(openInstalledHierarchyRuntimeForTest(bad,{openResources:f.openResources}),error=>error.code==='unavailable'&&!error.message.includes('private'));
 assert.equal(f.calls.some(c=>c[0]==='open-resources'),false);
});

test('standalone hierarchy17 runtime refuses an exact hierarchy16 installation before allocating resources',async()=>{
 const f=await fixture('hierarchy16');await assert.rejects(openInstalledHierarchyRuntimeForTest(f.options,{openResources:f.openResources}),{code:'unavailable'});
 assert.equal(f.calls.filter(call=>call[0]==='query').length,1);assert.equal(f.calls.some(call=>call[0]==='open-resources'||call[0]==='start-worker'),false);
});
