// Invented public-like strings, metadata and axes only; no capture/model/asset IO.
import test from 'node:test';
import assert from 'node:assert/strict';
import {BATCHES,ROOT_IDS,digest,sha,buildInputPacket,deriveDocumentIdentity} from '../../../../../spikes/topic-resolution/harness/browser-root-transfer-v1/manifest.js';
import {validateCaptureCompletion,validateCapturedPacket,makeEncodingPlan,validateEncodingReceipt,captureAdmissionReceipt,validateCaptureAdmissionProof,
 validateAllEncodingMetadata,assessEvidenceLinkedOutcomes,parseBoundedJson,vectorBitHash,LIMITS} from './contracts.js';
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
test('all8 browser metadata gate preserves full32 and exact prior chain without static evidence',()=>{
 const f=fixture(),c=validateCaptureCompletion(f.metadata);assert.equal(c.all8Complete,true);assert.equal(c.batches.length,8);assert.equal(c.batches.flatMap(b=>b.results).length,32);
 assert.equal(c.batches[0].collectedIds.length,3);assert.ok(Object.isFrozen(c.batches));assert.equal(Object.hasOwn(c,'all16Complete'),false);
 for(const change of [x=>x.batches.pop(),x=>x.batches.reverse(),x=>x.sourceHashes['invented.js']=H,x=>x.transferHash=H]){const g=fixture();change(g.metadata);assert.throws(()=>validateCaptureCompletion(g.metadata));}
});
test('metadata failure/resource/rights/profile/drain/hash/prior tampering rejects before body admission',()=>{
 for(const change of [r=>r.status='fatal',r=>r.protocolCallbacksDrained=false,r=>r.networkRequestIdCorrelated=true,r=>r.transferHash=H,r=>r.producerProfile.inputConstructionHash=H,
  r=>r.priorEvidence=[],r=>r.policyElapsedMs=60001,r=>r.navigationMs=80001,r=>r.peakCoordinatorPending=129,r=>r.resourceEvents=4097,
  r=>r.cases[0].documentWitness.response.observedRemoteAddressPublic=false,r=>r.cases[0].capture.bodyCharacters=4097,r=>r.collected=0]){
  const f=fixture(),b=f.metadata.batches[7];b.resultBytes=mutateBytes(b.resultBytes,change);b.supervisorBytes=mutateBytes(b.supervisorBytes,s=>s.resultSha256=sha(b.resultBytes));assert.throws(()=>validateCaptureCompletion(f.metadata));}
 for(const change of [s=>s.exitCode=1,s=>s.reason='failed',s=>s.ownTreeCleanupConfirmed=false,s=>s.emergencyOwnJobTermination=true,s=>s.freezeSha256=H,
  s=>s.resultSha256=H,s=>s.sourceHashes={},s=>s.elapsedSeconds=181,s=>s.sampledPeakTreePrivateBytes=1536*1048576+1,s=>s.sampledPeakOwnedOutputEntries=8193]){
  const f=fixture();f.metadata.batches[0].supervisorBytes=mutateBytes(f.metadata.batches[0].supervisorBytes,change);assert.throws(()=>validateCaptureCompletion(f.metadata));}
});
test('packet envelope/case truth and both-field contracts produce4 ledger rows and ≤8 calls',()=>{
 const f=prepared();assert.equal(validateCapturedPacket(f.packets[0],f.completion,1).rows.length,3);const p=f.plans[0];
 assert.equal(p.rows.length,4);assert.equal(p.expectedEncoderCalls,4);assert.equal(p.rows[0].reason,'encoding-title-empty');assert.equal(p.rows[3].captureStatus,'unavailable');assert.equal(p.rows[3].sourceInputHash,null);
 assert.equal(p.rows[1].scorerWitness.documentWitness.kind,'browser-document');assert.equal(p.rows[1].scorerWitness.inputHash,p.rows[1].sourceInputHash);assert.equal(p.rows[1].envelopeHash.length,64);
 assert.equal(f.plans.reduce((n,p)=>n+p.expectedEncoderCalls,0),60);assert.equal(LIMITS.maxEncoderCalls,64);
 assert.throws(()=>validateCapturedPacket(Buffer.concat([f.packets[0],Buffer.from(' ')]),f.completion,1));assert.throws(()=>validateCapturedPacket(f.packets[0],f.completion,2));
 const c=structuredClone(f.completion);c.batches[0].results[0].capture.titleSha256=E;assert.throws(()=>validateCapturedPacket(f.packets[0],c,1));
 const tampered=mutateBytes(f.packets[0],p=>p.rows[1].documentWitness.response.networkRequestIdCorrelated=true);const c2=structuredClone(f.completion);c2.batches[0].packetSha256=sha(tampered);assert.throws(()=>validateCapturedPacket(tampered,c2,1));
});
test('admission receipt requires actual successful supervised byte proof before any reader callback',()=>{
 const f=prepared(),expected=captureAdmissionReceipt({freezeHash:F,freezeFileSha256:H,sourceHashes:f.metadata.sourceHashes,completion:f.completion}),receiptBytes=bytes(expected);
 const s=supervisor('browser-root-transfer-evaluation-supervisor/v1','admit-captures',null,H,f.metadata.sourceHashes,receiptBytes);
 assert.equal(validateCaptureAdmissionProof({expectedReceipt:expected,receiptBytes,supervisorBytes:bytes(s)}).receiptSha256,sha(receiptBytes));
 for(const change of [s=>s.reason='failed',s=>s.freezeSha256=E,s=>s.resultSha256=E,s=>s.sourceHashes={},s=>s.elapsedSeconds=181,s=>s.ownTreeCleanupConfirmed=false,s=>s.emergencyOwnJobTermination=true]){
  const x=structuredClone(s);change(x);let reads=0;assert.throws(()=>{validateCaptureAdmissionProof({expectedReceipt:expected,receiptBytes,supervisorBytes:bytes(x)});reads++;});assert.equal(reads,0);}
 assert.throws(()=>validateCaptureAdmissionProof({expectedReceipt:expected,receiptBytes:Buffer.concat([receiptBytes,Buffer.from(' ')]),supervisorBytes:bytes(s)}));
});
test('all8 encoding proofs bind exact calls/rows/text/packet/freeze/source/byte hashes and resources',()=>{
 const f=prepared(),e=encoding(f);assert.equal(e.encodingCompletion.encoderCalls,60);assert.equal(e.encodingCompletion.all8Complete,true);
 for(const change of [m=>m.batches.pop(),m=>m.freezeFileSha256=E,m=>m.sourceHashes={},m=>m.plans[0].rows[1].bodySha256=E,m=>m.plans[0].inputPacketSha256=E]){
  const x={...e.metadata,plans:structuredClone(e.metadata.plans),batches:[...e.metadata.batches]};change(x);assert.throws(()=>validateAllEncodingMetadata(x));}
 for(const change of [r=>r.encoderCalls=8,r=>r.inputPacketSha256=E,r=>r.encoderHash=H,r=>r.rows[0].encodingAvailable=true,r=>r.sourceHashesRechecked=false]){
  const b=e.metadata.batches[0],r=JSON.parse(b.receiptBytes);change(r);assert.throws(()=>validateEncodingReceipt(r,f.plans[0],F,E));}
});
test('linked outcomes verify full envelope projection/vector bits/semantic identity and honest full32 arithmetic',()=>{
 const a=outcomeInput(),r=assessEvidenceLinkedOutcomes(a);assert.equal(r.assessment.browser.total,32);assert.equal(r.assessment.browser.available,30);assert.equal(r.assessment.browser.correct,30);
 assert.equal(r.assessment.browser.wrong,0);assert.equal(r.assessment.feasibilityPassed,true);assert.equal(r.assessment.staticAssessed,false);assert.equal(r.statisticalIndependenceClaim,false);
 assert.equal(r.work.headScalarProducts,30*6144);assert.equal(r.classificationReexecuted,false);
 for(const change of [x=>x.outcomes[0].inputAvailable=true,x=>x.outcomes[1].decision.witness.documentWitness.loaderId='other',x=>x.outcomes[1].envelopeHash=H,
  x=>x.outcomes[1].sourceInputHash=H,x=>x.outcomes[1].decision.vectorBindings.bodyVectorHash=H,x=>x.outcomes[1].decision.semanticWitnessHash=H,
  x=>x.outcomes[1].decision.transferHash=H,x=>x.outcomes[1].decision.work.headScalarProducts=1,x=>x.outcomes[1].selectedRootId='other',
  x=>x.encodingCompletion.all8Complete=false,x=>x.vectorPacketBytes[0]=Buffer.concat([x.vectorPacketBytes[0],Buffer.from(' ')]),x=>x.plans[1].batch=1]){
  const base=outcomeInput(),x={...base,outcomes:structuredClone(base.outcomes),plans:structuredClone(base.plans),encodingCompletion:structuredClone(base.encodingCompletion)};change(x);assert.throws(()=>assessEvidenceLinkedOutcomes(x));}
});
test('plain/accessor/proxy/extended-buffer/size/UTF8 boundaries never invoke hostile hooks',()=>{
 let calls=0;const proxy=new Proxy({}, {get(){calls++;throw Error();},ownKeys(){calls++;throw Error();},getPrototypeOf(){calls++;throw Error();}});
 assert.throws(()=>validateCaptureCompletion(proxy));assert.throws(()=>parseBoundedJson(proxy));
 const f=fixture();Object.defineProperty(f.metadata,'sourceHashes',{enumerable:true,get(){calls++;throw Error();}});assert.throws(()=>validateCaptureCompletion(f.metadata));
 const b=bytes({});Object.defineProperty(b,'secret',{get(){calls++;throw Error();}});assert.throws(()=>parseBoundedJson(b));
 const g=fixture();Object.defineProperty(g.metadata.cases[0],'id',{enumerable:true,get(){calls++;throw Error();}});assert.throws(()=>validateCaptureCompletion(g.metadata));
 assert.throws(()=>parseBoundedJson(Buffer.alloc(65537)));assert.throws(()=>parseBoundedJson(Buffer.from([255])));assert.equal(calls,0);
});
test('metadata outcomes have closed schemas, never a covert body/vector channel before admission',()=>{
 for(const [index,change]of [[0,r=>r.cases[0].body='covert'],[0,r=>r.cases[0].title='covert'],[0,r=>r.cases[0].vector=[1]],
  [0,r=>r.cases[3].body='covert'],[0,r=>r.cases[3].capture={}],[0,r=>r.cases[3].readerReason='arbitrary']]){
  const f=fixture(),b=f.metadata.batches[index];b.resultBytes=mutateBytes(b.resultBytes,change);b.supervisorBytes=mutateBytes(b.supervisorBytes,s=>s.resultSha256=sha(b.resultBytes));assert.throws(()=>validateCaptureCompletion(f.metadata));
 }
});
