import test from 'node:test';
import assert from 'node:assert/strict';
import {openHierarchyWorkerResourcesForTest,openInstalledHierarchyWorkerResources} from '../src/application/hierarchy-worker-resources.js';
import {loadInstalledHierarchyMatcher} from '../src/application/installed-hierarchy-matcher.js';
import {sourceStamp,operationDigestFor} from '../src/domain/source-threads.js';

const MODEL='e5-small-q8-browser-main-prefix-v1',axis=()=>Array.from({length:384},(_,i)=>i===0?1:0);
const defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function input(title='Invented durable public article'){
 return {expected:{generation:'worker-generation',revision:1},operationId:'worker-operation',url:'https://semantic.example.org/resource',title,
  embedding:{modelId:MODEL,values:axis()},extractorVersion:'crawler-static-html-prefix/v1'};
}
function claim(){const value=input();return {operationId:value.operationId,operationDigest:operationDigestFor(value),
 requestMaterial:JSON.stringify({url:value.url,title:value.title,embedding:value.embedding,extractorVersion:value.extractorVersion}),input:value,
 jobClass:'interactive',ordinal:0,attempts:1,leaseToken:'worker-lease',leaseUntil:'2026-10-27T12:01:00.000Z',authorityUntil:'2026-10-27T12:02:00.000Z'};}
function binary(values){const b=Buffer.alloc(20+values.length*12);for(const [offset,n] of [[0,1],[4,0],[8,701],[12,384],[16,1]])b.writeInt32BE(n,offset);
 values.forEach((n,i)=>{b.writeInt32BE(8,20+i*12);b.writeDoubleBE(n,24+i*12);});return b.toString('base64');}
async function candidate(index=0,title='Invented stored public article '+index){
 const installed=await loadInstalledHierarchyMatcher(),value=input(title),sourceId='stored-source-'+index,operationId='stored-operation-'+index;
 const digest=operationDigestFor(value),provenance='owner-local-page-embedding/v1',policyVersion='ridge1-fixed-reference-radius/v1';
 return {sourceId,ordinal:String(index),sourceVersion:'0',generation:'worker-generation',matcherIdentityHash:installed.descriptor.matcherIdentityHash,
  url:value.url,title:value.title,provenance,extractorVersion:value.extractorVersion,policyVersion,operationId,hasEmbedding:true,
  sourcePayload:JSON.stringify({id:sourceId,url:value.url,title:value.title,embedding:value.embedding,extractorVersion:value.extractorVersion,
   provenance,policyVersion,operationId,operationDigest:digest,topicIds:['canonical-topic']}),
  embedding:{sourceId,modelId:MODEL,dimensions:384,payload:JSON.stringify(value.embedding),valuesBase64:binary(axis()),values:axis()},
  receipt:{sourceId,operationId,operationDigest:digest},stamp:{sourceId,stamp:sourceStamp(value),postable:true},reuse:null};
}
function setup({encoderReady=null,embed=async()=>({modelId:MODEL,values:axis()}),semanticApply=null,repositoryFailure=false}={}){
 const state={claims:0,legacy:0,semantic:[],failed:0,encodes:0,encoderClosed:0,events:[]},completed=defer();let issued=false;
 const encoder={modelId:MODEL,embed:async title=>{state.encodes++;state.events.push('encode');return embed(title);},close:async()=>{state.encoderClosed++;state.events.push('encoder-close');}};
 const options={database:{query:()=>assert.fail('Fake resource factories own all SQL calls')},referenceMatcher:{represent:async value=>{state.events.push('represent');assert.equal(value.operationId,'worker-operation');return axis();}},
  nextId:kind=>'invented-'+kind,now:()=> '2026-10-27T12:00:00.000Z'};
 const dependencies={loadInstalled:loadInstalledHierarchyMatcher,openEncoder:async installed=>{assert.match(installed.descriptor.assets['encoder-manifest.json'].sha256,/^[a-f0-9]{64}$/u);if(encoderReady)await encoderReady.promise;state.events.push('encoder-ready');return encoder;},
  createIngestionRepository:()=>{if(repositoryFailure)throw new Error('Repository startup failed');return {
   claim:async()=>{state.claims++;state.events.push('claim');if(issued)return null;issued=true;return claim();},
   failClaim:async()=>{state.failed++;return true;},health:async()=>({ready:true}),apply:()=>{state.legacy++;assert.fail('Legacy apply prohibited');}};},
  createSemanticRepository:()=>({apply:async(c,value)=>{state.semantic.push({claim:c,value});state.events.push('semantic-apply');return semanticApply?semanticApply(c,value):{version:{generation:'worker-generation',revision:2}};}}),
  createStoredRepository:()=>({candidates:async v=>v,reclassify:async v=>v,adoptLegacyRoots:()=>assert.fail('Owner port must not be exposed')})};
 return {state,options,dependencies,completed,open:()=>openHierarchyWorkerResourcesForTest(options,dependencies)};
}

test('encoder is ready before any claim; real worker passes exact durable preparation only to semantic apply',async()=>{
 const ready=defer(),f=setup({encoderReady:ready});const opening=f.open();await Promise.resolve();assert.equal(f.state.claims,0);
 ready.resolve();const r=await opening;assert.equal(f.state.claims,0);assert.equal(r.descriptor.productionBinding,false);assert.equal(r.descriptor.titleEncoder.packagedAssetsVerified,false);
 assert.equal(r.descriptor.installed.matcherIdentity.nodes.length,18);assert.deepEqual(await r.health(),{ready:true});
 const loop=r.startWorker({onOutcome:o=>f.completed.resolve(o)});assert.equal((await f.completed.promise).outcome,'completed');await r.close();await loop.close();
 assert.equal(f.state.semantic.length,1);assert.equal(f.state.legacy,0);assert.equal(f.state.failed,0);assert.equal(f.state.encodes,1);
 const {claim:c,value}=f.state.semantic[0];assert.deepEqual(c,claim());assert.deepEqual(value.representedValues,axis());
 assert.equal(value.preparation.operationDigest,c.operationDigest);assert.equal(value.preparation.operationId,c.operationId);
 assert.equal(value.preparation.matcherIdentityHash,r.descriptor.installed.matcherIdentityHash);assert.equal(value.preparation.numericPreparedOnly,true);
 assert.equal(value.preparation.assignmentAuthority,false);assert.equal(value.preparation.titleEmbedding.modelId,MODEL);
 assert.ok(f.state.events.indexOf('encoder-ready')<f.state.events.indexOf('claim'));assert.equal(f.state.encoderClosed,1);
});

test('live and stored actual preparations share one encoder and total pending admission stays at eight',async()=>{
 const gate=defer(),entered=defer();let active=0,peak=0;
 const f=setup({embed:async()=>{active++;peak=Math.max(peak,active);entered.resolve();await gate.promise;active--;return {modelId:MODEL,values:axis()};}}),r=await f.open();
 const stored=await Promise.all(Array.from({length:8},(_,i)=>candidate(i)));
 r.startWorker({onOutcome:o=>f.completed.resolve(o)});await entered.promise;
 const pending=stored.slice(0,7).map(c=>r.prepareStoredSource(c)),settled=Promise.allSettled(pending);
 await assert.rejects(r.prepareStoredSource(stored[7]),{code:'unavailable'});assert.equal(f.state.encodes,1);
 gate.resolve();await f.completed.promise;const results=await settled;assert.ok(results.every(r=>r.status==='fulfilled'));
 assert.equal(peak,1);assert.equal(f.state.encodes,8);assert.equal(f.state.semantic.length,1);
 assert.equal(results[0].value.sourceVersion,'0');assert.equal(results[0].value.matcherIdentityHash,r.descriptor.installed.matcherIdentityHash);
 assert.equal(r.storedSources.adoptLegacyRoots,undefined);await r.close();assert.equal(f.state.encoderClosed,1);
});

test('closing waits for in-flight encoding, blocks pending publication and never applies after shutdown',async()=>{
 const gate=defer(),entered=defer(),f=setup({embed:async()=>{entered.resolve();await gate.promise;return {modelId:MODEL,values:axis()};}}),r=await f.open();
 const stored=await candidate();r.startWorker();await entered.promise;
 const queued=r.prepareStoredSource(stored),observed=assert.rejects(queued,{code:'unavailable'});
 const closing=r.close();assert.equal(f.state.encoderClosed,0);assert.throws(()=>r.startWorker(),{code:'unavailable'});
 await assert.rejects(r.prepareStoredSource(stored),{code:'unavailable'});await assert.rejects(r.storedSources.candidates({}),{code:'unavailable'});
 gate.resolve();await observed;await closing;await r.close();assert.equal(f.state.semantic.length,0);assert.equal(f.state.legacy,0);assert.equal(f.state.encoderClosed,1);
});

test('same title arriving through live and stored preparation coalesces one shared encoding without rebinding either digest',async()=>{
 const gate=defer(),entered=defer(),f=setup({embed:async()=>{entered.resolve();await gate.promise;return {modelId:MODEL,values:axis()};}}),r=await f.open();
 const stored=await candidate(0,input().title);r.startWorker({onOutcome:o=>f.completed.resolve(o)});await entered.promise;
 const work=r.prepareStoredSource(stored);await Promise.resolve();gate.resolve();const result=await work;await f.completed.promise;await r.close();
 assert.equal(f.state.encodes,1);assert.equal(result.operationId,stored.operationId);assert.equal(result.sourceId,stored.sourceId);
 assert.equal(f.state.semantic[0].value.preparation.operationId,claim().operationId);
 assert.equal(result.operationDigest,f.state.semantic[0].value.preparation.operationDigest);
});

test('encoder failures are ordinary uncertain work and never fall back to legacy apply or terminal invalid-claim failure',async()=>{
 const f=setup({embed:async()=>{throw new TypeError('Encoder infrastructure failure');}}),r=await f.open();
 r.startWorker({onOutcome:o=>f.completed.resolve(o)});assert.equal((await f.completed.promise).outcome,'representation-uncertain');await r.close();
 assert.equal(f.state.semantic.length,0);assert.equal(f.state.legacy,0);assert.equal(f.state.failed,0);
});

test('single owned worker and closed option allowlist prevent replacing repository, matcher or durable preparation',async()=>{
 const f=setup(),r=await f.open();
 for(const key of ['repository','referenceMatcher','prepareClaim'])assert.throws(()=>r.startWorker({[key]:()=>assert.fail('Injected authority')}),TypeError);
 let getters=0;const value={};Object.defineProperty(value,'idleDelayMs',{enumerable:true,get(){getters++;return 5;}});
 assert.throws(()=>r.startWorker(value),TypeError);assert.equal(getters,0);
 r.startWorker({onOutcome:o=>f.completed.resolve(o)});assert.throws(()=>r.startWorker(),{code:'unavailable'});await f.completed.promise;await r.close();
 assert.equal(f.state.semantic.length,1);assert.ok(Object.isFrozen(r.descriptor.titleEncoder));
 await assert.rejects(openInstalledHierarchyWorkerResources({...f.options,encoder:'caller-selected'}),TypeError);
});

test('early repository failure avoids encoder allocation; later startup failure closes an opened encoder',async()=>{
 const f=setup({repositoryFailure:true});await assert.rejects(f.open(),{message:'Repository startup failed'});
 assert.equal(f.state.encoderClosed,0);assert.equal(f.state.claims,0);assert.equal(f.state.events.includes('encoder-ready'),false);
 const later=setup();later.dependencies.createSemanticRepository=()=>{throw Error('Late startup failed');};
 await assert.rejects(later.open(),{message:'Late startup failed'});assert.equal(later.state.encoderClosed,1);assert.equal(later.state.claims,0);
});

test('closing retains exact outstanding SQL originals and suppresses late delivery without cancellation or retry',async()=>{
 const held=defer(),entered=defer(),f=setup();let calls=0,closed=false;
 f.dependencies.createStoredRepository=()=>({candidates:async v=>v,reclassify:()=>{calls++;entered.resolve();return held.promise;}});
 const r=await f.open(),work=r.storedSources.reclassify({invented:'request'}),rejected=assert.rejects(work,{code:'unavailable'});
 await entered.promise;const closing=r.close().then(()=>{closed=true;});await Promise.resolve();await Promise.resolve();
 assert.equal(closed,false);assert.equal(f.state.encoderClosed,0);await assert.rejects(r.health(),{code:'unavailable'});
 held.resolve([{status:'recorded'}]);await rejected;await closing;assert.equal(closed,true);assert.equal(calls,1);assert.equal(f.state.encoderClosed,1);
});

test('health and stored SQL share a finite eight-call admission limit',async()=>{
 const held=defer(),f=setup();let calls=0,startup=true;
 f.dependencies.createIngestionRepository=()=>({health:()=>{if(startup){startup=false;return Promise.resolve({schemaVersion:16});}calls++;return held.promise;},claim:async()=>null,failClaim:async()=>true});
 f.dependencies.createStoredRepository=()=>({candidates:()=>{calls++;return held.promise;},reclassify:()=>{calls++;return held.promise;}});
 const r=await f.open(),work=[r.health(),r.storedSources.candidates({}),r.storedSources.reclassify({}),...Array.from({length:5},()=>r.health())];
 const settled=Promise.allSettled(work);await assert.rejects(r.health(),{code:'unavailable'});assert.equal(calls,8);
 const closing=r.close();held.resolve({ready:true});const outcomes=await settled;assert.ok(outcomes.every(o=>o.status==='rejected'&&o.reason.code==='unavailable'));await closing;
 assert.equal(f.state.encoderClosed,1);
});

test('direct production resources refuse unregistered hierarchy schema before encoder allocation or claims',async()=>{
 const f=setup(),queries=[];
 await assert.rejects(openInstalledHierarchyWorkerResources({...f.options,database:{async query(sql){queries.push(sql);return {rows:[]};}}}),{code:'unavailable'});
 assert.deepEqual(queries,['SELECT version,hash FROM canonical_v4.schema_migrations ORDER BY version']);
 assert.equal(f.state.claims,0);assert.equal(f.state.encodes,0);
});

test('trusted resource composition selects16 health before opening its encoder',async()=>{
 const f=setup();let opened=false;
 f.dependencies.createIngestionRepository=options=>{assert.equal(options.schemaProfile,'hierarchy16');return {health:async()=>{throw Error('Invalid16 schema');}};};
 f.dependencies.openEncoder=async()=>{opened=true;assert.fail('Schema must precede encoder');};
 await assert.rejects(f.open(),{message:'Invalid16 schema'});assert.equal(opened,false);assert.equal(f.state.claims,0);
});

test('invalid database shape rejects before installed assets or encoder startup',async()=>{
 const f=setup();let loaded=0;f.dependencies.loadInstalled=()=>{loaded++;assert.fail('No expensive startup');};
 await assert.rejects(openHierarchyWorkerResourcesForTest({...f.options,database:{}},f.dependencies),TypeError);
 assert.equal(loaded,0);assert.equal(f.state.encoderClosed,0);
});
