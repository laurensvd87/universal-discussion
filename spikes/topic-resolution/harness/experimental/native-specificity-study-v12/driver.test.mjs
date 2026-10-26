// Invented metadata and pure/static SOURCE checks. No actual driver invocation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {specificityWorkspaceLayout,specificityIoCatalog,validateSpecificityBootstrap,validateSpecificityStartupAck,specificityFreeze,specificityPhaseLeaf,createSpecificityDriverFailureBoundary,SPECIFICITY_DRIVER_FAILURE_STAGES,publishSpecificityTrainSelection} from './driver.mjs';
import {specificityCliConfiguration} from './execute.mjs';
import {projectSpecificityCaptureDiagnostic} from './browser-capture.mjs';
import {compileSpecificityNetworkScope,compileNativeDnsPins,createNativePolicyDnsLookup,NATIVE_RESOURCE_ORIGINS} from './network-policy.js';
import {resolvePublicAddresses} from '../../../../../apps/local-service/src/crawler/public-fetch.js';
const H='a'.repeat(64),J='b'.repeat(64),K='c'.repeat(64),sha=x=>createHash('sha256').update(x).digest('hex'),digest=v=>sha(JSON.stringify(v));
const HERE='spikes/topic-resolution/harness/experimental/native-specificity-study-v12';

test('finite journey and timer witnesses fit actual driver line without replacing the original error',async()=>{
 const witness={site:'lifecycle',phase:'dispatched',blankLoaderMatch:false,lifecycleName:'firstMeaningfulPaintCandidate',seenFactsMask:127};
 const cases=[{primary:{family:'public-journey',code:'continuation-rejected'},journeyWitness:witness,timerWitness:null},
  {primary:{family:'control-unavailable',code:'origin-representation-unavailable'},journeyWitness:null,timerWitness:null},
  ...['ordinary','denial','cleanup'].map(lane=>({primary:{family:'capture',code:'article-deadline'},journeyWitness:null,timerWitness:{lane,rpc:'Page.setLifecycleEventsEnabled'}}))];
 for(const {primary,journeyWitness,timerWitness} of cases){
  const input={schema:'native-specificity-capture-failure/v1',stage:'article-retirement',rpc:'Page.setLifecycleEventsEnabled',
   primary,cleanup:{family:'control-unavailable',code:'origin-representation-unavailable'},journeyWitness,timerWitness};
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
 const entry=await readFile(new URL('./execute.mjs',import.meta.url),'utf8');assert.ok(entry.includes("yes(ACTUAL_EXECUTION_RELEASE==='adr194-reviewed-execution/v1');"));
 assert.ok(source.includes('emitFailure(Buffer.from(line,\'utf8\'))'));assert.ok(entry.includes('emitFailure:bytes=>process.stderr.write(bytes)'));
});
