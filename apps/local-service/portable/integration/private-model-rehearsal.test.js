// Invented captures, encoder/resource and SQL ports. No model/session, database,
// network, native process or provider is opened by these tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {runPrivateModelRehearsalForTest,runPrivateModelRehearsal} from './private-model-rehearsal.js';
import {createPostgresCrawlerClient} from '../../src/crawler/postgres-ingest-client.js';
import {operationDigestFor} from '../../src/domain/source-threads.js';
import {readLearnedIngest} from '../../src/domain/learned-sources.js';

const MODEL='e5-small-q8-browser-main-prefix-v1',axis=()=>Array.from({length:384},(_,i)=>i===0?1:0);
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
 let clock=0,nextId=0,revision=1,worker=false;const events=[],status=new Map(),sources=new Map(),http=[],captures=[
  {id:'real-train-01',url:'https://en.wikipedia.org/wiki/Tetris',title:'Invented captured diet page',text:'Invented captured body one',extractorVersion:'crawler-static-html-prefix/v1',sourceInputHash:'aba50dd9302b5448b0e5b4f14792e681810e6238d45d7b524c772a21c4fd5115'},
  {id:'real-train-04',url:'https://fr.wikipedia.org/wiki/Octopoda',title:'Invented captured range page',text:'Invented captured body two',extractorVersion:'crawler-static-html-prefix/v1',sourceInputHash:'4c89c4fe4490894cd7877790a4d4021c8a1babd5accf91be0212411c7952b3ff'},
 ];
 const version=()=>({generation:'model-test-generation',revision});
 const context={workerDatabase:{query:()=>assert.fail('No physical SQL')},submitterDatabase:{query:()=>assert.fail('No physical SQL')},
  foregroundSourceId:'foreground-source',deadline:300000,checkDeadline:()=>{},readCapturedTrainingInputs:async()=>structuredClone(captures),
  readHttp:async(kind,input)=>{clock++;http.push({kind,input});if(kind==='version')return {version:version()};
   if(kind==='topics')return {version:version(),policyRevision:1,topics:[{id:'games',title:'Games',path:['games']}]};
   if(kind==='context')return {version:version(),policyRevision:1,sourceId:input.sourceId,sourceVersion:sources.has(input.sourceId)?'1':'0',
    status:sources.has(input.sourceId)?'classified':'pending',supportedPath:[],selectedPath:[],topic:null};
   assert.fail('Staged apply must not request URL discovery');},
 };
 const resources={descriptor:{productionBinding:false,titleEncoder:{modelId:MODEL,packagedAssetsVerified:false},installed:{matcherIdentityHash:'eead1b2dcd6508ebf3d5c45358c71be95e81363da7c0b8325f7466ce487ed21c'}},
  embedCapturedBody:async text=>{events.push('body');assert.ok(text.startsWith('Invented captured body'));return {modelId:MODEL,values:axis()};},
  startWorker:()=>{assert.equal(worker,false);worker=true;events.push('worker');},close:async()=>events.push('resources-close')};
 const submitter={enqueueCrawler:async(input,authority)=>{assert.equal(worker,true);events.push('enqueue');
  const digest=operationDigestFor(readLearnedIngest(input)),sourceId='completed-source-'+(sources.size+1);revision++;
  const result={version:version(),sourceId,topicId:'container-'+sources.size,assignment:'provisional',policyVersion:'hierarchy-source-container/v1',topicIds:['container-'+sources.size]};
  sources.set(sourceId,{input,digest});status.set(input.operationId,{digest,result});
  return {operationId:input.operationId,operationDigest:digest,jobClass:'crawler',state:'complete',ordinal:1,attempts:1,replayed:false,sourceId,authorityToken:null};},
  status:async request=>{const row=status.get(request.operationId);assert.equal(request.operationDigest,row.digest);return {state:'complete',result:structuredClone(row.result)};},
  renewAuthority:async()=>assert.fail('No renewal for immediate completion'),revokeAuthority:async()=>assert.fail('No revoke on success')};
 const ports={loadReference:()=>({represent:()=>axis()}),openResources:async options=>{assert.equal(options.database,context.workerDatabase);events.push('open');return resources;},
  submitter:database=>{assert.equal(database,context.submitterDatabase);return submitter;},crawler:createPostgresCrawlerClient,
  now:()=>clock,sleep:async()=>{clock++;await turn();},nextId:kind=>kind+'-'+(++nextId)};
 return {context,ports,resources,submitter,captures,events,http,sources,run:()=>runPrivateModelRehearsalForTest(context,ports)};
}

test('fixed staged client completes two exact digest-bound operations with real crawler-client protocol and bounded foreground reads',async()=>{
 const f=setup(),proof=await f.run();assert.equal(proof.status,'passed');assert.equal(proof.testComposition,true);
 assert.equal(proof.scope.realE5,false);assert.equal(proof.scope.realQueuedApply,false);assert.equal(proof.scope.fullCrawlerDiscovery,false);
 assert.equal(proof.completed.length,2);assert.deepEqual(proof.completed.map(row=>row.sourceInputHash),f.captures.map(row=>row.sourceInputHash));
 for(const row of proof.completed){assert.equal(row.operationDigest,f.sources.get(row.sourceId).digest);assert.equal(row.sourceVersion,'1');}
 assert.equal(f.events.filter(value=>value==='open').length,1);assert.equal(f.events.filter(value=>value==='worker').length,1);
 assert.equal(f.events.filter(value=>value==='body').length,2);assert.equal(f.events.filter(value=>value==='enqueue').length,2);assert.equal(f.events.at(-1),'resources-close');
 assert.equal(f.http.some(row=>row.kind==='source-urls'),false);assert.ok(proof.maximumPending<=8);
 assert.equal(proof.phases.length,6);assert.equal(proof.phases[0].context.count,3);assert.ok(proof.phases.every(row=>row.context.count<=8&&row.topics.count<=8));
 assert.deepEqual(proof.cleanup,{resourcesClosed:true,originalsSettled:true,callerDatabasesClosed:false});
 assert.equal(JSON.stringify(proof).includes('Invented captured body'),false);assert.equal(JSON.stringify(proof).includes('Invented captured diet'),false);
});
test('missing, unavailable, non-TRAIN or mismatched captures fail before encoder allocation or queue work',async()=>{
 for(const change of [rows=>rows.pop(),rows=>{rows[0].id='child-test-01';},rows=>{rows[0].url='https://foreign.example/';},
  rows=>{rows[0].text='x'.repeat(4097);},rows=>{rows[0].title='invalid\u0000title';},rows=>{rows[0].sourceInputHash='invalid';},rows=>{rows[0].sourceInputHash='a'.repeat(64);}]){
  const f=setup();change(f.captures);const proof=await f.run();assert.equal(proof.status,'failed');assert.equal(proof.failure.stage,'capture-validation');assert.deepEqual(f.events,[]);
 }
});
test('a deferred encoder initializer is observed and closed even when concurrent foreground HTTP fails',async()=>{
 const f=setup(),gate=deferred();let entered=false,finished=false;
 const initial=f.ports.openResources;f.ports.openResources=async options=>{entered=true;await gate.promise;return initial(options);};
 const http=f.context.readHttp;f.context.readHttp=async(...args)=>{if(entered)throw Error('private URL and error must not escape');return http(...args);};
 const run=f.run().then(value=>{finished=true;return value;});while(!entered)await turn();await turn();assert.equal(finished,false);assert.ok(!f.events.includes('resources-close'));
 gate.resolve();const proof=await run;assert.equal(proof.status,'failed');assert.equal(proof.failure.stage,'encoder-initialization');assert.equal(proof.cleanup.resourcesClosed,true);
 assert.equal(f.events.at(-1),'resources-close');assert.equal(JSON.stringify(proof).includes('private URL'),false);assert.ok(!f.events.includes('worker'));
});
test('deferred body work must settle before shutdown; queue application never starts after deadline failure',async()=>{
 const f=setup(),gate=deferred();let entered=false,expired=false,finished=false;
 f.resources.embedCapturedBody=async()=>{entered=true;await gate.promise;return {modelId:MODEL,values:axis()};};
 f.context.checkDeadline=()=>{if(expired)throw false;};
 const run=f.run().then(value=>{finished=true;return value;});while(!entered)await turn();expired=true;await turn();assert.equal(finished,false);assert.ok(!f.events.includes('resources-close'));
 gate.resolve();const proof=await run;assert.equal(proof.status,'failed');assert.equal(proof.failure.stage,'body-encoding-1');assert.equal(proof.cleanup.resourcesClosed,true);
 assert.ok(!f.events.includes('enqueue'));assert.equal(proof.cleanup.originalsSettled,true);
});
test('wrong model output or completion binding refuses without fallback or helper retry',async()=>{
 const wrong=setup();wrong.resources.embedCapturedBody=async()=>({modelId:'wrong-model',values:axis()});const a=await wrong.run();
 assert.equal(a.status,'failed');assert.equal(a.completed.length,0);assert.ok(!wrong.events.includes('enqueue'));assert.equal(wrong.events.at(-1),'resources-close');
 const receipt=setup(),status=receipt.submitter.status;let calls=0;
 receipt.submitter.status=async request=>{const value=await status(request);if(++calls>=2)value.result.sourceId='foreign-source';return value;};
 const b=await receipt.run();assert.equal(b.status,'failed');assert.equal(b.failure.stage,'completion-verification');assert.equal(receipt.events.filter(value=>value==='enqueue').length,1);
});
test('strict context refuses selectors and hooks; public real entry rejects arguments without starting IO',async()=>{
 const f=setup();await assert.rejects(runPrivateModelRehearsalForTest({...f.context,encoder:{}},f.ports));
 let hooks=0;const value={...f.context};Object.defineProperty(value,'workerDatabase',{enumerable:true,get(){hooks++;return f.context.workerDatabase;}});
 await assert.rejects(runPrivateModelRehearsalForTest(value,f.ports));assert.equal(hooks,0);assert.deepEqual(f.events,[]);
 await assert.rejects(runPrivateModelRehearsal());await assert.rejects(runPrivateModelRehearsal(f.context,{}));
});
test('a pending original foreground request delays retirement even after body work has completed',async()=>{
 const f=setup(),body=deferred(),http=deferred();let bodyEntered=false,httpEntered=false,finished=false,expired=false;
 f.resources.embedCapturedBody=async()=>{bodyEntered=true;await body.promise;return {modelId:MODEL,values:axis()};};
 const read=f.context.readHttp;f.context.readHttp=async(...args)=>{if(bodyEntered){httpEntered=true;await http.promise;}return read(...args);};
 f.context.checkDeadline=()=>{if(expired)throw Error('original cutoff');};
 const run=f.run().then(value=>{finished=true;return value;});while(!httpEntered)await turn();body.resolve();await turn();
 assert.equal(finished,false);assert.ok(!f.events.includes('resources-close'));expired=true;http.resolve();
 const proof=await run;assert.equal(proof.status,'failed');assert.equal(proof.cleanup.originalsSettled,true);assert.equal(proof.cleanup.resourcesClosed,true);
 assert.ok(!f.events.includes('enqueue'));
});
test('the declared source-URL reader performs bounded actual-protocol pagination rather than returning a fake inventory',async()=>{
 const f=setup();let reader,page=0;const real=f.ports.crawler,read=f.context.readHttp,embed=f.resources.embedCapturedBody;
 f.ports.crawler=options=>{reader=options.readClient;return real(options);};
 f.context.readHttp=async(kind,input)=>{if(kind!=='source-urls')return read(kind,input);page++;
  assert.deepEqual(input,{limit:100,cursor:page===1?null:'page_2'});
  return {version:{generation:'model-test-generation',revision:1},urls:['https://public.example/'+page],nextCursor:page===1?'page_2':null};};
 let inventory=null;f.resources.embedCapturedBody=async text=>{inventory??=await reader.knownSourceUrls();return embed(text);};
 const proof=await f.run();assert.equal(proof.status,'passed');assert.equal(page,2);assert.deepEqual(inventory.urls,['https://public.example/1','https://public.example/2']);
 assert.equal(proof.scope.fullCrawlerDiscovery,false);
});
test('insufficient remaining admission time or changed installed identity cannot start the owned worker',async()=>{
 const f=setup();f.context.deadline=40000;const early=await f.run();assert.equal(early.status,'failed');assert.deepEqual(f.events,[]);
 const wrong=setup();wrong.resources.descriptor.installed.matcherIdentityHash='a'.repeat(64);const proof=await wrong.run();
 assert.equal(proof.status,'failed');assert.equal(proof.installed,null);assert.ok(!wrong.events.includes('worker'));assert.equal(wrong.events.at(-1),'resources-close');
});
test('binary64 body material is canonicalized once for the digest without rewriting the original crawler submission',async()=>{
 const f=setup(),values=axis();values[0]=.600000001;values[1]=.8;
 f.resources.embedCapturedBody=async()=>({modelId:MODEL,values});const proof=await f.run();assert.equal(proof.status,'passed');
 for(const row of proof.completed){const stored=f.sources.get(row.sourceId);assert.equal(stored.input.embedding.values[0],.600000001);
  assert.notEqual(row.operationDigest,operationDigestFor(stored.input));assert.equal(row.operationDigest,operationDigestFor(readLearnedIngest(stored.input)));}
});
