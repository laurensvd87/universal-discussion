// Default inert. No phase runs without a root-written, reviewed source freeze.
// Local E5 only; no fit, capture, provider, DB or canonical/runtime registration.
import assert from 'node:assert/strict';
import {readFile,lstat,realpath,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {HERE,REPO,INPUT_KEYS,CAPTURE_ADMISSION_KEY,createFixedReadLedger,readReviewedEvaluationContext,
 admitCompletedCaptureMetadata,describeCaptureAdmission,readAdmittedPairedPackets,admitCompletedEncodingMetadata,describeEncodingAdmission,
 readAdmittedVectorPackets,describeEncodingProofBuffers,encodingEvidenceKeys} from './manifest.js';
import {sha,digest,parseBoundedJson,validateCapturedPacket,makeEncodingPlan,compactRootDecision,vectorBitHash,assessEvidenceLinkedOutcomes,summarizeDecisionWork} from './contracts.js';
import {BATCHES,ROOT_IDS,validateCandidateStructure,record,dense} from '../../../../../spikes/topic-resolution/harness/current-producer-final-v1/manifest.js';
import {VECTOR_SCHEMA,serializeVectorPacket,parseVectorPacket} from './vector-packet.js';
import {verifyStoredBundle} from './verify.js';
import {compileBuilderScopedRootRankCandidate,describeBuilderScopedRootRankCandidate,classifyBuilderScopedRootRankCandidate} from '../builder-scoped-root-rank-candidate-v1/scorer.js';
import {MODEL_ID,MODEL_SHA256,readAssetManifest} from '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';
const ASSET_ROOT=resolve(REPO,'spikes/topic-resolution/browser/embedding/.assets');
const EVAL_KEY='apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-evaluation-v1/';
export function phaseFor(args){
 const items=dense(args,2);
 if(!items.length)return null;
 if(items.length===1&&items[0]==='--admit-captures')return {phase:'admit-captures',batch:null};
 if(items.length===1&&items[0]==='--evaluate')return {phase:'evaluate',batch:null};
 if(items.length===2&&items[0]==='--encode-batch'&&/^[1-8]$/u.test(items[1]))return {phase:'encode-batch',batch:Number(items[1])};
 throw new TypeError('Unsupported fixed evaluation phase');
}
export function outputDirectory(spec){
 const s=record(spec,['phase','batch']);
 if(s.phase==='encode-batch'){assert.ok(Number.isInteger(s.batch)&&s.batch>=1&&s.batch<=8);return resolve(HERE,'output-encode-'+String(s.batch).padStart(2,'0'));}
 assert.ok(['admit-captures','evaluate'].includes(s.phase)&&s.batch===null);return resolve(HERE,s.phase==='evaluate'?'output-evaluation':'output-admit-captures');
}
const phaseToken=s=>s.phase+(s.batch===null?'':'-'+String(s.batch).padStart(2,'0'));
async function handshake(spec){
 const token=phaseToken(spec);assert.equal(process.platform,'win32');assert.equal(process.env.MURMINGLE_CURRENT_TRANSFER_EVAL_V1_SUPERVISED,token);
 const wanted='CURRENT_TRANSFER_EVALUATION_JOB_ASSIGNED_V1:'+token+'\n';
 await new Promise((yes,no)=>{
  let value='',done=false;
  const finish=error=>{if(done)return;done=true;clearTimeout(timer);process.stdin.off('data',data);process.stdin.off('end',end);process.stdin.pause();error?no(error):yes();};
  const data=b=>{value+=b.toString('ascii');if(value===wanted)finish();else if(value.length>=wanted.length)finish(Error('invalid-job-handshake'));};
  const end=()=>finish(Error('missing-job-handshake')),timer=setTimeout(()=>finish(Error('job-handshake-timeout')),5000);
  process.stdin.on('data',data);process.stdin.on('end',end);process.stdin.resume();
 });
}
async function checkedDirectory(dir){
 assert.ok(/^D:/iu.test(dir));const s=await lstat(dir);assert.ok(s.isDirectory()&&!s.isSymbolicLink());assert.equal((await realpath(dir)).toLowerCase(),dir.toLowerCase());
}
async function absent(file){try{await lstat(file);throw Error('Existing output prohibits replay');}catch(e){if(e.code!=='ENOENT')throw e;}}
async function writeExclusive(dir,name,value,maximum=262144){
 const b=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));assert.ok(b.length>0&&b.length<=maximum);
 await writeFile(join(dir,name),b,{flag:'wx'});return sha(b);
}
function getCases(candidate){
 const captureCases=validateCandidateStructure(candidate),cases=candidate.cases.map((c,i)=>{
  assert.equal(c.id,captureCases[i].id);assert.equal(c.expectedRootId,ROOT_IDS[Math.floor(i/2)]);
  return {id:c.id,groupId:c.entityGroup,rootId:c.expectedRootId,language:c.language,host:new URL(c.publicUrl).hostname};
 });
 return {captureCases,cases};
}
function compileSelected(context){
 const s=context.fit.selection,handle=compileBuilderScopedRootRankCandidate({schema:'builder-scoped-root-rank-candidate/v1',
  inputDefinition:context.fit.inputDefinition,rootModel:context.fit.model,rootPolicy:context.fit.policy,trainingInputConstructionHash:s.trainingInputConstructionHash,
  targetProfiles:s.targetProfiles.map(({producerId,inputConstructionHash,extractorVersions})=>({producerId,inputConstructionHash,extractorVersions}))});
 assert.equal(describeBuilderScopedRootRankCandidate(handle).transferHash,s.transferHash);return handle;
}
async function verifyAssets(manifestBytes,guard,hashContents=true){
 const manifest=readAssetManifest(parseBoundedJson(manifestBytes,16384));let total=0;
 for(const [name,spec]of manifest){
  guard();const file=join(ASSET_ROOT,name),before=await lstat(file);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.size===spec.bytes);
  assert.equal((await realpath(file)).toLowerCase(),file.toLowerCase());
  if(hashContents){
   const b=await readFile(file);try{assert.equal(b.length,spec.bytes);assert.equal(sha(b),spec.sha256);}finally{b.fill(0);}
  }
  const after=await lstat(file);assert.equal(after.size,before.size);assert.equal(after.mtimeMs,before.mtimeMs);assert.equal(after.ctimeMs,before.ctimeMs);
  total+=spec.bytes;assert.ok(total<=256*1024*1024);
 }
 return manifest;
}
function admissionReceipt(context,completion){
 return {schema:'current-producer-transfer-capture-admission/v1',freezeHash:context.freeze.freezeHash,freezeFileSha256:context.freezeSha256,
  captureCompletionHash:digest(completion),selectionReceiptSha256:context.fit.selectionReceiptSha256,
  sourceHashes:context.sources,all16Complete:true,ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false};
}
async function priorEncodingProofs(context,batch){
 for(const spec of encodingEvidenceKeys().slice(0,batch-1)){
  const rb=await context.ledger.read(spec.receipt,65536),s=parseBoundedJson(await context.ledger.read(spec.supervisor,65536)),r=parseBoundedJson(rb);
  for(const [k,v]of Object.entries({schema:'current-producer-transfer-evaluation-supervisor/v1',phase:'encode-batch',batch:spec.batch,reason:null,exitCode:0,cleanupReason:null,
   ownTreeCleanupConfirmed:true,sourceHashesRechecked:true,freezeSha256:context.freezeSha256,receiptSha256:sha(rb),vectorPacketSha256:r.vectorPacketSha256}))assert.equal(s[k],v);
  assert.deepEqual(s.sourceHashes,context.sources);assert.equal(r.freezeHash,context.freeze.freezeHash);assert.equal(r.batch,spec.batch);
 }
}
async function encodeBatch({context,captureHandle,batch,dir,guard,started}){
 const completion=describeCaptureAdmission(captureHandle),pair=await readAdmittedPairedPackets(captureHandle,batch),plan=makeEncodingPlan({completion,batch,...pair});
 assert.deepEqual(parseBoundedJson(await context.ledger.read(CAPTURE_ADMISSION_KEY)),admissionReceipt(context,completion));
 await priorEncodingProofs(context,batch);
 const packets=['static','browser'].map(phase=>validateCapturedPacket(pair[phase+'PacketBytes'],completion,phase,batch));
 let embedder=null,calls=0,initializationMs=0,encodingMs=0;const vectors=[];
 const assetManifestBytes=await context.ledger.read(INPUT_KEYS.assetManifest,16384);
 // Encoder identity is the frozen original raw transform, not a target builder.
 const encoderHash=digest({modelSha256:MODEL_SHA256,embeddingContractSha256:context.sources['spikes/topic-resolution/browser/embedding/embedding-contract.js'],assetManifestSha256:sha(assetManifestBytes)});
 assert.equal(encoderHash,context.fit.selection.encoderHash);assert.equal(encoderHash,context.freeze.encoderHash);
 try{
  if(plan.expectedEncoderCalls){
   // The unchanged packaged loader hashes every actual asset before use.
   // Check path/layout first without a duplicate113MiB pre-load allocation.
   await verifyAssets(assetManifestBytes,guard,false);guard();const t=performance.now();
   const {createPackagedCrawlerEmbedder}=await import('../../../src/crawler/packaged-e5.js');
   embedder=await createPackagedCrawlerEmbedder({assetRoot:ASSET_ROOT});assert.equal(embedder.modelId,MODEL_ID);initializationMs=performance.now()-t;
  }
  for(const p of plan.rows){
   guard();if(!p.encodingAvailable)continue;
   const packet=packets[p.producerId==='current-static'?0:1],row=packet.rows.find(r=>r.id===p.id);assert.ok(row);
   const t=performance.now();calls++;const body=await embedder.embed(row.body);guard();calls++;const title=await embedder.embed(row.title);
   encodingMs+=performance.now()-t;assert.equal(body.modelId,MODEL_ID);assert.equal(title.modelId,MODEL_ID);
   const bodyVector=[...body.values],titleVector=[...title.values];vectors.push({id:p.id,producerId:p.producerId,sourceInputHash:p.sourceInputHash,
    bodySha256:p.bodySha256,titleSha256:p.titleSha256,bodyVector,titleVector,bodyVectorHash:vectorBitHash(bodyVector),titleVectorHash:vectorBitHash(titleVector)});
  }
 }finally{if(embedder)await embedder.close();}
 assert.equal(calls,plan.expectedEncoderCalls);assert.ok(calls<=16);
 const vectorBytes=serializeVectorPacket({schema:VECTOR_SCHEMA,freezeHash:context.freeze.freezeHash,encoderHash,batch,inputPacketHashes:plan.inputPacketHashes,rows:vectors});
 if(calls)await verifyAssets(assetManifestBytes,guard);await context.ledger.recheck();guard();
 const vectorPacketSha256=await writeExclusive(dir,'vectors.json',vectorBytes);
 const receipt={schema:'current-producer-transfer-encoding-receipt/v1',freezeHash:context.freeze.freezeHash,encoderHash,batch,captureCompletionHash:plan.captureCompletionHash,
  inputPacketHashes:plan.inputPacketHashes,rows:plan.rows,encoderCalls:calls,vectorPacketSha256,sourceHashesRechecked:true,
  timings:{initializationMs,encodingMs,totalChildMs:performance.now()-started},ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false};
 guard();await writeExclusive(dir,'encoding.json',receipt,65536);
}
async function evaluate({context,captureHandle,model,cases,dir,guard,started,compileMs}){
 const completion=describeCaptureAdmission(captureHandle);
 assert.deepEqual(parseBoundedJson(await context.ledger.read(CAPTURE_ADMISSION_KEY)),admissionReceipt(context,completion));
 const handle=await admitCompletedEncodingMetadata(context,captureHandle),{encoding,plans}=describeEncodingAdmission(handle),packetBytes=await readAdmittedVectorPackets(handle);
 const vectorRows=packetBytes.flatMap(b=>parseVectorPacket(b).rows),byVector=new Map(vectorRows.map(r=>[r.id+'|'+r.producerId,r]));
 assert.equal(byVector.size,vectorRows.length);const identity=describeBuilderScopedRootRankCandidate(model);
 const outcomes=plans.flatMap(p=>p.rows).map(p=>{
  guard();let decision=null,classificationMs=null,selectedRootId=null;
  if(p.encodingAvailable){
   const vector=byVector.get(p.id+'|'+p.producerId);assert.ok(vector);const profile=identity.targetProfiles.find(q=>q.producerId===p.producerId);
   for(const k of ['sourceInputHash','bodySha256','titleSha256'])assert.equal(vector[k],p[k]);
   const t=performance.now(),d=classifyBuilderScopedRootRankCandidate(model,{sourceId:p.id,sourceVersion:p.sourceVersion,sourceIncarnation:p.sourceIncarnation,producerId:p.producerId,
    producerProfileHash:profile.producerProfileHash,inputConstructionHash:profile.inputConstructionHash,extractorVersion:
     completion.batches[(p.producerId==='current-static'?0:8)+Math.floor((Number(p.id.slice(-3))-1)/4)].results.find(r=>r.id===p.id).capture.extractorVersion,
    inputHash:p.sourceInputHash,documentWitness:p.documentWitness,bodyVector:vector.bodyVector,titleVector:vector.titleVector});
   classificationMs=performance.now()-t;decision=compactRootDecision(d);selectedRootId=d.supportedPath[0]??null;
  }
  return {id:p.id,producerId:p.producerId,captureStatus:p.captureStatus,inputAvailable:p.encodingAvailable,reason:p.reason,sourceInputHash:p.sourceInputHash,
   inputIdentity:p.inputIdentity,bodySha256:p.bodySha256,titleSha256:p.titleSha256,selectedRootId,decision,classificationMs};
 });
 const result={schema:'current-producer-transfer-root-evaluation/v1',freezeHash:context.freeze.freezeHash,captureCompletionHash:digest(completion),encodingCompletionHash:digest(encoding),
  encoderHash:context.fit.selection.encoderHash,transferHash:identity.transferHash,transferIdentity:identity,encoderCalls:encoding.encoderCalls,outcomes,
  assessment:assessEvidenceLinkedOutcomes({cases,plans,outcomes}),work:summarizeDecisionWork(outcomes),
  timings:{compileMs,classificationMs:outcomes.reduce((n,r)=>n+(r.classificationMs??0),0),totalChildMs:performance.now()-started,scope:'classifier-wrapper-only-not-capture-E5-queue-or-DB'},
  ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false};
 const resultBytes=Buffer.from(JSON.stringify(result));assert.ok(resultBytes.length<=262144);
 const paired=[];for(let batch=1;batch<=8;batch++)paired.push(await readAdmittedPairedPackets(captureHandle,batch));
 verifyStoredBundle({cases,completion,pairedPacketBytes:paired,encodingBatches:describeEncodingProofBuffers(handle),vectorPacketBytes:packetBytes,
  freezeHash:context.freeze.freezeHash,freezeFileSha256:context.freezeSha256,sourceHashes:context.sources,encoderHash:context.fit.selection.encoderHash,transferHash:identity.transferHash,resultBytes});
 await context.ledger.recheck();guard();await writeExclusive(dir,'result.json',resultBytes);
}
export async function run(args){
 const spec=phaseFor(args);if(spec===null)return 'inert';
 await handshake(spec);const started=performance.now(),guard=()=>assert.ok(performance.now()-started<165000,'Child phase deadline exceeded');
 const dir=outputDirectory(spec);await checkedDirectory(dir);
 for(const name of ['node.started.json','encoding.json','vectors.json','result.json','capture-admission.json'])await absent(join(dir,name));
 const context=await readReviewedEvaluationContext(createFixedReadLedger());
 const protocol=parseBoundedJson(await context.ledger.read(EVAL_KEY+'protocol.json'));
 assert.equal(protocol.runtimeImplemented,true);assert.equal(protocol.automaticExecutionEnabled,false);assert.equal(protocol.requiresRootWrittenReviewedFreeze,true);
 const candidate=parseBoundedJson(await context.ledger.read(INPUT_KEYS.candidate)),{captureCases,cases}=getCases(candidate);
 // Pure artifact compilation must succeed BEFORE reading any final input text.
 const t=performance.now(),model=compileSelected(context),compileMs=performance.now()-t;
 const captureHandle=await admitCompletedCaptureMetadata(context,captureCases);guard();
 await writeExclusive(dir,'node.started.json',{schema:'current-producer-transfer-evaluation-started/v1',...spec,freezeHash:context.freeze.freezeHash,
  freezeSha256:context.freezeSha256,all16CaptureMetadataComplete:true,noAutomaticRetry:true},65536);
 if(spec.phase==='admit-captures'){
  await context.ledger.recheck();guard();await writeExclusive(dir,'capture-admission.json',admissionReceipt(context,describeCaptureAdmission(captureHandle)),65536);
 }else if(spec.phase==='encode-batch')await encodeBatch({context,captureHandle,batch:spec.batch,dir,guard,started});
 else await evaluate({context,captureHandle,model,cases,dir,guard,started,compileMs});
 return 'completed';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{await run(process.argv.slice(2));}catch{console.error('current-producer-transfer-evaluation-failed');process.exitCode=1;}
}
