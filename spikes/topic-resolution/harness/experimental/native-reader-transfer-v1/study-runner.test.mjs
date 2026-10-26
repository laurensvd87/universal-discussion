import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runNativeRootStudy,NativeRootStudyError} from './study-runner.js';
import {FIXED_CASES} from './native-adapter.js';
import {MODEL_ID} from '../../../browser/embedding/embedding-contract.js';
import {compileNativeRootRankCandidate as compile,describeNativeRootRankCandidate as describe}
 from '../../../../../apps/local-service/experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js';
import {compilePairedE5Input,describePairedE5Input}
 from '../../../../../apps/local-service/src/domain/hierarchical-e5-paired-input.js';

// Fixed case IDs/URLs are metadata only. ALL texts, native/rights observations,
// DNS metadata, coefficients and returned vectors below are invented; no IO.
const sha=v=>createHash('sha256').update(v).digest('hex'),digest=v=>sha(JSON.stringify(v));
const H='a'.repeat(64),T='b'.repeat(64),S='c'.repeat(64),B='d'.repeat(64);
const axis=i=>Array.from({length:384},(_,j)=>j===i?1:j===383?-0:0);
function rehashPolicy(p){delete p.policyHash;p.policyHash=digest(p);}
function fixture({weight=.75,minScore=.5,minGap=1,enabled=true}={}){
 const inputDefinition={bodyWeight:weight,titleWeight:1-weight,encoderHash:H};
 const representationHash=describePairedE5Input(compilePairedE5Input(inputDefinition)).representationHash;
 const schema='hierarchical-e5-paired-linear-heads-v1',representation='paired-raw-e5-body-title-v1',lambda=.1;
 const nodes=Array.from({length:16},(_,i)=>({id:'root-'+String(i).padStart(2,'0'),parentId:null}));
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

function observation(c){
 const nativeWitness={schema:'chrome-scripting-native-reader/v1',studyId:'invented-study',studyRevision:'invented-revision',caseId:c.id,ordinal:c.ordinal,
 observationNonce:'invented-nonce-'+c.ordinal,eventEpoch:0,tabId:9,windowId:4,frameId:0,documentId:'invented-document-'+c.ordinal,sourceUrl:c.url,documentUrl:c.url,
 foregroundChecks:Array.from({length:3},()=>({windowId:4,tabId:9,focused:true,windowType:'normal',incognito:false,active:true,tabStatus:'complete',
 sourceUrl:c.url,documentUrl:c.url,permissionGranted:true})),read:{contractVersion:'page-content/1',status:'collected',documentId:'invented-document-'+c.ordinal},
 attestation:{contractVersion:'page-content-attestation/1',status:'attested',url:c.url},effectiveTitleRule:'trim-or-hostname/v1',nativeDocumentContinuityOnly:true,canonicalAuthority:false};
 const dom={tabId:9,frameId:0,documentId:nativeWitness.documentId,sourceUrlHash:sha(c.url),documentUrlHash:sha(c.url),domPolicyHash:H,canonicalUrlHash:null,canonicalEqualsExpected:false,headComplete:true};
 const rightsEvidence={schema:'native-reader-bracketed-rights/v1',caseId:c.id,ordinal:c.ordinal,studyId:nativeWitness.studyId,studyRevision:nativeWitness.studyRevision,
 observationNonce:nativeWitness.observationNonce,eventEpoch:0,documentId:nativeWitness.documentId,tabId:9,windowId:4,sourceUrlHash:sha(c.url),documentUrlHash:sha(c.url),originPolicyHash:H,
 mainResponseJourney:{schema:'native-main-response-journey/v1',finalUrlHash:sha(c.url),status:200,frameId:'invented-cdp-frame',loaderId:'invented-loader',fetchRequestId:'invented-request',
 fetchResponseId:'invented-response',networkRequestId:'invented-network',requestUrlExact:true,ordinaryTlsSecure:true,selectedPublicPinMatched:true,pinHash:H,headerPolicyHash:H,
 navigationLoaderVerified:true,domPolicyRequiredSeparately:true,nativeDocumentIdDirectlyCorrelated:false},
 documentBefore:{...dom},documentAfter:{...dom},sameNativeDocument:true,httpNativeIdDirectlyCorrelated:false};
 const rawTitle=c.ordinal===1?'  ':'  INVENTED TITLE '+c.ordinal+'  ';
 return {status:'collected',caseId:c.id,ordinal:c.ordinal,rawTitle,effectiveTitle:rawTitle.trim()||new URL(c.url).hostname,
 body:'INVENTED BODY '+c.ordinal,extractorVersion:'main-text-prefix/v1',nativeWitness,rightsEvidence};
}
function summary(rows){
 return {schema:'native-browser-capture-summary/v1',accounted:32,available:rows.filter(r=>r.status==='collected').length,unavailable:rows.filter(r=>r.status==='unavailable').length,
 rows:rows.map(r=>r.status==='unavailable'?{caseId:r.caseId,ordinal:r.ordinal,status:r.status,reason:r.reason}:
  {caseId:r.caseId,ordinal:r.ordinal,status:r.status,nativeWitnessHash:digest(r.nativeWitness),rightsEvidenceHash:digest(r.rightsEvidence)}),
 cases:[{caseId:FIXED_CASES[0].id,ordinal:1,events:0,observedEncodedBytes:0,socketBlocks:0,network:{schema:'native-article-network-gate/v1',
  events:0,blocked:{},mainAdmitted:true,responseAdmitted:true,navigationLoaderVerified:true,closed:true,restrictedNetworkRendering:true,
  unrestrictedBrowserParity:false,completeOsEgressIsolation:false}}],
 policyRequests:2,resourceEvents:0,elapsedMs:1,cleanupSubmissions:2,browserCloseCompleted:true,physicalOperationsDrained:true,
 ownedAnchorTabs:1,maximumOwnedTabs:2,rawInputPersisted:false,restrictedNetworkRendering:true,ordinaryDynamicBrowserProducerValidated:false,
 completeOsEgressIsolation:false,nativeWriteAuthority:false,productionValidated:false,assignmentAuthority:false};
}
function setup({unavailable=[],unavailableReason='origin-policy-refused',mutateRow,mutateSummary,embedFailure,modelMismatch=false,closeFailure=false,recheck=false}={}){
 const h=compile(fixture()),profile=describe(h).targetProfiles[0],controller=new AbortController(),trace=[],rows=[],drains=[];
 const counts={calls:0,create:0,close:0,recheck:0,captured:0,progress:0};let lateOnRow;
 const input={cases:FIXED_CASES,goldCases:FIXED_CASES.map((c,i)=>({id:c.id,groupId:'invented-entity-'+i,rootId:'root-'+String(Math.floor(i/2)).padStart(2,'0'),language:i%2?'en':'nl',host:new URL(c.url).hostname})),
 producerProfile:profile,candidateHandle:h,studyId:'invented-study',
 resolveDns:async()=>{trace.push('dns');return {dnsPins:Object.freeze({}),summary:{schema:'invented-dns-metadata/v1',pinned:0}};},
 capture:async({cases,onRow})=>{
  trace.push('capture');lateOnRow=onRow;
  assert.deepEqual(Object.keys(cases[0]),['id','ordinal','url','groupId','language']);
  for(const c of cases){const row=unavailable.includes(c.ordinal)?{status:'unavailable',caseId:c.id,ordinal:c.ordinal,reason:unavailableReason}:observation(c);
   if(mutateRow)mutateRow(row,c.ordinal);onRow(row);rows.push(row);counts.captured++;}
  trace.push('browser-close');const s=summary(rows);if(mutateSummary)mutateSummary(s);return s;
 },
 assertBrowserDrained:async proof=>{trace.push('job-drain-ack');assert.equal(counts.captured,32);assert.equal(counts.create,0);assert.equal(trace.at(-2),'browser-close');
  assert.ok(Object.isFrozen(proof));assert.deepEqual(Object.keys(proof),['captureHash','accounted','available','producerProfileHash']);
  assert.match(proof.captureHash,/^[a-f0-9]{64}$/u);assert.equal(proof.accounted,32);assert.equal(proof.available,32-unavailable.length);
  assert.equal(proof.producerProfileHash,profile.producerProfileHash);drains.push(proof);return true;},
 createEmbedder:async()=>{trace.push('create-encoder');counts.create++;assert.equal(counts.captured,32);assert.ok(trace.includes('job-drain-ack'));
  return {modelId:modelMismatch?'wrong-model':MODEL_ID,embed:async text=>{
   counts.calls++;trace.push('embed');assert.ok(text);if(embedFailure&&counts.calls===embedFailure)throw Error('PRIVATE RAW FAILURE https://example.org/private');
   let ordinal;if(text.startsWith('INVENTED BODY '))ordinal=Number(text.slice(14));
   else if(text.startsWith('INVENTED TITLE '))ordinal=Number(text.slice(15));
   else {assert.equal(text,new URL(FIXED_CASES[0].url).hostname);ordinal=1;}
   return {modelId:MODEL_ID,values:axis(Math.floor((ordinal-1)/2))};
  },close:async()=>{counts.close++;trace.push('close-encoder');if(closeFailure)throw Error('PRIVATE CLOSE');}};
 },
 recheckAssetsAndSources:async()=>{counts.recheck++;trace.push('source-endcheck');return !recheck;},
 guard:()=>{},signal:controller.signal,onProgress:p=>{counts.progress++;assert.ok(p.accounted<=32);}
 };
 return {input,counts,trace,rows,drains,controller,late:()=>lateOnRow};
}
const fails=p=>assert.rejects(p,e=>e instanceof NativeRootStudyError&&e.code==='study-failed'&&e.message==='Native root study failed');
test('joined32 capture → actual rights/native validation → drain ACK → lazy64 encoding/close/endcheck → root-only assessment',async()=>{
 const f=setup(),result=await runNativeRootStudy(f.input);
 assert.deepEqual({calls:f.counts.calls,create:f.counts.create,close:f.counts.close,recheck:f.counts.recheck},{calls:64,create:1,close:1,recheck:1});
 assert.ok(f.trace.indexOf('job-drain-ack')<f.trace.indexOf('create-encoder'));assert.deepEqual(f.trace.slice(-2),['close-encoder','source-endcheck']);
 assert.equal(result.encoderCalls,64);assert.equal(result.outcomes.length,32);assert.equal(result.assessment.assigned,32);assert.equal(result.assessment.correct,32);
 assert.equal(f.drains.length,1);assert.equal(f.drains[0].captureHash,result.captureHash);
 assert.equal(result.assessment.wrong,0);assert.equal(result.assessment.feasibilityGate.passed,true);
 assert.equal(Object.keys(result.assessment.byRoot).length,16);assert.equal(result.timings.classificationPerCallMs.length,32);
 assert.equal(result.ordinaryDynamicBrowserProducerValidated,false);assert.equal(result.statisticalIndependenceClaim,false);
 assert.equal(result.semanticTextIndependentlyReconstructable,false);assert.ok(Object.isFrozen(result.outcomes[0].decision));
 const text=JSON.stringify(result);assert.ok(Buffer.byteLength(text)<=524288);
 for(const forbidden of ['https://','INVENTED BODY','INVENTED TITLE','"bodyVector":','"titleVector":','"weights":','"rawTitle":'])assert.equal(text.includes(forbidden),false);
 const first=result.outcomes[0].decision;assert.equal(first.witness.fieldBindings.rawTitleSha256,sha('  '));
 assert.equal(first.witness.rightsEvidenceHash,digest(f.rows[0].rightsEvidence));assert.equal(first.witness.sourceId,FIXED_CASES[0].id);
 assert.throws(()=>f.late()({status:'unavailable',caseId:FIXED_CASES[0].id,ordinal:1,reason:'origin-policy-refused'}));
});
test('unavailable inputs retain full32 plus language/host/root counts, with no missing-root gate rescue',async()=>{
 const f=setup({unavailable:[1,2]}),r=await runNativeRootStudy(f.input);
 assert.equal(f.counts.calls,60);assert.equal(r.assessment.total,32);assert.equal(r.assessment.available,30);assert.equal(r.assessment.assigned,30);
 assert.equal(r.assessment.byRoot['root-00'].assigned,0);assert.equal(r.assessment.feasibilityGate.passed,false);
 assert.equal(r.assessment.conditionalOnAvailable.denominator,30);assert.equal(r.outcomes[0].decision,null);
 assert.equal(r.outcomes[0].inputIdentityScope,'evaluation-only-not-captured-Source-proof');assert.equal(r.outcomes[0].reason,'origin-policy-refused');
 assert.equal(r.assessment.unavailableReasons['origin-policy-refused'],2);
});
test('all unavailable still needs drain/endchecks but creates no encoder or scores',async()=>{
 const f=setup({unavailable:Array.from({length:32},(_,i)=>i+1)}),r=await runNativeRootStudy(f.input);
 assert.equal(f.counts.create,0);assert.equal(f.counts.calls,0);assert.equal(f.counts.close,0);assert.equal(f.counts.recheck,1);
 assert.equal(r.encoderCalls,0);assert.equal(r.assessment.total,32);assert.equal(r.assessment.available,0);assert.equal(r.assessment.feasibilityGate.passed,false);
 assert.deepEqual(r.timings.classificationPerCallMs,[]);
});
test('descriptive assessment does not hide wrong roots or turn tied available inputs into forced assignments',async()=>{
 const f=setup();
 for(let i=0;i<4;i++)f.input.goldCases[i].rootId=i<2?'root-01':'root-00';
 const wrong=await runNativeRootStudy(f.input);assert.equal(wrong.assessment.assigned,32);
 assert.equal(wrong.assessment.correct,28);assert.equal(wrong.assessment.wrong,4);assert.equal(wrong.assessment.feasibilityGate.passed,false);
 const g=setup(),create=g.input.createEmbedder;
 g.input.createEmbedder=async()=>{const e=await create();e.embed=async()=>({modelId:MODEL_ID,values:axis(100)});return e;};
 const tied=await runNativeRootStudy(g.input);assert.equal(tied.assessment.available,32);assert.equal(tied.assessment.assigned,0);
 assert.equal(tied.assessment.unresolved,32);assert.equal(tied.assessment.wrong,0);assert.equal(tied.assessment.feasibilityGate.passed,false);
 assert.ok(tied.outcomes.every(r=>r.decision.reason==='rank-tie'));
});
test('wrong same-URL native rights/doc or fields fails before any encoder, sanitized without partial quality',async()=>{
 for(const change of [
 row=>{row.rightsEvidence.documentAfter.documentId='wrong-native-document';},row=>{row.rightsEvidence.caseId=FIXED_CASES[1].id;},
 row=>{row.rightsEvidence.mainResponseJourney.navigationLoaderVerified=false;},row=>{row.nativeWitness.studyId='wrong-study';},
 row=>{row.effectiveTitle='wrong-title';},row=>{row.body='x'.repeat(4097);},row=>{row.effectiveTitle+='\u0001';}
 ]){
  const f=setup({mutateRow:(r,n)=>{if(n===1)change(r);}});await fails(runNativeRootStudy(f.input));
  assert.equal(f.counts.create,0);assert.equal(f.counts.calls,0);assert.equal(f.counts.close,0);
 }
});
test('incomplete/drifted/unclosed capture metadata blocks drain/encoder regardless of producer declarations',async()=>{
 for(const mutate of [
 s=>s.rows.pop(),s=>s.rows[0].rightsEvidenceHash=B,s=>s.available=31,s=>s.browserCloseCompleted=false,
 s=>s.physicalOperationsDrained=false,s=>s.cleanupSubmissions=1,s=>s.resourceEvents=32769,
 s=>s.extra='body',s=>s.rows[0].body='MUST NOT RETAIN'
 ]){
  const f=setup({mutateSummary:mutate});await fails(runNativeRootStudy(f.input));assert.equal(f.counts.create,0);assert.equal(f.trace.includes('job-drain-ack'),false);
 }
 const f=setup();f.input.capture=async({onRow})=>{for(let i=0;i<31;i++)onRow(observation(FIXED_CASES[i]));return summary(FIXED_CASES.map(observation));};
 await fails(runNativeRootStudy(f.input));assert.equal(f.counts.create,0);
});
test('observed byte boundary is preserved, and one-event overshoot requires the matching restricted unavailable row',async()=>{
 const boundary=setup({mutateSummary:s=>{s.cases[0].observedEncodedBytes=33554432;}});
 const b=await runNativeRootStudy(boundary.input);assert.equal(b.capture.cases[0].observedEncodedBytes,33554432);
 const overshoot=setup({unavailable:[1],unavailableReason:'restricted-rendering',mutateSummary:s=>{s.cases[0].observedEncodedBytes=33554433;}});
 const o=await runNativeRootStudy(overshoot.input);assert.equal(o.capture.cases[0].observedEncodedBytes,33554433);
 assert.equal(o.outcomes[0].reason,'restricted-rendering');assert.equal(o.outcomes[0].decision,null);assert.equal(o.encoderCalls,62);
 assert.equal(overshoot.drains[0].available,31);assert.equal(overshoot.drains[0].captureHash,o.captureHash);
 for(const settings of [
  {mutateSummary:s=>{s.cases[0].observedEncodedBytes=33554433;}},
  {unavailable:[1],mutateSummary:s=>{s.cases[0].observedEncodedBytes=33554433;}},
  {unavailable:[2],unavailableReason:'restricted-rendering',mutateSummary:s=>{s.cases[0].observedEncodedBytes=33554433;}},
  {unavailable:[1],unavailableReason:'restricted-rendering',mutateSummary:s=>{s.cases[0].observedEncodedBytes=Number.MAX_SAFE_INTEGER+1;}}
 ]){const f=setup(settings);await fails(runNativeRootStudy(f.input));assert.equal(f.counts.create,0);assert.equal(f.drains.length,0);}
});
test('failed ACK, encoder/model/result/close/endcheck are fail-closed with once-only close and no retry',async()=>{
 const ack=setup();ack.input.assertBrowserDrained=async()=>false;await fails(runNativeRootStudy(ack.input));assert.equal(ack.counts.create,0);
 for(const settings of [{embedFailure:2},{modelMismatch:true},{closeFailure:true},{recheck:true}]){
  const f=setup(settings);await fails(runNativeRootStudy(f.input));assert.equal(f.counts.create,1);assert.equal(f.counts.close,1);assert.equal(f.counts.recheck,1);
 }
 const badOutput=setup(),create=badOutput.input.createEmbedder;badOutput.input.createEmbedder=async()=>{const e=await create();e.embed=async()=>({modelId:MODEL_ID,values:[1]});return e;};
 await fails(runNativeRootStudy(badOutput.input));assert.equal(badOutput.counts.close,1);
});
test('abort/guard completion fence after encoder allocation still closes owned embedder once',async()=>{
 const f=setup(),create=f.input.createEmbedder;
 f.input.createEmbedder=async()=>{const e=await create();f.controller.abort();return e;};
 await fails(runNativeRootStudy(f.input));assert.equal(f.counts.create,1);assert.equal(f.counts.close,1);assert.equal(f.counts.calls,0);
 const g=setup();g.input.guard=()=>{throw Error('PRIVATE CALLBACK');};await fails(runNativeRootStudy(g.input));assert.equal(g.counts.captured,0);
});
test('strict private/metadata/callback boundaries reject without proxy/getter execution',async()=>{
 let calls=0;const trap=()=>{calls++;throw Error('must not run');};
 const f=setup();Object.defineProperty(f.input,'capture',{enumerable:true,get:trap});await fails(runNativeRootStudy(f.input));
 await fails(runNativeRootStudy(new Proxy({},{getPrototypeOf:trap,ownKeys:trap})));
 const g=setup();g.input.capture=async({onRow})=>{onRow(new Proxy({},{getOwnPropertyDescriptor:trap,getPrototypeOf:trap}));return {};};
 await fails(runNativeRootStudy(g.input));assert.equal(calls,0);assert.equal(g.counts.create,0);
 const h=setup();h.input.goldCases[0].rootId=h.input.goldCases[2].rootId;await fails(runNativeRootStudy(h.input));assert.equal(h.counts.captured,0);
});
