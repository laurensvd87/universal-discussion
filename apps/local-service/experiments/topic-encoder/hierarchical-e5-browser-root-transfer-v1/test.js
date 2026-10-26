// Synthetic orchestration/source checks only; no real data/artifact/asset reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,relative,dirname,sep} from 'node:path';
import {spawnSync} from 'node:child_process';
import {BATCHES,ROOT_IDS,digest,sha,buildInputPacket,deriveDocumentIdentity} from '../../../../../spikes/topic-resolution/harness/browser-root-transfer-v1/manifest.js';
import {SOURCE_FILES} from '../../../../../spikes/topic-resolution/harness/browser-root-transfer-v1/run.mjs';
import {SOURCE_KEYS,CAPTURE_SOURCE_PATHS,OLD_FIT_SOURCE_PATHS,OLD_TARGET_SOURCE_PATHS,INPUT_KEYS,REPO,createFixedReadLedger,fixedPath,captureMetadataKeys,encodingEvidenceKeys,
 readAdmittedInputPacket,readAdmittedVectorPackets,withSuccessfulCaptureAdmission} from './manifest.js';
import {phaseFor,outputDirectory,run} from './run.js';
import {runVerifier,verifyStoredBundle} from './verify.js';
import {validateCaptureCompletion,validateCapturedPacket,makeEncodingPlan,validateEncodingReceipt,captureAdmissionReceipt,validateCaptureAdmissionProof,validateAllEncodingMetadata,
 assessEvidenceLinkedOutcomes,parseBoundedJson,vectorBitHash,LIMITS} from './contracts.js';
import {VECTOR_SCHEMA,serializeVectorPacket} from './vector-packet.js';
const H='a'.repeat(64),E='b'.repeat(64),F='c'.repeat(64),bytes=v=>Buffer.from(JSON.stringify(v));
const axis=i=>Array.from({length:384},(_,j)=>j===i?1:0);
function profile(producerId,inputConstructionHash){const p={schema:'root-rank-target-producer-profile/v1',producerId,inputConstructionHash,
 extractorVersions:producerId==='current-static'?['crawler-static-html-prefix/v1']:['article-container-prefix/v1','main-text-prefix/v1']};return {...p,producerProfileHash:digest(p)};}
function supervisor(schema,phase,batch,freezeSha256,sourceHashes,resultBytes){return {schema,phase,batch,reason:null,exitCode:0,cleanupReason:null,emergencyOwnJobTermination:false,
 ownTreeCleanupConfirmed:true,sourceHashesRechecked:true,freezeSha256,sourceHashes,resultSha256:sha(resultBytes),jobMemoryLimitBytes:1536*1048576,
 sampledPeakTreeRssBytes:1024,sampledPeakTreePrivateBytes:1024,elapsedSeconds:1};}
function fixture(){
 const sourceHashes={'protocol.json':H,'invented.js':E},profiles=[profile('current-static','d'.repeat(64)),profile('browser-current','e'.repeat(64))],p=profiles[1];
 const fm={schema:'browser-root-transfer-freeze/v1',sourceHashes,protocolSha256:H,candidateSha256:H,labelSealSha256:E,artifactReuseReceiptSha256:F,targetProfiles:profiles};
 const captureFreeze={...fm,freezeHash:digest(fm)},captureFreezeSha256=sha(bytes(captureFreeze));
 const transferBody={schema:'builder-scoped-root-rank-candidate/v1',nodeIds:[...ROOT_IDS].sort(),encoderHash:E,productionValidated:false,assignmentAuthority:false},transferIdentity={...transferBody,transferHash:digest(transferBody)};
 const cases=BATCHES.flat().map((id,i)=>({id,groupId:'group-'+i,url:'https://example.org/article-'+i,language:'en'}));
 const batches=[],packets=[];
 BATCHES.forEach((ids,i)=>{
  const batch=i+1,raw=ids.map((id,j)=>{
   const c=cases[i*4+j],frameId='frame-'+batch,loaderId='loader-'+j,identity=deriveDocumentIdentity({id,batch,freezeHash:captureFreeze.freezeHash,frameId,loaderId});
   const response={status:200,frameId,loaderId,exactFinalUrl:true,observedRemoteAddressPublic:true,ordinaryTlsSecure:true,
    requestIdentityScope:'same-playwright-request-object/v1',networkRequestIdCorrelated:false,nofollow:false,tdmReservation:null,headersSha256:H};
   const dom={frameId,loaderId,navigationId:identity.navigationId,exactDocumentUrl:true,canonicalUrlSha256:null,canonicalEqualsExpected:false,domDirectivesChecked:true};
   const documentWitness={schema:'playwright-owned-document/v1',finalUrlHash:sha(c.url),frameId,loaderId,navigationId:identity.navigationId,documentId:identity.sourceIncarnation,
    response,dom,responseWitnessHash:digest(response),domWitnessHash:digest(dom),networkRequestIdCorrelated:false,nativeAttestation:false};
   return {id,groupId:c.groupId,url:c.url,sourceVersion:identity.sourceVersion,sourceIncarnation:identity.sourceIncarnation,title:i===0&&j===0?'':'invented title',body:'invented body content',
    extractorVersion:'article-container-prefix/v1',documentWitness,originPolicyHash:H,pagePolicyHash:digest({schema:'browser-root-page-policy/v1',responseWitnessHash:digest(response),domWitnessHash:digest(dom)})};
  });
  const packet=buildInputPacket({phase:'browser-only',batch,freezeHash:captureFreeze.freezeHash,freezeSha256:captureFreezeSha256,candidateSha256:H,labelSealSha256:E,
   artifactReuseReceiptSha256:F,producerProfile:p,rows:raw.filter((_,j)=>!(i===0&&j===3))}),packetBytes=bytes(packet);packets.push(packetBytes);
  const results=ids.map((id,j)=>{const r=packet.rows.find(r=>r.id===id);return r?{id,status:'collected',reason:null,
   capture:{titleCharacters:r.title.length,titleSha256:r.titleSha256,bodyCharacters:r.body.length,bodySha256:r.bodySha256,extractorVersion:r.extractorVersion},
   documentWitness:r.documentWitness,responseWitness:r.documentWitness.response,pagePolicyHash:r.pagePolicyHash,sourceInputHash:r.sourceInputHash}:{id,status:'unavailable',reason:'origin-robots-denied'};});
  const result={schema:'browser-root-transfer-result/v1',phase:'browser-only',batch,status:'complete',denominator:4,fullProducerDenominator:32,cases:results,collected:packet.rows.length,
   sourceHashes,freezeHash:captureFreeze.freezeHash,freezeSha256:captureFreezeSha256,sourceHashesRechecked:true,protocolCallbacksDrained:true,
   producerProfile:p,artifactReuseReceiptSha256:F,artifactReuseReceiptHash:H,transferHash:transferIdentity.transferHash,profileRecipeHash:E,packetSha256:sha(packetBytes),
   priorEvidence:batches.map(b=>({batch:b.batch,resultSha256:sha(b.resultBytes),supervisorSha256:sha(b.supervisorBytes),packetSha256:JSON.parse(b.resultBytes).packetSha256})),
   policyElapsedMs:100,navigationMs:100,elapsedMs:500,peakCoordinatorPending:1,resourceEvents:10,policyRequests:2,
   reobservation:true,independentCohort:false,noOldInputSplice:true,evaluatedProducers:['browser-current'],unexercisedProducers:['current-static'],originalStaticProfileUnchanged:true,
   networkRequestIdCorrelated:false,browserProducerScope:'restricted-single-document-dom-reader/v1',ordinaryDynamicBrowserProducerValidated:false,noNativeAttestation:true,
   noModelCalls:true,noCanonicalWrites:true,productionValidated:false,assignmentAuthority:false};
  const resultBytes=bytes(result),s=supervisor('browser-root-transfer-supervisor/v1','browser-only',batch,captureFreezeSha256,sourceHashes,resultBytes);
  Object.assign(s,{childPid:123,denominator:4,fullProducerDenominator:32,sampledPeakTreeProcesses:1,noNativeAttestation:true,noModelCalls:true,productionValidated:false,
   purpose:'ADR148-browser-root-only-reobservation-not-independent-cohort',packetSha256:sha(packetBytes),ownedOutputByteLimit:512*1048576,ownedOutputEntryLimit:8192,sampledPeakOwnedOutputBytes:1,sampledPeakOwnedOutputEntries:1});
  batches.push({batch,resultBytes,supervisorBytes:bytes(s)});
 });
 const metadata={captureFreeze,captureFreezeSha256,sourceHashes,artifactReuseReceiptSha256:F,artifactReuseReceiptHash:H,transferHash:transferIdentity.transferHash,profileRecipeHash:E,oldSelectionReceiptSha256:H,cases,batches};
 return {metadata,packets,transferIdentity};
}
const mutateBytes=(b,fn)=>{const x=JSON.parse(b);fn(x);return bytes(x);};
function prepared(){const f=fixture(),completion=validateCaptureCompletion(f.metadata),plans=f.packets.map((inputPacketBytes,i)=>makeEncodingPlan({completion,batch:i+1,inputPacketBytes}));return {...f,completion,plans};}
function encoding(f){
 const vectorPacketBytes=f.plans.map(p=>serializeVectorPacket({schema:VECTOR_SCHEMA,freezeHash:F,encoderHash:E,batch:p.batch,inputPacketSha256:p.inputPacketSha256,
  rows:p.rows.filter(r=>r.encodingAvailable).map(r=>{const bodyVector=axis(0),titleVector=axis(1);bodyVector[2]=-0;return {id:r.id,producerId:'browser-current',sourceInputHash:r.sourceInputHash,
   bodySha256:r.bodySha256,titleSha256:r.titleSha256,bodyVector,titleVector,bodyVectorHash:vectorBitHash(bodyVector),titleVectorHash:vectorBitHash(titleVector)};})}));
 const batches=f.plans.map((p,i)=>{const r={schema:'browser-root-transfer-evaluation-encoding-receipt/v1',freezeHash:F,encoderHash:E,batch:p.batch,captureCompletionHash:p.captureCompletionHash,inputPacketSha256:p.inputPacketSha256,
  rows:p.rows,encoderCalls:p.expectedEncoderCalls,vectorPacketSha256:sha(vectorPacketBytes[i]),artifactReuseReceiptSha256:p.artifactReuseReceiptSha256,transferHash:p.transferHash,oldSelectionReceiptSha256:p.oldSelectionReceiptSha256,
  reobservation:true,untouchedIndependentCohort:false,noOldInputSplice:true,sourceHashesRechecked:true,timings:{initializationMs:0,encodingMs:1,totalChildMs:2},ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false};
  const receiptBytes=bytes(r),s=supervisor('browser-root-transfer-evaluation-supervisor/v1','encode-batch',i+1,H,f.metadata.sourceHashes,receiptBytes);s.receiptSha256=sha(receiptBytes);s.vectorPacketSha256=r.vectorPacketSha256;
  return {batch:i+1,receiptBytes,supervisorBytes:bytes(s)};});
 const metadata={freezeHash:F,freezeFileSha256:H,sourceHashes:f.metadata.sourceHashes,encoderHash:E,plans:f.plans,batches};
 return {metadata,vectorPacketBytes,encodingCompletion:validateAllEncodingMetadata(metadata)};
}
function outcomeInput(){const f=prepared(),e=encoding(f),cases=f.metadata.cases.map((c,i)=>({id:c.id,groupId:c.groupId,rootId:ROOT_IDS[Math.floor(i/2)],language:c.language,host:'example.org'}));
 const outcomes=f.plans.flatMap(p=>p.rows).map((p,i)=>{
  const r={id:p.id,producerId:p.producerId,captureStatus:p.captureStatus,inputAvailable:p.encodingAvailable,reason:p.reason,sourceInputHash:p.sourceInputHash,
   inputIdentity:p.inputIdentity,bodySha256:p.bodySha256,titleSha256:p.titleSha256,envelopeHash:p.envelopeHash,selectedRootId:null,decision:null,classificationMs:null};
  if(p.encodingAvailable){const v=JSON.parse(e.vectorPacketBytes[Math.floor(i/4)]).rows.find(v=>v.id===p.id),vectorBindings={encoding:'ieee754-binary64-little-endian/384/v1',bodyVectorHash:v.bodyVectorHash,titleVectorHash:v.titleVectorHash};
   r.selectedRootId=cases[i].rootId;r.classificationMs=.1;r.decision={schema:'current-producer-transfer-compact-root-decision/v2',originalSchema:'builder-scoped-root-rank-transfer-decision/v1',
    transferHash:f.transferIdentity.transferHash,status:'candidate',reason:'accepted',supportedPath:[r.selectedRootId],witness:p.scorerWitness,vectorBindings,
    semanticWitnessHash:digest({schema:'builder-scoped-root-rank-semantic-witness/v1',transferHash:f.transferIdentity.transferHash,witness:p.scorerWitness,vectorBindings}),
    work:{headDotProducts:16,headScalarProducts:6144,rankComparisonWork:64,fusionCoordinateVisitUpperBound:3072},experimental:true,developmentOnly:true,transferValidationStatus:'unvalidated',productionValidated:false,assignmentAuthority:false};}
  return r;});
 return {cases,plans:f.plans,outcomes,transferIdentity:f.transferIdentity,encodingCompletion:e.encodingCompletion,vectorPacketBytes:e.vectorPacketBytes};
}

function bundle(){
 const f=prepared(),e=encoding(f),a=outcomeInput(),completion=f.completion;
 const receipt=captureAdmissionReceipt({freezeHash:F,freezeFileSha256:H,sourceHashes:f.metadata.sourceHashes,completion}),receiptBytes=bytes(receipt);
 const admissionProof={receiptBytes,supervisorBytes:bytes(supervisor('browser-root-transfer-evaluation-supervisor/v1','admit-captures',null,H,f.metadata.sourceHashes,receiptBytes))};
 const result={schema:'browser-root-transfer-evaluation-result/v1',freezeHash:F,captureCompletionHash:digest(completion),encodingCompletionHash:digest(e.encodingCompletion),encoderHash:E,
  transferHash:f.transferIdentity.transferHash,transferIdentity:f.transferIdentity,encoderCalls:e.encodingCompletion.encoderCalls,outcomes:a.outcomes,
  assessment:assessEvidenceLinkedOutcomes(a),work:assessEvidenceLinkedOutcomes(a).work,
  timings:{compileMs:0,classificationMs:a.outcomes.reduce((n,r)=>n+(r.classificationMs??0),0),totalChildMs:10,scope:'classifier-wrapper-only-not-capture-E5-queue-or-DB'},
  artifactReuseReceiptSha256:F,artifactReuseReceiptHash:H,oldSelectionReceiptSha256:H,reobservation:true,untouchedIndependentCohort:false,noOldInputSplice:true,
  evaluatedProducers:['browser-current'],unexercisedProducers:['current-static'],ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false};
 return {cases:a.cases,completion,admissionProof,inputPacketBytes:f.packets,encodingBatches:e.metadata.batches,vectorPacketBytes:e.vectorPacketBytes,freezeHash:F,freezeFileSha256:H,
  sourceHashes:f.metadata.sourceHashes,encoderHash:E,transferHash:f.transferIdentity.transferHash,resultBytes:bytes(result)};
}
test('all default imports/actions inert and fixed phase/output APIs cannot name arbitrary work',async()=>{
 assert.equal(await run([]),'inert');assert.equal(await runVerifier([]),'inert');assert.equal(phaseFor([]),null);
 assert.deepEqual(phaseFor(['--encode-batch','8']),{phase:'encode-batch',batch:8});
 for(const a of [['--fit'],['--encode-batch','0'],['--encode-batch','../x'],['--evaluate','extra']])assert.throws(()=>phaseFor(a));
 assert.throws(()=>outputDirectory({phase:'capture',batch:null}));assert.throws(()=>outputDirectory({phase:'encode-batch',batch:9}));
 let calls=0;const proxy=new Proxy([],{get(){calls++;throw Error();}});assert.throws(()=>phaseFor(proxy));assert.equal(calls,0);
});
test('literal Node/Python closure covers all frozen collector aliases/package files and only allowed evidence paths',async()=>{
 assert.equal(SOURCE_KEYS.length,182);assert.equal(Object.keys(CAPTURE_SOURCE_PATHS).length,173);
 for(const [key,path]of Object.entries(SOURCE_FILES))assert.equal(CAPTURE_SOURCE_PATHS[key],relative(REPO,path).split(sep).join('/'));
 const root=resolve(REPO,'spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core'),found=[];
 async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){assert.equal(e.isSymbolicLink(),false);const p=resolve(dir,e.name);if(e.isDirectory())await walk(p);else found.push('node_modules/playwright-core/'+relative(root,p).split(sep).join('/'));}}
 await walk(root);assert.equal(found.length,115);assert.deepEqual(found.sort(),Object.keys(CAPTURE_SOURCE_PATHS).filter(k=>k.startsWith('node_modules/playwright-core/')).sort());
 for(const key of Object.values(CAPTURE_SOURCE_PATHS))assert.ok(SOURCE_KEYS.includes(key));
 for(const k of SOURCE_KEYS)assert.ok(!/output-batch-|input.packet|vectors.json|root-model.json|old-real32/u.test(k));
 const py=await readFile(new URL('./supervise.py',import.meta.url),'utf8');
 assert.deepEqual(JSON.parse(py.slice(py.indexOf('SOURCE_NAMES = ')+15,py.indexOf('\nFIT = '))),SOURCE_KEYS);
 assert.equal(captureMetadataKeys().length,8);assert.equal(encodingEvidenceKeys().length,8);
 for(const s of captureMetadataKeys())assert.ok(s.packet.includes('output-batch-'+String(s.batch).padStart(2,'0')));
 for(const bad of ['../owner.sqlite',INPUT_KEYS.model+'/../other',String.raw`D:\\owner`])assert.throws(()=>fixedPath(bad));
});
test('all statically executed relative runtime module imports belong to the reviewed literal source closure',async t=>{
 const base='apps/local-service/experiments/topic-encoder/hierarchical-e5-browser-root-transfer-v1/',queue=['run.js','manifest.js','verify.js','contracts.js'].map(n=>fixedPath(base+n)),seen=new Set();
 while(queue.length){const file=queue.pop();if(seen.has(file))continue;seen.add(file);
  const key=relative(REPO,file).split(sep).join('/');assert.ok(SOURCE_KEYS.includes(key),'Unpinned runtime source '+key);
  const source=await readFile(file,'utf8');
  for(const m of source.matchAll(/(?:from\s*|import\s*\(\s*)(['"])(\.[^'"]+)\1/g)){
   const next=resolve(dirname(file),m[2]);if(/\.m?js$/u.test(next))queue.push(next);}
 }
 t.diagnostic('Pinned relative runtime source modules: '+seen.size+'; variable asset imports are separately manifest/hash verified');
});
test('public ledger cannot bypass body/vector admission and returns detached CODE buffers',async()=>{
 const ledger=createFixedReadLedger();
 for(const spec of captureMetadataKeys())await assert.rejects(ledger.read(spec.packet));
 for(const spec of encodingEvidenceKeys())await assert.rejects(ledger.read(spec.vectors));
 await assert.rejects(readAdmittedInputPacket(Object.freeze({}),1));await assert.rejects(readAdmittedVectorPackets(Object.freeze({})));
 const key='apps/local-service/experiments/topic-encoder/hierarchical-e5-browser-root-transfer-v1/protocol.json',original=await ledger.read(key);
 const expected=sha(original);original.fill(0);assert.equal(sha(await ledger.read(key)),expected);await ledger.recheck();
});
test('actual admission IO orchestration calls no admitted packet/encoder path for failed/missing/drifted proof',async()=>{
 const b=bundle(),expectedReceipt=JSON.parse(b.admissionProof.receiptBytes),good=b.admissionProof;
 for(const fault of ['missing-receipt','missing-supervisor','bytes-drift','cleanup','source','resource','wall','recheck']){
  let reads=0,encoderCalls=0;const sup=JSON.parse(good.supervisorBytes);
  if(fault==='cleanup')sup.ownTreeCleanupConfirmed=false;if(fault==='source')sup.sourceHashes={};
  if(fault==='resource')sup.sampledPeakTreePrivateBytes=1536*1048576+1;if(fault==='wall')sup.elapsedSeconds=181;
  await assert.rejects(withSuccessfulCaptureAdmission({expectedReceipt,
   readReceipt:async()=>{if(fault==='missing-receipt')throw Error();return fault==='bytes-drift'?Buffer.concat([good.receiptBytes,Buffer.from(' ')]):good.receiptBytes;},
   readSupervisor:async()=>{if(fault==='missing-supervisor')throw Error();return bytes(sup);},
   recheck:async()=>{if(fault==='recheck')throw Error();},
   admitted:async()=>{reads++;encoderCalls++;}}));assert.equal(reads,0);assert.equal(encoderCalls,0);
 }
 let called=0;await withSuccessfulCaptureAdmission({expectedReceipt,readReceipt:async()=>good.receiptBytes,readSupervisor:async()=>good.supervisorBytes,recheck:async()=>{},admitted:async()=>called++});assert.equal(called,1);
});
test('whole stored bundle recomputes full32 results, byte/metadata links and rejects altered saved assessments',()=>{
 const b=bundle(),audit=verifyStoredBundle(b);assert.equal(audit.checked,true);assert.equal(audit.encoderCalls,60);assert.equal(audit.classificationReexecuted,false);assert.equal(audit.distinctArticleGroups,32);
 assert.ok(b.resultBytes.length<=262144);assert.ok(!b.resultBytes.toString().includes('bodyVector":['));
 for(const change of [r=>r.assessment.assessment.browser.correct=32,r=>r.outcomes[1].decision.semanticWitnessHash=H,r=>r.encoderCalls=64,r=>r.evaluatedProducers.push('current-static'),
  r=>r.timings.classificationMs=0,r=>r.transferIdentity.encoderHash=H,r=>r.work.headScalarProducts=1,r=>r.outcomes[0].selectedRootId='games']){
  const x={...b,resultBytes:mutateBytes(b.resultBytes,change)};assert.throws(()=>verifyStoredBundle(x));
 }
 const x={...b,vectorPacketBytes:[...b.vectorPacketBytes]};x.vectorPacketBytes[0]=Buffer.concat([x.vectorPacketBytes[0],Buffer.from(' ')]);assert.throws(()=>verifyStoredBundle(x));
});
test('guard-first offline phases, exact Job resources and no compiler/encoder in stored audit sources',async()=>{
 const runSource=await readFile(new URL('./run.js',import.meta.url),'utf8'),py=await readFile(new URL('./supervise.py',import.meta.url),'utf8'),verify=await readFile(new URL('./verify.js',import.meta.url),'utf8');
 assert.ok(runSource.indexOf('await handshake(spec)')<runSource.indexOf('const context=await readReviewedEvaluationContext'));
 assert.ok(runSource.indexOf('const t=performance.now(),model=compileSelected(context)')<runSource.indexOf('admitCompletedCaptureMetadata(context,captureCases)'));
 assert.ok(runSource.includes('await readPriorEncodingMetadata(context,captureHandle,batch)'));assert.ok(runSource.includes('calls<=8'));
 assert.ok(py.indexOf('AssignProcessToJobObject(job, process_handle)')<py.indexOf("child.stdin.write(('BROWSER_ROOT_EVALUATION_JOB_ASSIGNED_V1"));
 for(const required of ['0x0100 | 0x0001 | 0x1000','MEMORY_LIMIT, MAX_BYTES = 1536 * MIB','WALL_LIMIT, ACTIVE_LIMIT = 180, 170',"'TEMP': str(temp)","'TMP': str(temp)",'emergency_own_job_termination = True'])assert.ok(py.includes(required),required);
 assert.ok(!verify.includes('compileBuilderScopedRootRankCandidate'));assert.ok(!verify.includes('createPackagedCrawlerEmbedder'));assert.ok(!verify.includes('classifyBuilderScopedRootRankCandidate'));
 assert.ok(py.includes("for batch in range(1, 9):"));assert.ok(!py.includes("for phase in ('static', 'browser')"));
});
test('Python AST-only fixed-byte/capacity helpers reject invented drift/reparse/overflow without Win32',t=>{
 if(process.execArgv.some(a=>a.includes('deny-external-capabilities'))){t.skip('Offline guard blocks subprocess; run this AST-only check separately');return;}
 const script=String.raw`
import ast, types
from pathlib import Path
tree=ast.parse(Path('apps/local-service/experiments/topic-encoder/hierarchical-e5-browser-root-transfer-v1/supervise.py').read_text())
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('fixed_bytes','artifact_capacity')]
env={'MIB':1048576,'MAX_BYTES':512*1024,'RESULT_NAME':'result.json','PHASE':'evaluate'}
exec(compile(ast.Module(body=nodes,type_ignores=[]),'invented-only','exec'),env)
class Entry:
 def __init__(self,name,size=1,reparse=False): self.name=name; self.size=size; self.reparse=reparse; self.calls=0; self.drift=False
 def lstat(self):
  self.calls+=1
  return types.SimpleNamespace(st_size=self.size,st_mtime_ns=2 if self.drift and self.calls>1 else 1,st_ctime_ns=1,st_file_attributes=0x400 if self.reparse else 0)
 def stat(self): return self.lstat()
 def is_symlink(self): return self.reparse
 def is_file(self): return True
 def is_dir(self): return False
 def exists(self): return True
 def absolute(self): return self
 def resolve(self): return self
 def __str__(self): return self.name
 def read_bytes(self): return b'x'*self.size
class Missing:
 def exists(self): return False
class Root:
 def __init__(self,entries): self.entries=entries
 def iterdir(self): return iter(self.entries)
 def __truediv__(self,name): return next((x for x in self.entries if x.name==name),Missing())
def refuses(fn,reason):
 try: fn()
 except RuntimeError as e: assert str(e)==reason,(str(e),reason)
 else: raise AssertionError('Expected refusal')
fixed=env['fixed_bytes']; capacity=env['artifact_capacity']
assert fixed(Entry('fixed',2),2)==b'xx'
refuses(lambda:fixed(Entry('huge',3),2),'bounded-fixed-file-unavailable')
refuses(lambda:fixed(Entry('link',1,True),2),'bounded-fixed-file-unavailable')
x=Entry('changed',2);x.drift=True
refuses(lambda:fixed(x,2),'fixed-file-changed-during-read')
env['OUTPUT']=Root([Entry('result.json',10)]);capacity()
env['OUTPUT']=Root([Entry('result.json',64*1048576+1)])
refuses(capacity,'own-temp-and-output-capacity')
env['OUTPUT']=Root([Entry('link',1,True)])
refuses(capacity,'own-output-reparse-refused')
env['OUTPUT']=Root([Entry(str(i),0) for i in range(1025)])
refuses(capacity,'own-output-file-capacity')
env['OUTPUT']=Root([Entry('result.json',262145)])
refuses(capacity,'owned-file-capacity-exceeded')
print('AST helpers passed; no native/supervisor execution')
`;
 const r=spawnSync('python',['-c',script],{cwd:REPO,windowsHide:true,encoding:'utf8',timeout:10000,maxBuffer:32768});
 if(r.error&&['EPERM','EACCES','ENOENT'].includes(r.error.code)){t.skip('Python subprocess unavailable; execute the literal AST-only snippet separately');return;}
 assert.equal(r.status,0,r.stderr);assert.ok(r.stdout.includes('AST helpers passed'));
});

