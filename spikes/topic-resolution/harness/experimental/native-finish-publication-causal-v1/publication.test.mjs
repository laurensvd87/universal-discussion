import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {win32 as path} from 'node:path';

// Only these externally fixed SOURCE references are followed. No output read.
const repo=new URL('../../../../../',import.meta.url),root='spikes/topic-resolution/harness/experimental/native-specificity-study-v20/';
const sha=x=>createHash('sha256').update(x).digest('hex'),digest=x=>sha(JSON.stringify(x));
const listPin='42b2ec9b72d211faae5675d426f610a3771ba31a68fe5562840e89292a0dc10c',mapPin='4b93a7cba660846d09197d6c1f28da6c3a668e416eaab68d80233bf4a250053f';
const list=await readFile(new URL(root+'source-paths.js',repo));assert.equal(sha(list),listPin);
const map=await readFile(new URL(root+'reviewed-sources-r3.json',repo));assert.equal(sha(map),mapPin);
const keys=JSON.parse(list.toString().match(/export const SOURCE_PATHS=Object\.freeze\((\[[\s\S]*?\])\);/)[1]),pins=JSON.parse(map).sourceHashes;
assert.equal(keys.length,128);assert.deepEqual(Object.keys(pins),keys);
const source=new Map();for(const key of keys){const b=await readFile(new URL(key,repo));assert.equal(sha(b),pins[key]);source.set(key,b.toString('utf8'));}
const baseline='spikes/topic-resolution/harness/experimental/playwright-route-burst-dev-v1/freeze.json',baselinePin='908ed69a9b1e42ed6fb0de7ac0d0862ffb5fe8964cf368701cb442085e1091bb';
const baselineBytes=await readFile(new URL(baseline,repo));assert.equal(sha(baselineBytes),baselinePin);
// This historical fixed FILE has exactly one LF. Authenticate BEFORE decoding;
// follow ONLY its bounded package subtree, not its other old source entries.
const packagePins=Object.entries(JSON.parse(baselineBytes.toString().replace(/\n$/u,'')).sourceHashes).filter(([k])=>k.startsWith('node_modules/playwright-core/'));
assert.equal(packagePins.length,115);let packageBytes=0;
for(const [key,pin]of packagePins){assert.match(key,/^node_modules\/playwright-core\/[A-Za-z0-9._/-]+$/u);assert.ok(key.split('/').every(p=>p&&p!=='.'&&p!=='..'));const b=await readFile(new URL('spikes/topic-resolution/harness/experimental/playwright-dev-v1/'+key,repo));assert.ok(b.length<=4194304);packageBytes+=b.length;assert.equal(sha(b),pin);}
assert.equal(packageBytes,13656167);
const casesBytes=await readFile(new URL('./cases.json',import.meta.url)),cases=JSON.parse(casesBytes);
assert.equal(cases.schema,'native-finish-publication-causal-cases/v1');assert.equal(cases.physicalCrossLanguageIpc,false);
const deliberatelyPending=[];
after(async()=>{for(const key of keys)assert.equal(sha(await readFile(new URL(key,repo))),pins[key]);for(const [key,pin]of packagePins)assert.equal(sha(await readFile(new URL('spikes/topic-resolution/harness/experimental/playwright-dev-v1/'+key,repo))),pin);assert.equal(sha(await readFile(new URL(root+'source-paths.js',repo))),listPin);assert.equal(sha(await readFile(new URL(root+'reviewed-sources-r3.json',repo))),mapPin);assert.equal(sha(await readFile(new URL(baseline,repo))),baselinePin);assert.deepEqual(await readFile(new URL('./cases.json',import.meta.url)),casesBytes);for(const s of deliberatelyPending){assert.equal(s.settled(),false);assert.equal(s.wire.snapshot().pendingOriginals,1);assert.equal(s.held.settled,false);}});

const {createSpecificityIo}=await import('../native-specificity-study-v20/io.mjs');
const {createSpecificityFsProofWire,ExecutionFailure}=await import('../native-specificity-study-v20/execute.mjs');
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const ROOT='D:\\repo',WORK=ROOT+'\\owned\\run1';
const STAGE=['batch-config.js','chromium/page-content-reader.js','core/page-content-policy.js','manifest.json','native-adapter.js','native-rights.js','worker.js'];
// Exact authenticated original fake-FS helper bodies, strict evaluated, not an
// import of the old test module. No production algorithm is copied/replaced.
const reference=source.get(root+'io.test.mjs'),start=reference.indexOf('function failure(code){'),end=reference.indexOf('function stage(){',start);
assert.ok(start>0&&end>start);
const helperBody=reference.slice(start,end);
const {fixture}=Function('assert','path','Buffer','sha','digest','freeze','createSpecificityIo','STAGE','ROOT','WORK',"'use strict';\n"+helperBody+'\nreturn {fixture};')(assert,path,Buffer,sha,digest,freeze,createSpecificityIo,STAGE,ROOT,WORK);
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject,settled:false};}
async function turns(n=100){for(let i=0;i<n;i++)await Promise.resolve();}
async function until(check){for(let i=0;i<5000&&!check();i++)await Promise.resolve();assert.ok(check(),'finite invented schedule failed to reach edge');}

async function setup({hold='after',writeHold=false}={}){
 const f=fixture(),events=[],now={value:0},held=deferred();let request=null,proofPath=null,heldReached=false,heldAt=null,readCalls=0,publicationSettled=false,wireFailure=null;
 const event=x=>{assert.ok(cases.events.includes(x));assert.ok(events.length<cases.maximumTraceEvents);events.push(x);};
 const final=path.join(WORK,'finish.request.json'),pending=final+'.pending';
 const layout={directories:[],files:[{path:'finish.request.json',maximumBytes:16384}]};
 const config={...f.config,workspaceLayout:layout,expectedWorkspaceLayoutHash:digest(layout)};
 const reply=()=>{const n=f.fs.get(proofPath),raw=Buffer.from(JSON.stringify(request));
  const body={schema:'native-specificity-fs-proof/v1',pathKey:request.pathKey,operationNonce:request.operationNonce,edge:request.edge,
   ancestorsChecked:true,openedIdentityChecked:true,attributes:n.kind==='directory'?16:0,identity:{volumeSerial:'7',fileIndex:String(n.ino),creationFiletime:String(n.ino),size:String(n.b.length),fileType:n.kind},atomic:false,requestHash:sha(raw)};
  return Buffer.from(JSON.stringify({...body,receiptHash:digest(body)})+'\n');};
 const wire=createSpecificityFsProofWire({phase:'prepare',sourceIdentityHash:'a'.repeat(64),capabilities:{guard(){},now:()=>now.value,
  write(bytes){request=JSON.parse(bytes.toString());if(proofPath===final&&request.edge==='after')event(events.includes('final-read')?'final-native-after':'native-after');
   if(writeHold&&proofPath===final&&request.edge==='after'&&!heldReached){heldReached=true;heldAt=now.value;return held.promise;}
   return Promise.resolve(true);},
  readChunk(){readCalls++;if(hold==='after'&&proofPath===final&&request.edge==='after'&&!heldReached){heldReached=true;heldAt=now.value;return held.promise;}return Promise.resolve(reply());}}});
 config.inspectNoReparse=(p,c)=>{proofPath=p;if(p===pending&&c.edge==='before')event('native-before');const original=wire.inspect({pathKey:c.pathKey,operationNonce:c.operationNonce,edge:c.edge,parentPathKey:c.parentPathKey});original.catch(error=>{wireFailure??=error;});return original;};
 const io=createSpecificityIo(config,f.fs.adapter());await io.createWorkspace();
 f.fs.hooks.open=(_h,p,flags)=>{if(p===pending&&flags==='wx')event('pending-open');};
 f.fs.hooks.write=h=>{if(h.path===pending)event('pending-write');};
 f.fs.hooks.read=h=>{if(h.path===pending)event('pending-verification');if(h.path===final){event('final-read');if(hold==='read'&&!heldReached){heldReached=true;return held.promise;}}};
 f.fs.hooks.close=h=>{if(h.path===pending)event('pending-close');if(h.path===final){event('final-close');if(hold==='close'&&!heldReached){heldReached=true;return held.promise;}}};
 f.fs.hooks.link=()=>event('final-visible');
 const original=io.publishExclusive({path:'finish.request.json',bytes:Buffer.from('{"invented":true}'),beforePublish(){}});
 const observed=original.then(v=>{publicationSettled=true;event('publication-settled');return {ok:true,value:v};},error=>{publicationSettled=true;return {ok:false,error};});
 await until(()=>heldReached);
 return {f,io,wire,original,observed,held,now,events,final,pending,reply,event,heldAt:()=>heldAt,settled:()=>publicationSettled,wireFailure:()=>wireFailure,reads:()=>readCalls,
  settle(){assert.equal(held.settled,false);held.settled=true;held.resolve(writeHold?true:hold==='after'?reply():undefined);}};
}

test('actual IO final visibility precedes SAME after-proof original and publication settlement',async()=>{
 const s=await setup();assert.equal(s.f.fs.nodes.get(s.final),s.f.fs.nodes.get(s.pending));assert.equal(s.settled(),false);
 assert.equal(s.wire.snapshot().pendingOriginals,1);assert.equal(s.wire.snapshot().physicalExchangePending,true);assert.ok(s.io.snapshot().pendingOriginals>0);
 s.settle();const result=await s.observed;assert.equal(result.ok,true);assert.equal(s.wire.snapshot().pendingOriginals,0);assert.equal(s.io.snapshot().pendingOriginals,0);assert.equal(s.io.snapshot().openHandles,0);
 assert.ok(s.events.indexOf('final-visible')<s.events.indexOf('native-after'));assert.ok(s.events.indexOf('final-read')<s.events.indexOf('publication-settled'));
});
test('actual final read can arrive after idle wire; idle is not publication-complete',async()=>{
 const s=await setup({hold:'read'});assert.equal(s.wire.snapshot().physicalExchangePending,false);assert.equal(s.wire.snapshot().pendingOriginals,0);assert.equal(s.settled(),false);assert.ok(s.io.snapshot().pendingOriginals>0);
 s.settle();assert.equal((await s.observed).ok,true);assert.ok(s.events.includes('final-native-after'));
});
test('clock advance alone leaves actual read original pending; SAME late ACK triggers actual wire failure',async()=>{
 const s=await setup();assert.equal(s.heldAt(),0);s.now.value=cases.parentEntryMilliseconds;await turns();assert.equal(s.settled(),false);
 s.now.value+=cases.validationMilliseconds;
 await turns();assert.equal(s.settled(),false);assert.equal(s.wire.snapshot().failed,false);assert.equal(s.wire.snapshot().pendingOriginals,1);
 s.settle();assert.equal((await s.observed).ok,false);assert.ok(s.wireFailure() instanceof ExecutionFailure);assert.equal(s.wire.snapshot().failed,true);assert.equal(s.wire.snapshot().pendingOriginals,0);assert.equal(s.io.snapshot().openHandles,0);
});
test('contrast SAME exchange serviced before validation leaves actual original publication complete',async()=>{
 const s=await setup();s.now.value=cases.parentEntryMilliseconds;s.settle();assert.equal((await s.observed).ok,true);
 const checkpoint=s.wire.checkpoint();s.now.value+=cases.validationMilliseconds;
 assert.equal(s.settled(),true);assert.equal(s.io.snapshot().failed,false);assert.ok(checkpoint.sequence>0);
});
test('held original REQUEST write remains owned across clock advance and is never replaced',async()=>{
 const s=await setup({writeHold:true,hold:null}),reads=s.reads();s.now.value=cases.exchangeMilliseconds+1;await turns();assert.equal(s.settled(),false);assert.equal(s.wire.snapshot().pendingOriginals,1);
 s.settle();assert.equal((await s.observed).ok,false);assert.equal(s.reads(),reads);assert.ok(s.wireFailure() instanceof ExecutionFailure);
});
test('rejected SAME original is not physical success',async()=>{
 const s=await setup();await turns();assert.equal(s.settled(),false);assert.equal(s.wire.snapshot().pendingOriginals,1);
 s.held.settled=true;s.held.reject(false);assert.equal((await s.observed).ok,false);assert.ok(s.wireFailure() instanceof ExecutionFailure);assert.equal(s.wire.snapshot().pendingOriginals,0);
});
test('deliberately unfulfilled original remains retained through final bounded observations; no cleanup-success claim',async()=>{
 const s=await setup();deliberatelyPending.push(s);assert.equal(deliberatelyPending.length,1);
 s.now.value=cases.exchangeMilliseconds+1;await turns();assert.equal(s.settled(),false);assert.equal(s.wire.snapshot().pendingOriginals,1);
 // No resolver/rejector is invoked in this scenario, including after(). It is
 // not a proof of infinite liveness, a native handle leak or physical cleanup.
});
test('pending final handle close retains actual IO handle until SAME close completes',async()=>{
 const s=await setup({hold:'close'});assert.equal(s.settled(),false);assert.ok(s.io.snapshot().openHandles>0);assert.ok(s.io.snapshot().pendingOriginals>0);
 s.settle();assert.equal((await s.observed).ok,true);assert.equal(s.io.snapshot().openHandles,0);
});
test('actual wire refuses EOF extra bytes and malformed reply without invented parser claims',async()=>{
 for(const chunk of [null,Buffer.from('{}\nextra'),Buffer.from('{"invalid":true}\n')]){
  const wire=createSpecificityFsProofWire({phase:'prepare',sourceIdentityHash:'a'.repeat(64),capabilities:{guard(){},now:()=>0,write:()=>Promise.resolve(true),readChunk:()=>Promise.resolve(chunk)}});
  await assert.rejects(wire.inspect({pathKey:'workspace:finish.request.json',operationNonce:'invented',edge:'before',parentPathKey:null}),ExecutionFailure);
  assert.equal(wire.snapshot().failed,true);assert.equal(wire.snapshot().pendingOriginals,0);
 }
});
