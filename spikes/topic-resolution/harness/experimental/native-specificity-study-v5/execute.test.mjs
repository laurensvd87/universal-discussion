// Invented bytes/IO/ACKs only. No actual source, artifact, assets or native run.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTUAL_EXECUTION_RELEASE,authenticateSpecificitySourceList,authenticateSpecificityReviewedMap,authenticateSpecificityCode,authenticateSpecificityFreeze,createSpecificityDrainWire,createSpecificityFsProofWire,fileHash,metadataHash} from './execute.mjs';
import {assertSpecificityDrainStage} from './driver.mjs';
const H='a'.repeat(64),J='b'.repeat(64),K='c'.repeat(64),L='d'.repeat(64);
const bytes=v=>Buffer.from(JSON.stringify(v));
test('ADR185 reviewed readiness cannot replace final pins or a separate actual phase decision',()=>{
 assert.equal(ACTUAL_EXECUTION_RELEASE,'adr185-reviewed-execution/v1');
});
function sourceFixture(){const texts={'invented/a.js':Buffer.from('// invented a'),'invented/b.js':Buffer.from('// invented b')};
 const listBytes=Buffer.from('// invented CODE literal\nexport const SOURCE_PATHS=Object.freeze('+JSON.stringify(Object.keys(texts))+');\n');
 const listPin=fileHash(listBytes),sourceList=authenticateSpecificitySourceList(listBytes,listPin);
 const pins=Object.fromEntries(Object.entries(texts).map(([k,v])=>[k,fileHash(v)]));
 const reviewedBytes=bytes({schema:'native-specificity-reviewed-sources/v1',sourcePathsSha256:listPin,sourceHashes:pins});return {texts,listBytes,listPin,sourceList,pins,reviewedBytes};}
test('external source-list FILE pin precedes parse and only exact sorted literal paths are admitted',()=>{
 const f=sourceFixture();assert.equal(f.sourceList.paths.length,2);assert.ok(Object.isFrozen(f.sourceList.paths));
 assert.throws(()=>authenticateSpecificitySourceList(Buffer.from('{broken'),H));
 for(const paths of [['../escape.js'],['invented/b.js','invented/a.js'],['invented/a.js','invented/a.js'],['invented/A.js','invented/a.js']]){
  const b=Buffer.from('export const SOURCE_PATHS=Object.freeze('+JSON.stringify(paths)+');');assert.throws(()=>authenticateSpecificitySourceList(b,fileHash(b)));}
 let hooks=0;const proxy=new Proxy(f.listBytes,{get(){hooks++;throw Error();}});assert.throws(()=>authenticateSpecificitySourceList(proxy,f.listPin));assert.equal(hooks,0);
});
test('reviewed CODE map authenticates before JSON and cannot choose extra or missing source paths',()=>{
 const f=sourceFixture(),map=authenticateSpecificityReviewedMap(f.reviewedBytes,fileHash(f.reviewedBytes),f.sourceList);assert.deepEqual(map.sourceHashes,f.pins);
 assert.throws(()=>authenticateSpecificityReviewedMap(Buffer.from('{bad'),H,f.sourceList));
 for(const pins of [{...f.pins,'invented/extra.js':H},{'invented/a.js':f.pins['invented/a.js']}]){
  const b=bytes({schema:'native-specificity-reviewed-sources/v1',sourcePathsSha256:f.listPin,sourceHashes:pins});assert.throws(()=>authenticateSpecificityReviewedMap(b,fileHash(b),f.sourceList));}
 const duplicate=Buffer.from('{"schema":"native-specificity-reviewed-sources/v1","schema":"native-specificity-reviewed-sources/v1"}');assert.throws(()=>authenticateSpecificityReviewedMap(duplicate,fileHash(duplicate),f.sourceList));
});
test('CODE gate follows only authenticated list, caps bytes and rechecks guard after original settlement',async()=>{
 const f=sourceFixture(),reads=[];const out=await authenticateSpecificityCode({sourceList:f.sourceList,sourceHashes:{...f.pins,'node_modules/playwright-core/invented.js':H},readLiteral(p,max){reads.push(p);assert.ok(max<=4194304);return f.texts[p];},guard:()=>true});
 assert.deepEqual(reads,Object.keys(f.texts));assert.equal(out.files,2);assert.equal(out.actualPhysicalProofRequired,true);
 let good=true,calls=0;await assert.rejects(authenticateSpecificityCode({sourceList:f.sourceList,sourceHashes:f.pins,readLiteral(){calls++;good=false;return Promise.resolve(f.texts['invented/a.js']);},guard:()=>good}));assert.equal(calls,1);
 await assert.rejects(authenticateSpecificityCode({sourceList:f.sourceList,sourceHashes:f.pins,readLiteral:()=>Buffer.alloc(4194305),guard:()=>true}));
});
test('CODE gate refuses Promise hooks without assimilation or following subsequent source',async()=>{
 const f=sourceFixture();let hooks=0,calls=0;const p=Promise.resolve(undefined);Object.defineProperty(p,'constructor',{get(){hooks++;throw Error();}});
 await assert.rejects(authenticateSpecificityCode({sourceList:f.sourceList,sourceHashes:f.pins,readLiteral(){calls++;return p;},guard:()=>true}));assert.equal(hooks,0);assert.equal(calls,1);
});
function freezeFixture(){const f=sourceFixture(),sourceHashes={...f.pins,...Object.fromEntries(Array.from({length:115},(_,i)=>['node_modules/playwright-core/invented-'+i+'.js',H]))};
 const batchIds={'train-cal':Array.from({length:24},(_,i)=>metadataHash('train-'+i)),test:Array.from({length:18},(_,i)=>metadataHash('test-'+i))};
 const stageNames=['batch-config.js','chromium/page-content-reader.js','core/page-content-policy.js','manifest.json','native-adapter.js','native-rights.js','worker.js'];
 const body={schema:'native-specificity-study-freeze/v1',sourcePathsSha256:f.listPin,sourceHashes,catalogHash:H,contextHash:J,manifestHash:K,panelIdentity:L,recipeHash:H,encoderHash:J,assetPinsHash:K,packageFiles:115,packageBytes:13656167,batchIds,batchStageHashes:Object.fromEntries(Object.values(batchIds).flat().map(id=>[id,Object.fromEntries(stageNames.map(n=>[n,H]))]))};
 return {...f,body,freezeBytes:bytes({...body,freezeHash:metadataHash(body)})};}
test('freeze authenticates external FILE, complete CODE/package keys and all42 exact seven-file stage maps',()=>{
 const f=freezeFixture(),out=authenticateSpecificityFreeze(f.freezeBytes,fileHash(f.freezeBytes),f.sourceList);assert.equal(out.batchIds.test.length,18);assert.ok(Object.isFrozen(out.batchStageHashes));
 for(const mutate of [b=>{b.packageFiles=114;},b=>{b.batchIds.test[0]=b.batchIds['train-cal'][0];},b=>{delete b.batchStageHashes[b.batchIds.test[0]]['worker.js'];},b=>{b.sourceHashes['outside.js']=H;}]){
  const body=structuredClone(f.body);mutate(body);const b=bytes({...body,freezeHash:metadataHash(body)});assert.throws(()=>authenticateSpecificityFreeze(b,fileHash(b),f.sourceList));}
 assert.throws(()=>authenticateSpecificityFreeze(Buffer.from('{bad'),H,f.sourceList));
});
function wireFixture(phase='train-cal'){
 let time=0,guardGood=true,wire,previous=null,readCount=0;const count=phase==='train-cal'?24:18,batchIds=Array.from({length:count},(_,i)=>metadataHash(phase+i)),requests=[],acks=new Map();
 const bindings={freezeHash:H,manifestHash:J,nodeIdentityHash:K,sourceMapHash:L};
 const capabilities={guard:()=>guardGood,now:()=>time,sleep:async ms=>{time+=ms;},read(name){readCount++;return acks.get(name)??null;},publish(name,raw){
  const q=JSON.parse(raw);requests.push({name,q});let ack;
  const base={schema:'native-specificity-control-ack/v1',...bindings,phase};
  if(q.schema==='native-specificity-batch-start-request/v1')ack={...base,kind:'batch-start',batchId:q.batchId,batchIndex:q.batchIndex,requestHash:fileHash(raw)};
  else if(q.schema==='native-specificity-model-stage-request/v1')ack={...base,kind:'model-stage',stage:q.stage,captureHash:q.captureHash,encodingHash:q.encodingHash,requestHash:fileHash(raw)};
  else{const kind=q.schema.includes('batch-drain')?'batch-drain':'cohort-drain';assert.equal(q.previousAckHash,previous);ack={schema:'native-specificity-'+kind+'-ack/v1',...bindings,phase,requestHash:fileHash(raw),previousAckHash:previous,observedAt:987654321};previous=fileHash(bytes(ack));}
  acks.set(name.replace('.request.json','.ack.json'),bytes(ack));return true;
 }};
 const config={phase,...bindings,batchIds,capabilities};wire=createSpecificityDrainWire(config);
 const batch=i=>({batchId:batchIds[i],batchIndex:i+1,phase,cases:[]});
 async function drainAll(){const receipts=[];for(let i=0;i<count;i++){const b=batch(i),summary={id:i},prepared={batch:b,manifestHash:J,nodeIdentityHash:K,batchCaptureHash:metadataHash('capture'+i),captureSummaryHash:metadataHash(summary),captureSummary:summary};
  await wire.beginBatch(b);const ack=await wire.requestBatchDrain(prepared);const verified=wire.verifyBatchDrain({...prepared,guardianReceipt:structuredClone(ack)});assert.equal(verified.receiptHash,ack.receiptHash);receipts.push(ack.receiptHash);}
  const core={schema:'native-specificity-cohort-drain-request/v1',phase,panelIdentity:L,manifestHash:J,nodeIdentityHash:K,captureHash:H,batchReceiptHashes:receipts};
  return wire.requestFinalDrain({...core,requestHash:metadataHash(core)});
 }
 return {wire,config,capabilities,requests,acks,batch,drainAll,setTime:n=>{time=n;},setGuard:b=>{guardGood=b;},readCount:()=>readCount};
}
test('24/18 actual-wire seams chain guardian ACKs, separate clocks, preserve final request mapping and ordered stage ACKs',async()=>{
 for(const phase of ['train-cal','test']){const s=wireFixture(phase),out=await s.drainAll();assert.equal(out.nodeIdentityHash,K);assert.equal(out.requestedAt,0);assert.equal(out.acknowledgedAt,0);
  assert.notEqual(s.requests.at(-1).q.captureHash,out.receiptHash);const previous=s.wire.snapshot().previousAckHash;
  await s.wire.enterModelStage({phase,stage:phase==='test'?'assessment':'fitting',captureHash:H,encodingHash:J});await s.wire.enterModelStage({phase,stage:'checks',captureHash:H,encodingHash:J});
  assert.equal(s.wire.snapshot().previousAckHash,previous);assert.equal(s.wire.snapshot().modelStage,'checks');assert.equal(s.wire.snapshot().pendingOriginals,0);
 }
});
test('joined driver boundary refuses assets before cohort ACK and retains cohort chain through checks',async()=>{
 for(const phase of ['train-cal','test']){
  const s=wireFixture(phase),count=phase==='train-cal'?24:18;
  assert.throws(()=>assertSpecificityDrainStage(s.wire.snapshot(),count,'encoding'));
  const ack=await s.drainAll();assert.equal(assertSpecificityDrainStage(s.wire.snapshot(),count,'encoding',ack.receiptHash),true);
  assert.throws(()=>assertSpecificityDrainStage(s.wire.snapshot(),count,'checks',ack.receiptHash));
  await s.wire.enterModelStage({phase,stage:phase==='test'?'assessment':'fitting',captureHash:H,encodingHash:J});
  await s.wire.enterModelStage({phase,stage:'checks',captureHash:H,encodingHash:J});
  assert.equal(assertSpecificityDrainStage(s.wire.snapshot(),count,'checks',ack.receiptHash),true);
  assert.equal(s.wire.snapshot().previousAckHash,ack.receiptHash);
 }
});
test('forged guardian bytes, request/summary hashes, stage capture or encoding substitution fail sticky',async()=>{
 const s=wireFixture();await s.wire.beginBatch(s.batch(0));const summary={id:0};const p={batch:s.batch(0),manifestHash:J,nodeIdentityHash:K,batchCaptureHash:H,captureSummaryHash:metadataHash(summary),captureSummary:summary};
 const ack=await s.wire.requestBatchDrain(p),forged=structuredClone(ack);forged.ack.observedAt++;
 assert.throws(()=>s.wire.verifyBatchDrain({...p,guardianReceipt:forged}));assert.equal(s.wire.snapshot().failed,true);
 for(const field of ['captureHash','encodingHash']){const t=wireFixture();await t.drainAll();await t.wire.enterModelStage({phase:'train-cal',stage:'fitting',captureHash:H,encodingHash:J});
  await assert.rejects(t.wire.enterModelStage({phase:'train-cal',stage:'checks',captureHash:field==='captureHash'?L:H,encodingHash:field==='encodingHash'?L:J}));assert.equal(t.wire.snapshot().failed,true);}
});
test('pending original publication remains charged through abandon and actual late settlement',async()=>{
 const s=wireFixture();let reject;const original=new Promise((_,no)=>{reject=no;});s.capabilities.publish=()=>original;const wire=createSpecificityDrainWire(s.config),running=wire.beginBatch(s.batch(0));
 assert.equal(wire.snapshot().pendingOriginals,1);assert.throws(()=>wire.abandon());assert.equal(wire.snapshot().pendingOriginals,1);reject(Error('invented'));await assert.rejects(running);assert.equal(wire.snapshot().pendingOriginals,0);
});
test('lost ACK reaches fixed fifteen-second deadline with no retry or slot release fiction',async()=>{
 const s=wireFixture();let writes=0;s.capabilities.publish=()=>{writes++;return true;};const wire=createSpecificityDrainWire(s.config);await assert.rejects(wire.beginBatch(s.batch(0)));assert.equal(writes,1);assert.equal(wire.snapshot().failed,true);assert.ok(s.readCount()>0);
});
test('descriptor/Promise hooks never execute and async guard originals stay tracked',async()=>{
 let hooks=0;const s=wireFixture(),b=s.batch(0);Object.defineProperty(b,'batchId',{enumerable:true,get(){hooks++;throw Error();}});await assert.rejects(s.wire.beginBatch(b));assert.equal(hooks,0);assert.equal(s.requests.length,0);
 const t=wireFixture();let resolve;const p=new Promise(yes=>{resolve=yes;});t.capabilities.guard=()=>p;const wire=createSpecificityDrainWire(t.config);await assert.rejects(wire.beginBatch(t.batch(0)));assert.equal(wire.snapshot().pendingOriginals,1);resolve(true);await Promise.resolve();await Promise.resolve();assert.equal(wire.snapshot().pendingOriginals,0);
 const u=wireFixture(),unsafe=Promise.resolve();Object.defineProperty(unsafe,'then',{get(){hooks++;throw Error();}});u.capabilities.publish=()=>unsafe;const rejected=createSpecificityDrainWire(u.config);await assert.rejects(rejected.beginBatch(u.batch(0)));assert.equal(hooks,0);assert.equal(rejected.snapshot().unsafeOperationRefused,true);
});

test('caught clock/guard abandon cannot dispatch another capability or publish successful ACK state',async()=>{
 const s=wireFixture();let wire,guards=0,io=0;s.capabilities.now=()=>{try{wire.abandon();}catch{}return 0;};s.capabilities.guard=()=>{guards++;return true;};s.capabilities.publish=()=>{io++;return true;};
 wire=createSpecificityDrainWire(s.config);await assert.rejects(wire.beginBatch(s.batch(0)));assert.equal(guards,0);assert.equal(io,0);assert.equal(wire.snapshot().started,false);
 const t=wireFixture();let other;t.capabilities.guard=()=>{try{other.abandon();}catch{}return true;};let times=0;t.capabilities.now=()=>{times++;return 0;};
 other=createSpecificityDrainWire(t.config);await assert.rejects(other.beginBatch(t.batch(0)));assert.equal(times,1);assert.equal(t.requests.length,0);
 const u=wireFixture();let third,reads=0,afterReadClocks=0;const read=u.capabilities.read;u.capabilities.read=(...args)=>{reads++;return read(...args);};
 u.capabilities.now=()=>{if(reads&&++afterReadClocks===8){try{third.abandon();}catch{}}return 0;};
 third=createSpecificityDrainWire(u.config);await assert.rejects(third.beginBatch(u.batch(0)));assert.equal(afterReadClocks,8);assert.equal(third.snapshot().started,false);assert.equal(third.snapshot().completedBatches,0);
});

test('safe rejected synchronous CODE guard is observed before any reader is invoked',async()=>{
 const f=sourceFixture();let reads=0;await assert.rejects(authenticateSpecificityCode({sourceList:f.sourceList,sourceHashes:f.pins,readLiteral(){reads++;throw Error();},guard:()=>Promise.reject(Error('invented'))}));
 await Promise.resolve();assert.equal(reads,0);
});

test('CPython observedAt whole-float/exponent bytes remain original ACK identity, not cross-clock comparisons',async()=>{
 for(const token of ['1000.0','1e-05']){const s=wireFixture(),publish=s.capabilities.publish;
  s.capabilities.publish=(name,raw)=>{const result=publish(name,raw),key=name.replace('.request.json','.ack.json'),b=s.acks.get(key);if(b.toString().includes('"observedAt":'))s.acks.set(key,Buffer.from(b.toString().replace('"observedAt":987654321','"observedAt":'+token)));return result;};
  const wire=createSpecificityDrainWire(s.config),b=s.batch(0),summary={invented:true};await wire.beginBatch(b);
  const receipt=await wire.requestBatchDrain({batch:b,manifestHash:J,nodeIdentityHash:K,batchCaptureHash:H,captureSummaryHash:metadataHash(summary),captureSummary:summary});
  const ack=s.acks.get('batch-01.drain.ack.json');assert.equal(receipt.receiptHash,fileHash(ack));assert.equal(receipt.ack.observedAt,Number(token));assert.equal(wire.snapshot().failed,false);
 }
});

test('final ACK-time lease crossing refuses success even after valid bytes and prior deadline checks',async()=>{
 const s=wireFixture();let clocks=0,read=false;const readAck=s.capabilities.read;
 s.capabilities.read=(...args)=>{read=true;return readAck(...args);};
 s.capabilities.now=()=>read&&++clocks===8?15000:0;
 const wire=createSpecificityDrainWire(s.config);await assert.rejects(wire.beginBatch(s.batch(0)));assert.equal(clocks,8);assert.equal(wire.snapshot().started,false);assert.equal(wire.snapshot().completedBatches,0);assert.equal(wire.snapshot().failed,true);
});

function proofFixture(){let time=0,buffered=[],wire;const sent=[];
 const capabilities={guard:()=>true,now:()=>time,write(frame){sent.push(Buffer.from(frame));const raw=frame.subarray(0,-1),request=JSON.parse(raw);
  const body={schema:'native-specificity-fs-proof/v1',pathKey:request.pathKey,operationNonce:request.operationNonce,edge:request.edge,ancestorsChecked:true,openedIdentityChecked:true,attributes:32,
   identity:{volumeSerial:'123',fileIndex:'456',creationFiletime:'133445566778899',size:'12',fileType:'file'},atomic:false,requestHash:fileHash(raw)};
  buffered.push(Buffer.concat([bytes({...body,receiptHash:metadataHash(body)}),Buffer.from('\n')]));return true;},readChunk(){return buffered.shift()??null;}};
 const config={phase:'train-cal',sourceIdentityHash:H,capabilities};wire=createSpecificityFsProofWire(config);
 return {wire,config,capabilities,sent,getBuffered:()=>buffered,setBuffered:b=>{buffered=b;},setTime:t=>{time=t;}};
}
const proofRequest=(edge='before')=>({pathKey:'workspace:batch-01/profile',operationNonce:'invented-operation-1',edge,parentPathKey:null});
test('owned-pipe proof wire binds exact request/native receipt, split frames and prior compact chain only',async()=>{
 const s=proofFixture(),write=s.capabilities.write;s.capabilities.write=frame=>{const value=write(frame),b=s.getBuffered()[0];s.setBuffered([b.subarray(0,9),b.subarray(9)]);return value;};
 const wire=createSpecificityFsProofWire(s.config),first=await wire.inspect(proofRequest()),chain=wire.snapshot().finalChainHash;
 assert.equal(first.identity.fileIndex,'456');assert.equal(first.atomic,false);await wire.inspect(proofRequest('after'));
 const second=JSON.parse(s.sent[1].subarray(0,-1));assert.equal(second.sequence,2);assert.equal(second.priorChainHash,chain);assert.equal(wire.snapshot().requests,2);
 assert.equal(wire.snapshot().pendingOriginals,0);assert.equal(wire.snapshot().rawFramesRetained,false);assert.equal(wire.snapshot().independentRawFrameReplayPossible,false);
 assert.ok(wire.snapshot().combinedWireBytes>0&&wire.snapshot().maximumFrameBytes<=16384);
});
test('proof framing rejects oversized chunks, multiple frames, truncated EOF and malformed UTF8 before success',async()=>{
 for(const form of ['oversize','extra','truncated','utf8']){
  const s=proofFixture(),write=s.capabilities.write;s.capabilities.write=frame=>{write(frame);const b=s.getBuffered()[0];s.setBuffered(form==='oversize'?[Buffer.alloc(16385)]:form==='extra'?[Buffer.concat([b,b])]:form==='truncated'?[b.subarray(0,-1)]:[Buffer.from([255,10])]);return true;};
  const wire=createSpecificityFsProofWire(s.config);await assert.rejects(wire.inspect(proofRequest()));assert.equal(wire.snapshot().failed,true);assert.equal(wire.snapshot().finalChainHash,null);
 }
});
test('proof wrong source/sequence request hash, path, native reparse/identity and selfhash cannot mint accepted receipt',async()=>{
 for(const form of ['hash','path','reparse','identity','selfhash']){
  const s=proofFixture(),write=s.capabilities.write;s.capabilities.write=frame=>{write(frame);const value=JSON.parse(s.getBuffered()[0]);
   if(form==='hash')value.requestHash=J;if(form==='path')value.pathKey='workspace:foreign';if(form==='reparse')value.attributes=1024;if(form==='identity')value.identity.creationFiletime='0';
   const {receiptHash,...body}=value;value.receiptHash=form==='selfhash'?J:metadataHash(body);s.setBuffered([Buffer.concat([bytes(value),Buffer.from('\n')])]);return true;};
  const wire=createSpecificityFsProofWire(s.config);await assert.rejects(wire.inspect(proofRequest()));assert.equal(wire.snapshot().failed,true);
 }
});
test('proof original read remains physically charged and busy through failed reentry until actual settlement',async()=>{
 const s=proofFixture();let reject;const original=new Promise((_,no)=>{reject=no;});s.capabilities.readChunk=()=>original;const wire=createSpecificityFsProofWire(s.config),running=wire.inspect(proofRequest());
 for(let i=0;i<8&&wire.snapshot().pendingOriginals===0;i++)await Promise.resolve();assert.equal(wire.snapshot().pendingOriginals,1);
 await assert.rejects(wire.inspect(proofRequest('after')));assert.equal(wire.snapshot().pendingOriginals,1);assert.equal(wire.snapshot().physicalExchangePending,true);
 reject(Error('invented late EOF'));await assert.rejects(running);assert.equal(wire.snapshot().pendingOriginals,0);assert.equal(wire.snapshot().physicalExchangePending,false);
});
test('proof post-response guard expiry, caught fault and unsafe original hooks refuse without another dispatch',async()=>{
 const s=proofFixture();let expired=false;const read=s.capabilities.readChunk;s.capabilities.readChunk=()=>{expired=true;return read();};s.capabilities.guard=()=>{if(expired)s.setTime(15000);return true;};
 const wire=createSpecificityFsProofWire(s.config);await assert.rejects(wire.inspect(proofRequest()));assert.equal(wire.snapshot().finalChainHash,null);
 const t=proofFixture();let other,guards=0;t.capabilities.now=()=>{try{other.abandon();}catch{}return 0;};t.capabilities.guard=()=>{guards++;return true;};other=createSpecificityFsProofWire(t.config);await assert.rejects(other.inspect(proofRequest()));assert.equal(guards,0);assert.equal(t.sent.length,0);
 const u=proofFixture();let hooks=0;const original=Promise.resolve();Object.defineProperty(original,'constructor',{get(){hooks++;throw Error();}});u.capabilities.write=()=>original;
 const bad=createSpecificityFsProofWire(u.config);await assert.rejects(bad.inspect(proofRequest()));assert.equal(hooks,0);assert.equal(bad.snapshot().unsafeOperationRefused,true);
});

test('proof transport refuses raw URL/absolute/traversal or unknown namespaced path keys before writing',async()=>{
 for(const key of ['https://publisher.org/page','D:/private.txt','/private','workspace:../escape','asset:not-allowed.js','metadata:foreign','artifact:raw-query-vectors','control:arbitrary','audit:raw-query-vectors']){
  const s=proofFixture();await assert.rejects(s.wire.inspect({...proofRequest(),pathKey:key}));assert.equal(s.sent.length,0);
 }
});

test('proof keys admit only the four fixed bootstrap and four fixed TEST audit aliases',async()=>{
 for(const pathKey of ['control:bootstrap','control:reviewed-sources','control:freeze','control:source-list','audit:selection-audit','audit:train-supervisor','audit:train-result','audit:train-selection']){
  const s=proofFixture();await s.wire.inspect({...proofRequest(),pathKey});assert.equal(s.sent.length,1);
 }
 // Transport syntax is not phase authorization: actual parent owns those gates.
});

test('pre-publication checkpoint requires healthy physically idle wire and names last accepted head only',async()=>{
 const s=proofFixture();assert.deepEqual(s.wire.checkpoint(),{sequence:0,chainHash:null});await s.wire.inspect(proofRequest());const first=s.wire.checkpoint();
 assert.equal(first.sequence,1);assert.equal(first.chainHash,s.wire.snapshot().finalChainHash);assert.ok(Object.isFrozen(first));await s.wire.inspect(proofRequest('after'));assert.equal(first.sequence,1);assert.equal(s.wire.checkpoint().sequence,2);
 const t=proofFixture();let reject;const p=new Promise((_,no)=>{reject=no;});t.capabilities.readChunk=()=>p;const wire=createSpecificityFsProofWire(t.config),running=wire.inspect(proofRequest());
 for(let i=0;i<8&&wire.snapshot().pendingOriginals===0;i++)await Promise.resolve();assert.throws(()=>wire.checkpoint());assert.equal(wire.snapshot().pendingOriginals,1);assert.equal(wire.snapshot().physicalExchangePending,true);
 reject(Error('invented'));await assert.rejects(running);assert.throws(()=>wire.checkpoint());
});

test('checkpoint final guard cannot dispatch physical work and return an older idle head',async()=>{
 const s=proofFixture();let calls=0,wire,running,resolve;const physical=new Promise(yes=>{resolve=yes;});s.capabilities.write=()=>physical;
 s.capabilities.guard=()=>{if(++calls===2)running=wire.inspect(proofRequest());return true;};wire=createSpecificityFsProofWire(s.config);
 assert.throws(()=>wire.checkpoint());assert.equal(wire.snapshot().physicalExchangePending,true);assert.equal(wire.snapshot().pendingOriginals,1);assert.equal(wire.snapshot().requests,1);
 resolve(true);await assert.rejects(running);assert.equal(wire.snapshot().pendingOriginals,0);assert.equal(wire.snapshot().failed,true);
});
