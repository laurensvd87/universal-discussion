import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildTrainingEligibility,validateCapacityLedger,assertAllowedFrozenInputName} from './eligibility.js';
import {runCli} from './run.js';
import {runCli as auditCli,verifyCaptureMarkers,verifyCapacityResultAccounting,verifyEncodingMetadata} from './verify.js';
import {CANDIDATE_ORDER,selectCandidate,workPreflight,encodingViews} from '../hierarchical-e5-expanded-real-root-v1/methods.js';
const H='a'.repeat(64),B='b'.repeat(64);
function fixture(refuse=()=>false){
 const oldTraining=[],expansionCases=[],ledger=[],outcomes=[];
 for(let i=0;i<16;i++){
  for(let j=0;j<3;j++)oldTraining.push({id:'old-'+i+'-'+j,groupId:'og-'+i+'-'+j,expectedRootId:'r'+i,language:['en','de','nl'][j],sourceInputHash:H});
  for(let j=0;j<5;j++){
   const id='new-'+i+'-'+j,publicUrl='https://en.wikipedia.org/wiki/'+id,c={id,entityGroup:'ng-'+i+'-'+j,expectedRootId:'r'+i,language:['en','de','nl','fr','es'][j],publicUrl};expansionCases.push(c);
   if(refuse(i,j))ledger.push({id,url:publicUrl,status:'capacity-refused',reason:'page-decoder-output-limit',
    transportFailure:{code:'content-encoding',causeCode:'ERR_BUFFER_TOO_LARGE'},
    originPolicy:{robotsSha256:H,robotsDecodedSha256:H,robotsCanonicalSha256:H,robotsRepairId:null,robotsRepairManifestHash:null,
     robotsAbsent:false,tdmAbsent:true,tdmSha256:null,robotsAllowed:true,crawlDelayMs:2000,tdmDocumentReservation:null},
    pagePolicyAvailable:false,pagePolicyApproved:false,rightsPageUnknown:true,sourceInputIdentityAvailable:false,evaluationMarkerHash:B,evaluationMarkerScope:'evaluation-only-not-captured-source-input'});
   else{ledger.push({id,url:publicUrl,status:'captured',outcomeIndex:outcomes.length});
    outcomes.push({id,url:publicUrl,sourceInputHash:H,title:'synthetic public literal',current:{text:'synthetic'},leadCandidate:{status:'available',text:'lead'}});}
  }
 }
 return {freezeHash:H,captureSha256:B,reusedInputHashes:{prior:H},oldTraining,expansionCases,ledger,outcomes};
}
test('all128 potentialTRAIN remain metadata; exactly112 actualeligible is legitimate and group independent',()=>{
 const f=fixture((_,j)=>j===4),r=buildTrainingEligibility(f);
 assert.equal(f.expansionCases.length,80);assert.equal(r.eligible,true);assert.equal(r.totalTrainingRows,112);assert.equal(r.newEligibleRows,64);
 assert.equal(r.refusedExpansion.length,16);assert.ok(Object.values(r.countsByRoot).every(n=>n===7));assert.equal(r.equalPriorsClaim,false);
 assert.equal(r.eligibleTraining.length,112);assert.equal(r.eligibleTraining[0].id,'old-0-0');
 assert.ok(!r.eligibleTraining.some(row=>row.sourceInputHash===B));assert.equal(r.assignmentAuthority,false);assert.ok(Object.isFrozen(r.eligibleTraining));
});
test('allcaptured128 and unequal112+ rootcounts reported without pretending balanced priors',()=>{
 const complete=buildTrainingEligibility(fixture());assert.equal(complete.totalTrainingRows,128);assert.equal(complete.eligible,true);
 const unequal=buildTrainingEligibility(fixture((i,j)=>j===4&&i<8));assert.equal(unequal.totalTrainingRows,120);
 assert.equal(unequal.countsByRoot.r0,7);assert.equal(unequal.countsByRoot.r15,8);assert.equal(unequal.equalPriorsClaim,false);
});
test('belowtotal or one sparse root creates preserved ineligible receipt, no weaker thresholds',()=>{
 const total=buildTrainingEligibility(fixture((_,j)=>j>=3));assert.equal(total.totalTrainingRows,96);assert.equal(total.eligible,false);
 assert.ok(total.ineligibilityReasons.includes('minimum-total-training'));
 const sparse=buildTrainingEligibility(fixture((i,j)=>i===0&&j>=2));assert.equal(sparse.totalTrainingRows,125);assert.equal(sparse.eligible,false);
 assert.ok(sparse.ineligibilityReasons.includes('minimum-root:r0'));
});
test('missing captured title/current/lead is fatal rather than another capacity escape',()=>{
 for(const mutate of [o=>{o.title=' ';},o=>{o.current.text='';},o=>{o.leadCandidate.status='unavailable';},o=>{o.leadCandidate.text='';}]){
  const f=fixture();mutate(f.outcomes[0]);assert.throws(()=>buildTrainingEligibility(f));
 }
});
test('fatal, pending, duplicate, reordered or fabricated capacities are refused before any model',()=>{
 for(const mutate of [
 f=>{f.ledger[0]={id:f.ledger[0].id,url:f.ledger[0].url,status:'fatal',failedStage:'robots',failureCode:'body-too-large'};},
 f=>{f.ledger[0]={id:f.ledger[0].id,url:f.ledger[0].url,status:'not-attempted'};},
 f=>f.ledger.reverse(),f=>{f.ledger[1].id=f.ledger[0].id;},f=>{f.ledger[0].sourceInputHash=H;},
 f=>{f.ledger[0].transportFailure.causeCode='Z_DATA_ERROR';},f=>{f.ledger[0].pagePolicyApproved=true;}
 ]){const f=fixture((i,j)=>i===0&&j===0);mutate(f);assert.throws(()=>validateCapacityLedger({cases:f.expansionCases,ledger:f.ledger,outcomes:f.outcomes}));}
});
test('originalentity groups never become multiple votes and callers cannot mutate receipts',()=>{
 const f=fixture(),r=buildTrainingEligibility(f);f.oldTraining[0].id='changed';f.outcomes[0].sourceInputHash=B;
 assert.equal(r.eligibleTraining[0].id,'old-0-0');assert.equal(r.eligibleTraining[48].sourceInputHash,H);
 const duplicate=fixture();duplicate.oldTraining[0].groupId=duplicate.oldTraining[1].groupId;assert.throws(()=>buildTrainingEligibility(duplicate));
 let calls=0;const hostile=fixture();Object.defineProperty(hostile,'freezeHash',{enumerable:true,get(){calls++;return H;}});
 assert.throws(()=>buildTrainingEligibility(hostile));assert.equal(calls,0);assert.throws(()=>buildTrainingEligibility(new Proxy(fixture(),{})));
});
test('sixcandidate ordering/max128bounds and selected-only testencoding are reused unchanged',()=>{
 const rows=CANDIDATE_ORDER.map(([inputView,bodyWeight])=>({inputView,bodyWeight,acceptedCorrect:20,rawCorrect:40}));
 assert.equal(selectCandidate(rows),rows[0]);rows[3].acceptedCorrect=21;assert.equal(selectCandidate(rows),rows[3]);
 assert.equal(workPreflight().trainingWork,35205984);assert.deepEqual(encodingViews('test','current-static'),['current-static']);
});
test('new runner/audit default inert; unsupervised eligibility/model phase refuses before IO',async()=>{
 assert.equal(await runCli([]),'inert');assert.equal(await auditCli([]),'inert');
 await assert.rejects(()=>runCli(['--prepare-eligibility']));await assert.rejects(()=>runCli(['--fit-calibrate']));await assert.rejects(()=>auditCli(['--rerun']));
});
test('fixed frozen-input allowlist excludes oldreal32, arbitrarysiblings, ownerpaths and pathtricks',()=>{
 assertAllowedFrozenInputName('../hierarchical-e5-expanded-real-root-v1/methods.js');
 assertAllowedFrozenInputName('../hierarchical-e5-observed-cuts-v1/../hierarchical-e5-broad-heads-v1/assessment.js');
 for(const n of ['../../../data/hierarchy-curated-web-gold-adr134.json','../hierarchical-e5-real-root-v3/output/test.current-static.vectors.json',
 '../../../data/owner.sqlite','../unreviewed-experiment/run.js','D:/owner/profile','../x\\foo.js'])assert.throws(()=>assertAllowedFrozenInputName(n));
});

const sha=v=>createHash('sha256').update(v).digest('hex'),digest=v=>sha(JSON.stringify(v));
function savedEvidence(){
 const f=fixture((i,j)=>i===0&&j===0||i===1&&j===2),cases=f.expansionCases.slice(0,32);
 const ids=new Set(cases.map(c=>c.id)),ledger=f.ledger.slice(0,32),outcomes=f.outcomes.filter(o=>ids.has(o.id));
 for(const o of outcomes){
  o.htmlSha256=H;o.decodedHtmlSha256=H;o.metadataPrune={version:'synthetic-only'};
  if(o.id==='new-0-1'){o.leadCandidate.status='unavailable';o.leadCandidate.text='';}
  o.current.sha256=sha(o.current.text);o.leadCandidate.sha256=o.leadCandidate.text?sha(o.leadCandidate.text):null;
  o.sourceInputHash=digest({id:o.id,url:o.url,htmlSha256:o.htmlSha256,title:o.title,currentSha256:o.current.sha256,
   leadSha256:o.leadCandidate.sha256,decodedHtmlSha256:o.decodedHtmlSha256,metadataPruneReceiptSha256:digest(o.metadataPrune)});
 }
 const manifestHash=digest({namespace:'hierarchy-real-root-public-capture/v5',phase:'test',cases:cases.map(c=>({id:c.id,url:c.publicUrl}))});
 for(const row of ledger)if(row.status==='capacity-refused')row.evaluationMarkerHash=digest({schema:'hierarchy-root-capacity-refusal-evaluation-marker/v1',
  phase:'test',manifestHash,id:row.id,url:row.url,reason:row.reason,transportFailure:row.transportFailure,originPolicy:row.originPolicy,
  pagePolicyAvailable:false,pagePolicyApproved:false,rightsPageUnknown:true});
 const capture={phase:'test',status:'complete',manifestHash,ledger,outcomes,expectedCases:32,completedCases:32,attemptedCases:32,
  capturedCases:outcomes.length,capacityRefusedCases:32-outcomes.length,fatalCases:0,notAttemptedCases:0};
 const expected=verifyCaptureMarkers({phase:'test',cases,capture}),view='wikipedia-prose-lead',available=expected.filter(r=>r[view]).length;
 const encoding={encodedViews:[view],cases:structuredClone(expected),encoderCalls:available*2,packets:[
  {inputView:'current-static',rows:0,vectorPacketSha256:null},{inputView:view,rows:available,vectorPacketSha256:H}]};
 const result={selectionReceipt:{inputView:view},outcomes:expected.map((r,i)=>({
  ...r,inputView:view,selectedViewAvailable:r[view],scores:r[view]?[]:null,
  rootPath:r[view]&&i%2===0?[cases[i].expectedRootId]:[],rawPath:r[view]?[cases[i].expectedRootId]:[],
  detailPath:[],consensusPath:r[view]&&i%2===0?[cases[i].expectedRootId]:[]
 }))};
 const by=field=>Object.fromEntries([...new Set(cases.map(c=>c[field]))].sort().map(k=>{
  const part=result.outcomes.filter((_,i)=>cases[i][field]===k);
  return [k,{total:part.length,available:part.filter(r=>r.selectedViewAvailable).length,capacityRefused:part.filter(r=>r.captureStatus==='capacity-refused').length}];
 }));
 const accepted=result.outcomes.filter(r=>r.rootPath.length).length;
 result.inputAvailability={total:32,available,capacityRefused:32-outcomes.length,byRoot:by('expectedRootId'),byLanguage:by('language')};
 result.conditionalOnAvailable={denominator:available,rawCorrect:available,accepted,correct:accepted,wrong:0,
  scope:'descriptive-condition-on-available-not-all-case-or-population-quality'};
 return {cases,capture,encoding,result};
}
test('storedfinal audit ties all32 rows to actualcapture/refusal markers and recomputes conditional totals',()=>{
 const f=savedEvidence();assert.equal(verifyCapacityResultAccounting(f),true);
 assert.equal(f.result.inputAvailability.total,32);assert.equal(f.result.inputAvailability.capacityRefused,2);
 assert.equal(f.result.conditionalOnAvailable.denominator,29);
});
test('refusalmarker must bind exactphase/case/typedfailure/originpolicy, not just SHAformat',()=>{
 for(const mutate of [
 f=>{f.capture.ledger[0].evaluationMarkerHash=H;},
 f=>{f.capture.ledger[0].originPolicy.crawlDelayMs=3000;},
 f=>{f.capture.ledger[0].reason='page-body-too-large';f.capture.ledger[0].transportFailure={code:'body-too-large',causeCode:null};},
 f=>{f.capture.outcomes[0].sourceInputHash=B;}
 ]){const f=savedEvidence();mutate(f);assert.throws(()=>verifyCaptureMarkers({phase:'test',cases:f.cases,capture:f.capture}));}
 const wrongPhase=savedEvidence();assert.throws(()=>verifyCaptureMarkers({phase:'training-expansion',cases:wrongPhase.cases,capture:wrongPhase.capture}));
});
test('storedresult hiddenrefusal/status/hash/view/denominator/rootlanguage and rawrescue tampering rejects',()=>{
 for(const mutate of [
 f=>{f.result.outcomes[0].captureStatus='captured';},
 f=>{f.result.outcomes[0].sourceInputHash=H;},
 f=>{f.result.outcomes[0].sourceInputHashScope='captured-public-input';},
 f=>{f.result.outcomes[0].selectedViewAvailable=true;},
 f=>{f.result.outcomes[0].rawPath=['r0'];},
 f=>{f.result.outcomes[1].scores=[];},
 f=>{f.result.outcomes[1].rootPath=['r0'];},
 f=>{f.result.inputAvailability.total=30;},
 f=>{f.result.inputAvailability.byRoot.r0.capacityRefused=0;},
 f=>{f.result.inputAvailability.byLanguage.en.available=99;},
 f=>{f.result.conditionalOnAvailable.denominator=32;},
 f=>{f.result.conditionalOnAvailable.rawCorrect=32;},
 f=>{f.result.outcomes.pop();}
 ]){const f=savedEvidence();mutate(f);assert.throws(()=>verifyCapacityResultAccounting(f));}
});
test('packetfile read plans refuse unknown/pathlike/duplicate views before constructing any IO path',()=>{
 for(const mutate of [
 e=>{e.packets[0].inputView='../owner';},e=>{e.packets[0].inputView='wikipedia-prose-lead';},
 e=>e.packets.reverse(),e=>e.packets.pop(),e=>{e.packets[0].vectorPacketSha256=H;},
 e=>{e.packets[1].rows++;},e=>{e.encodedViews=['current-static','wikipedia-prose-lead'];},
 e=>{e.encoderCalls+=2;}
 ]){const f=savedEvidence();mutate(f.encoding);assert.throws(()=>verifyEncodingMetadata({phase:'test',encoding:f.encoding,
  expectedInputs:verifyCaptureMarkers({phase:'test',cases:f.cases,capture:f.capture}),selectedView:'wikipedia-prose-lead'}));}
});
test('TRAIN and TEST marker namespaces independently bind their own phase and manifest',()=>{
 const f=savedEvidence(),phase='training-expansion';f.capture.phase=phase;
 f.capture.manifestHash=digest({namespace:'hierarchy-real-root-public-capture/v5',phase,cases:f.cases.map(c=>({id:c.id,url:c.publicUrl}))});
 for(const e of f.capture.ledger)if(e.status==='capacity-refused')e.evaluationMarkerHash=digest({
  schema:'hierarchy-root-capacity-refusal-evaluation-marker/v1',phase,manifestHash:f.capture.manifestHash,id:e.id,url:e.url,reason:e.reason,
  transportFailure:e.transportFailure,originPolicy:e.originPolicy,pagePolicyAvailable:false,pagePolicyApproved:false,rightsPageUnknown:true});
 assert.equal(verifyCaptureMarkers({phase,cases:f.cases,capture:f.capture}).length,32);
 const old=savedEvidence();f.capture.ledger[0].evaluationMarkerHash=old.capture.ledger[0].evaluationMarkerHash;
 assert.throws(()=>verifyCaptureMarkers({phase,cases:f.cases,capture:f.capture}));
});
