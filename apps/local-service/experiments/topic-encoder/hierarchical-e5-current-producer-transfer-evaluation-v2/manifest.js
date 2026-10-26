// Fixed paths only. Import is inert; no paths are accepted from saved metadata.
import assert from 'node:assert/strict';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SOURCE_NAMES as FIT_SOURCES} from '../hierarchical-e5-current-producer-transfer-v1/manifest.js';
import {TARGET_PRODUCER_SOURCE_KEYS,buildTargetProducerProfiles} from '../../../../../spikes/topic-resolution/harness/current-producer-final-v2/producer-profiles.js';
import {validateArtifactReuseReceipt,ARTIFACT_REUSE_DEPENDENCY_PINS} from '../../../../../spikes/topic-resolution/harness/current-producer-final-v2/artifact-reuse.js';
import {freeze} from '../../../../../spikes/topic-resolution/harness/current-producer-final-v2/manifest.js';
import {sha,parseBoundedJson,validateFreeze,validateRootFitEvidence,validateCaptureCompletion,validateCapturedPacket,makeEncodingPlan,validateAllEncodingMetadata,captureAdmissionReceipt,validateCaptureAdmissionProof} from './contracts.js';
export const HERE=dirname(fileURLToPath(import.meta.url));
export const REPO=resolve(HERE,'../../../../..');
const LOCAL='apps/local-service/experiments/topic-encoder/',EVAL=LOCAL+'hierarchical-e5-current-producer-transfer-evaluation-v2/',FIT=LOCAL+'hierarchical-e5-current-producer-transfer-v1/',CAP='spikes/topic-resolution/harness/current-producer-final-v2/';
const OWN=['run.js','manifest.js','contracts.js','contracts.test.js','supervise.py','verify.js','protocol.json','README.md'];
// Literal released collector closure. These are identity inputs, not paths
// followed from a receipt. No final public input text or vector packet is here.
export const CAPTURE_SOURCE_KEYS=Object.freeze([
 "spikes/topic-resolution/harness/current-producer-final-v2/run.mjs",
 "spikes/topic-resolution/harness/current-producer-final-v2/policy.js",
 "spikes/topic-resolution/harness/current-producer-final-v2/manifest.js",
 "spikes/topic-resolution/harness/current-producer-final-v2/supervise.py",
 "spikes/topic-resolution/harness/current-producer-final-v2/run.test.mjs",
 "spikes/topic-resolution/harness/current-producer-final-v2/policy.test.mjs",
 "spikes/topic-resolution/harness/current-producer-final-v2/manifest.test.mjs",
 "spikes/topic-resolution/harness/current-producer-final-v2/protocol.json",
 "spikes/topic-resolution/harness/current-producer-final-v2/README.md",
 "spikes/topic-resolution/browser/chromium/page-content-reader.js",
 "spikes/topic-resolution/browser/core/page-content-policy.js",
 "apps/local-service/src/crawler/public-fetch.js",
 "apps/local-service/src/crawler/robots.js",
 "apps/local-service/src/crawler/static-capture.js",
 "apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js",
 "spikes/topic-resolution/harness/current-producer-final-v2/producer-profiles.js",
 "spikes/topic-resolution/harness/current-producer-final-v2/producer-profiles.test.js",
 "apps/local-service/experiments/topic-encoder/hierarchical-e5-paired-v1/taxonomy.js",
 "decisions/ADR-143-current-producer-transfer-gate.md",
 "spikes/topic-resolution/harness/current-producer-controls-v1/run.mjs",
 "spikes/topic-resolution/harness/current-producer-controls-v1/policy.js",
 "spikes/topic-resolution/harness/current-producer-controls-v1/supervise.py",
 "spikes/topic-resolution/harness/current-producer-controls-v1/run.test.mjs",
 "spikes/topic-resolution/harness/current-producer-controls-v1/policy.test.mjs",
 "spikes/topic-resolution/harness/current-producer-controls-v1/protocol.json",
 "spikes/topic-resolution/harness/current-producer-controls-v1/README.md",
 "spikes/topic-resolution/harness/current-producer-controls-v1/freeze.json",
 "spikes/topic-resolution/harness/current-producer-controls-v1/output-static/result.json",
 "spikes/topic-resolution/harness/current-producer-controls-v1/output-static/supervisor.json",
 "spikes/topic-resolution/harness/current-producer-controls-v1/output-browser/result.json",
 "spikes/topic-resolution/harness/current-producer-controls-v1/output-browser/supervisor.json",
 "apps/local-service/data/hierarchy-current-producer-transfer-candidates-adr143.json",
 "apps/local-service/data/hierarchy-current-producer-transfer-label-seal-adr143.json",
 "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/output/selection-receipt.json",
 "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/freeze.json",
 "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/output/supervisor.json",
 "spikes/topic-resolution/harness/current-producer-final-v2/artifact-reuse.js",
 "spikes/topic-resolution/harness/current-producer-final-v2/artifact-reuse.test.js",
 "decisions/ADR-145-typed-transport-and-fixed-artifact-reobservation.md",
 "apps/local-service/data/hierarchy-current-producer-artifact-reuse-adr145.json",
 "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-evaluation-v1/contracts.js",
 "spikes/topic-resolution/harness/current-producer-final-v1/manifest.js",
 "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.js",
 "spikes/topic-resolution/browser/embedding/embedding-contract.js",
 "apps/local-service/experiments/topic-encoder/builder-scoped-root-rank-candidate-v1/scorer.js",
 "apps/local-service/src/domain/hierarchical-e5-paired-input.js",
 "apps/local-service/src/domain/hierarchical-e5-paired-linear-heads.js",
 "apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js",
 "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/fit.js",
 "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/contracts.test.js",
 "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/protocol.json",
 "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/supervise.py",
 "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/manifest.js",
 "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.test.js",
 "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/README.md",
 "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.js",
 "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.test.js",
 "apps/local-service/experiments/topic-encoder/hierarchical-e5-broad-heads-v1/vector-packet.js",
 "spikes/topic-resolution/harness/deny-external-capabilities.js",
 "spikes/topic-resolution/harness/current-producer-final-v1/run.mjs",
 "spikes/topic-resolution/harness/current-producer-final-v1/policy.js",
 "spikes/topic-resolution/harness/current-producer-final-v1/protocol.json"
]);
export const SOURCE_KEYS=Object.freeze([...new Set([
 ...OWN.map(n=>EVAL+n),...FIT_SOURCES.map(n=>relative(REPO,resolve(REPO,FIT,n)).replaceAll('\\','/')),
 ...TARGET_PRODUCER_SOURCE_KEYS,...CAPTURE_SOURCE_KEYS,...Object.keys(ARTIFACT_REUSE_DEPENDENCY_PINS),
 LOCAL+'hierarchical-e5-current-producer-transfer-evaluation-v1/vector-packet.js',
 'apps/local-service/src/crawler/packaged-e5.js','spikes/topic-resolution/browser/embedding/embedding-contract.js',
 'spikes/topic-resolution/harness/deny-external-capabilities.js',
])].sort());
export const INPUT_KEYS=Object.freeze({
 evaluationFreeze:EVAL+'freeze.json',collectorFreeze:CAP+'freeze.json',
 fitFreeze:FIT+'freeze.json',fitSupervisor:FIT+'output/supervisor.json',selectionReceipt:FIT+'output/selection-receipt.json',
 selection:FIT+'output/selection.json',model:FIT+'output/root-model.json',policy:FIT+'output/root-policy.json',inputDefinition:FIT+'output/input-definition.json',
 candidate:'apps/local-service/data/hierarchy-current-producer-transfer-candidates-adr143.json',
 labelSeal:'apps/local-service/data/hierarchy-current-producer-transfer-label-seal-adr143.json',
 assetManifest:'spikes/topic-resolution/browser/embedding/.assets/manifest.json',
 artifactReuse:'apps/local-service/data/hierarchy-current-producer-artifact-reuse-adr145.json',
});
const batchPath=(phase,batch,file)=>CAP+'output-'+phase+'-'+String(batch).padStart(2,'0')+'/'+file;
const encodePath=(batch,file)=>EVAL+'output-encode-'+String(batch).padStart(2,'0')+'/'+file;
export function captureMetadataKeys(){
 return ['static','browser'].flatMap(phase=>Array.from({length:8},(_,i)=>({phase,batch:i+1,result:batchPath(phase,i+1,'result.json'),
  supervisor:batchPath(phase,i+1,'supervisor.json'),packet:batchPath(phase,i+1,'input.packet.json')})));
}
export function encodingEvidenceKeys(){
 return Array.from({length:8},(_,i)=>({batch:i+1,receipt:encodePath(i+1,'encoding.json'),supervisor:encodePath(i+1,'supervisor.json'),vectors:encodePath(i+1,'vectors.json')}));
}
const ALLOWED=new Set([...SOURCE_KEYS,...Object.values(INPUT_KEYS),
 ...captureMetadataKeys().flatMap(x=>[x.result,x.supervisor,x.packet]),...encodingEvidenceKeys().flatMap(x=>[x.receipt,x.supervisor,x.vectors]),
 EVAL+'output-admit-captures/capture-admission.json',EVAL+'output-admit-captures/supervisor.json',
 EVAL+'output-evaluation/result.json',EVAL+'output-evaluation/supervisor.json']);
export const CAPTURE_ADMISSION_KEY=EVAL+'output-admit-captures/capture-admission.json';
export function fixedPath(key){
 assert.equal(typeof key,'string');assert.ok(ALLOWED.has(key),'Path outside fixed evaluation allowlist');return resolve(REPO,key);
}
async function boundedFixedBytes(key,maximum=262144){
 assert.ok(Number.isInteger(maximum)&&maximum>0&&maximum<=4*1024*1024);
 const file=fixedPath(key),before=await lstat(file);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.size>0&&before.size<=maximum);
 assert.equal((await realpath(file)).toLowerCase(),file.toLowerCase());
 const bytes=await readFile(file),after=await lstat(file);assert.equal(bytes.length,before.size);
 assert.equal(after.size,before.size);assert.equal(after.mtimeMs,before.mtimeMs);assert.equal(after.ctimeMs,before.ctimeMs);return bytes;
}
const BODY_KEYS=new Set([...captureMetadataKeys().map(s=>s.packet),...encodingEvidenceKeys().map(s=>s.vectors)]);
const ledgers=new WeakMap(),contexts=new WeakSet();
export function createFixedReadLedger(){
 const values=new Map(),limits=new Map();
 const read=async(key,maximum=262144)=>{
   fixedPath(key);if(values.has(key)){assert.ok(values.get(key).length<=maximum);return values.get(key);}
   const bytes=await boundedFixedBytes(key,maximum);values.set(key,bytes);limits.set(key,maximum);return bytes;
 };
 const ledger=Object.freeze({
  async read(key,maximum=262144){
   assert.ok(!BODY_KEYS.has(key),'Retained input/vector bytes require private completed-metadata admission');
   return read(key,maximum);
  },
  hashes:()=>Object.fromEntries([...values].map(([key,b])=>[key,sha(b)])),
  async recheck(){for(const [key,b]of values)assert.equal(sha(await boundedFixedBytes(key,limits.get(key))),sha(b));},
 });
 ledgers.set(ledger,{read});return ledger;
}
export async function readReviewedEvaluationContext(ledger=createFixedReadLedger()){
 assert.ok(ledgers.has(ledger),'Expected privately created fixed ledger');
 const sources={};for(const key of SOURCE_KEYS)sources[key]=sha(await ledger.read(key,4*1024*1024));
 const freezeBytes=await ledger.read(INPUT_KEYS.evaluationFreeze,65536),f=validateFreeze(parseBoundedJson(freezeBytes),'current-producer-transfer-evaluation-freeze/v2',sources);
 // Root writes this only after all dependent source reviews. Never create it here.
 assert.equal(f.executionApproved,true);assert.equal(f.ordinaryDynamicBrowserProducerValidated,false);
 assert.equal(f.protocolSha256,sources[EVAL+'protocol.json']);
 const inputNames=Object.keys(INPUT_KEYS).filter(k=>!['evaluationFreeze','collectorFreeze'].includes(k)).map(k=>INPUT_KEYS[k]);
 assert.deepEqual(Object.keys(f.inputHashes).sort(),inputNames.slice().sort());
 for(const key of Object.keys(INPUT_KEYS).filter(k=>!['evaluationFreeze','collectorFreeze'].includes(k))){
  const name=INPUT_KEYS[key];assert.ok(Object.hasOwn(f.inputHashes,name),'Missing fixed input pin');
  assert.equal(sha(await ledger.read(name)),f.inputHashes[name]);
 }
 const fitSources=Object.fromEntries(FIT_SOURCES.map(n=>[n,sources[relative(REPO,resolve(REPO,FIT,n)).replaceAll('\\','/')]]));
 const inheritedFit=validateRootFitEvidence({
  freezeBytes:await ledger.read(INPUT_KEYS.fitFreeze),sourceHashes:fitSources,selectionReceiptBytes:await ledger.read(INPUT_KEYS.selectionReceipt),
  supervisorBytes:await ledger.read(INPUT_KEYS.fitSupervisor),selectionBytes:await ledger.read(INPUT_KEYS.selection),
  modelBytes:await ledger.read(INPUT_KEYS.model),policyBytes:await ledger.read(INPUT_KEYS.policy),inputDefinitionBytes:await ledger.read(INPUT_KEYS.inputDefinition),
 });
 assert.equal(f.oldSelectionReceiptSha256,inheritedFit.selectionReceiptSha256);
 for(const [key,pin]of Object.entries(ARTIFACT_REUSE_DEPENDENCY_PINS))assert.equal(sources[key],pin);
 const profiles=buildTargetProducerProfiles(Object.fromEntries(TARGET_PRODUCER_SOURCE_KEYS.map(key=>[key,sources[key]])));
 const reuseBytes=await ledger.read(INPUT_KEYS.artifactReuse,65536),reuseReceiptSha256=sha(reuseBytes);
 assert.equal(f.artifactReuseReceiptSha256,reuseReceiptSha256);
 const reuse=validateArtifactReuseReceipt({receipt:parseBoundedJson(reuseBytes),oldProof:{
  freezeBytes:await ledger.read(INPUT_KEYS.fitFreeze),supervisorBytes:await ledger.read(INPUT_KEYS.fitSupervisor),
  selectionReceiptBytes:await ledger.read(INPUT_KEYS.selectionReceipt),sourceHashes:fitSources},
  next:{targetProfiles:profiles.targetProfiles,profileRecipeHash:profiles.recipeHash,protocolSha256:sources[CAP+'protocol.json'],
   candidateSha256:sources[INPUT_KEYS.candidate],labelSealSha256:sources[INPUT_KEYS.labelSeal]}});
 assert.equal(reuse.transferHash,f.transferHash);assert.equal(reuse.encoderHash,f.encoderHash);
 const captureFreezeBytes=await ledger.read(INPUT_KEYS.collectorFreeze,65536),captureFreeze=parseBoundedJson(captureFreezeBytes);
 assert.equal(sha(captureFreezeBytes),f.collectorFreezeSha256);
 assert.deepEqual(captureFreeze.targetProfiles,reuse.targetProfiles);
 assert.equal(captureFreeze.artifactReuseReceiptSha256,reuseReceiptSha256);
 // Capture source entries are not followed as paths. Every path must already be
 // present in the reviewed fixed source set or the literal selection input.
 assert.deepEqual(Object.keys(captureFreeze.sourceHashes),CAPTURE_SOURCE_KEYS);
 for(const key of CAPTURE_SOURCE_KEYS)assert.equal(captureFreeze.sourceHashes[key],sources[key]);
 const metadataKeys=captureMetadataKeys().flatMap(s=>[s.result,s.supervisor]);
 assert.deepEqual(Object.keys(f.captureMetadataHashes).sort(),metadataKeys.slice().sort());
 for(const key of metadataKeys)assert.equal(sha(await ledger.read(key,65536)),f.captureMetadataHashes[key]);
 const context=Object.freeze({ledger,freeze:freeze(f),freezeSha256:sha(freezeBytes),sources:Object.freeze(sources),inheritedFit,reuse,reuseReceiptSha256,
  captureFreeze:freeze(captureFreeze),captureFreezeSha256:sha(captureFreezeBytes)});
 contexts.add(context);return context;
}
const admissions=new WeakMap(),bodyAdmissions=new WeakSet(),encodingAdmissions=new WeakMap();
export async function admitCompletedCaptureMetadata(context,cases){
 assert.ok(contexts.has(context),'Expected privately validated reviewed context');
 const batches=[];for(const spec of captureMetadataKeys())batches.push({phase:spec.phase,batch:spec.batch,
  resultBytes:await context.ledger.read(spec.result,65536),supervisorBytes:await context.ledger.read(spec.supervisor,65536)});
 const completion=validateCaptureCompletion({captureFreeze:context.captureFreeze,captureFreezeSha256:context.captureFreezeSha256,
  sourceHashes:context.captureFreeze.sourceHashes,artifactReuseReceiptSha256:context.reuseReceiptSha256,
  artifactReuseReceiptHash:context.reuse.receiptHash,transferHash:context.reuse.transferHash,profileRecipeHash:context.reuse.profileRecipeHash,
  oldSelectionReceiptSha256:context.inheritedFit.selectionReceiptSha256,cases,batches});
 await context.ledger.recheck();const handle=Object.freeze({});admissions.set(handle,{context,completion});return handle;
}
export function describeCaptureAdmission(handle){assert.ok(admissions.has(handle));return admissions.get(handle).completion;}
// Shared IO orchestration, also exercised with invented reader/callback seams.
// This function cannot mint a private production handle by itself.
export async function withSuccessfulCaptureAdmission({expectedReceipt,readReceipt,readSupervisor,recheck,admitted}){
 const receiptBytes=await readReceipt(),supervisorBytes=await readSupervisor();
 const proof=validateCaptureAdmissionProof({expectedReceipt,receiptBytes,supervisorBytes});
 await recheck();return admitted(proof,{receiptBytes,supervisorBytes});
}
export async function admitSavedCaptureAdmission(context,captureHandle){
 assert.ok(contexts.has(context)&&admissions.has(captureHandle));const own=admissions.get(captureHandle);assert.equal(own.context,context);
 const expectedReceipt=captureAdmissionReceipt({freezeHash:context.freeze.freezeHash,freezeFileSha256:context.freezeSha256,sourceHashes:context.sources,completion:own.completion});
 return withSuccessfulCaptureAdmission({expectedReceipt,
  readReceipt:()=>context.ledger.read(CAPTURE_ADMISSION_KEY,65536),
  readSupervisor:()=>context.ledger.read(EVAL+'output-admit-captures/supervisor.json',65536),recheck:()=>context.ledger.recheck(),
  admitted:(proof,proofBuffers)=>{const handle=Object.freeze({});admissions.set(handle,{...own,proof,proofBuffers});bodyAdmissions.add(handle);return handle;}});
}
export function describeCaptureAdmissionProof(handle){assert.ok(bodyAdmissions.has(handle));return admissions.get(handle).proofBuffers;}
export async function readAdmittedPairedPackets(handle,batch){
 assert.ok(bodyAdmissions.has(handle),'Successful saved admission supervisor not privately admitted');assert.ok(Number.isInteger(batch)&&batch>=1&&batch<=8);
 const {context,completion}=admissions.get(handle),out={};
 // Detect post-admission proof drift before opening any packet, even from cache.
 await context.ledger.recheck();
 for(const phase of ['static','browser']){
  const key=batchPath(phase,batch,'input.packet.json'),bytes=await ledgers.get(context.ledger).read(key,131072);
  validateCapturedPacket(bytes,completion,phase,batch);out[phase+'PacketBytes']=bytes;
 }
 return out;
}
export async function admitCompletedEncodingMetadata(context,captureHandle){
 assert.ok(contexts.has(context)&&bodyAdmissions.has(captureHandle));const own=admissions.get(captureHandle);assert.equal(own.context,context);
 const plans=[];for(let batch=1;batch<=8;batch++){
  const pair=await readAdmittedPairedPackets(captureHandle,batch);
  plans.push(makeEncodingPlan({completion:own.completion,batch,...pair}));
 }
 const batches=[];for(const spec of encodingEvidenceKeys())batches.push({batch:spec.batch,receiptBytes:await context.ledger.read(spec.receipt,65536),
  supervisorBytes:await context.ledger.read(spec.supervisor,65536)});
 const encoding=validateAllEncodingMetadata({freezeHash:context.freeze.freezeHash,freezeFileSha256:context.freezeSha256,sourceHashes:context.sources,
  encoderHash:context.inheritedFit.selection.encoderHash,plans,batches});
 await context.ledger.recheck();const handle=Object.freeze({});encodingAdmissions.set(handle,{context,completion:own.completion,encoding,plans,batches});return handle;
}
export function describeEncodingAdmission(handle){
 assert.ok(encodingAdmissions.has(handle));const {completion,encoding,plans}=encodingAdmissions.get(handle);return {completion,encoding,plans};
}
export async function readAdmittedVectorPackets(handle){
 assert.ok(encodingAdmissions.has(handle),'All8 encoding supervisors not privately admitted');
 const {context,encoding}=encodingAdmissions.get(handle),packets=[];
 for(const spec of encodingEvidenceKeys()){
  const bytes=await ledgers.get(context.ledger).read(spec.vectors,262144);
  assert.equal(sha(bytes),encoding.receipts[spec.batch-1].vectorPacketSha256);packets.push(bytes);
 }
 return packets;
}
export function reviewedContextHashes(context){assert.ok(contexts.has(context));return context.ledger.hashes();}
export function describeEncodingProofBuffers(handle){
 assert.ok(encodingAdmissions.has(handle));return encodingAdmissions.get(handle).batches;
}
