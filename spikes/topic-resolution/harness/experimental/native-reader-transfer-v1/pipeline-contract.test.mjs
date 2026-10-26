import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createNativeReaderTransfer,FIXED_CASES} from './native-adapter.js';
import {createTransientNativeCohort} from './phase-ledger.js';
import * as urlPolicy from '../../../browser/core/page-content-policy.js';
import {compileNativeRootRankCandidate as compile,describeNativeRootRankCandidate as describe,
 prepareNativeRootInput as prepare,classifyNativeRootRankCandidate as classify}
 from '../../../../../apps/local-service/experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js';
import {compilePairedE5Input,describePairedE5Input}
 from '../../../../../apps/local-service/src/domain/hierarchical-e5-paired-input.js';

// Only the fixed public case metadata is reused. All reader text, rights records,
// coefficients, calibration metadata and embeddings below are INVENTED. This
// joins interfaces, not actual Chrome, publisher rights or semantic quality.
const sha=v=>createHash('sha256').update(v).digest('hex'),digest=v=>sha(JSON.stringify(v));
const H='a'.repeat(64),T='b'.repeat(64),S='c'.repeat(64),B='d'.repeat(64);
const axis=(i)=>Array.from({length:384},(_,j)=>j===i?1:j===383?-0:0);
function rehashPolicy(p){delete p.policyHash;p.policyHash=digest(p);}
function fixture({weight=.75,minScore=.5,minGap=1,enabled=true}={}){
 const inputDefinition={bodyWeight:weight,titleWeight:1-weight,encoderHash:H};
 const representationHash=describePairedE5Input(compilePairedE5Input(inputDefinition)).representationHash;
 const schema='hierarchical-e5-paired-linear-heads-v1',representation='paired-raw-e5-body-title-v1',lambda=.1;
 const nodes=[{id:'games',parentId:null},{id:'nature',parentId:null}];
 const heads=nodes.map((n,i)=>({nodeId:n.id,enabled:true,positiveGroups:2,negativeGroups:2,weights:axis(i),intercept:-.5}));
 const trainingIdHashes=[0,1,2,3].map(i=>sha('invented-id-'+i)).sort(),trainingGroupHashes=[0,1,2,3].map(i=>sha('invented-group-'+i)).sort();
 const rootModel={schema,representation,representationHash,trainingVersion:'manual-not-fitted',
 trainingHash:sha('invented-geometric-not-real-training'),taxonomyHash:digest(nodes),
 settingsHash:digest({schema,lambda,dimensions:384,centering:'training-mean-features-and-labels',solver:'shared-dual-gram-cholesky',
 targets:'ancestor-inclusive-plus-one-otherwise-minus-one',independentGroups:'duplicates-rejected',minimumPositiveGroups:2,minimumNegativeGroups:2}),
 parameterHash:digest({schema,representation,representationHash,heads}),lambda,dimensions:384,trainingIdHashes,trainingGroupHashes,
 provenanceHash:digest({trainingIdHashes,trainingGroupHashes}),experimental:true,productionValidated:false,assignmentAuthority:false,nodes,heads,
 trainingWork:{units:0,gramProducts:0,choleskyProducts:0,solveProducts:0,weightProducts:0}};
 const rootPolicy={schema:'pooled-root-rank-development-policy/v1',modelHash:digest(rootModel),representationHash,inputConstructionHash:T,
 nodeIds:nodes.map(n=>n.id),calibrationHash:sha('invented-metadata-not-real-calibration'),minimumAcceptedGroups:20,
 enabled,minWinnerScore:enabled?minScore:0,minWinnerGap:enabled?minGap:0,acceptedGroups:enabled?20:0,correctGroups:enabled?20:0,
 work:{countedUnits:0,preflightUpperBound:10000},developmentOnly:true,perClassPrecisionGuaranteed:false,productionValidated:false,assignmentAuthority:false};
 rehashPolicy(rootPolicy);
 return {schema:'native-root-rank-candidate/v1',inputDefinition,rootModel,rootPolicy,trainingInputConstructionHash:T,
 targetProfile:{producerId:'native-browser-current',inputConstructionHash:B,
 extractorVersions:['main-text-prefix/v1','article-container-prefix/v1'],effectiveTitleRule:'trim-or-hostname/v1'}};

}

function emitter(){
 const handlers=new Set();return {addListener:f=>handlers.add(f),removeListener:f=>handlers.delete(f)};
}
function setup(unavailableOrdinals=[]){
 const events=Array.from({length:7},emitter),trace=[];
 const state={window:{id:4,type:'normal',incognito:false,focused:true},
 tab:{id:9,windowId:4,active:true,incognito:false,status:'complete',url:FIXED_CASES[0].url},ordinal:1};
 const chromeApi={
  windows:{getLastFocused:async()=>({...state.window}),onFocusChanged:events[0],onRemoved:events[1]},
  tabs:{query:async()=>[{...state.tab}],onActivated:events[2],onUpdated:events[3],onRemoved:events[4],onReplaced:events[5]},
  permissions:{contains:async()=>true,onRemoved:events[6]}};
 const reader={
  read:async(_tabId,url)=>{
   trace.push('read:'+state.ordinal);
   return {documentId:'invented-native-document-'+state.ordinal,result:unavailableOrdinals.includes(state.ordinal)?
    {contractVersion:'page-content/1',status:'unsupported',reason:'missing-region'}:
    {contractVersion:'page-content/1',status:'collected',url,title:state.ordinal===1?'  ':'  Invented title '+state.ordinal+'  ',
     text:'SYNTHETIC paired pipeline body '+state.ordinal,extractorVersion:'main-text-prefix/v1'}};
  },
  attest:async(_tabId,_documentId,url)=>{trace.push('attest:'+state.ordinal);return {contractVersion:'page-content-attestation/1',status:'attested',url};}};
 const adapter=createNativeReaderTransfer({chromeApi,reader,urlPolicy}),h=compile(fixture()),profile=describe(h).targetProfiles[0];
 let preparedCount=0,classifications=0;
 const cohort=createTransientNativeCohort({cases:FIXED_CASES,producerProfileHash:profile.producerProfileHash,admitAvailable:admission=>{
  const {case:c,producerProfileHash,fieldBindings,extractorVersion,nativeWitness:w,rightsEvidence:r}=admission;
  // This is an explicit INVENTED trusted-caller check, not a real rights grant.
  assert.deepEqual(Object.keys(r),['schema','invented','caseId','sourceUrl','documentUrl','studyRevision','eventEpoch','documentId','mainResponseHash','domPolicyHash','approved','canonicalAuthority']);
  assert.equal(r.schema,'invented-same-document-rights/v1');assert.equal(r.invented,true);assert.equal(r.approved,true);assert.equal(r.canonicalAuthority,false);
  assert.equal(r.caseId,c.id);assert.equal(r.sourceUrl,c.url);assert.equal(r.sourceUrl,w.sourceUrl);assert.equal(r.documentUrl,w.documentUrl);
  assert.equal(r.documentId,w.documentId);assert.equal(r.studyRevision,w.studyRevision);assert.equal(r.eventEpoch,w.eventEpoch);
  assert.equal(r.mainResponseHash,H);assert.equal(r.domPolicyHash,S);
  const prepared=prepare(h,{sourceId:c.id,sourceVersion:w.observationNonce,producerId:profile.producerId,producerProfileHash,
   inputConstructionHash:profile.inputConstructionHash,extractorVersion,fieldBindings,nativeWitness:w,rightsEvidenceHash:digest(r)});
  preparedCount++;return {inputIdentity:prepared.sourceInputHash,evidence:prepared};
 }});
 function rights(w){
  return {schema:'invented-same-document-rights/v1',invented:true,caseId:w.caseId,sourceUrl:w.sourceUrl,documentUrl:w.documentUrl,
   studyRevision:w.studyRevision,eventEpoch:w.eventEpoch,documentId:w.documentId,mainResponseHash:H,domPolicyHash:S,approved:true,canonicalAuthority:false};
 }
 async function begin(){return adapter.beginStudy({studyId:'invented-joined-study',windowId:4,cases:FIXED_CASES});}
 async function observe(session,ordinal){
  state.ordinal=ordinal;state.tab.url=FIXED_CASES[ordinal-1].url;
  return adapter.observe({studyId:session.studyId,studyRevision:session.studyRevision,caseId:FIXED_CASES[ordinal-1].id,ordinal,
   observationNonce:'invented-observation-'+ordinal});
 }
 function admit(o,mutate){
  if(o.status==='unavailable')return cohort.unavailable({caseId:o.caseId,ordinal:o.ordinal,
   reason:o.reason==='origin-policy-refused'?'origin-policy-refused':'reader-unavailable',
   inputIdentity:digest({schema:'invented-unavailable-evaluation-only/v1',caseId:o.caseId,ordinal:o.ordinal,reason:o.reason})});
  const row={caseId:o.nativeWitness.caseId,ordinal:o.nativeWitness.ordinal,rawTitle:o.rawTitle,effectiveTitle:o.effectiveTitle,body:o.body,
   extractorVersion:o.extractorVersion,nativeWitness:o.nativeWitness,rightsEvidence:rights(o.nativeWitness)};
  if(mutate)mutate(row);return cohort.available(row);
 }
 function assess(){
  return cohort.assess(row=>{
   classifications++;assert.equal(cohort.snapshot().accounted,32);
   assert.deepEqual(trace.slice(-2),['close','endcheck']);
   assert.equal(Object.hasOwn(row,'body'),false);assert.equal(Object.hasOwn(row,'rawTitle'),false);
   assert.equal(row.inputIdentity,row.evidence.sourceInputHash);
   const d=classify(h,{...row.evidence,bodyVector:row.bodyVector,titleVector:row.titleVector});
   assert.equal(d.witness.sourceId,row.id);assert.equal(d.witness.sourceInputHash,row.inputIdentity);
   assert.equal(d.vectorBindings.bodyVectorHash,vectorHash(row.bodyVector));
   assert.equal(d.vectorBindings.titleVectorHash,vectorHash(row.titleVector));return d;
  });
 }
 return {adapter,cohort,h,profile,trace,begin,observe,admit,assess,
 counts:()=>({preparedCount,classifications})};
}
function vectorHash(v){
 const b=Buffer.alloc(384*8);v.forEach((x,i)=>b.writeDoubleLE(x,i*8));
 return createHash('sha256').update('builder-root-input-vector/binary64-le/384/v1\0').update(b).digest('hex');
}
async function fill(f){
 const session=await f.begin();let first;
 for(let ordinal=1;ordinal<=32;ordinal++){
  const observation=await f.observe(session,ordinal);if(ordinal===1)first=observation;
  f.admit(observation);assert.equal(f.counts().classifications,0);assert.equal(f.cohort.snapshot().encoderCalls,0);
 }
 f.adapter.endStudy({studyId:session.studyId,studyRevision:session.studyRevision});return first;
}
function encoding(f,overrides={}){
 return {assertBrowserDrained:async()=>{f.trace.push('drained');return true;},
 embed:async text=>{assert.equal(f.cohort.snapshot().accounted,32);assert.equal(f.counts().classifications,0);
  assert.match(text,/^(?:SYNTHETIC paired pipeline body |Invented title |[a-z0-9.-]+$)/u);f.trace.push('embed');return axis(0);},
 closeEncoder:async()=>{f.trace.push('close');return true;},
 recheckAssetsAndSources:async()=>{f.trace.push('endcheck');return true;},...overrides};
}
test('actual adapter → canonical rights/native admission → all32 ledger → drained64-call encoding → unchanged root scoring',async()=>{
 const f=setup();let encoded=0;
 const session=await f.begin();
 for(let ordinal=1;ordinal<=31;ordinal++)f.admit(await f.observe(session,ordinal));
 assert.throws(()=>f.cohort.finishCapture());assert.throws(()=>f.assess());
 await assert.rejects(f.cohort.encodeAfterBrowserDrain(encoding(f,{embed:async()=>{encoded++;return axis(0);}})));
 assert.equal(encoded,0);assert.equal(f.counts().classifications,0);
 f.admit(await f.observe(session,32));f.adapter.endStudy({studyId:session.studyId,studyRevision:session.studyRevision});
 assert.equal(f.cohort.finishCapture().available,32);
 let release,drainEntered=false;
 const pending=f.cohort.encodeAfterBrowserDrain(encoding(f,{
  assertBrowserDrained:async()=>{drainEntered=true;f.trace.push('drain-wait');return new Promise(yes=>{release=yes;});},
  embed:async text=>{encoded++;assert.equal(f.cohort.snapshot().accounted,32);assert.equal(f.counts().classifications,0);assert.ok(text);f.trace.push('embed');return axis(0);}
 }));
 assert.equal(drainEntered,true);assert.equal(encoded,0);assert.throws(()=>f.assess());
 release(true);const receipt=await pending;assert.equal(receipt.encoderCalls,64);assert.equal(encoded,64);
 assert.deepEqual(f.trace.slice(-2),['close','endcheck']);assert.equal(f.cohort.snapshot().retainedTextUnits,0);
 const ledger=f.assess();assert.equal(f.counts().classifications,32);assert.equal(ledger.accounted,32);
 assert.ok(ledger.results.every(r=>r.status==='classified'&&r.decision.supportedPath[0]==='games'));
 assert.ok(ledger.results.every(r=>r.decision.assignmentAuthority===false));
 for(const r of ledger.results){
  const json=JSON.stringify(r.decision);
  for(const forbidden of ['https://','SYNTHETIC paired pipeline body','Invented title','"bodyVector":','"titleVector":','"rawTitle":'])assert.equal(json.includes(forbidden),false);
 }
 assert.equal(ledger.semanticTextIndependentlyReconstructable,false);assert.equal(f.cohort.snapshot().privateVectorRows,0);
});
test('actual unavailable adapter rows remain in the full32 denominator, never rescued or encoded',async()=>{
 const f=setup([2,17]);await fill(f);assert.equal(f.cohort.finishCapture().available,30);
 const receipt=await f.cohort.encodeAfterBrowserDrain(encoding(f));assert.equal(receipt.encoderCalls,60);
 const ledger=f.assess();assert.equal(ledger.results.length,32);assert.equal(f.counts().classifications,30);
 for(const ordinal of [2,17])assert.deepEqual(ledger.results[ordinal-1],{
  id:FIXED_CASES[ordinal-1].id,ordinal,status:'unavailable',reason:'reader-unavailable',
  inputIdentity:digest({schema:'invented-unavailable-evaluation-only/v1',caseId:FIXED_CASES[ordinal-1].id,ordinal,reason:'reader-missing-region'})});
});
test('same URL with wrong native document, case, revision, epoch or rights refuses before retention/E5',async()=>{
 for(const mutate of [
 row=>{row.rightsEvidence.documentId='different-native-document';},row=>{row.rightsEvidence.caseId=FIXED_CASES[1].id;},
 row=>{row.rightsEvidence.studyRevision='different-study';},row=>{row.rightsEvidence.eventEpoch++;},
 row=>{row.rightsEvidence.approved=false;},row=>{row.rightsEvidence.domPolicyHash=H;}
 ]){
  const f=setup(),session=await f.begin(),observation=await f.observe(session,1);
  assert.throws(()=>f.admit(observation,mutate));assert.equal(f.cohort.snapshot().phase,'failed');
  assert.equal(f.cohort.snapshot().retainedTextUnits,0);assert.equal(f.counts().preparedCount,0);
  await assert.rejects(f.cohort.encodeAfterBrowserDrain(encoding(f)));assert.equal(f.cohort.snapshot().encoderCalls,0);assert.equal(f.counts().classifications,0);
  f.adapter.endStudy({studyId:session.studyId,studyRevision:session.studyRevision});
 }
});
test('preflight policy skip advances the same one-use adapter sequence without read/attest or native rescue',async()=>{
 const f=setup(),session=await f.begin();
 const skipped=f.adapter.skipUnavailable({studyId:session.studyId,studyRevision:session.studyRevision,
 caseId:FIXED_CASES[0].id,ordinal:1,observationNonce:'invented-preflight-refusal',reason:'origin-policy-refused'});
 assert.deepEqual(skipped,{status:'unavailable',caseId:FIXED_CASES[0].id,ordinal:1,reason:'origin-policy-refused'});
 assert.deepEqual(f.trace,[]);assert.equal(f.counts().preparedCount,0);f.admit(skipped);
 await assert.rejects(f.observe(session,1));assert.deepEqual(f.trace,[]);
 for(let ordinal=2;ordinal<=32;ordinal++)f.admit(await f.observe(session,ordinal));
 f.adapter.endStudy({studyId:session.studyId,studyRevision:session.studyRevision});assert.equal(f.cohort.finishCapture().available,31);
 const receipt=await f.cohort.encodeAfterBrowserDrain(encoding(f));assert.equal(receipt.encoderCalls,62);
 const result=f.assess();assert.equal(result.accounted,32);assert.equal(f.counts().classifications,31);
 assert.equal(result.results[0].reason,'origin-policy-refused');assert.equal(result.results[0].status,'unavailable');
 assert.equal(Object.hasOwn(result.results[0],'decision'),false);assert.equal(Object.hasOwn(result.results[0],'nativeWitness'),false);
 assert.equal(f.trace.includes('read:1'),false);assert.equal(f.trace.includes('attest:1'),false);
});
test('joined hashes bind exact raw/effective title and invented evidence, with canonical wrapper preparation',async()=>{
 const f=setup(),first=await fill(f);f.cohort.finishCapture();
 await f.cohort.encodeAfterBrowserDrain(encoding(f));const ledger=f.assess(),d=ledger.results[0].decision;
 assert.equal(first.rawTitle,'  ');assert.equal(first.effectiveTitle,new URL(FIXED_CASES[0].url).hostname);
 assert.deepEqual(d.witness.fieldBindings,{
  bodySha256:sha(first.body),bodyCharacters:first.body.length,rawTitleSha256:sha(first.rawTitle),rawTitleCharacters:2,
  effectiveTitleSha256:sha(first.effectiveTitle),effectiveTitleCharacters:first.effectiveTitle.length});
 assert.equal(d.witness.nativeWitnessHash,digest(first.nativeWitness));assert.equal(d.witness.nativeDocumentIdentity.documentId,first.nativeWitness.documentId);
 const rights={schema:'invented-same-document-rights/v1',invented:true,caseId:first.nativeWitness.caseId,sourceUrl:first.nativeWitness.sourceUrl,
 documentUrl:first.nativeWitness.documentUrl,studyRevision:first.nativeWitness.studyRevision,eventEpoch:first.nativeWitness.eventEpoch,
 documentId:first.nativeWitness.documentId,mainResponseHash:H,domPolicyHash:S,approved:true,canonicalAuthority:false};
 assert.equal(d.witness.rightsEvidenceHash,digest(rights));assert.equal(d.vectorBindings.bodyVectorHash,vectorHash(axis(0)));
});
test('joined encoding failure cannot publish partial native decisions or retry',async()=>{
 const f=setup();await fill(f);f.cohort.finishCapture();let calls=0;
 await assert.rejects(f.cohort.encodeAfterBrowserDrain(encoding(f,{
  embed:async()=>{if(++calls===2)throw Error('invented failure');return axis(0);}
 })));
 assert.deepEqual(f.trace.slice(-2),['close','endcheck']);assert.equal(f.counts().classifications,0);
 assert.equal(f.cohort.snapshot().retainedTextUnits,0);assert.equal(f.cohort.snapshot().privateVectorRows,0);
 assert.throws(()=>f.assess());await assert.rejects(f.cohort.encodeAfterBrowserDrain(encoding(f)));assert.equal(calls,2);
});
