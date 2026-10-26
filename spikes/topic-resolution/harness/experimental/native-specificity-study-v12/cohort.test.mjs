import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSpecificityManifest,digest,SpecificityError} from './manifest.js';
import {createSpecificityCohort,COHORT_LIMITS} from './cohort.js';
import {MODEL_ID} from '../../../browser/embedding/embedding-contract.js';

// Independent invented panel; no real metadata, captured text, vector or artifact.
function manifest(){
 const cases=[];for(const split of ['training','calibration','test'])for(let i=0;i<(split==='test'?72:48);i++){
  const id=split==='test'&&i<2?`adr159-test-${i?'083':'054'}`:`invented-${split}-${i}`,g={kind:'complete',path:['games']},unknown=split==='test'&&i<2;
  cases.push({id,groupId:'group-'+id,split,role:'parent-stop',nodeId:'games',publicUrl:`https://publisher${i%7}.org/${id}`,publicSupportUrl:`https://publisher${i%7}.org/${id}`,language:'en',publisherFamily:`family-${split}-${i%(split==='test'?25:24)}`,proposedGold:g,assessmentGold:unknown?null:{...g,path:[...g.path]},labelStatus:unknown?'unverified':'verified',referenceAnnotation:split==='training'?{nodeId:'games',kind:'stop'}:null});
 }
 const body={schema:'hierarchy-native-specificity-panel/v1',cases,counts:{},sourceDigests:{},taxonomy:{unionNodeCount:25},assessmentPolicy:{allOriginalRowsAndDenominatorsRetained:true,unverifiedOrDisputedProposedGoldNeverPassedToAssessor:true},limitations:{},fullyReviewedGoldReady:false,nativeReady:false,modelReady:false,productionValidated:false,assignmentAuthority:false};
 const identity=digest(body);return buildSpecificityManifest({panel:{...body,panelIdentity:identity},expectedPanelIdentity:identity});
}
const H='a'.repeat(64),J='b'.repeat(64);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const unit=()=>{const a=Array(384).fill(0);a[0]=1;a[1]=-0;return a;};
function setup(phase='train-cal',overrides={}){
 const m=manifest(),batches=m.batches.filter(b=>b.phase===phase);let time=0,created=0,closed=0,embedded=0,checked=0,authorized=0;
 const available=a=>({inputIdentity:digest({id:a.case.id,bindings:a.fieldBindings}),evidence:{caseId:a.case.id,fieldBindings:a.fieldBindings,native:a.nativeWitness,rights:a.rightsEvidence}});
 const args={manifest:m,expectedPanelIdentity:m.panelIdentity,expectedManifestHash:m.manifestHash,phase,producerProfileHash:H,nodeIdentityHash:J,guard:()=>true,now:()=>time,phaseDeadline:10000000,
  admitAvailable:available,admitUnavailable:a=>({inputIdentity:digest(a),evidence:{reason:a.reason}}),
  verifyBatchDrain:a=>({batchId:a.batch.batchId,manifestHash:a.manifestHash,nodeIdentityHash:a.nodeIdentityHash,batchCaptureHash:a.batchCaptureHash,receiptHash:digest({id:a.batch.batchId,hash:a.batchCaptureHash})}),
  authorizeTest:a=>{authorized++;return {manifestHash:a.manifestHash,selectionIdentity:H,auditIdentity:J};},...overrides};
 const c=createSpecificityCohort(args);
 const encodeArgs={requestFinalDrain:r=>({requestHash:r.requestHash,receiptHash:H,nodeIdentityHash:J,requestedAt:time,acknowledgedAt:time}),
  createEncoder:()=>{created++;return {modelId:MODEL_ID,embed:()=>{embedded++;return {modelId:MODEL_ID,values:unit()};},close:()=>{closed++;return true;}};},
  recheckAssetsAndSources:()=>{checked++;return true;},revalidateAvailable:r=>({inputIdentity:r.inputIdentity,evidence:r.evidence})};
 function row(batch,local,available=true,maximum=false){const x=batch.cases[local];return available?{status:'collected',caseId:x.id,ordinal:x.nativeOrdinal,
  rawTitle:maximum?'T'.repeat(200):'Title',effectiveTitle:maximum?'T'.repeat(200):'Title',body:maximum?'B'.repeat(4096):'Invented body',extractorVersion:'main-text-prefix/v1',
  nativeWitness:{caseId:x.id,ordinal:x.nativeOrdinal,studyId:'study-'+batch.batchId,studyRevision:batch.batchId,observationNonce:'nonce-'+x.id},rightsEvidence:{invented:true}}:
  {status:'unavailable',caseId:x.id,ordinal:x.nativeOrdinal,reason:'article-unavailable'};}
 function capture({allAvailable=false,maximum=false}={}){
  for(const b of batches){for(let i=0;i<4;i++)c.acceptRow(b.batchId,row(b,i,allAvailable||i===0,maximum));c.finishBatch({batchId:b.batchId,captureSummary:{invented:true},guardianReceipt:{invented:true}});}return c.finishCapture();
 }
 return {m,batches,c,args,encodeArgs,row,capture,setTime:n=>{time=n;},counts:()=>({created,closed,embedded,checked,authorized})};
}
test('96 capture rows+24 authenticated receipt callbacks precede any encoder; bits survive pair/consumer',async()=>{
 const s=setup();const capture=s.capture();assert.equal(capture.accounted,96);assert.equal(capture.batchReceiptHashes.length,24);assert.equal(s.counts().created,0);
 const result=await s.c.encodeAfterCohortDrain(s.encodeArgs);assert.equal(result.encoderCalls,48);assert.equal(result.available,24);assert.equal(s.counts().closed,1);assert.equal(s.c.snapshot().retainedTextUnits,0);
 const out=s.c.consumeEncoded(a=>{assert.equal(a.rows.length,96);for(const r of a.rows.filter(r=>r.status==='available')){assert.ok(Object.is(r.bodyVector[1],-0));assert.ok(Object.is(r.titleVector[1],-0));assert.ok(Object.isFrozen(r.bodyVector));}return {accounted:a.rows.length};});
 assert.equal(out.accounted,96);assert.equal(s.c.snapshot().phase,'complete');assert.equal(s.c.snapshot().privateVectorRows,0);assert.throws(()=>s.c.consumeEncoded(()=>({})));
});
test('72 TEST retains both null gold rows and requires separate trusted immutable-selection admission',async()=>{
 const s=setup('test');assert.equal(s.counts().authorized,1);const capture=s.capture();assert.equal(capture.accounted,72);assert.equal(capture.batchReceiptHashes.length,18);
 await s.c.encodeAfterCohortDrain(s.encodeArgs);s.c.consumeEncoded(a=>{assert.equal(a.selection.selectionIdentity,H);assert.equal(a.rows.filter(r=>r.panelCase.assessmentGold===null).length,2);return {};});
 assert.throws(()=>setup('test',{authorizeTest:()=>true}));assert.throws(()=>setup('test',{authorizeTest:()=>({manifestHash:'0'.repeat(64),selectionIdentity:H,auditIdentity:J})}));
});
test('all-available maximum raw budgets and192/144 field calls, no early encoder',async()=>{
 for(const phase of ['train-cal','test']){const s=setup(phase);s.capture({allAvailable:true,maximum:true});assert.equal(s.c.snapshot().retainedTextUnits,COHORT_LIMITS[phase].rawUnits);
  const r=await s.c.encodeAfterCohortDrain(s.encodeArgs);assert.equal(r.encoderCalls,COHORT_LIMITS[phase].fieldCalls);assert.equal(s.counts().embedded,r.encoderCalls);assert.equal(s.c.snapshot().retainedTextUnits,0);}
});
test('capture and each batch block advancement/finish until exact4 rows and bound normal-drain receipt',()=>{
 const s=setup();assert.throws(()=>s.c.finishCapture(),{code:'capture-incomplete'});assert.equal(s.c.snapshot().phase,'failed');
 const t=setup();const first=t.batches[0];for(let i=0;i<4;i++)t.c.acceptRow(first.batchId,t.row(first,i));
 assert.throws(()=>t.c.acceptRow(t.batches[1].batchId,t.row(t.batches[1],0)),{code:'batch-order'});
 const u=setup('train-cal',{verifyBatchDrain:()=>true});const b=u.batches[0];for(let i=0;i<4;i++)u.c.acceptRow(b.batchId,u.row(b,i));assert.throws(()=>u.c.finishBatch({batchId:b.batchId,captureSummary:{},guardianReceipt:{}}));
 const v=setup('train-cal',{verifyBatchDrain:a=>({batchId:a.batch.batchId,manifestHash:a.manifestHash,nodeIdentityHash:J,batchCaptureHash:H,receiptHash:J})});const x=v.batches[0];for(let i=0;i<4;i++)v.c.acceptRow(x.batchId,v.row(x,i));assert.throws(()=>v.c.finishBatch({batchId:x.batchId,captureSummary:{},guardianReceipt:{}}),{code:'batch-receipt'});
});
test('global ordinal cannot replace genuine local ordinal and native identities cannot cross batches',()=>{
 const s=setup();const b=s.batches[0],row=s.row(b,0);row.ordinal=33;assert.throws(()=>s.c.acceptRow(b.batchId,row),{code:'row-order'});
 const t=setup();const x=t.batches[0];for(let i=0;i<4;i++)t.c.acceptRow(x.batchId,t.row(x,i));t.c.finishBatch({batchId:x.batchId,captureSummary:{},guardianReceipt:{}});
 const y=t.row(t.batches[1],0);y.nativeWitness.studyId='study-'+x.batchId;assert.throws(()=>t.c.acceptRow(t.batches[1].batchId,y),{code:'native-identity'});
});
test('unsupported unavailable reasons, fields and malformed admitted evidence are fatal',()=>{
 for(const change of [r=>{r.reason='encoding-input-unavailable';},r=>{r.reason='generic-error';},r=>{r.extra=true;}]){const s=setup(),b=s.batches[0],r=s.row(b,0,false);change(r);assert.throws(()=>s.c.acceptRow(b.batchId,r));assert.equal(s.c.snapshot().phase,'failed');}
 for(const change of [r=>{r.rawTitle='T'.repeat(201);},r=>{r.body='B'.repeat(4097);},r=>{r.effectiveTitle='wrong';},r=>{r.nativeWitness.ordinal=33;}]){const s=setup(),b=s.batches[0],r=s.row(b,0);change(r);assert.throws(()=>s.c.acceptRow(b.batchId,r));assert.equal(s.c.snapshot().retainedTextUnits,0);}
 const s=setup('train-cal',{admitAvailable:()=>({inputIdentity:H,evidence:{x:'x'.repeat(16384)}})});assert.throws(()=>s.c.acceptRow(s.batches[0].batchId,s.row(s.batches[0],0)),{code:'capacity'});
});
test('descriptor/getter/proxy rejection has zero getter calls at row and vector boundaries',async()=>{
 let called=0;const s=setup(),b=s.batches[0],r=s.row(b,0);Object.defineProperty(r,'body',{enumerable:true,get(){called++;throw Error();}});assert.throws(()=>s.c.acceptRow(b.batchId,r));assert.equal(called,0);
 const t=setup();t.capture();t.encodeArgs.createEncoder=()=>({modelId:MODEL_ID,embed:()=>{const v=unit();Object.defineProperty(v,'1',{enumerable:true,get(){called++;throw Error();}});return {modelId:MODEL_ID,values:v};},close:()=>true});
 await assert.rejects(t.c.encodeAfterCohortDrain(t.encodeArgs));assert.equal(called,0);
 const u=setup();u.capture();u.encodeArgs.requestFinalDrain=()=>{const bad={};Object.defineProperty(bad,'then',{get(){called++;throw Error();}});return bad;};await assert.rejects(u.c.encodeAfterCohortDrain(u.encodeArgs));assert.equal(called,0);
});
test('final cohort ACK is not boolean, binds request/node and starts clock at fresh observed request',async()=>{
 for(const ack of [()=>true,r=>({requestHash:r.requestHash,receiptHash:H,nodeIdentityHash:H,requestedAt:0,acknowledgedAt:0})]){const s=setup();s.capture();await assert.rejects(s.c.encodeAfterCohortDrain({...s.encodeArgs,requestFinalDrain:ack}));assert.equal(s.counts().created,0);}
 const s=setup();s.capture();s.setTime(100);const d=deferred();const promise=s.c.encodeAfterCohortDrain({...s.encodeArgs,requestFinalDrain:r=>{d.request=r;return d.promise;}});
 assert.equal(s.counts().created,0);assert.equal(s.c.snapshot().pendingOriginals,1);s.setTime(540100);d.resolve({requestHash:d.request.requestHash,receiptHash:H,nodeIdentityHash:J,requestedAt:100,acknowledgedAt:540100});
 await assert.rejects(promise,{code:'deadline'});assert.equal(s.counts().created,0);assert.equal(s.c.snapshot().pendingOriginals,0);
});
test('revalidation happens before first field and any mismatch is fatal without partial vectors',async()=>{
 const s=setup();s.capture();await assert.rejects(s.c.encodeAfterCohortDrain({...s.encodeArgs,revalidateAvailable:r=>({inputIdentity:H,evidence:r.evidence})}),{code:'revalidation'});assert.equal(s.counts().created,0);assert.equal(s.c.snapshot().privateVectorRows,0);
});
test('original pending embed remains charged after abandon; late rejection keeps first fault and closes once',async()=>{
 const s=setup();s.capture();const d=deferred();let closes=0;
 const p=s.c.encodeAfterCohortDrain({...s.encodeArgs,createEncoder:()=>({modelId:MODEL_ID,embed:()=>d.promise,close:()=>{closes++;return true;}})});await new Promise(resolve=>queueMicrotask(()=>queueMicrotask(resolve)));
 assert.equal(s.c.snapshot().pendingOriginals,1);s.c.abandon();assert.equal(s.c.snapshot().pendingOriginals,1);assert.equal(s.c.snapshot().retainedTextUnits,0);d.reject(Error('invented rejection'));
 await assert.rejects(p,{code:'abandoned'});assert.equal(closes,1);assert.equal(s.c.snapshot().pendingOriginals,0);assert.equal(s.c.snapshot().privateVectorRows,0);
});
test('pending encoder creation settles before late handle close, without borrowed authority',async()=>{
 const s=setup();s.capture();const d=deferred();let closes=0;
 const p=s.c.encodeAfterCohortDrain({...s.encodeArgs,createEncoder:()=>d.promise});await new Promise(resolve=>queueMicrotask(()=>queueMicrotask(resolve)));assert.equal(s.c.snapshot().pendingOriginals,1);
 s.c.abandon();d.resolve({modelId:MODEL_ID,embed:()=>{throw Error('must not embed');},close:()=>{closes++;return true;}});await assert.rejects(p,{code:'abandoned'});assert.equal(closes,1);
});
test('close remains physically pending and rejects/fails without completed-state claim',async()=>{
 const s=setup();s.capture();const d=deferred();let closes=0;
 const p=s.c.encodeAfterCohortDrain({...s.encodeArgs,createEncoder:()=>({modelId:MODEL_ID,embed:()=>({modelId:MODEL_ID,values:unit()}),close:()=>{closes++;return d.promise;}})});
 for(let i=0;i<110;i++)await Promise.resolve();assert.equal(s.c.snapshot().pendingOriginals,1);assert.equal(s.c.snapshot().phase,'encoding');d.reject(Error('close'));await assert.rejects(p,{code:'encoder-close'});assert.equal(closes,1);assert.equal(s.c.snapshot().pendingOriginals,0);
});
test('reentry, phase misuse, asynchronous sync callbacks and guard poison are sticky',()=>{
 let c;const s=setup('train-cal',{admitAvailable:()=>{c.abandon();return {inputIdentity:H,evidence:{}};}});c=s.c;assert.throws(()=>c.acceptRow(s.batches[0].batchId,s.row(s.batches[0],0)),{code:'abandoned'});
 let t;const u=setup('train-cal',{admitAvailable:()=>{try{t.finishCapture();}catch{}return {inputIdentity:H,evidence:{}};}});t=u.c;assert.throws(()=>t.acceptRow(u.batches[0].batchId,u.row(u.batches[0],0)),{code:'reentry'});
 const v=setup('train-cal',{admitAvailable:()=>Promise.reject(Error('observed'))});assert.throws(()=>v.c.acceptRow(v.batches[0].batchId,v.row(v.batches[0],0)),{code:'async-callback'});
 assert.throws(()=>setup('train-cal',{guard:()=>false}),{code:'guard'});
});
test('nonfinite/decreasing clocks and original exact phase deadline reject without renewal',()=>{
 for(const now of [()=>NaN,()=>Infinity,()=>-1])assert.throws(()=>setup('train-cal',{now}));
 const s=setup();s.setTime(10000000);assert.throws(()=>s.c.acceptRow(s.batches[0].batchId,s.row(s.batches[0],0)),{code:'deadline'});
 const t=setup();t.setTime(10);t.c.acceptRow(t.batches[0].batchId,t.row(t.batches[0],0));t.setTime(9);assert.throws(()=>t.c.acceptRow(t.batches[0].batchId,t.row(t.batches[0],1)),{code:'clock'});
});
test('encoder and endcheck failures wipe raw/vectors; consumer output cannot save query vectors',async()=>{
 const s=setup();s.capture();await assert.rejects(s.c.encodeAfterCohortDrain({...s.encodeArgs,recheckAssetsAndSources:()=>false}),{code:'endcheck'});assert.equal(s.c.snapshot().privateVectorRows,0);assert.equal(s.c.snapshot().retainedTextUnits,0);
 const t=setup();t.capture();await t.c.encodeAfterCohortDrain(t.encodeArgs);assert.throws(()=>t.c.consumeEncoded(a=>({bodyVector:a.rows[0].bodyVector})),{code:'result-content'});assert.equal(t.c.snapshot().privateVectorRows,0);
});
test('signed-zero vector hashes differ from positive zero without normalization',async()=>{
 const a=setup();a.capture();const negative=await a.c.encodeAfterCohortDrain(a.encodeArgs);
 const b=setup();b.capture();b.encodeArgs.createEncoder=()=>({modelId:MODEL_ID,embed:()=>{const values=unit();values[1]=0;return {modelId:MODEL_ID,values};},close:()=>true});
 const positive=await b.c.encodeAfterCohortDrain(b.encodeArgs);assert.notEqual(negative.vectorBindings[0].bodyVectorHash,positive.vectorBindings[0].bodyVectorHash);
});

test('prepare drain is idempotent private-metadata-only read; finish independently binds both hashes',()=>{
 let expected=null,verified=0;
 const s=setup('train-cal',{verifyBatchDrain:r=>{verified++;assert.equal(r.batchCaptureHash,expected.batchCaptureHash);assert.equal(r.captureSummaryHash,expected.captureSummaryHash);
  return {batchId:r.batch.batchId,manifestHash:r.manifestHash,nodeIdentityHash:r.nodeIdentityHash,batchCaptureHash:r.batchCaptureHash,receiptHash:H};}}),b=s.batches[0];
 for(let i=0;i<4;i++)s.c.acceptRow(b.batchId,s.row(b,i));
 const summary={invented:true},before=s.c.snapshot(),prepared=s.c.prepareBatchDrain({batchId:b.batchId,captureSummary:summary});
 assert.deepEqual(s.c.snapshot(),before);assert.deepEqual(s.c.prepareBatchDrain({batchId:b.batchId,captureSummary:summary}),prepared);assert.equal(verified,0);
 assert.equal(prepared.captureSummaryHash,digest(summary));assert.equal(prepared.manifestHash,s.m.manifestHash);assert.ok(Object.isFrozen(prepared.batch.cases[0]));
 const text=JSON.stringify(prepared);for(const forbidden of ['rawTitle','effectiveTitle','body','nativeWitness','bodyVector','titleVector'])assert.equal(text.includes('"'+forbidden+'"'),false);
 expected=prepared;s.c.finishBatch({batchId:b.batchId,captureSummary:summary,guardianReceipt:{invented:true}});assert.equal(verified,1);assert.equal(s.c.snapshot().completedBatches,1);
});

test('prepare before four rows, foreign batch, fault or summary getter refuses without hooks or advancement',()=>{
 for(const wrong of ['incomplete','foreign','fault','getter']){
  const s=setup(),b=s.batches[0];if(wrong!=='incomplete')for(let i=0;i<4;i++)s.c.acceptRow(b.batchId,s.row(b,i));
  let hooks=0;const summary={invented:true};if(wrong==='getter')Object.defineProperty(summary,'field',{enumerable:true,get(){hooks++;throw Error();}});
  if(wrong==='fault')s.c.abandon();
  assert.throws(()=>s.c.prepareBatchDrain({batchId:wrong==='foreign'?s.batches[1].batchId:b.batchId,captureSummary:summary}));
  assert.equal(hooks,0);assert.equal(s.c.snapshot().completedBatches,0);assert.equal(s.c.snapshot().phase,'failed');
 }
});

test('prepared summary change or forged ACK capture hash fails independently in finish',()=>{
 for(const change of ['summary','ack']){
  let prepared;
  const s=setup('train-cal',{verifyBatchDrain:r=>{assert.equal(r.captureSummaryHash,prepared.captureSummaryHash);
   return {batchId:r.batch.batchId,manifestHash:r.manifestHash,nodeIdentityHash:r.nodeIdentityHash,batchCaptureHash:change==='ack'?H:r.batchCaptureHash,receiptHash:J};}}),b=s.batches[0];
  for(let i=0;i<4;i++)s.c.acceptRow(b.batchId,s.row(b,i));const summary={invented:true};prepared=s.c.prepareBatchDrain({batchId:b.batchId,captureSummary:summary});
  if(change==='summary')summary.invented=false;
  assert.throws(()=>s.c.finishBatch({batchId:b.batchId,captureSummary:summary,guardianReceipt:{}}));assert.equal(s.c.snapshot().completedBatches,0);assert.equal(s.c.snapshot().phase,'failed');
 }
});
test('fresh final barrier starts model clock long after batch1 without sliding original phase deadline',async()=>{
 const s=setup();s.setTime(600000);s.capture();s.setTime(1200000);const encoded=await s.c.encodeAfterCohortDrain(s.encodeArgs);
 assert.equal(encoded.encodingStartedAt,1200000);assert.equal(encoded.encodingCompletedAt,1200000);
});
test('deadline is checked before each field dispatch, even after first body callback returns',async()=>{
 const s=setup();s.capture();let calls=0,closes=0;
 await assert.rejects(s.c.encodeAfterCohortDrain({...s.encodeArgs,createEncoder:()=>({modelId:MODEL_ID,embed:()=>{calls++;s.setTime(540000);return {modelId:MODEL_ID,values:unit()};},close:()=>{closes++;return true;}})}),{code:'deadline'});
 assert.equal(calls,1);assert.equal(closes,1);assert.equal(s.c.snapshot().privateVectorRows,0);
});
test('all-unavailable still requires all receipts/finalACK but initializes no encoder',async()=>{
 const s=setup();for(const b of s.batches){for(let i=0;i<4;i++)s.c.acceptRow(b.batchId,s.row(b,i,false));s.c.finishBatch({batchId:b.batchId,captureSummary:{},guardianReceipt:{}});}s.c.finishCapture();
 const result=await s.c.encodeAfterCohortDrain(s.encodeArgs);assert.equal(result.encoderCalls,0);assert.equal(s.counts().created,0);assert.equal(s.counts().closed,0);assert.equal(s.c.snapshot().encoderCloseAttempted,false);
 s.c.consumeEncoded(a=>{assert.equal(a.rows.length,96);assert.ok(a.rows.every(r=>r.status==='unavailable'));return {};});
});
test('opaque callback faults do not execute error-code getters or retain arbitrary labels',()=>{
 let calls=0;const e=new SpecificityError('contract');Object.defineProperty(e,'code',{get(){calls++;throw Error();}});
 const s=setup('train-cal',{admitAvailable:()=>{throw e;}});assert.throws(()=>s.c.acceptRow(s.batches[0].batchId,s.row(s.batches[0],0)),{code:'callback'});assert.equal(calls,0);
 const t=setup('train-cal',{admitAvailable:()=>{throw new SpecificityError('arbitrary-content');}});assert.throws(()=>t.c.acceptRow(t.batches[0].batchId,t.row(t.batches[0],0)),{code:'callback'});assert.equal(t.c.snapshot().fault,'callback');
});
test('malformed encoder invocation terminalizes instead of leaving retryable captured phase',async()=>{
 const s=setup();s.capture();await assert.rejects(s.c.encodeAfterCohortDrain({...s.encodeArgs,unexpected:true}));assert.equal(s.c.snapshot().phase,'failed');await assert.rejects(s.c.encodeAfterCohortDrain(s.encodeArgs));assert.equal(s.counts().created,0);
});
test('fresh postguard phase/model clocks reject crossing before admission or encoder action',async()=>{
 let now=0,advance=false,admitted=0;
 const s=setup('train-cal',{now:()=>now,phaseDeadline:100,guard:()=>{if(advance)now=100;return true;},admitAvailable:()=>{admitted++;return {inputIdentity:H,evidence:{}};}});
 advance=true;assert.throws(()=>s.c.acceptRow(s.batches[0].batchId,s.row(s.batches[0],0)),{code:'deadline'});assert.equal(admitted,0);
 let clock=0,cross=false;const t=setup('train-cal',{now:()=>clock,guard:()=>{if(cross)clock=540000;return true;}});t.capture();
 await assert.rejects(t.c.encodeAfterCohortDrain({...t.encodeArgs,revalidateAvailable:r=>{cross=true;return {inputIdentity:r.inputIdentity,evidence:r.evidence};}}),{code:'deadline'});assert.equal(t.counts().created,0);
});
test('unsafe sync-callback native Promise constructor getter is refused with zero hooks',()=>{
 let hooks=0;const p=Promise.resolve({});Object.defineProperty(p,'constructor',{configurable:true,get(){hooks++;return Promise;}});
 const s=setup('train-cal',{admitAvailable:()=>p});assert.throws(()=>s.c.acceptRow(s.batches[0].batchId,s.row(s.batches[0],0)),{code:'unsafe-promise'});
 assert.equal(hooks,0);assert.equal(s.c.snapshot().unsafeOperationRefused,true);assert.equal(s.c.snapshot().pendingOriginals,0);
});
test('observation rejects constructor/then getters, accessors, proxies and subclass species without hooks',async()=>{
 let hooks=0;
 class Subclass extends Promise{static get [Symbol.species](){hooks++;return Promise;}}
 const factories=[()=>{const p=Promise.resolve({});Object.defineProperty(p,'constructor',{get(){hooks++;return Promise;}});return p;},
  ()=>{const p=Promise.resolve({});Object.defineProperty(p,'then',{get(){hooks++;return Promise.prototype.then;}});return p;},
  ()=>{const p=Promise.resolve({});Object.defineProperty(p,'other',{get(){hooks++;return 1;}});return p;},
  ()=>new Proxy(Promise.resolve({}),{getPrototypeOf(){hooks++;return Promise.prototype;}}),
  ()=>new Subclass(resolve=>resolve({}))];
 for(const factory of factories){const s=setup();s.capture();await assert.rejects(s.c.encodeAfterCohortDrain({...s.encodeArgs,createEncoder:factory}),{code:'unsafe-promise'});assert.equal(s.c.snapshot().unsafeOperationRefused,true);assert.equal(s.c.snapshot().encoderCloseAttempted,false);}
 assert.equal(hooks,0);
});
test('benign data symbols on genuine original Promises preserve physical settlement tracking',async()=>{
 const s=setup();s.capture();const d=deferred();d.promise[Symbol('invented-async-hooks-data')]=12;
 const p=s.c.encodeAfterCohortDrain({...s.encodeArgs,requestFinalDrain:r=>{d.request=r;return d.promise;}});assert.equal(s.c.snapshot().pendingOriginals,1);
 d.resolve({requestHash:d.request.requestHash,receiptHash:H,nodeIdentityHash:J,requestedAt:0,acknowledgedAt:0});await p;assert.equal(s.c.snapshot().pendingOriginals,0);assert.equal(s.c.snapshot().unsafeOperationRefused,false);
});
test('refused safe async sync-callback originals remain charged until their own settlement',async()=>{
 const d=deferred(),s=setup('train-cal',{admitAvailable:()=>d.promise});assert.throws(()=>s.c.acceptRow(s.batches[0].batchId,s.row(s.batches[0],0)),{code:'async-callback'});
 assert.equal(s.c.snapshot().pendingOriginals,1);d.reject(Error('invented late rejection'));await Promise.resolve();await Promise.resolve();assert.equal(s.c.snapshot().pendingOriginals,0);assert.equal(s.c.snapshot().fault,'async-callback');
});
test('ordinary Error with proxy prototype never executes prototype traversal hooks',()=>{
 let hooks=0;const e=new Error('invented');Object.setPrototypeOf(e,new Proxy({},{getPrototypeOf(){hooks++;throw Error();}}));
 const s=setup('train-cal',{admitAvailable:()=>{throw e;}});assert.throws(()=>s.c.acceptRow(s.batches[0].batchId,s.row(s.batches[0],0)),{code:'callback'});assert.equal(hooks,0);
});
test('consumer returns compact receipt; selected TRAIN material stays in separately validated owner closure',async()=>{
 const s=setup();s.capture();await s.c.encodeAfterCohortDrain(s.encodeArgs);let selected=null;
 const receipt=s.c.consumeEncoded(()=>{selected={inventedSelectedTrainingVectors:Array.from({length:48},()=>unit())};return {selectionIdentity:digest({rows:selected.inventedSelectedTrainingVectors.length}),rows:48};});
 assert.equal(selected.inventedSelectedTrainingVectors.length,48);assert.equal(receipt.rows,48);
 const t=setup();t.capture();await t.c.encodeAfterCohortDrain(t.encodeArgs);assert.throws(()=>t.c.consumeEncoded(()=>({selectedArtifact:Array.from({length:48},()=>unit())})),{code:'capacity'});
 const u=setup();u.capture();await u.c.encodeAfterCohortDrain(u.encodeArgs);assert.throws(()=>u.c.consumeEncoded(()=>({codecPacket:'x'.repeat(200000)})),{code:'capacity'});
});
