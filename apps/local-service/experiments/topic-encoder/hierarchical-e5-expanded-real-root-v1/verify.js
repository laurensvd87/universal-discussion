// Stored bytes + arithmetic only. No encoder, model/scorer or capture imports.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {rankRootScores,compilePooledRootRankPolicy,classifyPooledRootRankPolicy} from '../hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js';
import {assessRootOnlyPredictions} from '../hierarchical-e5-real-root-v1/assessment.js';
import {selectCandidate,digest,inputConstructionIdentity,compileDualRepresentationGate,describeDualRepresentationGate,applyDualRepresentationGate,partialPrefixAgreement} from './methods.js';
const here=new URL('./',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
export function verifySelectionArithmetic(selection){
 assert.equal(selection.finalTestEvaluated,false);assert.equal(selection.candidates.length,6);
 for(const c of selection.candidates){
  assert.equal(c.calibrationRows.length,48);const p=c.policy,h=compilePooledRootRankPolicy(p);let accepted=0,correct=0,rawCorrect=0;
  const ids=new Set(),groups=new Set();
  for(const row of c.calibrationRows){
   assert.ok(!ids.has(row.id)&&!groups.has(row.groupId));ids.add(row.id);groups.add(row.groupId);
   const r=rankRootScores({nodeIds:p.nodeIds,scores:row.scores});if(r.winnerId===row.expectedRootId)rawCorrect++;
   const d=classifyPooledRootRankPolicy(h,{modelHash:p.modelHash,representationHash:p.representationHash,inputConstructionHash:p.inputConstructionHash,
    sourceId:row.id,sourceVersion:row.sourceInputHash+'|'+c.inputView,scores:row.scores});
   if(d.selectedPath.length){accepted++;if(d.selectedPath[0]===row.expectedRootId)correct++;}
  }
  assert.equal(accepted,c.acceptedGroups);assert.equal(correct,c.acceptedCorrect);assert.equal(rawCorrect,c.rawCorrect);
  assert.equal(accepted,p.acceptedGroups);assert.equal(correct,p.correctGroups);assert.equal(correct,accepted);
 }
 const winner=selectCandidate(selection.candidates);assert.equal(winner,selection.candidates[selection.selectedIndex]);return winner;
}
export function verifyAssessmentArithmetic({nodes,cases,result}){
 const exactCases=cases.map(({id,entityGroup,language,expectedRootId,specificityPath})=>({id,entityGroup,language,expectedRootId,specificityPath}));
 assert.equal(result.outcomes.length,cases.length);assert.deepEqual(result.outcomes.map(o=>o.id),cases.map(c=>c.id));
 for(const [name,field]of [['rootOnly','rootPath'],['consensus','consensusPath'],['detailAlone','detailPath'],['rawRoot','rawPath']]){
  const predictions=result.outcomes.map(o=>({id:o.id,sourceInputHash:o.sourceInputHash,selectedPath:o[field]}));
  assert.deepEqual(assessRootOnlyPredictions({nodes,cases:exactCases,predictions}),result[name]);
 }
 assert.equal(result.feasibilityGate.passed,result.rootOnly.assigned>=24&&result.rootOnly.wrongRoot===0);
 for(const [name,field,pathField]of [['guarded','guardedPrefixAgreement','consensusPath'],['detailAlone','detailPrefixAgreement','detailPath']]){
  const counts=Object.fromEntries(['unresolved','safe-broader','known-prefix-satisfied','incompatible-known-prefix'].map(k=>[k,0]));
  for(let i=0;i<cases.length;i++){
   const c=cases[i],o=result.outcomes[i],expected=partialPrefixAgreement({supportedPathPrefix:c.supportedPathPrefix,maximumSpecificityKnown:c.maximumSpecificityKnown,selectedPath:o[pathField]});
   assert.deepEqual(o[field],expected);counts[expected.outcome]++;
   if(name==='guarded')assert.deepEqual(o.unscoredDescendants,expected.unscoredDescendants);
  }
  assert.deepEqual(result.partialPrefixAgreement[name],counts);
 }
 assert.equal(result.unknownChildrenAreNegatives,false);assert.equal(result.unknownRootsTested,false);return true;
}
async function stored(name,maximum=12*1024*1024){
 const stat=await lstat(new URL(name,here));assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=maximum);
 const b=await readFile(new URL(name,here));assert.equal(b.length,stat.size);return b;
}
export async function verifyStored(){
 const snapshots=new Map(),get=async name=>{if(!snapshots.has(name))snapshots.set(name,await stored(name));return snapshots.get(name);},json=async name=>JSON.parse(await get(name));
 const f=await json('freeze.json'),{freezeHash,...body}=f;assert.equal(digest(body),freezeHash);
 assert.equal(f.schema,'hierarchical-e5-expanded-real-root-experiment/v1');assert.equal(digest(f.manifestIdentity),f.manifestHash);
 for(const [name,hash]of Object.entries({...f.sourceHashes,...f.reusedInputHashes})){
  assert.ok(!name.includes('real-root-v3/output/test')&&!name.includes('hierarchy-curated-web-gold')&&!name.includes('real-root-test-supplement'),'Oldfinal must never open');
  assert.equal(sha(await get(name)),hash);
 }
 const selection=await json('output/selection.json'),chosen=verifySelectionArithmetic(selection),receipt=selection.receipt;
 assert.equal(selection.freezeHash,freezeHash);assert.equal(receipt.freezeHash,freezeHash);
 assert.equal(receipt.inputConstructionHash,inputConstructionIdentity(f,receipt.inputView,receipt.bodyWeight,receipt.rootRepresentationHash));
 const receiptBytes=await get('../../../data/hierarchy-root-expansion-selection-adr141.json');
 assert.equal(sha(receiptBytes),selection.receiptSha256);assert.deepEqual(JSON.parse(receiptBytes),receipt);
 assert.equal(sha(await get('output/root-model.json')),receipt.selectedModelSha256);
 assert.equal(sha(await get('output/root-policy.json')),receipt.selectedPolicySha256);
 assert.deepEqual(await json('output/root-policy.json'),chosen.policy);
 const result=await json('measured-results.json');assert.equal(result.freezeHash,freezeHash);
 assert.equal(result.finalTestEvaluated,true);
 assert.deepEqual(result.selectionReceipt,receipt);assert.equal(result.selectionReceiptSha256,selection.receiptSha256);
 for(const [phase,capture]of [['training-expansion','../../../data/hierarchy-root-expansion-capture-adr141.training-expansion.json'],['test','../../../data/hierarchy-root-expansion-capture-adr141.test.json']]){
  const encoding=await json('output/encoding-'+phase+'.json');assert.equal(encoding.freezeHash,freezeHash);assert.equal(sha(await get(capture)),encoding.captureSha256);
  if(phase==='training-expansion')assert.equal(selection.expansionEncodingSha256,sha(await get('output/encoding-training-expansion.json')));
  for(const packet of encoding.packets)if(packet.vectorPacketSha256)assert.equal(sha(await get('output/'+phase+'.'+packet.inputView+'.vectors.json')),packet.vectorPacketSha256);
  if(phase==='test'){assert.equal(result.testEncodingSha256,sha(await get('output/encoding-test.json')));assert.equal(result.testCaptureSha256,encoding.captureSha256);assert.equal(encoding.selectedReceiptSha256,selection.receiptSha256);}
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
 for(const [name,b]of snapshots)assert.equal(sha(await stored(name)),sha(b),'Stored audit evidence changed');
 return {schema:'expanded-root-stored-audit/v1',freezeHash,filesChecked:snapshots.size,modelExecution:false,captureExecution:false,productionValidated:false};
}
export async function runCli(args){
 if(!args.length)return 'inert';assert.deepEqual(args,['--verify']);const result=await verifyStored();process.stdout.write(JSON.stringify(result)+'\n');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runCli(process.argv.slice(2));
