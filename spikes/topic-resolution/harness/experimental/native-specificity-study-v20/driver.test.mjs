// Invented metadata and pure/static SOURCE checks. No actual driver invocation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {specificityWorkspaceLayout,specificityIoCatalog,validateSpecificityBootstrap,validateSpecificityStartupAck,specificityFreeze,specificityPhaseLeaf,createSpecificityDriverFailureBoundary,SPECIFICITY_DRIVER_FAILURE_STAGES,publishSpecificityTrainSelection} from './driver.mjs';
import {specificityCliConfiguration} from './execute.mjs';
import {projectSpecificityCaptureDiagnostic,createNativeCaptureCoordinator,NativeCaptureError} from './browser-capture.mjs';
import {compileSpecificityNetworkScope,compileNativeDnsPins,createNativePolicyDnsLookup,NATIVE_RESOURCE_ORIGINS} from './network-policy.js';
import {resolvePublicAddresses} from '../../../../../apps/local-service/src/crawler/public-fetch.js';
import {createInfrastructurePolicy} from '../infrastructure-identity-witness-v1/policy.mjs';
import {createArticleOwner,ArticleOwnerError} from './article-owner.mjs';
const H='a'.repeat(64),J='b'.repeat(64),K='c'.repeat(64),sha=x=>createHash('sha256').update(x).digest('hex'),digest=v=>sha(JSON.stringify(v));
const HERE='spikes/topic-resolution/harness/experimental/native-specificity-study-v20';

// Evaluate the complete actual driver text with only its module/IO capabilities
// replaced by invented ones. No production test hook or exported entry is added.
// This proves actual control flow/import/delegate wiring, not authentication,
// native issuance, physical cleanup or a funded native capture by these fakes.
async function actualDriverFixture({phase='train-cal',stop='after-capture',original,emission='write'}={}){
 const [{win32:path},{fileURLToPath,pathToFileURL},{types}]=await Promise.all([import('node:path'),import('node:url'),import('node:util')]);
 const raw=await readFile(new URL('./driver.mjs',import.meta.url),'utf8'),events=[],writes=[],published=new Map();
 const text=raw.replace(/^import .+;\r?$/gmu,'').replace(/^export /gmu,'').replaceAll('import.meta.url','moduleUrl').replace(/\bimport\(/gu,'importModule(');
 let built,prepared,emissions=0;
 const stagePaths={'manifest.json':HERE+'/manifest.json','worker.js':HERE+'/worker.js','native-adapter.js':HERE+'/native-adapter.js',
  'native-rights.js':'spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/native-rights.js',
  'chromium/page-content-reader.js':'spikes/topic-resolution/browser/chromium/page-content-reader.js','core/page-content-policy.js':'spikes/topic-resolution/browser/core/page-content-policy.js'};
 const keys=[...Object.values(stagePaths),HERE+'/source-paths.js'].sort(),staged=Buffer.from('// invented staged source');
 const sourceHashes=Object.fromEntries(keys.map(k=>[k,sha(staged)]));
 const catalog={schema:'native-specificity-source-catalog/v1',entries:keys.map(k=>({key:k,path:k,kind:'code',maximumBytes:4194304,sha256:null}))};
 const batches=Array.from({length:42},(_,i)=>({batchId:sha('invented-'+i),batchIndex:i<24?i+1:i-23,phase:i<24?'train-cal':'test',cases:[]}));
 const context={sourceHashes,contextHash:H,manifest:{batches,cases:[],manifestHash:H},panel:{panelIdentity:H},profile:{recipeHash:H},encoderHash:H,
  assetPins:{},package:{files:115,bytes:13656167},rootCandidate:{},rootReuse:{receiptHash:H}};
 const stageFor=batch=>({batchId:batch.batchId,files:[...Object.keys(stagePaths),'batch-config.js'].map(p=>({path:p,sha256:H}))});
 const node={pid:42,creationFiletime:'1',imagePathSha256:sha('win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1\0c:\\program files\\nodejs\\node.exe'),imagePathHashEncoding:'win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1'};
 const baselineBody={schema:'native-console-baseline/v1',node,console:null},baseline={...baselineBody,baselineHash:digest(baselineBody)};
 const bootstrap={schema:'native-specificity-bootstrap/v1',phase,sourceIdentityHash:H,sourceIdentityKind:phase==='prepare'?'reviewed-source-map-file':'freeze-file',sourcePathsSha256:H,
  originalNodePid:42,originalNodeCreationFiletime:'1',nodeIdentityHash:digest({pid:42,creationFileTime:'1',imagePathHash:node.imagePathSha256,pathEncoding:node.imagePathHashEncoding}),testAuditSha256:null,
  sourceMapHash:digest(sourceHashes)};
 const io={async readEntry(e){events.push('read:'+e.key);return e.key==='control:bootstrap'?Buffer.from(JSON.stringify(bootstrap)):staged;},
  async createWorkspace(){events.push('workspace');},async publishExclusive({path,bytes}){published.set(path,bytes);return {sha256:sha(bytes)};},
  async readPublishedIfPresent(){return Buffer.from(JSON.stringify({schema:'native-specificity-startup-ack/v1',phase,sourceIdentityHash:H,sourceMapHash:bootstrap.sourceMapHash,
   originalNodePid:42,originalNodeCreationFiletime:'1',readySha256:sha(published.get('ready.json')),baseline,baselineHash:baseline.baselineHash,testAuditSha256:null}));},
  async streamAssets(){events.push('assets');}};
 const capture={assertCaptureHealthy(){events.push('capture-health');},emitCaptureFailureDiagnostic(p,s,emit){
  emissions++;events.push('private:'+p+':'+s);if(emission==='throw')throw false;
  if(emission==='write')emit(Buffer.from('invented-private-wire\n'));return false;
 },captureFailureDiagnostic(){assert.fail('legacy getter in actual driver');},projectSpecificityCaptureDiagnostic(){assert.fail('public projector in actual driver');}};
 async function importModule(spec){events.push('import:'+spec);
  if(stop==='preimport'&&spec==='./source-ledger.js')throw original;
  if(spec==='./io.mjs')return {createSpecificityIo:()=>io};
  if(spec==='./source-paths.js')return {SOURCE_CATALOG:catalog};
  if(spec==='./source-ledger.js')return {createSpecificitySourceLedger:()=>({async inspect(){events.push('ledger');return context;},async recheck(){throw original;}})};
  if(spec==='./stage.js')return {STAGE_SOURCE_PATHS:Object.keys(stagePaths),buildSpecificityStage:({batch})=>stageFor(batch)};
  if(spec==='./browser-capture.mjs')return capture;
  if(['./run.mjs','./network-policy.js','./dns-resolver.js','./origin-policy.js'].includes(spec)||spec.startsWith('../../'))return {};
  assert.fail('unexpected invented import '+spec);
 }
 built=Function('path','fileURLToPath','pathToFileURL','createHash','types','moduleUrl','importModule',"'use strict';\n"+text+'\nreturn {runSpecificityDriver,specificityFreeze};')(
  path,fileURLToPath,pathToFileURL,createHash,types,new URL('./driver.mjs',import.meta.url).href,importModule);
 prepared=built.specificityFreeze(context,H,batches.map(stageFor),digest(catalog));
 const execution={createSpecificityFsProofWire:()=>({checkpoint:()=>({})}),authenticateSpecificitySourceList:()=>({paths:keys}),
  authenticateSpecificityReviewedMap:()=>({sourceHashes}),authenticateSpecificityFreeze:()=>prepared,
  async authenticateSpecificityCode(){events.push('repeat-code');},createSpecificityDrainWire(){events.push('drain');throw original;}};
 return {events,writes,emissions:()=>emissions,run:()=>built.runSpecificityDriver({phase,sourceIdentityHash:H,sourcePathsSha256:H,testAuditSha256:null,nodePid:42,
  channel:{assertHealthy(){events.push('channel-health');}},clock:()=>0,deadline:100000,execution,emitFailure:b=>{writes.push(b);return false;}})};
}

test('ADR216 complete actual driver is silent before capture import and throughout failing PREPARE',async()=>{
 for(const phase of ['prepare','train-cal'])for(const original of [undefined,null,false,0,-0,NaN,'']){
  const f=await actualDriverFixture({phase,stop:phase==='prepare'?'prepare-endcheck':'preimport',original});
  let caught=false;try{await f.run();}catch(error){caught=true;assert.ok(Object.is(error,original),'invented fixture: '+String(error)+' / '+f.events.join(','));}
  assert.equal(caught,true);assert.equal(f.emissions(),0);assert.equal(f.writes.length,0);
  assert.ok(!f.events.includes('import:./browser-capture.mjs'));
 }
});

test('ADR216 complete actual driver reaches only the private delegate after original CODE and ledger gates',async()=>{
 for(const original of [undefined,null,false,0,-0,NaN,''])for(const emission of ['write','deny','throw']){
  const f=await actualDriverFixture({original,emission});let caught=false;
  try{await f.run();}catch(error){caught=true;assert.ok(Object.is(error,original),'invented fixture: '+String(error)+' / '+f.events.join(','));}
  assert.equal(caught,true);assert.equal(f.emissions(),1);assert.equal(f.writes.length,emission==='write'?1:0);
  assert.ok(f.events.indexOf('repeat-code')<f.events.indexOf('ledger'));
  assert.ok(f.events.indexOf('ledger')<f.events.indexOf('import:./browser-capture.mjs'));
  assert.ok(f.events.includes('private:train-cal:semantic-setup'));
 }
});

test('ADR216 exact actual delegate discards private returns and has no second closure or legacy read',async()=>{
 const source=await readFile(new URL('./driver.mjs',import.meta.url),'utf8');
 const match=source.match(/function emitCaptureDiagnostic\(phase,stage,originalEmitter\)\{\s*if\(captureModule!==null\)captureModule\.emitCaptureFailureDiagnostic\(phase,stage,originalEmitter\);\s*\}/u);
 assert.ok(match);let calls=0,hooks=0;const result={get then(){hooks++;throw false;}};
 const get=Function('captureModule',"'use strict';\n"+match[0]+';return emitCaptureDiagnostic;');
 assert.equal(get(null)('prepare','startup',()=>assert.fail('early output')),undefined);
 assert.equal(get({emitCaptureFailureDiagnostic(){calls++;return result;}})('train-cal','browser-capture',()=>{}),undefined);
 assert.equal(calls,1);assert.equal(hooks,0);
 assert.equal((source.match(/captureDiagnostic:emitCaptureDiagnostic,emitCaptureDiagnostic/gu)??[]).length,1);
 assert.equal(source.includes('captureModule?.captureFailureDiagnostic()'),false);
});

test('ADR216 private composition receives exact originals and emits no legacy fallback on denial',async()=>{
 const originals=[undefined,null,false,0,-0,NaN,'',Symbol('invented'),Object.freeze({private:true})];
 for(const original of originals){let calls=0,getters=0,writes=0,boundary;
  const emit=()=>{writes++;};
  boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:emit,captureDiagnostic(){getters++;throw Error('legacy getter forbidden');},
   emitCaptureDiagnostic(phase,stage,actualEmitter){calls++;assert.equal(phase,'train-cal');assert.equal(stage,'browser-capture');assert.equal(actualEmitter,emit);assert.throws(()=>boundary.mark('completion'));return undefined;}});
  boundary.mark('browser-capture');let present=false,received;
  try{await boundary.run(()=>Promise.reject(original));}catch(error){present=true;received=error;}
  assert.equal(present,true);assert.ok(Object.is(received,original));assert.equal(calls,1);assert.equal(getters,0);assert.equal(writes,0);
 }
});

test('ADR216 private composition faults never invoke public projection or a replacement emission',async()=>{
 for(const diagnosticFault of [undefined,null,false,0,-0,NaN,'',Error('invented diagnostic failure')]){
  let calls=0,getters=0,writes=0;const original=Object.freeze({original:true});
  const boundary=createSpecificityDriverFailureBoundary({phase:'test',emitFailure(){writes++;},captureDiagnostic(){getters++;return '{}';},emitCaptureDiagnostic(){calls++;throw diagnosticFault;}});
  let caught=false;try{await boundary.run(()=>Promise.reject(original));}catch(error){caught=true;assert.equal(error,original);}
  assert.equal(caught,true);assert.equal(calls,1);assert.equal(getters,0);assert.equal(writes,0);
 }
});

test('ADR216 successful actions do not attempt private output or materialize diagnostics',async()=>{
 let observations=0;const boundary=createSpecificityDriverFailureBoundary({phase:'prepare',emitFailure(){observations++;},captureDiagnostic(){observations++;},emitCaptureDiagnostic(){observations++;}});
 assert.equal(await boundary.run(()=>17),17);assert.equal(observations,0);
});

test('ADR216 private path does not inspect arbitrary composition return hooks',async()=>{
 let hooks=0;const result=Object.freeze({get then(){hooks++;throw false;},get constructor(){hooks++;throw false;}}),original=NaN;
 const boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure(){assert.fail('no fallback');},captureDiagnostic(){assert.fail('no legacy read');},emitCaptureDiagnostic(){return result;}});
 let caught=false;try{await boundary.run(()=>Promise.reject(original));}catch(error){caught=true;assert.ok(Object.is(error,original));}
 assert.equal(caught,true);assert.equal(hooks,0);
});

// Invented owner protocol only; these calls are not native physical proof.
function compactOwnerFixture(){
 let clockFailure=false,clockError;const cases=Array.from({length:4},(_,i)=>({id:'compact-case-'+(i+1),nativeOrdinal:i+1,url:'https://publisher.org/compact-'+(i+1)}));
 const info=(targetId,type,url,attached=false)=>({targetId,type,url,attached,browserContextId:'context'});
 const base=[info('anchor','page','about:blank',true),info('ui','browser_ui','chrome://omnibox-popup.top-chrome/'),info('aim','browser_ui','chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html')];
 const owner=createArticleOwner({infrastructure:createInfrastructurePolicy(),cases,clock(){if(clockFailure)throw clockError;return 0;}});
 owner.seal({targetInfo:base[0]});for(const targetInfo of base)owner.created({targetInfo});
 const initial=owner.snapshot();
 function open(i){
  const c=cases[i],page={},frame={},target=info('article-'+(i+1),'page','about:blank');
  owner.reserve({id:c.id,ordinal:i+1,url:c.url},20000);owner.created({targetInfo:target});owner.page(page);owner.returned(page);
  target.attached=true;owner.authenticate({targetInfo:{...target}});owner.navigate('frame-'+(i+1),'blank-'+(i+1));
  owner.pageNavigation(frame,frame,c.url);owner.commit({frame:{id:'frame-'+(i+1),loaderId:'loader-'+(i+1),url:c.url}});
  owner.verifyNavigation({frameId:'frame-'+(i+1),loaderId:'loader-'+(i+1)});target.url=c.url;
  owner.lifecycle('target-info-changed',{targetInfo:{...target}});return {c,target};
 }
 return {owner,cases,base,initial,info,open,setClockFailure(value){clockFailure=true;clockError=value;},restoreClock(){clockFailure=false;}};
}

test('ADR211 all four retired owner records compact without dropping historical identity or revival refusals',async()=>{
 const f=compactOwnerFixture();let expectedBytes=f.initial.retainedBytes;
 for(let i=0;i<4;i++){
  const {target}=f.open(i),beforeRetire=f.owner.snapshot();
  assert.throws(()=>f.owner.retired(),{code:'article-retirement'});assert.deepEqual(f.owner.snapshot(),beforeRetire);
  const original=f.owner.retire();const held=f.owner.snapshot();assert.equal(held.pending,true);assert.equal(held.tombstones,i);
  f.owner.lifecycle('target-destroyed',{targetId:target.targetId});await original;
  const before=f.owner.snapshot();assert.equal(before.pending,true);assert.equal(before.tombstones,i+1);
  f.owner.retired();const after=f.owner.snapshot();
  // Existing accounting: retained ID Set32+ID length; minimal Map entry32 plus
  // terminal8+boolean8+state5+literal terminal8 =61. No arbitrary discount.
  expectedBytes+=32+target.targetId.length+61;
  assert.equal(after.retainedBytes,expectedBytes);assert.ok(before.retainedBytes-after.retainedBytes>1024);
  assert.equal(after.targets,before.targets);assert.equal(after.events,before.events);assert.equal(after.articles,i+1);assert.equal(after.tombstones,i+1);assert.equal(after.pending,false);
  for(let j=0;j<=i;j++){
   const prior=f.info('article-'+(j+1),'page',f.cases[j].url,true);
   assert.throws(()=>f.owner.created({targetInfo:prior}),{code:'article-revival'});
   assert.throws(()=>f.owner.lifecycle('target-info-changed',{targetInfo:prior}),{code:'article-identity'});
   assert.throws(()=>f.owner.lifecycle('target-destroyed',{targetId:prior.targetId}),{code:'article-lifecycle'});
   assert.throws(()=>f.owner.census({targetInfos:[...f.base,prior]},'post-load'),{code:'census-revival'});
  }
  assert.throws(()=>f.owner.reserve({id:f.cases[i].id,ordinal:i+1,url:f.cases[i].url},20000),{code:'article-slot'});
  assert.equal(f.owner.census({targetInfos:f.base},'post-load').articleTombstones,i+1);
 }
 f.owner.release();assert.throws(()=>f.owner.reserve({id:f.cases[0].id,ordinal:1,url:f.cases[0].url},20000),{code:'released'});
});

test('ADR211 compaction cannot erase a first navigation witness or pass a falsy clock failure',async()=>{
 for(const value of [undefined,null,false,0,-0,NaN,'']){
  const f=compactOwnerFixture();let first;
  try{f.owner.pageNavigation({},{} ,'about:blank');assert.fail('must refuse');}catch(error){first=error;}
  assert.ok(first instanceof ArticleOwnerError);const witness=f.owner.navigationWitnessFor(first);
  assert.deepEqual(witness,{schema:'native-article-navigation-witness/v1',predicate:'pending',state:'unexamined',urlRelation:'unexamined'});
  const {target}=f.open(0),original=f.owner.retire();f.owner.lifecycle('target-destroyed',{targetId:target.targetId});await original;
  const before=f.owner.snapshot();f.setClockFailure(value);let caught=false;
  try{f.owner.retired();}catch(error){caught=true;assert.ok(Object.is(error,value));}
  assert.equal(caught,true);assert.deepEqual(f.owner.snapshot(),before);assert.equal(f.owner.navigationWitnessFor(first),witness);
  f.restoreClock();f.owner.retired();assert.equal(f.owner.navigationWitnessFor(first),witness);
  assert.equal(f.owner.navigationWitnessFor(new ArticleOwnerError('article-navigation')),null);
  f.owner.release();assert.equal(f.owner.navigationWitnessFor(first),null);
 }
});

test('ADR211 retired identity and event budgets remain cumulative rather than resetting',async()=>{
 const f=compactOwnerFixture(),{target}=f.open(0),original=f.owner.retire();f.owner.lifecycle('target-destroyed',{targetId:target.targetId});await original;f.owner.retired();
 while(f.owner.snapshot().events<4096)f.owner.lifecycle('target-info-changed',{targetInfo:f.base[0]});
 assert.throws(()=>f.owner.lifecycle('target-info-changed',{targetInfo:f.base[0]}),{code:'event-capacity'});f.owner.release();
 const g=compactOwnerFixture(),opened=g.open(0),completion=g.owner.retire();g.owner.lifecycle('target-destroyed',{targetId:opened.target.targetId});await completion;g.owner.retired();
 let next=0;while(g.owner.snapshot().targets<32){assert.throws(()=>g.owner.created({targetInfo:g.info('unknown-'+next++,'browser','')}),{code:'unexpected-target'});}
 assert.equal(g.owner.snapshot().tombstones,1);assert.equal(g.owner.snapshot().targets,32);
 assert.throws(()=>g.owner.created({targetInfo:g.info('over-cap','browser','')}),{code:'target-capacity'});g.owner.release();
});

test('finite journey and timer witnesses fit actual driver line without replacing the original error',async()=>{
 const witness={site:'lifecycle',phase:'dispatched',blankLoaderMatch:false,lifecycleName:'firstMeaningfulPaintCandidate',seenFactsMask:127};
 const cases=[{primary:{family:'public-journey',code:'continuation-rejected'},journeyWitness:witness,timerWitness:null},
  {primary:{family:'control-unavailable',code:'origin-representation-unavailable'},journeyWitness:null,timerWitness:null},
  ...['ordinary','denial','cleanup'].map(lane=>({primary:{family:'capture',code:'article-deadline'},journeyWitness:null,timerWitness:{lane,rpc:'Page.setLifecycleEventsEnabled'}}))];
 for(const {primary,journeyWitness,timerWitness} of cases){
  const input={schema:'native-specificity-capture-failure/v1',stage:'article-retirement',rpc:'Page.setLifecycleEventsEnabled',
   primary,cleanup:{family:'control-unavailable',code:'origin-representation-unavailable'},journeyWitness,timerWitness,infrastructureWitness:null,networkWitness:null,operationWitness:null,ownerNavigationWitness:null,navigationAccountingWitness:null};
  const projected=projectSpecificityCaptureDiagnostic(input),capture=JSON.stringify(projected);
  assert.ok(Buffer.byteLength(capture)<=700);
  const original=new Error('invented original, never serialize this message'),lines=[];
  const boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:line=>lines.push(line),captureDiagnostic:()=>capture});
  boundary.mark('browser-capture');await assert.rejects(boundary.run(()=>{throw original;}),error=>error===original);
  assert.equal(lines.length,1);assert.ok(lines[0].length<=900);assert.ok(lines[0].length+31<=1024);
  assert.deepEqual(JSON.parse(lines[0]).capture,projected);assert.equal(lines[0].includes('never serialize'),false);
 }
 const original=new Error('invented original'),lines=[];
 const boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:line=>lines.push(line),captureDiagnostic:()=>{
  throw new Error('invented projection failure');}});
 await assert.rejects(boundary.run(()=>{throw original;}),error=>error===original);
 assert.equal(JSON.parse(lines[0]).capture,null);
});

test('ADR200 actual policy witness reaches the driver unchanged within700/900/1KiB bounds',async()=>{
 const policy=createInfrastructurePolicy(),anchor={targetId:'anchor',type:'page',url:'about:blank',attached:true,browserContextId:'context'};
 policy.seal({targetInfo:anchor});policy.created(policy.targetPayload({targetInfo:anchor}));
 let original;
 try{policy.created(policy.targetPayload({targetInfo:{targetId:'ui',type:'browser_ui',url:'chrome://omnibox-popup.top-chrome/',attached:true,browserContextId:'context'}}));assert.fail('must reject');}catch(error){original=error;}
 const witness=policy.readFailureWitness(original);
 assert.deepEqual(witness,{schema:'native-infrastructure-identity-witness/v1',site:'created',role:'ui-root',predicate:'attached'});
 const input={schema:'native-specificity-capture-failure/v1',stage:'target-discovery',rpc:'Target.setDiscoverTargets',primary:{family:'startup',code:'infrastructure-identity'},
  cleanup:{family:'control-unavailable',code:'origin-representation-unavailable'},journeyWitness:null,timerWitness:null,infrastructureWitness:witness,networkWitness:null,operationWitness:null,ownerNavigationWitness:null,navigationAccountingWitness:null};
 // The second projection uses the longest finite enum fields, not a claim that
 // this different tuple was observed for the actual error above.
 for(const candidate of [input,{...input,stage:'article-retirement',rpc:'Page.setLifecycleEventsEnabled',infrastructureWitness:{...witness,site:'created',role:'ui-root',predicate:'duplicate-created'}}]){
  const projected=projectSpecificityCaptureDiagnostic(candidate),capture=JSON.stringify(projected),lines=[];
  assert.ok(Buffer.byteLength(capture)<=700);
  const boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:line=>lines.push(line),captureDiagnostic:()=>capture});
  boundary.mark('browser-capture');await assert.rejects(boundary.run(()=>{throw original;}),error=>error===original);
  assert.equal(lines.length,1);assert.ok(lines[0].length<=900);assert.ok(lines[0].length+31<=1024);assert.deepEqual(JSON.parse(lines[0]).capture,projected);
  assert.equal(lines[0].includes('about:blank'),false);assert.equal(lines[0].includes('chrome://'),false);
 }
 policy.release();assert.equal(policy.readFailureWitness(original),null);
});

test('ADR201 finite unknown network witness crosses actual capture projection and driver without authority',async()=>{
 const pairs=[['unknown-network-response','response'],['unknown-network-data','data'],['unknown-loading-finished','finished'],['unknown-network-failure','failed']];
 for(const [code,event]of pairs){
  const networkWitness={schema:'native-network-observation-witness/v1',event,scheme:'unavailable',resourceType:'CSPViolationReport',frameRelation:'unavailable',loaderRelation:'unavailable'};
  const input={schema:'native-specificity-capture-failure/v1',stage:'article-retirement',rpc:'Page.setLifecycleEventsEnabled',
   primary:{family:'capture',code},cleanup:{family:'control-unavailable',code:'origin-representation-unavailable'},
   journeyWitness:null,timerWitness:null,infrastructureWitness:null,networkWitness,operationWitness:null,ownerNavigationWitness:null,navigationAccountingWitness:null};
  const projected=projectSpecificityCaptureDiagnostic(input),capture=JSON.stringify(projected),original={unserialized:'invented only'},lines=[];
  assert.deepEqual(projected.networkWitness,networkWitness);assert.ok(Buffer.byteLength(capture)<=700);
  const boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:line=>lines.push(line),captureDiagnostic:()=>capture});
  boundary.mark('browser-capture');await assert.rejects(boundary.run(()=>{throw original;}),error=>error===original);
  assert.equal(lines.length,1);assert.ok(lines[0].length<=900);assert.ok(lines[0].length+31<=1024);
  assert.deepEqual(JSON.parse(lines[0]).capture,projected);assert.equal(lines[0].includes('unserialized'),false);
  for(const change of [{primary:{family:'capture',code:'contract'}},{primary:{family:'startup',code:'infrastructure-identity'}},
   {networkWitness:{...networkWitness,event:event==='response'?'data':'response'}},
   {networkWitness:{...networkWitness,scheme:'https://invented.invalid/private'}},
   {networkWitness:{...networkWitness,extra:true}}])assert.throws(()=>projectSpecificityCaptureDiagnostic({...input,...change}));
  let hooks=0;const hostile={...networkWitness};Object.defineProperty(hostile,'scheme',{enumerable:true,get(){hooks++;throw Error('forbidden');}});
  assert.throws(()=>projectSpecificityCaptureDiagnostic({...input,networkWitness:hostile}));
  assert.throws(()=>projectSpecificityCaptureDiagnostic({...input,networkWitness:new Proxy(networkWitness,{getPrototypeOf(){hooks++;throw Error('forbidden');},ownKeys(){hooks++;throw Error('forbidden');}})}));
  assert.equal(hooks,0);
 }
});

test('ADR202 operation witness crosses the actual projection and driver within unchanged ceilings',async()=>{
 const causes=[{family:'unclassified',code:'unclassified'},
  {family:'control-unavailable',code:'origin-representation-unavailable'},
  {family:'capture',code:'unsettled-retirement'},
  {family:'startup',code:'infrastructure-identity'},
  {family:'public-journey',code:'continuation-rejected'}];
 for(const lane of ['ordinary','denial','cleanup'])for(const kind of ['sync-throw','promise-rejection'])for(const cause of causes){
  const operationWitness={lane,rpc:'Page.setLifecycleEventsEnabled',kind,cause};
  const input={schema:'native-specificity-capture-failure/v1',stage:'article-retirement',rpc:'Target.getTargets',
   primary:{family:'capture',code:'client-operation'},cleanup:{family:'control-unavailable',code:'origin-representation-unavailable'},
   journeyWitness:null,timerWitness:null,infrastructureWitness:null,networkWitness:null,operationWitness,ownerNavigationWitness:null,navigationAccountingWitness:null};
  const projected=projectSpecificityCaptureDiagnostic(input),capture=JSON.stringify(projected),lines=[],first={private:'must not emit'};
  assert.deepEqual(projected.operationWitness,operationWitness);assert.equal(projected.rpc,'Target.getTargets');
  assert.ok(Buffer.byteLength(capture)<=700);assert.ok(Object.isFrozen(projected.operationWitness.cause));
  const boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:b=>lines.push(b),captureDiagnostic:()=>capture});
  boundary.mark('browser-capture');await assert.rejects(boundary.run(()=>{throw first;}),e=>e===first);
  assert.equal(lines.length,1);assert.ok(lines[0].length<=900);assert.ok(lines[0].length+31<=1024);
  assert.deepEqual(JSON.parse(lines[0]).capture,projected);assert.equal(lines[0].includes('must not emit'),false);
 }
});

test('ADR202 actual executor association reaches the driver rather than borrowing the last RPC',async()=>{
 for(const sync of [true,false]){
  let rejectOriginal,observed,first,lastRpc='Fetch.failRequest',timerCount=0;
  const coordinator=createNativeCaptureCoordinator({guard:()=>{},clock:()=>0,until:()=>20000,
   schedule:()=>++timerCount,cancel:()=>{},onFailure:error=>{
    if(first!==undefined)return;first=error;observed=coordinator.operationWitnessFor(error);
   }});
  const cause=new NativeCaptureError('unsettled-retirement');
  const pending=coordinator.resolveFetch(()=>{if(sync)throw cause;return new Promise((_,reject)=>{rejectOriginal=reject;});},'Fetch.failRequest');
  const rejected=assert.rejects(pending,e=>e===first&&e!==cause);
  await Promise.resolve();lastRpc='Target.getTargets';
  if(!sync){await coordinator.rpc(()=>Promise.resolve(true),lastRpc);rejectOriginal(cause);}
  await rejected;
  assert.deepEqual(observed,{lane:'denial',rpc:'Fetch.failRequest',kind:sync?'sync-throw':'promise-rejection',cause:{family:'capture',code:'unsettled-retirement'}});
  assert.equal(timerCount,sync?1:2);assert.equal(coordinator.operationWitnessFor(cause),null);
  assert.equal(coordinator.operationWitnessFor(new NativeCaptureError('client-operation')),null);
  const capture=JSON.stringify(projectSpecificityCaptureDiagnostic({schema:'native-specificity-capture-failure/v1',stage:'article-retirement',rpc:lastRpc,
   primary:{family:'capture',code:'client-operation'},cleanup:null,journeyWitness:null,timerWitness:null,infrastructureWitness:null,networkWitness:null,operationWitness:observed,ownerNavigationWitness:null,navigationAccountingWitness:null}));
  const lines=[],boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:b=>lines.push(b),captureDiagnostic:()=>capture});
  await assert.rejects(boundary.run(()=>{throw first;}),e=>e===first);
  assert.equal(JSON.parse(lines[0]).capture.operationWitness.rpc,'Fetch.failRequest');
  assert.equal(JSON.parse(lines[0]).capture.rpc,'Target.getTargets');assert.ok(lines[0].length+31<=1024);
  coordinator.dispose();
 }
});

test('ADR202 malformed operation observations cannot replace the first failure or invoke hooks',async()=>{
 const witness={lane:'denial',rpc:'Fetch.failRequest',kind:'promise-rejection',cause:{family:'unclassified',code:'unclassified'}};
 const input={schema:'native-specificity-capture-failure/v1',stage:'article-retirement',rpc:'page.close',
  primary:{family:'capture',code:'client-operation'},cleanup:null,journeyWitness:null,timerWitness:null,infrastructureWitness:null,networkWitness:null,operationWitness:witness,ownerNavigationWitness:null,navigationAccountingWitness:null};
 let hooks=0;const getter={...witness};Object.defineProperty(getter,'rpc',{enumerable:true,get(){hooks++;throw Error('forbidden');}});
 const proxy=new Proxy(witness,{ownKeys(){hooks++;throw Error('forbidden');},getPrototypeOf(){hooks++;throw Error('forbidden');}});
 const causeGetter={...witness.cause};Object.defineProperty(causeGetter,'family',{enumerable:true,get(){hooks++;throw Error('forbidden');}});
 const variants=[{primary:{family:'capture',code:'contract'}},{primary:{family:'startup',code:'infrastructure-identity'}},
  ...[{...witness,lane:'background'},{...witness,rpc:'arbitrary private URL'},
   {...witness,kind:'timeout'},{...witness,cause:{family:'unclassified',code:'private error'}},
   {...witness,cause:{family:'unclassified',code:'unclassified',raw:'private'}},
   {...witness,extra:true},getter,proxy,{...witness,cause:causeGetter},
   {...witness,cause:new Proxy(witness.cause,{getPrototypeOf(){hooks++;throw Error('forbidden');}})}].map(operationWitness=>({operationWitness}))];
 for(const change of variants){
  const first=Object.freeze({private:'not serialized'}),lines=[];
  const boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:b=>lines.push(b),
   captureDiagnostic:()=>JSON.stringify(projectSpecificityCaptureDiagnostic({...input,...change}))});
  await assert.rejects(boundary.run(()=>{throw first;}),e=>e===first);
  assert.equal(lines.length,1);assert.equal(JSON.parse(lines[0]).capture,null);assert.ok(lines[0].length+31<=1024);
 }
 assert.equal(hooks,0);
});

test('ADR209 correlated owner DTO data crosses the actual validator and driver within original byte limits',async()=>{
 const rows=[['pending','unexamined','unexamined'],['frame','unexamined','unexamined'],
  ...['blank','other','unavailable'].map(relation=>['target','absent',relation]),
  ...['provisional','authenticated','retiring','terminal'].map(state=>['state',state,'unexamined']),
  ...['navigating','reading'].flatMap(state=>[['repeat',state,'unexamined'],...['blank','other','unavailable'].map(relation=>['url',state,relation])])];
 for(const [predicate,state,urlRelation]of rows){
  const ownerNavigationWitness={schema:'native-article-navigation-witness/v1',predicate,state,urlRelation};
  const input={schema:'native-specificity-capture-failure/v1',stage:'article-retirement',rpc:'Page.setLifecycleEventsEnabled',
   primary:{family:'article-owner',code:'article-navigation'},cleanup:{family:'control-unavailable',code:'origin-representation-unavailable'},
   journeyWitness:null,timerWitness:null,infrastructureWitness:null,networkWitness:null,operationWitness:null,ownerNavigationWitness,navigationAccountingWitness:null};
  const projected=projectSpecificityCaptureDiagnostic(input),capture=JSON.stringify(projected);
  assert.deepEqual(projected.ownerNavigationWitness,ownerNavigationWitness);assert.ok(Object.isFrozen(projected.ownerNavigationWitness));
  assert.ok(Buffer.byteLength(capture)<=700);
  const first=new Error('invented private exception, never serialized'),lines=[];
  const boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:line=>lines.push(line),captureDiagnostic:()=>capture});
  boundary.mark('browser-capture');await assert.rejects(boundary.run(()=>{throw first;}),error=>error===first);
  assert.equal(lines.length,1);assert.ok(Buffer.byteLength(lines[0])<=900);assert.ok(Buffer.byteLength(lines[0])+31<=1024);
  assert.deepEqual(JSON.parse(lines[0]).capture,projected);assert.equal(lines[0].includes('private exception'),false);
 }
 // These are closed DTO/transport checks, not native provenance. The actual
 // capture tests separately prove the private exact-original-error association.
});

test('ADR209 incompatible owner enum combinations and hostile DTOs cannot replace an earlier falsy original',async()=>{
 const witness={schema:'native-article-navigation-witness/v1',predicate:'url',state:'reading',urlRelation:'other'};
 const input={schema:'native-specificity-capture-failure/v1',stage:'article-navigation',rpc:'Page.navigate',
  primary:{family:'article-owner',code:'article-navigation'},cleanup:null,
  journeyWitness:null,timerWitness:null,infrastructureWitness:null,networkWitness:null,operationWitness:null,ownerNavigationWitness:witness,navigationAccountingWitness:null};
 let hooks=0;const getter={...witness};Object.defineProperty(getter,'state',{enumerable:true,get(){hooks++;throw Error('forbidden');}});
 const proxy=new Proxy(witness,{getPrototypeOf(){hooks++;throw Error('forbidden');},ownKeys(){hooks++;throw Error('forbidden');}});
 const badWitnesses=[getter,proxy,{...witness,raw:'https://private.invalid/'},{...witness,schema:'other'},
  {...witness,predicate:'pending',state:'unexamined',urlRelation:'blank'},
  {...witness,predicate:'frame',state:'navigating',urlRelation:'unexamined'},
  {...witness,predicate:'target',state:'absent',urlRelation:'unexamined'},
  {...witness,predicate:'state',state:'reading',urlRelation:'unexamined'},
  {...witness,predicate:'repeat',urlRelation:'blank'},
  {...witness,state:'absent'},{...witness,urlRelation:'case'}];
 const changes=[{primary:{family:'capture',code:'client-operation'}},{primary:{family:'article-owner',code:'released'}},
  ...badWitnesses.map(ownerNavigationWitness=>({ownerNavigationWitness}))];
 for(const change of changes){
  const lines=[],boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:line=>lines.push(line),
   captureDiagnostic:()=>JSON.stringify(projectSpecificityCaptureDiagnostic({...input,...change}))});
  const outcome=await boundary.run(()=>{throw false;}).then(()=>({failed:false}),error=>({failed:true,error}));
  assert.deepEqual(outcome,{failed:true,error:false});assert.equal(lines.length,1);assert.equal(JSON.parse(lines[0]).capture,null);
  assert.ok(Buffer.byteLength(lines[0])+31<=1024);
 }
 const missing={...input};delete missing.ownerNavigationWitness;assert.throws(()=>projectSpecificityCaptureDiagnostic(missing));assert.equal(hooks,0);
});

test('ADR211 every correlated navigation callsite crosses real capture and driver projectors under700/900/1024',async()=>{
 const states=[['active','matched'],['active','unmatched'],['sealed','matched'],['sealed','unmatched'],
  ['retiring','matched'],['retiring','unmatched'],['released','unmatched'],['unavailable','unavailable']];
 let combinations=0;
 for(const site of ['fresh','within','public','read','seal','retire'])for(const [state,balance]of states)
 for(const urlRelation of ['within','public'].includes(site)?['exact','different','blank','unavailable']:['not-examined']){
  const navigationAccountingWitness={schema:'native-main-navigation-observation/v1',site,state,balance,urlRelation};
  const input={schema:'native-specificity-capture-failure/v1',stage:'article-retirement',rpc:'Page.setLifecycleEventsEnabled',
   primary:{family:'unclassified',code:'unclassified'},cleanup:{family:'control-unavailable',code:'origin-representation-unavailable'},
   journeyWitness:null,timerWitness:null,infrastructureWitness:null,networkWitness:null,operationWitness:null,ownerNavigationWitness:null,navigationAccountingWitness};
  const projected=projectSpecificityCaptureDiagnostic(input),capture=JSON.stringify(projected),lines=[];
  assert.deepEqual(projected.navigationAccountingWitness,navigationAccountingWitness);
  assert.ok(Object.isFrozen(projected));assert.ok(Object.isFrozen(projected.navigationAccountingWitness));
  assert.deepEqual(Object.keys(projected.navigationAccountingWitness),['schema','site','state','balance','urlRelation']);
  assert.ok(Buffer.byteLength(capture)<=700);
  const first=Object.freeze({private:'not serialized'}),boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:b=>lines.push(b),captureDiagnostic:()=>capture});
  boundary.mark('browser-capture');await assert.rejects(boundary.run(()=>{throw first;}),e=>e===first);
  assert.equal(lines.length,1);assert.ok(Buffer.byteLength(lines[0])<=900);assert.ok(Buffer.byteLength(lines[0])+31<=1024);
  assert.deepEqual(JSON.parse(lines[0]).capture,projected);assert.equal(lines[0].includes('not serialized'),false);combinations++;
 }
 assert.equal(combinations,96);
});

test('ADR211 mismatched callsite DTOs and unsafe descriptors cannot replace any falsy first original',async()=>{
 const witness={schema:'native-main-navigation-observation/v1',site:'within',state:'active',balance:'matched',urlRelation:'exact'};
 const base={schema:'native-specificity-capture-failure/v1',stage:'article-navigation',rpc:'Page.navigate',
  primary:{family:'unclassified',code:'unclassified'},cleanup:null,journeyWitness:null,timerWitness:null,infrastructureWitness:null,
  networkWitness:null,operationWitness:null,ownerNavigationWitness:null,navigationAccountingWitness:witness};
 let hooks=0;
 const getter={...witness};Object.defineProperty(getter,'state',{enumerable:true,get(){hooks++;throw Error('hook');}});
 const proxy=new Proxy(witness,{getPrototypeOf(){hooks++;throw Error('hook');},ownKeys(){hooks++;throw Error('hook');}});
 const symbol={...witness,[Symbol('extra')]:true};
 const malformed=[getter,proxy,symbol,{...witness,schema:'other'},{...witness,extra:'private'},
  {...witness,site:'response'},{...witness,state:'reading'},{...witness,balance:'balanced'},
  {...witness,urlRelation:'https://private.invalid/secret'},{...witness,urlRelation:'not-examined'},
  {...witness,site:'public',urlRelation:'not-examined'},
  ...['fresh','read','seal','retire'].map(site=>({...witness,site})),
  {...witness,state:'released',balance:'matched'},{...witness,state:'unavailable',balance:'matched'},
  {...witness,state:'active',balance:'unavailable'}];
 const changes=[...malformed.map(navigationAccountingWitness=>({navigationAccountingWitness})),
  {primary:{family:'capture',code:'contract'}},{primary:{family:'article-owner',code:'article-navigation'}},
  {journeyWitness:{site:'commit',phase:'dispatched',blankLoaderMatch:false,lifecycleName:'non-lifecycle',seenFactsMask:1}},
  {timerWitness:{lane:'ordinary',rpc:'Page.navigate'}},
  {infrastructureWitness:{schema:'native-infrastructure-identity-witness/v1',site:'created',role:'other',predicate:'type'}},
  {networkWitness:{schema:'native-network-observation-witness/v1',event:'response',scheme:'https',resourceType:'Document',frameRelation:'main',loaderRelation:'main'}},
  {operationWitness:{lane:'ordinary',rpc:'Page.navigate',kind:'sync-throw',cause:{family:'unclassified',code:'unclassified'}}},
  {ownerNavigationWitness:{schema:'native-article-navigation-witness/v1',predicate:'repeat',state:'navigating',urlRelation:'unexamined'}}];
 const missing={...base};delete missing.navigationAccountingWitness;assert.throws(()=>projectSpecificityCaptureDiagnostic(missing));
 for(const change of changes)for(const first of [undefined,null,false,0,-0,NaN,'']){
  const lines=[],boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:b=>lines.push(b),
   captureDiagnostic:()=>JSON.stringify(projectSpecificityCaptureDiagnostic({...base,...change}))});
  const outcome=await boundary.run(()=>{throw first;}).then(()=>({failed:false}),error=>({failed:true,error}));
  assert.equal(outcome.failed,true);assert.ok(Object.is(outcome.error,first));
  assert.equal(lines.length,1);assert.equal(JSON.parse(lines[0]).capture,null);assert.ok(Buffer.byteLength(lines[0])+31<=1024);
 }
 assert.equal(hooks,0);
});

test('actual publication seam preserves completed no-reference outcome and selected binding',async()=>{
 const no={status:'no-reference-set',accounted:96,referenceCount:0,calibrationSelections:0,testAllowed:false};
 let takes=0,publishes=0,guards=0;
 const caps={takeSelection:()=>{takes++;return {selectionIdentity:H,referencePacket:{packetHash:J,artifactHash:K}};},
  publishSelection:value=>{publishes++;assert.equal(value.selectionIdentity,H);return Promise.resolve(K);},guard:()=>{guards++;}};
 assert.equal(await publishSpecificityTrainSelection({semantic:no,...caps}),null);
 assert.deepEqual({takes,publishes},{takes:0,publishes:0});assert.equal(guards,2);
 const selected={status:'selected-pending-independent-audit',accounted:96,referenceCount:48,calibrationSelections:1,selectionIdentity:H,packetHash:J,artifactHash:K,testAllowed:false};
 assert.equal(await publishSpecificityTrainSelection({semantic:selected,...caps}),K);
 assert.deepEqual({takes,publishes},{takes:1,publishes:1});
});

test('malformed TRAIN unions and selected packets fail before artifact publication without hooks',async()=>{
 const no={status:'no-reference-set',accounted:96,referenceCount:0,calibrationSelections:0,testAllowed:false};
 let takes=0,publishes=0,hooks=0;
 const caps={takeSelection:()=>{takes++;return {};},publishSelection:()=>{publishes++;return H;},guard:()=>true};
 for(const change of [{status:'other'},{accounted:95},{referenceCount:1},{calibrationSelections:1},{testAllowed:true},{extra:true},{selectionIdentity:H}])
  await assert.rejects(publishSpecificityTrainSelection({semantic:{...no,...change},...caps}));
 const hostile={...no};Object.defineProperty(hostile,'status',{enumerable:true,get(){hooks++;throw Error('hook');}});
 await assert.rejects(publishSpecificityTrainSelection({semantic:hostile,...caps}));
 await assert.rejects(publishSpecificityTrainSelection({semantic:new Proxy(no,{get(){hooks++;throw Error('hook');}}),...caps}));
 assert.deepEqual({takes,publishes,hooks},{takes:0,publishes:0,hooks:0});
 const selected={status:'selected-pending-independent-audit',accounted:96,referenceCount:1,calibrationSelections:1,selectionIdentity:H,packetHash:J,artifactHash:K,testAllowed:false};
 for(const change of [{referenceCount:0},{referenceCount:49},{referenceCount:1.5},{calibrationSelections:0},{packetHash:'invalid'}])
  await assert.rejects(publishSpecificityTrainSelection({semantic:{...selected,...change},...caps}));
 for(const packet of [{}, {selectionIdentity:J,referencePacket:{packetHash:J,artifactHash:K}},
  {selectionIdentity:H,referencePacket:{packetHash:H,artifactHash:K}},{selectionIdentity:H,referencePacket:{packetHash:J,artifactHash:H}}])
  await assert.rejects(publishSpecificityTrainSelection({semantic:selected,...caps,takeSelection:()=>packet}));
 assert.equal(publishes,0);
 const bound={selectionIdentity:H,referencePacket:{packetHash:J,artifactHash:K}};
 await assert.rejects(publishSpecificityTrainSelection({semantic:selected,...caps,takeSelection:()=>bound,publishSelection:()=>null}));
 await assert.rejects(publishSpecificityTrainSelection({semantic:no,...caps,guard:()=>false}));
});
test('driver diagnostics preserve exact falsy first error and successful actions stay silent',async()=>{
 for(const first of [null,undefined,false,0,'',new Error('invented secret must not be serialized')]){
  const lines=[];const boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:b=>{lines.push(b);return true;},captureDiagnostic:()=>null});
  boundary.mark('browser-capture');let caught=false;
  try{await boundary.run(async()=>{throw first;});}catch(e){caught=true;assert.equal(e,first);}
  assert.equal(caught,true);assert.equal(lines.length,1);assert.ok(lines[0].length+31<=1024);
  assert.deepEqual(JSON.parse(lines[0]),{schema:'native-specificity-execution-failure/v1',phase:'train-cal',stage:'browser-capture',capture:null});
  assert.equal(lines[0].includes('secret'),false);assert.throws(()=>boundary.mark('checks'));
  await assert.rejects(boundary.run(()=>{assert.fail('must not retry');}));assert.equal(lines.length,1);
 }
 const lines=[];const boundary=createSpecificityDriverFailureBoundary({phase:'prepare',emitFailure:b=>lines.push(b),captureDiagnostic:()=>{assert.fail('success must not inspect capture');}});
 assert.equal(await boundary.run(async()=>17),17);assert.equal(lines.length,0);
});

test('diagnostic getter/emitter failure, oversized text and hostile hooks cannot replace original failure',async()=>{
 const first=new Error('original');let hooks=0;
 const hostile=new Proxy({}, {get(){hooks++;throw Error('hook');},getPrototypeOf(){hooks++;throw Error('hook');}});
 for(const captureDiagnostic of [()=>{throw new Error('diagnostic');},()=>hostile,()=>'{"secret":"'+ 'x'.repeat(1000)+'"}',()=>'{broken',()=>'{"bad":"\ud800"}']){
  const lines=[];const boundary=createSpecificityDriverFailureBoundary({phase:'test',emitFailure:b=>{lines.push(b);throw hostile;},captureDiagnostic});
  try{await boundary.run(()=>{throw first;});assert.fail('must fail');}catch(e){assert.equal(e,first);}
  assert.equal(lines.length,1);assert.equal(JSON.parse(lines[0]).capture,null);assert.ok(lines[0].length<900);
 }
 assert.equal(hooks,0);
 assert.throws(()=>createSpecificityDriverFailureBoundary({phase:'test',emitFailure:hostile,captureDiagnostic:()=>null}));assert.equal(hooks,0);
 const lines=[];const boundary=createSpecificityDriverFailureBoundary({phase:'test',emitFailure:b=>{lines.push(b);return Promise.reject(new Error('emitter'));},captureDiagnostic:()=>null});
 try{await boundary.run(()=>{throw false;});}catch(e){assert.equal(e,false);}await new Promise(resolve=>setImmediate(resolve));assert.equal(lines.length,1);
 assert.equal(new Set(SPECIFICITY_DRIVER_FAILURE_STAGES).size,SPECIFICITY_DRIVER_FAILURE_STAGES.length);
 assert.throws(()=>boundary.mark('untrusted URL or stage'));
});
function bootstrap(phase='prepare'){
 const encoding='win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1',node={pid:17,creationFiletime:'123456789012345',imagePathSha256:sha(encoding+'\0c:\\program files\\nodejs\\node.exe'),imagePathHashEncoding:encoding};
 const b={schema:'native-specificity-bootstrap/v1',phase,sourceIdentityHash:H,sourceIdentityKind:phase==='prepare'?'reviewed-source-map-file':'freeze-file',sourcePathsSha256:J,sourceMapHash:K,testAuditSha256:phase==='test'?J:null,originalNodePid:17,originalNodeCreationFiletime:node.creationFiletime,
  nodeIdentityHash:digest({pid:node.pid,creationFileTime:node.creationFiletime,imagePathHash:node.imagePathSha256,pathEncoding:node.imagePathHashEncoding})};
 return {b,node,expected:{phase,sourceIdentityHash:H,sourcePathsSha256:J,nodePid:17,testAuditSha256:b.testAuditSha256}};
}
test('closed CLI requires exact Windows/supervisor bindings and TEST-only external audit pin',()=>{
 const environment={MURMINGLE_NATIVE_SPECIFICITY_SUPERVISED:'1',MURMINGLE_NATIVE_SPECIFICITY_SOURCE_IDENTITY:H,MURMINGLE_NATIVE_SPECIFICITY_SOURCE_LIST:J};
 for(const [flag,phase]of [['--prepare','prepare'],['--run-train-cal','train-cal']])assert.equal(specificityCliConfiguration([flag],environment,'win32').phase,phase);
 assert.throws(()=>specificityCliConfiguration(['--run-test'],environment,'win32'));
 assert.equal(specificityCliConfiguration(['--run-test'],{...environment,MURMINGLE_NATIVE_SPECIFICITY_TEST_AUDIT:K},'win32').testAuditSha256,K);
 for(const args of [[],['--prepare','--run-test'],['--run'],['--prepare=1']])assert.throws(()=>specificityCliConfiguration(args,environment,'win32'));
 assert.throws(()=>specificityCliConfiguration(['--prepare'],environment,'linux'));
 assert.throws(()=>specificityCliConfiguration(['--prepare'],{...environment,MURMINGLE_NATIVE_SPECIFICITY_TEST_AUDIT:K},'win32'));
 let calls=0;const bad={...environment};Object.defineProperty(bad,'MURMINGLE_NATIVE_SPECIFICITY_SUPERVISED',{get(){calls++;return '1';}});assert.throws(()=>specificityCliConfiguration(['--prepare'],bad,'win32'));assert.equal(calls,0);
});
test('fresh workspace layout contains exact stage7 perbatch without adopting Chrome descendants',()=>{
 for(const [phase,count]of [['prepare',0],['train-cal',24],['test',18]]){
  const layout=specificityWorkspaceLayout(phase);assert.equal(layout.directories.length,count*5);assert.equal(layout.files.filter(f=>f.path.includes('/extension/')).length,count*7);
  assert.equal(new Set(layout.files.map(f=>f.path)).size,layout.files.length);assert.ok(Object.isFrozen(layout));
  assert.equal(layout.files.some(f=>f.path==='freeze.json'),phase==='prepare');assert.equal(layout.files.some(f=>f.path==='selection.json'),phase==='train-cal');
  assert.equal(layout.files.some(f=>f.path.includes('Local State')),false);
 }
});
test('IO control catalog is separate and finite perphase; no future freeze/audit in PREPARE',()=>{
 const base={schema:'native-specificity-source-catalog/v1',entries:[{key:HERE+'/source-paths.js',path:HERE+'/source-paths.js',kind:'code',maximumBytes:4194304,sha256:null}],package:{}};
 for(const phase of ['prepare','train-cal','test']){const c=specificityIoCatalog(base,phase),keys=c.entries.map(e=>e.key);
  assert.equal(base.entries.length,1);assert.equal(keys.includes('control:reviewed-sources'),phase==='prepare');assert.equal(keys.includes('control:freeze'),phase!=='prepare');
  assert.equal(c.entries.find(e=>e.key==='control:bootstrap').path,HERE+'/output/'+specificityPhaseLeaf(phase)+'/bootstrap.json');
  if(phase==='prepare')assert.equal(c.entries.find(e=>e.key==='control:reviewed-sources').path,HERE+'/reviewed-sources-r3.json');
  else assert.equal(c.entries.find(e=>e.key==='control:freeze').path,HERE+'/output/prepare-r3/node-owned/freeze.json');
  assert.equal(keys.filter(k=>k.startsWith('audit:')).length,phase==='test'?4:0);assert.equal(keys.includes('control:source-list'),false);
 }
});
test('phase leaves are fixed; old failed prepare evidence cannot be adopted or selected by a caller',()=>{
 assert.equal(specificityPhaseLeaf('prepare'),'prepare-r3');assert.equal(specificityPhaseLeaf('train-cal'),'train-cal');assert.equal(specificityPhaseLeaf('test'),'test');
 for(const value of ['prepare-r3','constructor','../prepare',null])assert.throws(()=>specificityPhaseLeaf(value));
});
test('bootstrap joins original held Node identity and TEST external pin without granting itself authority',()=>{
 for(const phase of ['prepare','train-cal','test']){const f=bootstrap(phase);assert.deepEqual(validateSpecificityBootstrap(f.b,f.expected),f.b);
  for(const change of [{originalNodePid:18},{sourcePathsSha256:H},{sourceIdentityHash:J},{originalNodeCreationFiletime:'18446744073709551616'},{testAuditSha256:phase==='test'?H:J},{extra:true}])assert.throws(()=>validateSpecificityBootstrap({...f.b,...change},f.expected));
 }
});
test('startup accepts actual baseline four-field DTO and explicit guardian projection, not basename guesses',()=>{
 const {b,node}=bootstrap(),body={schema:'native-console-baseline/v1',node,console:null},baseline={...body,baselineHash:digest(body)};
 const ack={schema:'native-specificity-startup-ack/v1',phase:b.phase,sourceIdentityHash:H,sourceMapHash:K,testAuditSha256:null,originalNodePid:17,originalNodeCreationFiletime:node.creationFiletime,readySha256:J,baseline,baselineHash:baseline.baselineHash};
 assert.equal(validateSpecificityStartupAck(ack,b,J).baselineHash,baseline.baselineHash);
 for(const modify of [a=>{a.originalNodePid=18;},a=>{a.baseline.node.creationFiletime='999';},a=>{a.testAuditSha256=J;},a=>{a.baseline.node.imageBasename='node.exe';}]){const a=structuredClone(ack);modify(a);assert.throws(()=>validateSpecificityStartupAck(a,b,J));}
});
test('prepared freeze binds all42 exact stage maps and full stable base catalog identity',()=>{
 const stages=Array.from({length:42},(_,i)=>({batchId:sha('batch'+i),files:[{path:'manifest.json',sha256:H}]}));
 const context={sourceHashes:{z:H,a:J},manifest:{manifestHash:H,batches:stages.map((s,i)=>({batchId:s.batchId,phase:i<24?'train-cal':'test'}))},panel:{panelIdentity:J},contextHash:K,profile:{recipeHash:H},encoderHash:J,assetPins:[{filename:'invented',sha256:H}],package:{files:115,bytes:13656167}};
 const out=specificityFreeze(context,J,stages,H);assert.equal(out.batchIds['train-cal'].length,24);assert.equal(out.batchIds.test.length,18);assert.deepEqual(Object.keys(out.sourceHashes),['a','z']);
 const {freezeHash,...body}=out;assert.equal(freezeHash,digest(body));assert.throws(()=>specificityFreeze(context,J,stages.slice(1),H));
});
test('policy lookup reuses exact validated chosen pin with no DNS/fallback or extra origin',async()=>{
 const batch={phase:'train-cal',batchIndex:1,cases:Array.from({length:4},(_,i)=>({id:'case'+i,groupId:'group'+i,url:'https://publisher.org/'+i,language:'en',split:'training',globalOrdinal:i+1,nativeOrdinal:i+1})),batchId:H};
 const body={panelIdentity:H,batchId:H,primaryHosts:['publisher.org'],primaryOrigins:['https://publisher.org'],cdnOrigins:[...NATIVE_RESOURCE_ORIGINS],hosts:[...NATIVE_RESOURCE_ORIGINS.map(o=>new URL(o).hostname),'publisher.org'].sort(),origins:[...NATIVE_RESOURCE_ORIGINS,'https://publisher.org'].sort()};
 const scope=compileSpecificityNetworkScope({scope:{...body,scopeHash:digest(body)},batch});
 const pins=compileNativeDnsPins({scope,rows:body.hosts.map(host=>({host,status:host==='publisher.org'?'pinned':'unavailable',answers:host==='publisher.org'?[{address:'8.8.8.8',family:4},{address:'1.1.1.1',family:4}]:[]}))});
 const lookup=createNativePolicyDnsLookup(pins);assert.deepEqual(await resolvePublicAddresses('publisher.org',{dnsLookup:lookup}),[{address:'1.1.1.1',family:4}]);
 await assert.rejects(lookup('evil.org',{all:true}));await assert.rejects(lookup(body.hosts[0],{all:true}),e=>e.code==='ENOTFOUND');
});
test('actual driver source never counts Chrome profiles through ASCII-only Node workspace walker',async()=>{
 const source=await readFile(new URL('./driver.mjs',import.meta.url),'utf8');assert.equal(/\.countWorkspace\s*\(/u.test(source),false);
 assert.ok(source.includes("if(phase==='prepare'){failureBoundary.mark('asset-checks');await io.streamAssets(context.assetPins);guard();}"));
 assert.ok(source.includes("assertSpecificityDrainStage(drain.snapshot(),prepared.batchIds[phase].length,'encoding',finalDrainAckHash);await io.streamAssets"));
 assert.ok(source.includes('captureModule.releaseCapturedBatch(summary);need(activeBatchOrigins!==null);pacing.closedBatch(activeBatchOrigins);'));
 assert.ok(source.includes('await channel.waitHandshake')===false); // Header is the entrypoint's original responsibility.
 const entry=await readFile(new URL('./execute.mjs',import.meta.url),'utf8');assert.ok(entry.includes("yes(ACTUAL_EXECUTION_RELEASE==='adr216-reviewed-execution/v1');"));
 assert.ok(source.includes('emitFailure(Buffer.from(line,\'utf8\'))'));assert.ok(entry.includes('emitFailure:bytes=>{process.stderr.write(bytes);}'));
 assert.ok(source.includes('captureDiagnostic:emitCaptureDiagnostic,emitCaptureDiagnostic'));
 assert.ok(source.includes('if(captureModule!==null)captureModule.emitCaptureFailureDiagnostic(phase,stage,originalEmitter);'));
 assert.ok(!entry.includes("process.stderr.write('Specificity execution refused.\\n')"));
});
