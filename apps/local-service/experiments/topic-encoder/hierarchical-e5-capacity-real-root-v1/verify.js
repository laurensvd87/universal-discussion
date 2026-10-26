// Stored bytes + arithmetic only. No encoder, model/scorer or capture imports.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {rankRootScores,compilePooledRootRankPolicy,classifyPooledRootRankPolicy} from '../hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js';
import {assessRootOnlyPredictions} from '../hierarchical-e5-real-root-v1/assessment.js';
import {selectCandidate,digest,inputConstructionIdentity,compileDualRepresentationGate,describeDualRepresentationGate,applyDualRepresentationGate,partialPrefixAgreement} from '../hierarchical-e5-expanded-real-root-v1/methods.js';
import {verifySelectionArithmetic,verifyAssessmentArithmetic} from '../hierarchical-e5-expanded-real-root-v1/verify.js';
import {buildTrainingEligibility,validateCapacityLedger,assertAllowedFrozenInputName} from './eligibility.js';
const here=new URL('./',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
// Pure saved-evidence checks: no scorer, vectors or model parameters.
export function verifyCaptureMarkers({phase,cases,capture}){
 assert.equal(capture.phase,phase);assert.equal(capture.status,'complete');
 assert.equal(capture.manifestHash,digest({namespace:'hierarchy-real-root-public-capture/v5',phase,cases:cases.map(c=>({id:c.id,url:c.publicUrl}))}));
 validateCapacityLedger({cases,ledger:capture.ledger,outcomes:capture.outcomes});
 const byId=new Map(capture.outcomes.map(o=>[o.id,o])),rows=[];
 for(let i=0;i<cases.length;i++){
  const c=cases[i],entry=capture.ledger[i],o=byId.get(c.id);
  if(entry.status==='capacity-refused'){
   const marker=digest({schema:'hierarchy-root-capacity-refusal-evaluation-marker/v1',phase,manifestHash:capture.manifestHash,
    id:entry.id,url:entry.url,reason:entry.reason,transportFailure:entry.transportFailure,originPolicy:entry.originPolicy,
    pagePolicyAvailable:false,pagePolicyApproved:false,rightsPageUnknown:true});
   assert.equal(entry.evaluationMarkerHash,marker);assert.equal(o,undefined);
   rows.push({id:c.id,sourceInputHash:marker,sourceInputHashScope:'evaluation-only-not-captured-source-input',
    captureStatus:entry.status,capacityReason:entry.reason,'current-static':false,'wikipedia-prose-lead':false});
  }else{
   assert.ok(o);assert.equal(typeof o.title,'string');assert.ok(o.title.length<=200);
   assert.equal(typeof o.current.text,'string');assert.ok(o.current.text.length<=4096);
   assert.equal(typeof o.leadCandidate.text,'string');assert.ok(o.leadCandidate.text.length<=4096);
   assert.equal(o.current.sha256,o.current.text?sha(o.current.text):null);
   assert.equal(o.leadCandidate.sha256,o.leadCandidate.text?sha(o.leadCandidate.text):null);
   assert.equal(o.leadCandidate.status==='available',o.leadCandidate.text.length>0);
   const sourceInputHash=digest({id:o.id,url:o.url,htmlSha256:o.htmlSha256,title:o.title,currentSha256:o.current.sha256,
    leadSha256:o.leadCandidate.sha256,decodedHtmlSha256:o.decodedHtmlSha256,metadataPruneReceiptSha256:digest(o.metadataPrune)});
   assert.equal(o.sourceInputHash,sourceInputHash);
   const title=!!o.title.trim();
   rows.push({id:c.id,sourceInputHash,sourceInputHashScope:'captured-public-input',captureStatus:'captured',capacityReason:null,
    'current-static':title&&!!o.current.text.trim(),'wikipedia-prose-lead':title&&o.leadCandidate.status==='available'&&!!o.leadCandidate.text.trim()});
  }
 }
 assert.equal(capture.expectedCases,cases.length);assert.equal(capture.completedCases,cases.length);assert.equal(capture.attemptedCases,cases.length);
 assert.equal(capture.capturedCases,capture.outcomes.length);assert.equal(capture.capacityRefusedCases,cases.length-capture.outcomes.length);
 assert.equal(capture.fatalCases,0);assert.equal(capture.notAttemptedCases,0);
 return rows;
}
export function verifyEncodingMetadata({phase,encoding,expectedInputs,selectedView=null}){
 const views=['current-static','wikipedia-prose-lead'],allowed=phase==='training-expansion'?views:[selectedView];
 assert.ok(phase==='training-expansion'||phase==='test');assert.ok(allowed.every(v=>views.includes(v)));
 assert.deepEqual(encoding.encodedViews,allowed);assert.equal(encoding.cases.length,expectedInputs.length);
 for(let i=0;i<expectedInputs.length;i++){
  const expected=expectedInputs[i],row=encoding.cases[i];assert.equal(row.id,expected.id);
  for(const key of ['sourceInputHash','sourceInputHashScope','captureStatus','capacityReason',...views])assert.equal(row[key],expected[key]);
 }
 assert.ok(Array.isArray(encoding.packets));assert.equal(encoding.packets.length,2);
 for(let i=0;i<2;i++){
  const p=encoding.packets[i],view=views[i];assert.equal(p.inputView,view,'Only fixed literal packet paths may be opened');
  const count=allowed.includes(view)?expectedInputs.filter(r=>r[view]).length:0;
  assert.equal(p.rows,count);assert.ok(Number.isSafeInteger(p.rows)&&p.rows>=0);
  if(!count)assert.equal(p.vectorPacketSha256,null);else assert.match(p.vectorPacketSha256,/^[a-f0-9]{64}$/u);
 }
 const calls=expectedInputs.reduce((n,r)=>n+(allowed.some(v=>r[v])?1:0)+allowed.filter(v=>r[v]).length,0);
 assert.equal(encoding.encoderCalls,calls);
 return true;
}
export function verifyCapacityResultAccounting({cases,capture,encoding,result}){
 assert.equal(cases.length,32);assert.equal(result.outcomes.length,32);
 const view=result.selectionReceipt.inputView;assert.ok(['current-static','wikipedia-prose-lead'].includes(view));
 const expected=verifyCaptureMarkers({phase:'test',cases,capture});
 verifyEncodingMetadata({phase:'test',encoding,expectedInputs:expected,selectedView:view});
 assert.equal(encoding.cases.length,32);assert.deepEqual(encoding.encodedViews,[view]);
 let available=0,rawCorrect=0,accepted=0,correct=0,wrong=0;
 for(let i=0;i<32;i++){
  const c=cases[i],row=expected[i],flag=encoding.cases[i],o=result.outcomes[i];
  assert.equal(o.id,c.id);assert.equal(flag.id,c.id);assert.equal(o.inputView,view);
  for(const key of ['sourceInputHash','sourceInputHashScope','captureStatus','capacityReason']){
   assert.equal(flag[key],row[key]);assert.equal(o[key],row[key]);
  }
  for(const key of ['current-static','wikipedia-prose-lead'])assert.equal(flag[key],row[key]);
  assert.equal(o.selectedViewAvailable,row[view]);
  if(!row[view]){assert.equal(o.scores,null);for(const key of ['rootPath','rawPath','detailPath','consensusPath'])assert.deepEqual(o[key],[]);}
  else available++;
  if(o.rawPath[0]===c.expectedRootId)rawCorrect++;
  if(o.rootPath.length){accepted++;if(o.rootPath[0]===c.expectedRootId)correct++;else wrong++;}
 }
 assert.equal(encoding.encoderCalls,available*2);
 for(const p of encoding.packets)assert.equal(p.rows,p.inputView===view?available:0);
 const by=field=>Object.fromEntries([...new Set(cases.map(c=>c[field]))].sort().map(k=>{
  const ids=new Set(cases.filter(c=>c[field]===k).map(c=>c.id)),part=expected.filter(r=>ids.has(r.id));
  return [k,{total:part.length,available:part.filter(r=>r[view]).length,capacityRefused:part.filter(r=>r.captureStatus==='capacity-refused').length}];
 }));
 const availability={total:32,available,capacityRefused:expected.filter(r=>r.captureStatus==='capacity-refused').length,
  byRoot:by('expectedRootId'),byLanguage:by('language')};
 const conditional={denominator:available,rawCorrect,accepted,correct,wrong,scope:'descriptive-condition-on-available-not-all-case-or-population-quality'};
 assert.deepEqual(result.inputAvailability,availability);assert.deepEqual(result.conditionalOnAvailable,conditional);
 return true;
}
async function stored(name,maximum=12*1024*1024){
 const stat=await lstat(new URL(name,here));assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=maximum);
 const b=await readFile(new URL(name,here));assert.equal(b.length,stat.size);return b;
}
export async function verifyStored(){
 const snapshots=new Map(),get=async name=>{if(!snapshots.has(name))snapshots.set(name,await stored(name));return snapshots.get(name);},json=async name=>JSON.parse(await get(name));
 const f=await json('freeze.json'),{freezeHash,...body}=f;assert.equal(digest(body),freezeHash);
 assert.equal(f.schema,'hierarchical-e5-capacity-real-root-experiment/v1');assert.equal(digest(f.manifestIdentity),f.manifestHash);
 for(const [name,hash]of Object.entries({...f.sourceHashes,...f.reusedInputHashes})){
  assertAllowedFrozenInputName(name);
  assert.ok(!name.includes('real-root-v3/output/test')&&!name.includes('hierarchy-curated-web-gold')&&!name.includes('real-root-test-supplement'),'Oldfinal must never open');
  assert.equal(sha(await get(name)),hash);
 }
 const selection=await json('output/selection.json'),chosen=verifySelectionArithmetic(selection),receipt=selection.receipt;
 const eligibilityBytes=await get('output/training-eligibility.json'),eligibility=JSON.parse(eligibilityBytes);
 assert.equal(sha(eligibilityBytes),receipt.eligibilityReceiptSha256);assert.equal(eligibility.eligibleCohortHash,receipt.eligibleCohortHash);
 assert.deepEqual(selection.eligibility,eligibility);assert.equal(eligibility.eligible,true);
 const trainingCapture=await json('../../../data/hierarchy-root-capacity-capture-adr142.training-expansion.json');
 const oldEncoding=await json('../hierarchical-e5-real-root-v3/output/encoding-traincal.json'),oldInputs=new Map(oldEncoding.cases.map(r=>[r.id,r]));
 const oldTraining=f.manifestIdentity.cases.filter(c=>c.split==='training'&&!c.id.startsWith('root-expansion-')).map(c=>({id:c.id,groupId:c.entityGroup,expectedRootId:c.expectedRootId,language:c.language,sourceInputHash:oldInputs.get(c.id).sourceInputHash}));
 assert.deepEqual(eligibility,buildTrainingEligibility({freezeHash,captureSha256:sha(await get('../../../data/hierarchy-root-capacity-capture-adr142.training-expansion.json')),
 reusedInputHashes:f.reusedInputHashes,oldTraining,expansionCases:f.manifestIdentity.cases.filter(c=>c.split==='training'&&c.id.startsWith('root-expansion-')),
 ledger:trainingCapture.capture.ledger,outcomes:trainingCapture.capture.outcomes}));
 for(const c of selection.candidates){assert.equal(c.actualTrainingRows,eligibility.totalTrainingRows);assert.equal(c.eligibleCohortHash,eligibility.eligibleCohortHash);}

 assert.equal(selection.freezeHash,freezeHash);assert.equal(receipt.freezeHash,freezeHash);
 assert.equal(receipt.inputConstructionHash,inputConstructionIdentity(f,receipt.inputView,receipt.bodyWeight,receipt.rootRepresentationHash));
 const receiptBytes=await get('../../../data/hierarchy-root-capacity-selection-adr142.json');
 assert.equal(sha(receiptBytes),selection.receiptSha256);assert.deepEqual(JSON.parse(receiptBytes),receipt);
 assert.equal(sha(await get('output/root-model.json')),receipt.selectedModelSha256);
 const model=await json('output/root-model.json');
 assert.deepEqual(model.trainingIdHashes,eligibility.eligibleTraining.map(r=>sha(r.id)).sort());
 assert.deepEqual(model.trainingGroupHashes,eligibility.eligibleTraining.map(r=>sha(r.groupId)).sort());
 assert.equal(sha(await get('output/root-policy.json')),receipt.selectedPolicySha256);
 assert.deepEqual(await json('output/root-policy.json'),chosen.policy);
 const result=await json('measured-results.json');assert.equal(result.freezeHash,freezeHash);
 assert.equal(result.finalTestEvaluated,true);
 assert.deepEqual(result.selectionReceipt,receipt);assert.equal(result.selectionReceiptSha256,selection.receiptSha256);
 for(const [phase,capture]of [['training-expansion','../../../data/hierarchy-root-capacity-capture-adr142.training-expansion.json'],['test','../../../data/hierarchy-root-capacity-capture-adr142.test.json']]){
  const captureRecord=await json(capture);assert.equal(captureRecord.capture.status,'complete');
  const caseRows=f.manifestIdentity.cases.filter(c=>phase==='test'?c.split==='test':c.split==='training'&&c.id.startsWith('root-expansion-'));
  const expectedInputs=verifyCaptureMarkers({phase,cases:caseRows,capture:captureRecord.capture});
  const encoding=await json('output/encoding-'+phase+'.json');assert.equal(encoding.freezeHash,freezeHash);assert.equal(sha(await get(capture)),encoding.captureSha256);
  verifyEncodingMetadata({phase,encoding,expectedInputs,selectedView:phase==='test'?receipt.inputView:null});
  if(phase==='training-expansion'){
   assert.equal(selection.expansionEncodingSha256,sha(await get('output/encoding-training-expansion.json')));
   assert.equal(encoding.eligibilityReceiptSha256,receipt.eligibilityReceiptSha256);assert.equal(encoding.eligibleCohortHash,receipt.eligibleCohortHash);
  }
  for(const packet of encoding.packets)if(packet.vectorPacketSha256)assert.equal(sha(await get('output/'+phase+'.'+packet.inputView+'.vectors.json')),packet.vectorPacketSha256);
  if(phase==='test'){assert.equal(result.testEncodingSha256,sha(await get('output/encoding-test.json')));assert.equal(result.testCaptureSha256,encoding.captureSha256);assert.equal(encoding.selectedReceiptSha256,selection.receiptSha256);
   verifyCapacityResultAccounting({cases:caseRows,capture:captureRecord.capture,encoding,result});}
 }
 const cases=f.manifestIdentity.cases.filter(c=>c.split==='test');assert.equal(cases.length,32);
 const gate=compileDualRepresentationGate({inputConstructionHash:receipt.inputConstructionHash,inputView:receipt.inputView,
 rootModelSha256:receipt.selectedModelSha256,rootPolicySha256:receipt.selectedPolicySha256,rootRepresentationHash:receipt.rootRepresentationHash,
 detailModelSha256:receipt.detailModelSha256,detailPolicySha256:receipt.detailPolicySha256,detailRepresentationHash:receipt.detailRepresentationHash});
 assert.equal(describeDualRepresentationGate(gate).dualGateHash,receipt.dualGateHash);
 const p=compilePooledRootRankPolicy(chosen.policy);
 for(const o of result.outcomes){
  if(o.scores){
   const r=rankRootScores({nodeIds:chosen.policy.nodeIds,scores:o.scores});assert.deepEqual(o.rawPath,r.winnerId?[r.winnerId]:[]);
   const d=classifyPooledRootRankPolicy(p,{modelHash:chosen.policy.modelHash,representationHash:receipt.rootRepresentationHash,inputConstructionHash:receipt.inputConstructionHash,sourceId:o.id,sourceVersion:o.sourceInputHash+'|'+receipt.inputView,scores:o.scores});
   assert.deepEqual(o.rootPath,d.selectedPath);
  }else assert.deepEqual(o.rootPath,[]);
  const common={sourceId:o.id,sourceVersion:o.sourceInputHash+'|'+receipt.inputView,sourceInputHash:o.sourceInputHash,inputView:receipt.inputView,inputConstructionHash:receipt.inputConstructionHash};
  const d=applyDualRepresentationGate(gate,{root:{...common,modelSha256:receipt.selectedModelSha256,policySha256:receipt.selectedPolicySha256,representationHash:receipt.rootRepresentationHash,path:o.rootPath},
  detail:{...common,modelSha256:receipt.detailModelSha256,policySha256:receipt.detailPolicySha256,representationHash:receipt.detailRepresentationHash,path:o.detailPath}});
  assert.deepEqual(d.selectedPath,o.consensusPath);
 }
 verifyAssessmentArithmetic({nodes:f.manifestIdentity.taxonomyNodes,cases,result});
 assert.deepEqual(result.trainingEligibility,eligibility);
 for(const o of result.outcomes)if(o.captureStatus==='capacity-refused'){
  assert.equal(o.sourceInputHashScope,'evaluation-only-not-captured-source-input');assert.equal(o.selectedViewAvailable,false);assert.equal(o.scores,null);
  for(const key of ['rootPath','rawPath','detailPath','consensusPath'])assert.deepEqual(o[key],[]);
 }
 for(const [name,b]of snapshots)assert.equal(sha(await stored(name)),sha(b),'Stored audit evidence changed');
 return {schema:'capacity-root-stored-audit/v1',freezeHash,filesChecked:snapshots.size,modelExecution:false,captureExecution:false,productionValidated:false};
}
export async function runCli(args){
 if(!args.length)return 'inert';assert.deepEqual(args,['--verify']);const result=await verifyStored();process.stdout.write(JSON.stringify(result)+'\n');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runCli(process.argv.slice(2));
