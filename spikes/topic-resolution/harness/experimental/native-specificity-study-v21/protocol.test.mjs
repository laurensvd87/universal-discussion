// Fixed source constants only. No public/native/model/artifact/runtime actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const p=JSON.parse(readFileSync(new URL('./protocol.json',import.meta.url),'utf8'));

test('ADR218 changes the successor decision only; every ADR179 semantic limit/gate remains exact',()=>{
 const {decision,...body}=p;assert.equal(decision,'ADR218');
 // Immutable v1 protocol SOURCE body hash, excluding its ADR179 decision only.
 assert.equal(createHash('sha256').update(JSON.stringify(body)).digest('hex'),'36b0712bffed96a0ada6feadeaa810f32e57df4c41248c96db97a893bf253b5e');
 assert.equal(p.status,'source-only-no-preparation-or-execution');
});

test('complete cohort, native batch and unknown-label denominators stay distinct',()=>{
 assert.equal(p.cases.total,168);
 assert.equal(p.cases.training+p.cases.calibration+p.cases.test,p.cases.total);
 assert.equal(p.cases.verified+p.cases.unverified,p.cases.total);
 assert.equal(p.cases.unverified,2);
 assert.equal(p.capture.trainCalBatches*p.batchCases,p.phases.trainCal.rows);
 assert.equal(p.capture.testBatches*p.batchCases,p.phases.test.rows);
 assert.equal(p.capture.freshProfiles,p.capture.trainCalBatches+p.capture.testBatches);
 assert.equal(p.capture.nativeOrdinalMaximum,4);
 assert.equal(p.semantic.roots+p.semantic.localForestNodesIncludingThreeRoots-3,p.semantic.unionNodes);
});

test('absolute batch and phase time allocations cross-foot, no sliding deadline',()=>{
 const c=p.capture;
 assert.equal(Object.values(c.batchAllocationsSeconds).reduce((n,v)=>n+v,0),c.batchActiveSeconds);
 assert.equal(c.batchActiveSeconds+p.phases.terminalCleanupReserveSeconds,c.batchWallSeconds);
 assert.equal(c.batchAllocationsSeconds.articles,p.batchCases*c.readingLeaseSeconds);
 for(const [key,phase]of Object.entries({trainCal:p.phases.trainCal,test:p.phases.test})){
  assert.equal(phase.captureSeconds,phase.batches*c.batchActiveSeconds);
  assert.equal(phase.activeSeconds,phase.captureSeconds+phase.encodingSeconds+(key==='trainCal'?phase.fittingSeconds:phase.assessmentSeconds)+phase.finalChecksSeconds);
  assert.equal(phase.wallSeconds,phase.activeSeconds+p.phases.terminalCleanupReserveSeconds);
  assert.equal(phase.encodingSeconds,phase.encoderCallsMaximum*180/64);
  // CPU and wall-time leases are independent ceilings. Waiting contributes
  // wall time but not CPU, and the CPU guard may refuse before wall expiry.
  assert.ok(phase.cpuSeconds>=phase.batches*c.batchCpuSeconds);
  assert.ok(phase.cpuSeconds<=phase.activeSeconds);
 }
 assert.equal(p.phases.phaseDeadlineCanSlide,false);
 assert.equal(p.phases.modelClockOrigin,'first-externally-observed-cohort-complete-drain-request-including-ACK-wait-not-first-batch-drain');
});

test('all rows precede paired encoding and raw-text limits count all three fields',()=>{
 const units=p.semantic.bodyUnitsMaximum+p.semantic.rawTitleUnitsMaximum+p.semantic.effectiveTitleUnitsMaximum;
 for(const phase of [p.phases.trainCal,p.phases.test]){
  assert.equal(phase.encoderCallsMaximum,phase.rows*2);
  assert.equal(phase.rawTextUnitsMaximum,phase.rows*units);
 }
 assert.equal(p.semantic.dimensions,384);
 assert.deepEqual(p.semantic.trainingAnnotations,{member:24,stop:12,outside:12});
 assert.equal(Object.values(p.semantic.trainingAnnotations).reduce((n,v)=>n+v,0),p.cases.training);
 assert.equal(p.semantic.rewriteMemberToStopFromGold,false);
 assert.equal(p.semantic.signedZeroMustSurvive,true);
 assert.equal(p.semantic.calibrationSelectionsMaximum,1);
 assert.equal(p.semantic.calibrationGridSize,270);
});

test('network scope and aggregate submissions are finite and no wider than the batch',()=>{
 const n=p.network;
 assert.equal(new Set(n.resourceOrigins).size,5);
 assert.deepEqual(n.policyPaths,['/robots.txt','/.well-known/tdmrep.json']);
 assert.equal(n.batchHostsMaximum,p.batchCases+n.resourceOrigins.length);
 assert.equal(n.batchDnsQueriesMaximum,n.batchHostsMaximum*2);
 assert.equal(n.pendingDnsQueriesMaximum,n.concurrentResolversMaximum*2);
 assert.equal(n.studyDnsQueriesMaximum,n.batchDnsQueriesMaximum*p.capture.freshProfiles);
 assert.equal(n.batchPolicyRequestsMaximum,p.batchCases*n.policyPaths.length);
 assert.equal(n.studyPolicyRequestsMaximum,n.batchPolicyRequestsMaximum*p.capture.freshProfiles);
 assert.equal(n.supportAliasesExpandScope,false);
 assert.equal(n.redirectsAllowed,false);assert.equal(n.addressRetriesAllowed,false);
 assert.equal(n.ordinaryTlsRequired,true);assert.equal(n.selectedPublicPeerRequired,true);
 assert.equal(n.completeOsEgressIsolation,false);
});

test('native filesystem proof pipe is finite and does not pretend hashes retain raw replay evidence',()=>{
 const w=p.fsProofWire;assert.equal(w.transport,'original-owned-child-pipes-canonical-NDJSON');
 assert.equal(w.maximumFrameBytes,16384);assert.equal(w.maximumQueuedFrames,8);assert.equal(w.maximumQueuedBytes,w.maximumFrameBytes*w.maximumQueuedFrames);
 assert.equal(w.maximumSequence,65536);assert.equal(w.maximumCombinedWireBytes,64*1024*1024);assert.equal(w.maximumPhysicalExchanges,1);
 assert.equal(w.rawFramesRetained,false);assert.equal(w.compactHashChainAndCountsRetained,true);assert.equal(w.independentRawFrameReplayPossible,false);
 assert.equal(w.ordinaryLogsIncludeControlFrames,false);assert.equal(w.sampledNativePathProofIsAtomicSandbox,false);
});

test('disk aggregate is an actual ceiling rather than a fictitious per-profile reservation',()=>{
 const r=p.resources;
 assert.equal(r.batchOwnedBytesMaximum,512*1024*1024);
 assert.equal(r.studyOwnedBytesMaximum,8*1024*1024*1024);
 assert.ok(r.studyOwnedBytesMaximum<r.batchOwnedBytesMaximum*p.capture.freshProfiles);
 assert.equal(r.studyOwnedEntriesMaximum,r.batchOwnedEntriesMaximum*p.capture.freshProfiles);
 assert.equal(r.minimumCFreeMiB,2048);assert.equal(r.minimumDFreeMiB,4096);
 assert.equal(r.automaticProfileDeletion,false);
 assert.equal(r.cpuIncludesExitedOwnedChildren,true);
 assert.equal(r.samplingIsInstantaneousSchedulerCap,false);
 assert.equal(p.capture.normalPhysicalMaximum+p.capture.reservedCleanupMaximum,p.capture.aggregatePhysicalMaximum);
});

test('fixed composition is evaluated once; unknown and unchecked rows get no success credit',()=>{
 const g=p.qualityGate;
 assert.equal(g.candidate,'fixed-root-gated-detail-composition');
 assert.equal(g.rootOnlyBaselineMaySelectCandidate,false);
 assert.equal(g.testDenominator,p.cases.test);
 assert.equal(g.minimumAvailable,60);assert.equal(g.minimumExactLeaves,24);
 assert.equal(g.leafDenominator,36);assert.equal(g.minimumExactPerLeaf,3);
 assert.equal(g.parentDenominator,18);assert.equal(g.minimumExactParents,12);
 for(const k of ['maximumOverspecificParents','maximumKnownWrongAcceptedPaths','maximumAssignedUnassessed'])assert.equal(g[k],0);
 assert.equal(g.uncheckedPrefixGetsCorrectnessCredit,false);
 assert.equal(g.all72AccuracyClaim,false);
 assert.equal(p.phases.testRequiresIndependentlyAuditedImmutableSelection,true);
});

test('source protocol grants no actual collection, model, provider, crawler or canonical action',()=>{
 assert.equal(p.status,'source-only-no-preparation-or-execution');
 for(const v of Object.values(p.execution))assert.equal(v,false);
 assert.equal(p.semantic.rawTextPersistedByHarness,false);
 assert.equal(p.semantic.queryVectorsPersisted,false);
 assert.equal(p.semantic.browserTemporaryCacheMayContainResponses,true);
 assert.equal(p.capture.browserMustCloseBeforeNextBatch,true);
 assert.equal(p.capture.originalPhysicalWorkMustSettle,true);
 assert.equal(p.capture.independentNormalGuardianAckRequired,true);
});
