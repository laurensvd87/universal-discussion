import test from 'node:test';
import assert from 'node:assert/strict';
import {verifySelectionArithmetic,verifyAssessmentArithmetic,runCli as verifyCli} from './verify.js';
import {CANDIDATE_ORDER,partialPrefixAgreement} from './methods.js';
import {fitPooledRootRankPolicy} from '../hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js';
import {assessRootOnlyPredictions} from '../hierarchical-e5-real-root-v1/assessment.js';
const H='a'.repeat(64),nodes=Array.from({length:16},(_,i)=>({id:'r'+i,parentId:null}));
function selection(){
 const rows=Array.from({length:48},(_,i)=>({id:'cal-'+i,groupId:'group-'+i,expectedRootId:'r'+i%16,
 scores:nodes.map(n=>({nodeId:n.id,score:n.id==='r'+i%16?1:-1}))}));
 const candidates=CANDIDATE_ORDER.map(([inputView,bodyWeight])=>{
  const policy=fitPooledRootRankPolicy({modelHash:H,representationHash:H,inputConstructionHash:H,nodeIds:nodes.map(n=>n.id),rows});
  return {inputView,bodyWeight,acceptedCorrect:48,acceptedGroups:48,rawCorrect:48,policy,calibrationRows:rows.map(r=>({...r,sourceInputHash:H}))};
 });
 return {finalTestEvaluated:false,selectedIndex:0,candidates};
}
test('stored six-candidate CAL arithmetic verifies without embeddings or model parameters',()=>{
 const s=selection();assert.equal(verifySelectionArithmetic(s),s.candidates[0]);
 s.candidates[1].rawCorrect=47;assert.throws(()=>verifySelectionArithmetic(s));
});
test('stored audit rejects wrong selected candidate, duplicate groups and hidden accepted error',()=>{
 for(const change of [s=>{s.selectedIndex=1;},s=>{s.candidates[0].calibrationRows[1].groupId='group-0';},
 s=>{s.candidates[0].calibrationRows[0].expectedRootId='r1';},s=>{s.finalTestEvaluated=true;}]){
  const s=selection();change(s);assert.throws(()=>verifySelectionArithmetic(s));
 }
});
function report(){
 const ns=[{id:'games',parentId:null},{id:'board',parentId:'games'},{id:'nature',parentId:null}];
 const cases=[{id:'a',entityGroup:'a',language:'en',expectedRootId:'games',specificityPath:['games','board']},
 {id:'b',entityGroup:'b',language:'de',expectedRootId:'nature',specificityPath:null}];
 const outcomes=[{id:'a',sourceInputHash:H,rootPath:['games'],consensusPath:['games','board'],detailPath:['games','board'],rawPath:['games']},
 {id:'b',sourceInputHash:H,rootPath:[],consensusPath:[],detailPath:['games'],rawPath:['games']}];
 const result={outcomes,feasibilityGate:{passed:false},unknownChildrenAreNegatives:false,unknownRootsTested:false};
 for(const c of cases){c.supportedPathPrefix=c.specificityPath??[c.expectedRootId];c.maximumSpecificityKnown=c.specificityPath!==null;}
 result.partialPrefixAgreement={};
 for(const [name,field,path]of [['guarded','guardedPrefixAgreement','consensusPath'],['detailAlone','detailPrefixAgreement','detailPath']]){
  const counts=Object.fromEntries(['unresolved','safe-broader','known-prefix-satisfied','incompatible-known-prefix'].map(k=>[k,0]));
  for(let i=0;i<cases.length;i++){const c=cases[i],o=outcomes[i];
   o[field]=partialPrefixAgreement({supportedPathPrefix:c.supportedPathPrefix,maximumSpecificityKnown:c.maximumSpecificityKnown,selectedPath:o[path]});
   counts[o[field].outcome]++;if(name==='guarded')o.unscoredDescendants=o[field].unscoredDescendants;
  }result.partialPrefixAgreement[name]=counts;
 }
 for(const [name,key]of [['rootOnly','rootPath'],['consensus','consensusPath'],['detailAlone','detailPath'],['rawRoot','rawPath']]){
  result[name]=assessRootOnlyPredictions({nodes:ns,cases:cases.map(({id,entityGroup,language,expectedRootId,specificityPath})=>({id,entityGroup,language,expectedRootId,specificityPath})),predictions:outcomes.map(o=>({id:o.id,sourceInputHash:o.sourceInputHash,selectedPath:o[key]}))});
 }
 return {nodes:ns,cases,result};
}
test('stored full-path/root/specificity and unresolved aggregates are recomputed honestly',()=>{
 const f=report();assert.equal(verifyAssessmentArithmetic(f),true);
 assert.equal(f.result.rootOnly.assigned,1);assert.equal(f.result.consensus.specificity.exactSupportedPath,1);
 f.result.consensus={...f.result.consensus,correctRoot:2};assert.throws(()=>verifyAssessmentArithmetic(f));
});
test('stored audit refuses outcome omission/order change and fabricated feasibility/OOD claims',()=>{
 for(const change of [f=>f.result.outcomes.pop(),f=>f.result.outcomes.reverse(),f=>{f.result.feasibilityGate.passed=true;},
 f=>{f.result.unknownRootsTested=true;}]){const f=report();change(f);assert.throws(()=>verifyAssessmentArithmetic(f));}
});
test('stored verifier is inert by default and rejects unknown operations',async()=>{
 assert.equal(await verifyCli([]),'inert');await assert.rejects(()=>verifyCli(['--rerun']));
});
