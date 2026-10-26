// ADR179 transient orchestration. Trusted callbacks authenticate actual owned
// observations; datatype/hash checks alone never establish native/guardian truth.
import {types} from 'node:util';
import {MODEL_ID,inputText} from '../../../browser/embedding/embedding-contract.js';
import {record,dense,dataCopy,freeze,digest,sha,hash,identifier,text,requireTrue,refuse,SpecificityError,validateSpecificityBatch} from './manifest.js';

export const COHORT_LIMITS=freeze({dimensions:384,evidenceBytes:16384,resultBytes:524288,
 'train-cal':{rows:96,batches:24,fieldCalls:192,rawUnits:431616,encodingMs:540000},
 test:{rows:72,batches:18,fieldCalls:144,rawUnits:323712,encodingMs:405000}});
const EXTRACTORS=['main-text-prefix/v1','article-container-prefix/v1'];
const UNAVAILABLE=['origin-policy-unavailable','origin-policy-refused','article-unavailable','document-policy-unavailable',
 'document-policy-refused','reader-unavailable','foreground-changed','restricted-rendering'];
const FAULTS=new Set(['contract','capacity','phase','callback','reentry','clock','deadline','guard','async-callback','unsafe-promise','batch-order','row-order','native-identity',
 'unavailable','batch-receipt','capture-incomplete','cohort-receipt','cohort-time','field-binding','revalidation','model','encoder-close','endcheck','result-content','test-admission','abandoned']);
function failureCode(error,fallback){
 if(error!==null&&typeof error==='object'&&!types.isProxy(error)&&types.isNativeError(error)&&Object.getPrototypeOf(error)===SpecificityError.prototype){
  const d=Object.getOwnPropertyDescriptor(error,'code');if(d&&Object.hasOwn(d,'value')&&typeof d.value==='string'&&FAULTS.has(d.value))return d.value;
 }return fallback;
}
const fn=f=>{requireTrue(typeof f==='function'&&!types.isProxy(f));return f;};
function bounded(v,bytes=16384){const out=dataCopy(v,{values:8192,units:bytes,depth:16,array:1024,properties:128,string:16384});requireTrue(Buffer.byteLength(JSON.stringify(out))<=bytes,'capacity');return freeze(out);}
const NativePromise=Promise,originalThen=Promise.prototype.then;
function safeOriginalPromise(v){
 if(types.isProxy(v)||!types.isPromise(v)||Object.getPrototypeOf(v)!==NativePromise.prototype)return false;
 for(const k of Reflect.ownKeys(v)){const d=Object.getOwnPropertyDescriptor(v,k);
  if(k==='constructor'||k==='then'||!d||!Object.hasOwn(d,'value'))return false;}
 return true;
}
function vector(v){const a=dense(v,384);requireTrue(a.length===384);let norm=0;
 for(const n of a){requireTrue(typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1);norm+=n*n;}
 requireTrue(Math.abs(norm-1)<=1e-5);return a;}
function vectorHash(v){const b=Buffer.alloc(384*8);v.forEach((n,i)=>b.writeDoubleLE(n,i*8));
 return sha(Buffer.concat([Buffer.from('builder-root-input-vector/binary64-le/384/v1\0'),b]));}
function fieldBindings(r){return freeze({bodySha256:sha(r.body),bodyCharacters:r.body.length,
 rawTitleSha256:sha(r.rawTitle),rawTitleCharacters:r.rawTitle.length,effectiveTitleSha256:sha(r.effectiveTitle),effectiveTitleCharacters:r.effectiveTitle.length});}
function noRawResult(v){
 if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){requireTrue(!['rawTitle','effectiveTitle','body','bodyVector','titleVector'].includes(k),'result-content');noRawResult(x);}
}
export function createSpecificityCohort(input){
 const a=record(input,['manifest','expectedPanelIdentity','expectedManifestHash','phase','producerProfileHash','nodeIdentityHash','guard','now','phaseDeadline','admitAvailable','admitUnavailable','verifyBatchDrain','authorizeTest']);
 requireTrue(a.phase==='train-cal'||a.phase==='test');hash(a.producerProfileHash);hash(a.nodeIdentityHash);
 for(const k of ['guard','now','admitAvailable','admitUnavailable','verifyBatchDrain','authorizeTest'])fn(a[k]);
 requireTrue(typeof a.phaseDeadline==='number'&&Number.isFinite(a.phaseDeadline));
 // Authenticate the whole detached manifest using independently held owner pins.
 const manifest=dataCopy(a.manifest),selected=dense(manifest.batches,42).filter(b=>b.phase===a.phase),limits=COHORT_LIMITS[a.phase];
 requireTrue(selected.length===limits.batches);
 const batches=selected.map(batch=>validateSpecificityBatch({manifest,batch,expectedPanelIdentity:a.expectedPanelIdentity,expectedManifestHash:a.expectedManifestHash}));
 let phase='capture',fault=null,busy=false,nextBatch=0,rows=[],textUnits=0,calls=0,encoded=[],captureHash=null,modelUntil=null,modelStartedAt=null,lastNow=-Infinity;
 const pending=new Set(),receipts=[],studies=new Map(),revisions=new Map(),nonces=new Set();let selection=null,encoder=null,closeAttempted=false,unsafeOperationRefused=false;
 function trackOriginal(original){
  if(!safeOriginalPromise(original)){unsafeOperationRefused=true;refuse('unsafe-promise');}
  pending.add(original);
  // Only structurally safe native originals are observed. A plain bridge wraps
  // payloads, never resolving another Promise directly with a supplied object.
  return new NativePromise((resolve,reject)=>{
   try{originalThen.call(original,value=>{pending.delete(original);resolve({value});},reason=>{pending.delete(original);reject(reason);});}
   catch(e){pending.delete(original);reject(e);}
  });
 }
 function sync(v){
  if(types.isProxy(v)){unsafeOperationRefused=true;refuse('unsafe-promise');}
  if(types.isPromise(v)){const wait=trackOriginal(v);originalThen.call(wait,()=>undefined,()=>undefined);refuse('async-callback');}
  return v;
 }
 const metadata=r=>Object.fromEntries(Object.entries(r).filter(([k])=>!['rawTitle','effectiveTitle','body'].includes(k)));
 function wipe(){for(const row of rows){delete row.rawTitle;delete row.effectiveTitle;delete row.body;}textUnits=0;encoded=[];}
 function poison(code='failed'){if(fault===null)fault=code;phase='failed';wipe();}
 function error(){throw new SpecificityError(fault||'phase');}
 function clock(){const n=sync(a.now());requireTrue(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n>=lastNow,'clock');lastNow=n;return n;}
 function guard(expected){if(fault!==null)error();requireTrue(phase===expected,'phase');
  const n=clock();requireTrue(n<a.phaseDeadline&&(modelUntil===null||n<modelUntil),'deadline');const checked=sync(a.guard());requireTrue(checked===undefined||checked===true,'guard');if(fault!==null||phase!==expected)error();
  const after=clock();requireTrue(after<a.phaseDeadline&&(modelUntil===null||after<modelUntil),'deadline');if(fault!==null||phase!==expected)error();return after;}
 function work(expected,action){if(busy){poison('reentry');error();}busy=true;
  try{guard(expected);const value=action();guard(expected);return value;}catch(e){poison(failureCode(e,'callback'));error();}finally{busy=false;}}
 function expectedCase(batchId,ordinal,caseId){const b=batches[nextBatch];requireTrue(b!==undefined&&batchId===b.batchId,'batch-order');
  const local=rows.length-nextBatch*4;requireTrue(local<4&&ordinal===local+1&&b.cases[local].id===caseId,'row-order');return b.cases[local];}
 function admission(c,r,bindings){return freeze({case:c,producerProfileHash:a.producerProfileHash,fieldBindings:bindings,extractorVersion:r.extractorVersion,nativeWitness:bounded(r.nativeWitness),rightsEvidence:bounded(r.rightsEvidence)});}
 function acceptRow(batchId,value){return work('capture',()=>{
  identifier(batchId);const raw=bounded(value,65536),status=raw.status;
  if(status==='collected'){
   const r=record(raw,['status','caseId','ordinal','rawTitle','effectiveTitle','body','extractorVersion','nativeWitness','rightsEvidence']);
   const c=expectedCase(batchId,r.ordinal,r.caseId);text(r.rawTitle,200,true);text(r.effectiveTitle,200);text(r.body,4096);inputText(r.effectiveTitle);inputText(r.body);
   requireTrue(r.effectiveTitle===(r.rawTitle.trim()||new URL(c.url).hostname)&&EXTRACTORS.includes(r.extractorVersion));
   const units=r.rawTitle.length+r.effectiveTitle.length+r.body.length;requireTrue(textUnits+units<=limits.rawUnits,'capacity');
   const doc=r.nativeWitness;identifier(doc.studyId);identifier(doc.studyRevision);identifier(doc.observationNonce);
   requireTrue(doc.caseId===c.id&&doc.ordinal===c.nativeOrdinal&&!nonces.has(doc.observationNonce),'native-identity');
   requireTrue(!studies.has(doc.studyId)||studies.get(doc.studyId)===batchId,'native-identity');
   requireTrue(!revisions.has(doc.studyRevision)||revisions.get(doc.studyRevision)===batchId,'native-identity');
   const existing=rows.find(x=>x.batchId===batchId&&x.status==='available');
   if(existing)requireTrue(existing.evidenceNativeStudyId===doc.studyId&&existing.evidenceNativeRevision===doc.studyRevision,'native-identity');
   const bindings=fieldBindings(r),admitted=record(sync(a.admitAvailable(admission(c,r,bindings))),['inputIdentity','evidence']);
   guard('capture');hash(admitted.inputIdentity);const evidence=bounded(admitted.evidence);
   nonces.add(doc.observationNonce);studies.set(doc.studyId,batchId);revisions.set(doc.studyRevision,batchId);textUnits+=units;
   rows.push({id:c.id,groupId:c.groupId,split:c.split,globalOrdinal:c.globalOrdinal,nativeOrdinal:c.nativeOrdinal,batchId,status:'available',inputIdentity:admitted.inputIdentity,evidence,fieldBindings:bindings,
    evidenceNativeStudyId:doc.studyId,evidenceNativeRevision:doc.studyRevision,rawTitle:r.rawTitle,effectiveTitle:r.effectiveTitle,body:r.body,extractorVersion:r.extractorVersion});
  }else{
   const r=record(raw,['status','caseId','ordinal','reason']);requireTrue(status==='unavailable'&&UNAVAILABLE.includes(r.reason),'unavailable');
   const c=expectedCase(batchId,r.ordinal,r.caseId),proof=record(sync(a.admitUnavailable(freeze({case:c,reason:r.reason,producerProfileHash:a.producerProfileHash}))),['inputIdentity','evidence']);
   guard('capture');hash(proof.inputIdentity);rows.push({id:c.id,groupId:c.groupId,split:c.split,globalOrdinal:c.globalOrdinal,nativeOrdinal:c.nativeOrdinal,batchId,status:'unavailable',reason:r.reason,inputIdentity:proof.inputIdentity,evidence:bounded(proof.evidence)});
  }
  return freeze({accounted:rows.length,batchId});
 });}
 function prepareBatchDrain(value){return work('capture',()=>{
  const r=record(value,['batchId','captureSummary']),batch=batches[nextBatch];
  requireTrue(pending.size===0&&batch!==undefined&&batch.batchId===r.batchId&&rows.length===(nextBatch+1)*4,'batch-order');
  return freeze({batch,manifestHash:manifest.manifestHash,nodeIdentityHash:a.nodeIdentityHash,
   batchCaptureHash:digest(rows.slice(-4).map(metadata)),captureSummaryHash:digest(bounded(r.captureSummary,131072))});
 });}
 function finishBatch(value){return work('capture',()=>{
  const r=record(value,['batchId','captureSummary','guardianReceipt']),batch=batches[nextBatch];requireTrue(batch!==undefined&&batch.batchId===r.batchId&&rows.length===(nextBatch+1)*4,'batch-order');
  const batchCaptureHash=digest(rows.slice(-4).map(metadata));
  const receipt=record(sync(a.verifyBatchDrain(freeze({batch,manifestHash:manifest.manifestHash,nodeIdentityHash:a.nodeIdentityHash,batchCaptureHash,captureSummaryHash:digest(bounded(r.captureSummary,131072)),
   captureSummary:bounded(r.captureSummary,131072),guardianReceipt:bounded(r.guardianReceipt,32768)}))),['batchId','manifestHash','nodeIdentityHash','batchCaptureHash','receiptHash']);
  guard('capture');requireTrue(receipt.batchId===batch.batchId&&receipt.manifestHash===manifest.manifestHash&&receipt.nodeIdentityHash===a.nodeIdentityHash&&receipt.batchCaptureHash===batchCaptureHash,'batch-receipt');hash(receipt.receiptHash);
  requireTrue(!receipts.some(x=>x.receiptHash===receipt.receiptHash),'batch-receipt');receipts.push(freeze({...receipt}));nextBatch++;
  return freeze({batchId:batch.batchId,receiptHash:receipt.receiptHash,completedBatches:nextBatch});
 });}
 function finishCapture(){return work('capture',()=>{
  requireTrue(nextBatch===limits.batches&&rows.length===limits.rows,'capture-incomplete');
  captureHash=digest({schema:'native-specificity-capture-ledger/v1',phase:a.phase,manifestHash:manifest.manifestHash,nodeIdentityHash:a.nodeIdentityHash,producerProfileHash:a.producerProfileHash,rows:rows.map(metadata),batchReceiptHashes:receipts.map(r=>r.receiptHash)});
  // work() checks capture until return; transition is performed by the wrapper.
  return freeze({captureHash,accounted:rows.length,available:rows.filter(r=>r.status==='available').length,batchReceiptHashes:receipts.map(r=>r.receiptHash)});
 });}
 // Track the original Promise itself; not the caller's timeout or a derived
 // wait. A late rejection remains observed by the awaiting original operation.
 async function observe(action,options={}){
  if(!options.cleanup)guard('encoding');const original=action();
  // Wrap direct values so async return cannot assimilate an untrusted .then.
  if(types.isProxy(original)){unsafeOperationRefused=true;refuse('unsafe-promise');}
  if(!types.isPromise(original)){if(!options.cleanup&&options.after!==false)guard('encoding');return {value:original};}
  const result=await trackOriginal(original);if(!options.cleanup&&options.after!==false)guard('encoding');return result;
 }
 async function closeOnce(){if(closeAttempted||encoder===null)return;closeAttempted=true;const {value}=await observe(()=>encoder.close(),{cleanup:true});requireTrue(value===undefined||value===true,'encoder-close');}
 async function encodeAfterCohortDrain(value){
  if(busy||phase!=='captured'||fault!==null){poison(busy?'reentry':'phase');error();}
  let f;try{f=record(value,['requestFinalDrain','createEncoder','recheckAssetsAndSources','revalidateAvailable']);Object.values(f).forEach(fn);}catch(e){poison(failureCode(e,'callback'));error();}
  busy=true;phase='encoding';let failed=false;
  try{
   guard('encoding');const body={schema:'native-specificity-cohort-drain-request/v1',phase:a.phase,panelIdentity:manifest.panelIdentity,manifestHash:manifest.manifestHash,nodeIdentityHash:a.nodeIdentityHash,captureHash,batchReceiptHashes:receipts.map(r=>r.receiptHash)};
   const request=freeze({...body,requestHash:digest(body)}),before=clock();
   const ack=record((await observe(()=>f.requestFinalDrain(request))).value,['requestHash','receiptHash','nodeIdentityHash','requestedAt','acknowledgedAt']);
   const arrived=clock();hash(ack.receiptHash);requireTrue(ack.requestHash===request.requestHash&&ack.nodeIdentityHash===a.nodeIdentityHash,'cohort-receipt');
   requireTrue(typeof ack.requestedAt==='number'&&Number.isFinite(ack.requestedAt)&&typeof ack.acknowledgedAt==='number'&&Number.isFinite(ack.acknowledgedAt)&&ack.requestedAt>=before&&ack.acknowledgedAt>=ack.requestedAt&&ack.acknowledgedAt<=arrived,'cohort-time');
   modelStartedAt=ack.requestedAt;modelUntil=modelStartedAt+limits.encodingMs;guard('encoding');
   for(const row of rows){
    if(row.status==='unavailable')continue;
    inputText(row.body);inputText(row.effectiveTitle);text(row.body,4096);text(row.effectiveTitle,200);
    requireTrue(digest(fieldBindings(row))===digest(row.fieldBindings),'field-binding');
    const proof=record(sync(f.revalidateAvailable(freeze({case:batches.flatMap(b=>b.cases).find(c=>c.id===row.id),producerProfileHash:a.producerProfileHash,inputIdentity:row.inputIdentity,fieldBindings:row.fieldBindings,evidence:row.evidence,extractorVersion:row.extractorVersion}))),['inputIdentity','evidence']);
    guard('encoding');requireTrue(proof.inputIdentity===row.inputIdentity&&digest(bounded(proof.evidence))===digest(row.evidence),'revalidation');
    if(encoder===null){const created=(await observe(()=>f.createEncoder(),{after:false})).value;encoder=record(created,['modelId','embed','close']);fn(encoder.embed);fn(encoder.close);guard('encoding');requireTrue(encoder.modelId===MODEL_ID,'model');}
    requireTrue(++calls<=limits.fieldCalls,'capacity');const bodyResult=record((await observe(()=>encoder.embed(row.body))).value,['modelId','values']);requireTrue(bodyResult.modelId===MODEL_ID,'model');const bodyVector=vector(bodyResult.values);
    requireTrue(++calls<=limits.fieldCalls,'capacity');const titleResult=record((await observe(()=>encoder.embed(row.effectiveTitle))).value,['modelId','values']);requireTrue(titleResult.modelId===MODEL_ID,'model');const titleVector=vector(titleResult.values);
    encoded.push({id:row.id,bodyVector,titleVector,bodyVectorHash:vectorHash(bodyVector),titleVectorHash:vectorHash(titleVector)});
    textUnits-=row.rawTitle.length+row.effectiveTitle.length+row.body.length;delete row.rawTitle;delete row.effectiveTitle;delete row.body;
   }
  }catch(e){failed=true;poison(failureCode(e,'callback'));}
  try{await closeOnce();if(!failed)guard('encoding');}catch(e){failed=true;poison(failureCode(e,'encoder-close'));}
  try{const {value:checked}=await observe(()=>f.recheckAssetsAndSources(),{cleanup:true});if(checked!==true)refuse('endcheck');if(!failed)guard('encoding');}catch(e){failed=true;poison(failureCode(e,'endcheck'));}
  busy=false;if(failed)error();phase='encoded';modelUntil=null;return freeze({captureHash,encoderCalls:calls,available:encoded.length,encodingStartedAt:modelStartedAt,encodingCompletedAt:lastNow,rawTextRetained:false,vectorBindings:encoded.map(({id,bodyVectorHash,titleVectorHash})=>({id,bodyVectorHash,titleVectorHash}))});
 }
 function consumeEncoded(consumer){
  if(busy){poison('reentry');error();}busy=true;
  try{guard('encoded');fn(consumer);phase='consuming';
   const query=rows.map(row=>{const v=encoded.find(x=>x.id===row.id);return freeze({...metadata(row),...(v?{bodyVector:[...v.bodyVector],titleVector:[...v.titleVector],bodyVectorHash:v.bodyVectorHash,titleVectorHash:v.titleVectorHash}:{}),panelCase:dataCopy(manifest.cases[row.globalOrdinal-1])});});
   const result=bounded(sync(consumer(freeze({phase:a.phase,manifestHash:manifest.manifestHash,captureHash,selection,rows:query}))),524288);noRawResult(result);
   guard('consuming');wipe();phase='complete';return result;
  }catch(e){poison(failureCode(e,'callback'));error();}finally{busy=false;}
 }
 try{guard('capture');if(a.phase==='test'){
  const proof=record(sync(a.authorizeTest(freeze({manifestHash:manifest.manifestHash,panelIdentity:manifest.panelIdentity,nodeIdentityHash:a.nodeIdentityHash}))),['manifestHash','selectionIdentity','auditIdentity']);
  guard('capture');requireTrue(proof.manifestHash===manifest.manifestHash,'test-admission');hash(proof.selectionIdentity);hash(proof.auditIdentity);selection=freeze(proof);
 }}catch(e){poison(failureCode(e,'test-admission'));error();}
 return Object.freeze({acceptRow,prepareBatchDrain,finishBatch,finishCapture(){const result=finishCapture();phase='captured';return result;},encodeAfterCohortDrain,consumeEncoded,
  abandon(){if(phase==='complete')refuse('phase');poison('abandoned');},snapshot(){return freeze({phase,fault,accounted:rows.length,completedBatches:nextBatch,retainedTextUnits:textUnits,encoderCalls:calls,privateVectorRows:encoded.length,pendingOriginals:pending.size,unsafeOperationRefused,encoderCloseAttempted:closeAttempted});}});
}
