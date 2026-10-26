// Default inert. New ROOT-only fits on fixed, previously consumed TRAIN/CAL vectors.
// No encoder, browser, network, database or old final-outcome loader exists here.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {lstat,realpath,writeFile} from 'node:fs/promises';
import {HERE,INPUTS,ENCODER_HASH,CAPACITY_HASH,V3_HASH,sha,digest,boundedBytes,inputBytes,sourceLedger,recheckLedger,targetProfileLedger,validateLabelSeal} from './manifest.js';
import {CURRENT_WEIGHT_ORDER,selectCurrentCandidate,currentTransferWorkPreflight} from './methods.js';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../../../src/domain/hierarchical-e5-paired-input.js';
import {trainHierarchyLinearHeads,compileHierarchyLinearHeads,scoreHierarchyLinearHeads} from '../../../src/domain/hierarchical-e5-paired-linear-heads.js';
import {fitPooledRootRankPolicy,rankRootScores} from '../hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js';
import {parseVectorPacket} from '../hierarchical-e5-broad-heads-v1/vector-packet.js';
import {compileBuilderScopedRootRankCandidate,describeBuilderScopedRootRankCandidate} from '../builder-scoped-root-rank-candidate-v1/scorer.js';
const HEX=/^[a-f0-9]{64}$/u;
const checkHash=v=>assert.ok(typeof v==='string'&&HEX.test(v));
function plain(v){assert.ok(v&&typeof v==='object'&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Object.prototype);return v;}
function dense(v,n){assert.ok(!types.isProxy(v)&&Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length===n&&Reflect.ownKeys(v).length===n+1);
 return Array.from({length:n},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));assert.ok(d?.enumerable&&Object.hasOwn(d,'value'));return d.value;});}
function data(v,k){plain(v);const d=Object.getOwnPropertyDescriptor(v,k);assert.ok(d?.enumerable&&Object.hasOwn(d,'value'));return d.value;}
function string(v){assert.ok(typeof v==='string'&&v.length>0&&v.length<=160&&v.isWellFormed()&&!/[\u0000-\u001f\u007f]/u.test(v));return v;}
export function cohortContract(input){
 const [eligibility,trainingGold,calibrationGold,expansionGold,oldEncoding,expansionEncoding]=['eligibility','trainingGold','calibrationGold','expansionGold','oldEncoding','expansionEncoding'].map(k=>data(input,k));
 assert.equal(data(eligibility,'eligible'),true);assert.equal(data(eligibility,'totalTrainingRows'),127);
 const training=dense(data(eligibility,'eligibleTraining'),127).map(r=>({id:string(data(r,'id')),groupId:string(data(r,'groupId')),expectedRootId:string(data(r,'expectedRootId')),language:string(data(r,'language')),sourceInputHash:data(r,'sourceInputHash')}));
 training.forEach(r=>checkHash(r.sourceInputHash));assert.equal(digest(training),data(eligibility,'eligibleCohortHash'));
 const oldGold=dense(data(trainingGold,'cases'),48),calGold=dense(data(calibrationGold,'cases'),48);
 const expansion=dense(data(expansionGold,'cases'),112).filter(r=>data(r,'split')==='training');assert.equal(expansion.length,80);
 const originals=new Map([...oldGold,...expansion].map(r=>[data(r,'id'),r]));assert.equal(originals.size,128);
 for(const r of training){const gold=originals.get(r.id);assert.ok(gold);assert.equal(data(gold,'split'),'training');assert.equal(data(gold,'entityGroup'),r.groupId);assert.equal(data(gold,'expectedRootId'),r.expectedRootId);assert.equal(data(gold,'language'),r.language);}
 const flags=[...dense(data(oldEncoding,'cases'),96),...dense(data(expansionEncoding,'cases'),80)],byId=new Map(flags.map(r=>[data(r,'id'),r]));assert.equal(byId.size,176);
 const calibration=calGold.map(g=>({id:string(data(g,'id')),groupId:string(data(g,'entityGroup')),expectedRootId:string(data(g,'expectedRootId')),language:string(data(g,'language')),sourceInputHash:data(byId.get(data(g,'id')),'sourceInputHash')}));
 const ids=new Set(),groups=new Set(),roots=new Map();
 for(const r of [...training,...calibration]){assert.ok(!ids.has(r.id)&&!groups.has(r.groupId));ids.add(r.id);groups.add(r.groupId);checkHash(r.sourceInputHash);
  const flag=byId.get(r.id);assert.equal(data(flag,'current-static'),true);assert.equal(data(flag,'sourceInputHashScope'),'captured-public-input');assert.equal(data(flag,'sourceInputHash'),r.sourceInputHash);
  if(training.includes(r))roots.set(r.expectedRootId,(roots.get(r.expectedRootId)??0)+1);
 }
 assert.equal(roots.size,16);assert.ok([...roots.values()].every(n=>n>=6));
 assert.ok(calibration.every(r=>roots.has(r.expectedRootId)));assert.equal(training.filter(r=>r.id.startsWith('real-train-')).length,48);
 assert.equal(training.filter(r=>r.id.startsWith('root-expansion-train-')).length,79);
 return {training,calibration};
}
export function encodingContract(input){
 const [oldEncoding,expansionEncoding,eligibility,oldPacket,expansionPacket]=['oldEncoding','expansionEncoding','eligibility','oldPacket','expansionPacket'].map(k=>data(input,k));
 assert.equal(oldEncoding.freezeHash,V3_HASH);assert.equal(oldEncoding.phase,'traincal');assert.equal(oldEncoding.captureStatus,'complete');assert.equal(oldEncoding.encoderCalls,288);
 assert.equal(expansionEncoding.freezeHash,CAPACITY_HASH);assert.equal(expansionEncoding.phase,'training-expansion');assert.equal(expansionEncoding.captureStatus,'complete');assert.equal(expansionEncoding.encoderCalls,237);
 assert.equal(expansionEncoding.eligibilityReceiptSha256,INPUTS.eligibility[1]);assert.equal(expansionEncoding.eligibleCohortHash,eligibility.eligibleCohortHash);
 assert.deepEqual(expansionEncoding.encodedViews,['current-static','wikipedia-prose-lead']);
 for(const [receipt,packet,count,expectedFreeze,expectedSha]of [[oldEncoding,oldPacket,96,V3_HASH,INPUTS.oldVectors[1]],[expansionEncoding,expansionPacket,79,CAPACITY_HASH,INPUTS.expansionVectors[1]]]){
  const specs=dense(receipt.packets,2);assert.equal(specs[0].inputView,'current-static');assert.equal(specs[1].inputView,'wikipedia-prose-lead');assert.equal(specs[0].rows,count);assert.equal(specs[0].vectorPacketSha256,expectedSha);
  assert.equal(packet.freezeHash,expectedFreeze);assert.equal(packet.encoderHash,ENCODER_HASH);
  const expectedIds=receipt.cases.filter(r=>r['current-static']).map(r=>r.id);assert.equal(expectedIds.length,count);assert.deepEqual(packet.vectors.map(r=>r.id),expectedIds);
 }
}
async function absent(path){try{await lstat(path);assert.fail('Existing evidence prohibits replay');}catch(e){if(e.code!=='ENOENT')throw e;}}
async function write(name,value){const b=Buffer.from(JSON.stringify(value));assert.ok(b.length<=4*1024*1024);await writeFile(resolve(HERE,'output',name),b,{flag:'wx'});return sha(b);}
async function handshake(){assert.equal(process.platform,'win32');assert.equal(process.env.MURMINGLE_CURRENT_ROOT_FIT_V1_SUPERVISED,'fit-current');
 await new Promise((yes,no)=>{let s='';const timer=setTimeout(()=>no(Error('handshake-timeout')),5000);process.stdin.on('data',b=>{s+=b.toString('ascii');if(s==='CURRENT_ROOT_FIT_JOB_ASSIGNED_V1\n'){clearTimeout(timer);process.stdin.pause();yes();}else if(s.length>=33){clearTimeout(timer);no(Error('invalid-handshake'));}});process.stdin.on('end',()=>{if(s!=='CURRENT_ROOT_FIT_JOB_ASSIGNED_V1\n')no(Error('invalid-handshake'));});});}
export async function fitCurrent(){
 await handshake();const started=performance.now(),guard=()=>assert.ok(performance.now()-started<165000);
 assert.ok(/^D:/iu.test(HERE));const initial=await sourceLedger(),protocolBytes=await boundedBytes('protocol.json');assert.equal(sha(protocolBytes),initial['protocol.json']);const protocol=JSON.parse(protocolBytes);
 assert.equal(protocol.contractStatus,'ready');checkHash(protocol.labelSealSha256);assert.deepEqual(protocol.bodyWeights,CURRENT_WEIGHT_ORDER);assert.equal(protocol.lambda,.1);
 const fb=await boundedBytes('freeze.json'),f=JSON.parse(fb),{freezeHash,...material}=f;
 assert.equal(f.schema,'current-producer-root-fit-freeze/v1');assert.equal(digest(material),freezeHash);assert.deepEqual(f.sourceHashes,initial);assert.equal(f.protocolSha256,initial['protocol.json']);
 const buffers={},inputLedger={};for(const key of Object.keys(INPUTS)){buffers[key]=await inputBytes(key);inputLedger[INPUTS[key][0]]=INPUTS[key][1];}
 const parsed=Object.fromEntries(Object.entries(buffers).filter(([key])=>!key.endsWith('Vectors')).map(([key,b])=>[key,JSON.parse(b)]));
 const profiles=await targetProfileLedger();assert.deepEqual(f.targetSourceHashes,profiles.ledger);assert.equal(f.profileRecipeHash,profiles.profiles.recipeHash);
 assert.equal(protocol.candidateSha256,INPUTS.candidate[1]);assert.equal(protocol.labelSealSha256,INPUTS.labelSeal[1]);
 const devLedger=await validateLabelSeal(parsed.candidate,parsed.labelSeal);
 const allLedger={...initial,...inputLedger,...profiles.ledger,...devLedger,'freeze.json':sha(fb)};
 const output=resolve(HERE,'output'),outputInfo=await lstat(output);assert.ok(outputInfo.isDirectory()&&!outputInfo.isSymbolicLink());assert.equal((await realpath(output)).toLowerCase(),output.toLowerCase());
 for(const name of ['fit-current.started.json','root-model.json','root-policy.json','input-definition.json','selection.json','selection-receipt.json','fit-refused.json'])await absent(resolve(output,name));
 await write('fit-current.started.json',{schema:'current-producer-root-fit-started/v1',freezeHash,sourceHashes:initial,inputHashes:inputLedger,noAutomaticRetry:true});
 // Parse only the initially pinned buffers; a later reread cannot select the input.
 const oldPacket=parseVectorPacket(buffers.oldVectors),expansionPacket=parseVectorPacket(buffers.expansionVectors);
 encodingContract({...parsed,oldPacket,expansionPacket});const cohort=cohortContract(parsed);
 assert.equal(parsed.capacityFreeze.freezeHash,CAPACITY_HASH);assert.equal(parsed.oldFreeze.freezeHash,V3_HASH);assert.equal(parsed.capacityFreeze.encoderHash,ENCODER_HASH);assert.equal(parsed.oldFreeze.encoderHash,ENCODER_HASH);
 const nodes=parsed.capacityFreeze.manifestIdentity.rootNodes;assert.equal(nodes.length,16);assert.ok(nodes.every(n=>n.parentId===null));
 assert.deepEqual([...new Set(cohort.training.map(r=>r.expectedRootId))].sort(),nodes.map(n=>n.id).sort());
 const vectors=new Map([...oldPacket.vectors,...expansionPacket.vectors].map(r=>[r.id,r]));assert.equal(vectors.size,175);
 const reports=[],artifacts=[],preflight=currentTransferWorkPreflight(),totals={trainingWork:0,fusionCoordinateVisits:0,calibrationCoordinateProducts:0,rankWork:0};
 for(const bodyWeight of CURRENT_WEIGHT_ORDER){
  guard();const inputDefinition={bodyWeight,titleWeight:1-bodyWeight,encoderHash:ENCODER_HASH},adapter=compilePairedE5Input(inputDefinition),identity=describePairedE5Input(adapter);
  const trainingInputConstructionHash=digest({schema:'current-producer-reused-pruned-static-training/v1',inputView:'current-static',encoderHash:ENCODER_HASH,
   sourceBindingsHash:digest(inputLedger),eligibleCohortHash:parsed.eligibility.eligibleCohortHash,representationHash:identity.representationHash,bodyWeight,
   provenance:'reused-V3-and-ADR142-pruned-static-not-target-producer-attestation'});
  const fused=rows=>rows.map(r=>{const raw=vectors.get(r.id);assert.ok(raw);const result=applyPairedE5Input(adapter,{sourceId:r.id,sourceVersion:r.sourceInputHash,bodyVector:raw.bodyVector,titleVector:raw.titleVector});assert.equal(result.status,'available');totals.fusionCoordinateVisits+=384*8;return {...r,vector:result.vector};});
  const training=fused(cohort.training).map(r=>({id:r.id,groupId:r.groupId,split:'training',expectedTopicId:r.expectedRootId,vector:r.vector}));
  const model=trainHierarchyLinearHeads({nodes,rows:training,representation:identity.representation,representationHash:identity.representationHash,trainingVersion:freezeHash+'|'+bodyWeight,lambda:.1});
  totals.trainingWork+=model.trainingWork.units;assert.ok(model.heads.every(h=>h.enabled));assert.deepEqual(model.trainingIdHashes,cohort.training.map(r=>digestString(r.id)).sort());assert.deepEqual(model.trainingGroupHashes,cohort.training.map(r=>digestString(r.groupId)).sort());
  const compiled=compileHierarchyLinearHeads(model),modelHash=digest(model);
  const rows=fused(cohort.calibration).map(r=>{const scored=scoreHierarchyLinearHeads(compiled,{sourceId:r.id,sourceVersion:r.sourceInputHash,representation:identity.representation,representationHash:identity.representationHash,vector:r.vector});totals.calibrationCoordinateProducts+=scored.work.scalarProducts;return {id:r.id,groupId:r.groupId,expectedRootId:r.expectedRootId,scores:scored.scores.map(({nodeId,score})=>({nodeId,score}))};});
  const policy=fitPooledRootRankPolicy({modelHash,representationHash:identity.representationHash,inputConstructionHash:trainingInputConstructionHash,nodeIds:nodes.map(n=>n.id),rows});totals.rankWork+=policy.work.countedUnits;
  const rawRanks=rows.map(r=>({id:r.id,...rankRootScores({nodeIds:policy.nodeIds,scores:r.scores})}));totals.rankWork+=rawRanks.reduce((n,r)=>n+r.comparisonWork,0);
  const accepted=rawRanks.filter(r=>policy.enabled&&!r.tied&&r.winnerScore>=policy.minWinnerScore&&r.winnerGap>=policy.minWinnerGap);
  assert.equal(accepted.length,policy.acceptedGroups);assert.ok(accepted.every(r=>r.winnerId===rows.find(x=>x.id===r.id).expectedRootId));
  const rawCorrect=rawRanks.filter(r=>r.winnerId===rows.find(x=>x.id===r.id).expectedRootId).length;
  reports.push({bodyWeight,acceptedCorrect:policy.correctGroups,rawCorrect,modelHash,policyHash:policy.policyHash,trainingInputConstructionHash,representationHash:identity.representationHash,
   calibrationRows:rows,rawRanks,policy,trainingWork:model.trainingWork,trainingIdHashes:model.trainingIdHashes,trainingGroupHashes:model.trainingGroupHashes});artifacts.push({model,policy,inputDefinition});
 }
 for(const key of Object.keys(totals))assert.ok(totals[key]<=preflight[key]);
 const selectedIndex=selectCurrentCandidate(reports.map(({bodyWeight,acceptedCorrect,rawCorrect})=>({bodyWeight,acceptedCorrect,rawCorrect}))),selected=reports[selectedIndex],chosen=artifacts[selectedIndex];
 const candidate=compileBuilderScopedRootRankCandidate({schema:'builder-scoped-root-rank-candidate/v1',...{inputDefinition:chosen.inputDefinition,rootModel:chosen.model,rootPolicy:chosen.policy},trainingInputConstructionHash:selected.trainingInputConstructionHash,
  targetProfiles:profiles.profiles.targetProfiles.map(({producerId,inputConstructionHash,extractorVersions})=>({producerId,inputConstructionHash,extractorVersions}))});
 const transfer=describeBuilderScopedRootRankCandidate(candidate);guard();await recheckLedger(allLedger);
 const selectedModelSha256=await write('root-model.json',chosen.model),selectedPolicySha256=await write('root-policy.json',chosen.policy),selectedInputDefinitionSha256=await write('input-definition.json',chosen.inputDefinition);
 const report={schema:'current-producer-root-fit-report/v1',freezeHash,selectedIndex,candidates:reports,preflight,totals,inputHashes:inputLedger,targetProfiles:profiles.profiles,
  selectedModelSha256,selectedPolicySha256,selectedInputDefinitionSha256,transfer,trainingRows:127,calibrationRows:48,finalTestEvaluated:false,productionValidated:false,assignmentAuthority:false};
 const selectionSha256=await write('selection.json',report);guard();await recheckLedger(allLedger);
 if(!chosen.policy.enabled){await write('fit-refused.json',{reason:'no-supported-calibration-cut',selectionSha256});return;}
 // Receipt LAST. Its existence is the future collector's prospective gate.
 await write('selection-receipt.json',{schema:'current-producer-root-selection/v1',phase:'selected-before-final-transfer',finalTestEvaluated:false,
  freezeHash,freezeFileSha256:sha(fb),protocolSha256:initial['protocol.json'],selectionSha256,selectedIndex,bodyWeight:chosen.inputDefinition.bodyWeight,titleWeight:chosen.inputDefinition.titleWeight,lambda:.1,
  trainingInputConstructionHash:selected.trainingInputConstructionHash,eligibleCohortHash:parsed.eligibility.eligibleCohortHash,eligibilityReceiptSha256:INPUTS.eligibility[1],calibrationGoldSha256:INPUTS.calibrationGold[1],
  selectedModelSha256,modelJsonHash:selected.modelHash,selectedPolicySha256,policyHash:selected.policyHash,selectedInputDefinitionSha256,transferHash:transfer.transferHash,
  targetProfiles:profiles.profiles.targetProfiles,sourceBindingsHash:digest(allLedger),candidateSha256:protocol.candidateSha256,labelSealSha256:protocol.labelSealSha256,encoderHash:ENCODER_HASH,
  representationHash:selected.representationHash,inputView:'current-static',productionValidated:false,assignmentAuthority:false});
}
function digestString(s){return sha(s);}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length===2)console.log('No action. Reviewed freeze and explicit supervised --fit-current required.');
 else if(process.argv.length===3&&process.argv[2]==='--fit-current')await fitCurrent().catch(()=>{console.error('current-root-fit-failed');process.exitCode=1;});
 else {console.error('Unsupported fit mode');process.exitCode=1;}
}
