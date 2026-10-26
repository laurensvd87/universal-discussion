import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MAIN_SETUP_PLAN, publicNavigationCommand, ControlProtocolError, projectProtocolFailure, SOURCE_FILES, validateEligibilityResult, validateFitterCompletion, batchOutput, fatalCaseStatuses, OLD_FIT_SOURCE_PATHS, OLD_TARGET_SOURCE_PATHS, runSyntheticBrowserCallbacks } from './run.mjs';
import { ControlFatal } from './policy.js';
import { digest } from './manifest.js';
import { sha } from './policy.js';
const CONTROLS=['en','de','nl','fr'].map((language,i)=>({id:'fixture-'+i,groupId:'g-'+i,language,url:'https://'+language+'.example/article'}));
const URLS=CONTROLS.map(c=>c.url);

test('immutable setup preserves V2 guards and adds own main-document Response interception before resume', () => {
  const methods = MAIN_SETUP_PLAN.map(x => x.method);
  for (const m of ['Target.setAutoAttach', 'Network.enable', 'Network.setBypassServiceWorker', 'Network.setCacheDisabled', 'Network.setBlockedURLs', 'ServiceWorker.enable', 'ServiceWorker.stopAllWorkers', 'Fetch.enable', 'Page.enable', 'Page.setLifecycleEventsEnabled', 'Runtime.runIfWaitingForDebugger']) assert.equal(methods.filter(x => x === m).length, 1);
  assert.ok(methods.indexOf('ServiceWorker.enable') < methods.indexOf('ServiceWorker.stopAllWorkers'));
  assert.ok(methods.indexOf('Fetch.enable') < methods.indexOf('Runtime.runIfWaitingForDebugger'));
  assert.deepEqual(MAIN_SETUP_PLAN.find(c => c.method === 'Fetch.enable').params.patterns, [{ urlPattern: '*', requestStage: 'Request' }, { urlPattern: '*', resourceType: 'Document', requestStage: 'Response' }]);
  assert.ok(Object.isFrozen(MAIN_SETUP_PLAN)); for (const c of MAIN_SETUP_PLAN) assert.ok(Object.isFrozen(c.params));
});
test('navigation cannot precede private setup completion or target final/nonallowlisted URLs', () => {
  for (const done of [false, 1, null, undefined]) assert.throws(() => publicNavigationCommand(done, URLS[0], CONTROLS));
  for (const url of URLS) assert.deepEqual(publicNavigationCommand(true, url, CONTROLS), { method: 'Page.navigate', params: { url } });
  assert.throws(() => publicNavigationCommand(true, 'https://example.invalid/', CONTROLS));
});
test('CDP errors project only reviewed stage, fixed method and integer code', () => {
  const e = new ControlProtocolError('Fetch.continueResponse', -32000);
  assert.deepEqual(projectProtocolFailure({ stage: 'continue-response', method: e.method, code: e.code }), { stage: 'continue-response', method: 'Fetch.continueResponse', code: -32000, reason: 'cdp-command-rejected' });
  assert.throws(() => projectProtocolFailure({ stage: 'navigate', method: 'Browser.close', code: -1 }));
  assert.throws(() => new ControlProtocolError('Arbitrary.command', -1)); assert.throws(() => new ControlProtocolError('Page.navigate', 'private text'));
});
test('browser prerequisite requires complete exact static rights evidence, not a per-batch quality threshold and matching sources/freeze', () => {
  const hashes = { fixture: 'a'.repeat(64) }, freezeHash = 'b'.repeat(64), receipt = { fixture: true };
  const x = { schema: 'current-producer-final-result/v2', phase: 'static', status: 'complete', sourceHashesRechecked: true, freezeHash, sourceHashes: hashes,
    denominator: 4, eligibleCases: 2, compatibilityPrerequisitePassed: true, cases: CONTROLS.map((c, i) => ({ ...c, rightsTransportEligible: i < 2, status: 'unavailable', reason: i < 2 ? 'static-insufficient-text' : 'origin-robots-denied',
      ...(i < 2 ? { originPolicy: receipt, originPolicyHash: sha(JSON.stringify(receipt)), pagePolicy: { domDirectivesChecked: true }, htmlSha256: 'c'.repeat(64) } : {}) })) };
  assert.deepEqual(validateEligibilityResult(x, hashes, freezeHash, CONTROLS), [true, true, false, false]);
  for (const change of [r => r.phase = 'browser', r => r.sourceHashes = {}, r => r.cases[0].id = 'other', r => r.cases[0].pagePolicy.domDirectivesChecked = false, r => r.status = 'fatal']) {
    const c = structuredClone(x); change(c); assert.throws(() => validateEligibilityResult(c, hashes, freezeHash, CONTROLS));
  }
});

test('fixed source allowlist pins all transitive producers and DEV closure without old final inputs',async()=>{
 const base='spikes/topic-resolution/harness/current-producer-final-v2/';
 const protocol=JSON.parse(await readFile(SOURCE_FILES[base+'protocol.json'],'utf8'));
 assert.equal(protocol.batches.length,8);assert.equal(protocol.static.wholePhaseMaximumSeconds,2880);
 assert.equal(protocol.resources.packetBytes,131072);assert.equal(protocol.resources.resultBytes,65536);
 const paths=Object.keys(SOURCE_FILES);
 assert.ok(paths.includes('decisions/ADR-143-current-producer-transfer-gate.md'));
 assert.ok(paths.includes('spikes/topic-resolution/harness/current-producer-controls-v1/output-browser/supervisor.json'));
 assert.ok(paths.every(k=>!/(?:adr136|adr141|adr142|real-root-v[123]|capacity-real-root)/u.test(k)));
 for(const file of ['run.mjs','policy.js','manifest.js']){
  const source=await readFile(SOURCE_FILES[base+file],'utf8'),imports=[...source.matchAll(/from ['"]([^'"]+)['"]/gu)].map(m=>m[1]);
  assert.ok(imports.every(k=>!/(?:scorer|classifier|encoding|model|fit\.js)/u.test(k)));
 }
 const supervisor=await readFile(SOURCE_FILES[base+'supervise.py'],'utf8');
 assert.ok(supervisor.indexOf('AssignProcessToJobObject(job, process_handle)')<supervisor.indexOf('child.stdin.write('));
 assert.ok(supervisor.includes('IsProcessInJob(handle, job'));assert.ok(supervisor.includes('cleanup_deadline = time.monotonic() + 5'));
 assert.ok(supervisor.includes('packetSha256'));assert.ok(supervisor.includes("ACTIVE_LIMIT = 170 if PHASE == 'browser' else 350"));
 assert.ok(supervisor.includes('64 * 1024'));assert.ok(supervisor.includes('128 * 1024'));
});
test('only eight ordinal batch paths exist, never caller-supplied paths or adaptive ranges',()=>{
 assert.match(batchOutput('browser',8),/output-browser-08$/u);
 for(const n of [0,9,'1',1.5])assert.throws(()=>batchOutput('static',n));
 assert.throws(()=>batchOutput('../owner',1));
});
test('Python literal source map exactly equals Node keys/order and resolves to the same paths',async()=>{
 const base='spikes/topic-resolution/harness/current-producer-final-v2/';
 const text=await readFile(SOURCE_FILES[base+'supervise.py'],'utf8');
 const match=/^source_paths = \{name: REPO \/ name for name in (\[[^\r\n]+\])\}$/mu.exec(text);
 assert.ok(match,'only the reviewed literal comprehension is accepted');
 const keys=JSON.parse(match[1]);assert.deepEqual(keys,Object.keys(SOURCE_FILES));
 const root=resolve(SOURCE_FILES[base+'run.mjs'],'../../../../..');
 for(const key of keys)assert.equal(resolve(root,key),SOURCE_FILES[key]);
 assert.equal(keys.filter(k=>k.startsWith('spikes/topic-resolution/harness/current-producer-controls-v1/')).length,12);
 assert.equal(keys.includes(base+'freeze.json'),false);
});
test('fitter completion requires actual receipt/freeze bytes and successful owned cleanup/source proof',()=>{
 const h='a'.repeat(64),receiptSha256='b'.repeat(64),freezeSha256='c'.repeat(64);
 const material={schema:'current-producer-root-fit-freeze/v1',sourceHashes:{'protocol.json':h,'fit.js':h},protocolSha256:h};
 const f={...material,freezeHash:digest(material)},r={freezeHash:f.freezeHash,freezeFileSha256:freezeSha256,protocolSha256:h};
 const s={schema:'current-producer-root-fit-supervisor/v1',phase:'fit-current',reason:null,cleanupReason:null,exitCode:0,
  ownTreeCleanupConfirmed:true,sourceHashesRechecked:true,resultSha256:receiptSha256,freezeSha256,sourceHashes:material.sourceHashes};
 assert.equal(validateFitterCompletion(f,s,r,{receiptSha256,freezeSha256}),true);
 for(const change of [x=>x.reason='resource-failed',x=>x.cleanupReason='drain-failed',x=>x.exitCode=1,x=>x.ownTreeCleanupConfirmed=false,
  x=>x.sourceHashesRechecked=false,x=>x.resultSha256=h,x=>x.freezeSha256=h,x=>x.sourceHashes={},x=>x.phase='other']){
  const x=structuredClone(s);change(x);assert.throws(()=>validateFitterCompletion(f,x,r,{receiptSha256,freezeSha256}));
 }
 assert.throws(()=>validateFitterCompletion({...f,protocolSha256:'d'.repeat(64)},s,r,{receiptSha256,freezeSha256}));
 assert.throws(()=>validateFitterCompletion(f,s,{...r,freezeFileSha256:h},{receiptSha256,freezeSha256}));
 let called=0;const x=structuredClone(s);Object.defineProperty(x,'reason',{enumerable:true,get(){called++;throw 0}});
 assert.throws(()=>validateFitterCompletion(f,x,r,{receiptSha256,freezeSha256}));assert.equal(called,0);
 assert.ok(Object.keys(SOURCE_FILES).includes('apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/freeze.json'));
 assert.ok(Object.keys(SOURCE_FILES).includes('apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/output/supervisor.json'));
});
test('policy work failures never manufacture a fatal first pending article',()=>{
 const ids=Array.from({length:4},(_,i)=>'producer-transfer-'+String(25+i).padStart(3,'0'));
 const policy={phase:'static',batch:7,caseOrdinal:null,originOrdinal:3,stage:'robots'};
 assert.deepEqual(fatalCaseStatuses({ids,completedIds:[],failureContext:policy,batch:7}).map(r=>r.status),Array(4).fill('not-attempted'));
 const page={...policy,caseOrdinal:27,stage:'page'};
 assert.deepEqual(fatalCaseStatuses({ids,completedIds:ids.slice(0,2),failureContext:page,batch:7}).map(r=>r.status),['completed','completed','fatal','not-attempted']);
 assert.throws(()=>fatalCaseStatuses({ids,completedIds:[],failureContext:{...policy,caseOrdinal:25},batch:7}));
});
test('fixed old fitter source maps preserve original insertion order and never follow JSON paths',()=>{
 assert.deepEqual(Object.keys(OLD_FIT_SOURCE_PATHS).slice(0,10),['fit.js','contracts.test.js','protocol.json','supervise.py','manifest.js','methods.js','methods.test.js','README.md','producer-profiles.js','producer-profiles.test.js']);
 assert.equal(Object.keys(OLD_FIT_SOURCE_PATHS).length,16);assert.equal(Object.keys(OLD_TARGET_SOURCE_PATHS).length,11);
 for(const path of [...Object.values(OLD_FIT_SOURCE_PATHS),...Object.values(OLD_TARGET_SOURCE_PATHS)])assert.ok(Object.hasOwn(SOURCE_FILES,path));
 assert.ok(!Object.keys(SOURCE_FILES).some(k=>/\.assets\/|\.vectors\.json|\/output-(?:static|browser)-\d\d\/|\/input\.packet\.json/u.test(k)));
});
test('new namespace binds separate reviewed reuse receipt, no old-target comparison or model load',async()=>{
 const base='spikes/topic-resolution/harness/current-producer-final-v2/',source=await readFile(SOURCE_FILES[base+'run.mjs'],'utf8');
 assert.ok(source.includes('validateArtifactReuseReceipt({receipt:JSON.parse(buffers[REUSE_RECEIPT])'));
 assert.equal(source.includes('validateSelectionReceipt('),false);
 assert.ok(source.includes('oldSelectionReceiptSha256:initial.hashes[SELECTION]'));
 assert.ok(source.includes('artifactReuseReceiptSha256:initial.hashes[REUSE_RECEIPT]'));
 assert.ok(source.includes('diagnostics.length<32'));assert.ok(source.includes('<=16384'));
 const protocol=JSON.parse(await readFile(SOURCE_FILES[base+'protocol.json'],'utf8'));
 assert.equal(protocol.schema,'current-producer-final-protocol/v2');
 assert.ok(Object.hasOwn(SOURCE_FILES,'decisions/ADR-145-typed-transport-and-fixed-artifact-reobservation.md'));
 assert.ok(Object.hasOwn(SOURCE_FILES,'apps/local-service/data/hierarchy-current-producer-artifact-reuse-adr145.json'));
});
function fakeCdpFixture({boundary=null,coarse=null,networkError='net::ERR_CONNECTION_RESET',abortBeforeRetain=false,latePrevious=false,twoArticles=false,duplicate=null,distinctDuplicate=false,responseStatus=200,responseHeaders=[],failAtStop=false}={}){
 const cases=Array.from({length:4},(_,i)=>({id:'fixture-'+i,groupId:'family-'+i,language:'en',url:'https://fixture.example/article-'+i}));
 let clock=0,aborted=false,url='about:blank',article=0,frameReads=0,closed=false,fired=false;
 const listeners=new Map(),retained=[],calls=[];
 const emit=(name,p)=>{for(const fn of listeners.get(name)??[])fn(p,'session');};
 const fail=(id='network-'+article,errorText=networkError)=>emit('Network.loadingFailed',{requestId:id,type:'Document',errorText});
 const hit=name=>{if(boundary===name&&!fired){fired=true;fail();}};
 const browser={
  on(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},
  async send(method,params){
   calls.push({method,requestId:params.requestId??null});
   if(method==='Target.createTarget'){emit('Target.attachedToTarget',{sessionId:'session',targetInfo:{type:'page',url:'about:blank',targetId:'target'}});return {targetId:'target'};}
   if(method==='Page.navigate'){
    url=params.url;article++;frameReads=0;
    emit('Fetch.requestPaused',{requestId:'fetch-'+article,networkId:'network-'+article,frameId:'main',resourceType:'Document',request:{url,method:'GET',headers:{}}});
    return {frameId:'main',loaderId:'loader-'+article};
   }
   if(method==='Fetch.continueRequest'){
    emit('Fetch.requestPaused',{requestId:'response-'+article,networkId:'network-'+article,frameId:'main',resourceType:'Document',
     request:{url,method:'GET',headers:{}},...(coarse?{responseErrorReason:coarse}:{responseStatusCode:responseStatus,responseHeaders})});
    if(coarse)fail('network-'+article,networkError);
    emit('Network.responseReceived',{requestId:'network-'+article,type:'Document',frameId:'main',loaderId:'loader-'+article,
     response:{url,status:200,remoteIPAddress:'8.8.8.8',securityState:'secure',mimeType:'text/html'}});
    emit('Page.frameNavigated',{frame:{id:'main',loaderId:'loader-'+article,url}});
    emit('Page.lifecycleEvent',{name:'DOMContentLoaded',frameId:'main',loaderId:'loader-'+article});
   }
   if(method==='Page.getFrameTree'){
    if(url==='about:blank')return {frameTree:{frame:{id:'main',url:'about:blank',loaderId:'blank'}}};
    frameReads++;hit(frameReads===1?'frame':'final-frame');
    return {frameTree:{frame:{id:'main',url,loaderId:'loader-'+article}}};
   }
   if(method==='Page.createIsolatedWorld'){
    if(latePrevious&&article===2)fail('network-1','net::ERR_CERT_DATE_INVALID');
    if(duplicate){
     emit('Fetch.requestPaused',{requestId:'duplicate-'+article,networkId:distinctDuplicate?'blocked-extra':'network-'+article,
      frameId:duplicate==='unmatched-response'?'subframe':'main',resourceType:'Document',request:{url,method:'GET',headers:{}},
      ...(duplicate==='request'?{}:{responseStatusCode:200,responseHeaders:[]})});
     if(!distinctDuplicate&&networkError!==null)fail();
    }
    hit('world');return {executionContextId:1};
   }
   if(method==='Page.stopLoading'&&failAtStop)fail();
   if(method==='Runtime.evaluate'){hit('snapshot');return {result:{value:{
    capture:{contractVersion:'page-content/1',status:'collected',url,title:'Invented synthetic title',text:'Pure invented bounded callback fixture body. '.repeat(8),extractorVersion:'main-text-prefix/v1'},
    document:{url,canonicalUrl:url,robots:[],tdm:[],complete:true}}}};}
   if(method==='Target.closeTarget')return {success:true};
   return {};
  },
  async close(){closed=true;}
 };
 const run=()=>runSyntheticBrowserCallbacks({cases,eligible:[true,twoArticles,false,false],browser,clock:()=>clock,
  sleep:async ms=>{clock+=ms;if(ms>=2000)hit('dcl-delay');},
  guard:()=>{if(aborted)throw new ControlFatal('aborted');},
  beforeRetain:()=>{hit('before-retain');if(abortBeforeRetain)aborted=true;},
  onInput:value=>retained.push(value)});
 return {run,retained,calls,get closed(){return closed;}};
}
test('actual runtime callbacks collect an unfailed synthetic document without real Chrome/reader IO',async()=>{
 const f=fakeCdpFixture(),r=await f.run();assert.equal(r.collectedCases,1);assert.equal(f.retained.length,1);assert.equal(f.closed,true);
});
test('late allowed own loading failure at every post-DCL await yields unavailable and ZERO retained inputs',async()=>{
 for(const boundary of ['frame','world','dcl-delay','snapshot','final-frame','before-retain']){
  const f=fakeCdpFixture({boundary}),r=await f.run();
  assert.equal(r.collectedCases,0,boundary);assert.equal(f.retained.length,0,boundary);
  assert.equal(r.cases[0].status,'unavailable',boundary);assert.equal(r.cases[0].reason,'browser-transport-unavailable',boundary);assert.equal(f.closed,true);
 }
});
test('exact TLS/unknown loading failures after the final await cannot publish or become unavailable',async()=>{
 for(const networkError of ['net::ERR_CERT_DATE_INVALID','net::ERR_SSL_PROTOCOL_ERROR','net::ERR_PRIVATE_UNKNOWN']){
  const f=fakeCdpFixture({boundary:'before-retain',networkError});
  await assert.rejects(f.run(),e=>e instanceof ControlFatal);assert.equal(f.retained.length,0);assert.equal(f.closed,true);
 }
});
test('coarse Fetch Failed/AccessDenied/Aborted always fatal and never deliberately ignore admitted failure',async()=>{
 for(const coarse of ['Failed','AccessDenied','Aborted'])for(const networkError of ['net::ERR_CERT_DATE_INVALID','net::ERR_PRIVATE_UNKNOWN','net::ERR_CONNECTION_RESET']){
  const f=fakeCdpFixture({coarse,networkError});
  await assert.rejects(f.run(),e=>e instanceof ControlFatal);assert.equal(f.retained.length,0);
  assert.equal(f.calls.filter(c=>c.method==='Fetch.failRequest'&&c.requestId==='response-1').length,0);
  assert.equal(f.closed,true);
 }
});
test('previous retired request cannot pollute the next actual runtime article incarnation',async()=>{
 const f=fakeCdpFixture({latePrevious:true,twoArticles:true}),r=await f.run();
 assert.equal(r.collectedCases,2);assert.equal(f.retained.length,2);assert.equal(f.retained[1].id,'fixture-1');
});
test('abort injected after exact last await and immediately before synchronous retention blocks publication',async()=>{
 const f=fakeCdpFixture({abortBeforeRetain:true});
 await assert.rejects(f.run(),e=>e instanceof ControlFatal&&e.code==='aborted');
 assert.equal(f.retained.length,0);assert.equal(f.closed,true);
});

test('duplicate or unmatched Fetch sharing the live admission ID is fatal before failure evidence can be ignored',async()=>{
 for(const duplicate of ['request','response','unmatched-response'])for(const networkError of [null,'net::ERR_CONNECTION_RESET','net::ERR_CERT_DATE_INVALID','net::ERR_PRIVATE_UNKNOWN']){
  const f=fakeCdpFixture({duplicate,networkError});
  // Either concurrent fatal may win the callback catch race; neither may be unavailable.
  await assert.rejects(f.run(),e=>e instanceof ControlFatal&&(networkError!==null||e.code==='response-integrity'));
  assert.equal(f.retained.length,0);assert.equal(f.closed,true);
  assert.equal(f.calls.some(c=>c.method==='Fetch.failRequest'&&c.requestId==='duplicate-1'),false);
 }
});

test('a separately blocked duplicate cannot retire the live admission failure evidence',async()=>{
 for(const duplicate of ['request','response','unmatched-response']){
  const clean=fakeCdpFixture({duplicate,distinctDuplicate:true}),r=await clean.run();
  assert.equal(r.collectedCases,1);assert.equal(clean.retained.length,1);
  assert.ok(clean.calls.some(c=>c.method==='Fetch.failRequest'&&c.requestId==='duplicate-1'));
  const failed=fakeCdpFixture({duplicate,distinctDuplicate:true,boundary:'before-retain'}),u=await failed.run();
  assert.equal(u.cases[0].status,'unavailable');assert.equal(failed.retained.length,0);
 }
});

test('explicit HTTP/header refusals may block their admitted ID and own teardown remains unavailable with no input',async()=>{
 for(const options of [{responseStatus:403},{responseHeaders:[{name:'TDM-Reservation',value:'1'}]}]){
  const f=fakeCdpFixture({...options,failAtStop:true,networkError:'net::ERR_CERT_DATE_INVALID'}),r=await f.run();
  assert.equal(r.cases[0].status,'unavailable');assert.equal(f.retained.length,0);assert.equal(f.closed,true);
  assert.ok(f.calls.some(c=>c.method==='Fetch.failRequest'&&c.requestId==='response-1'));
 }
});
