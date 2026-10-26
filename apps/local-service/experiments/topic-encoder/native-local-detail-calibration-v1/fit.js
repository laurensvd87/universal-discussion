// Pure prospective CAL fitting; no IO, encoding, saved artifacts or authority.
import {types} from 'node:util';
import {createHash} from 'node:crypto';
import {compileNativeRootRankCandidate,describeNativeRootRankCandidate,prepareNativeRootInput,classifyNativeRootRankCandidate} from '../native-root-rank-candidate-v1/scorer.js';
import {compileHierarchyLocalEvidence,describeHierarchyLocalEvidence,scoreHierarchyLocalEvidence} from '../../../src/domain/hierarchical-e5-local-evidence.js';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../../../src/domain/hierarchical-e5-paired-input.js';
import {compileNativeRootLocalDetailTransfer,describeNativeRootLocalDetailTransfer,classifyNativeRootLocalDetailTransfer} from '../../../src/domain/experimental/native-root-local-detail-transfer-v1/adapter.js';
import {assessCompleteHierarchyPredictions} from '../hierarchical-e5-complete-path-assessment-v1/assessment.js';

export const CALIBRATION_LIMITS=Object.freeze({nodes:12,trainingGroups:48,trainingCaseIds:512,references:512,calibrationGroups:48,
 views:96,depth:8,identifierUnits:160,languageUnits:32,copyUnits:400000,gridUnits:16000000,totalUnits:128000000,
 coordinateProducts:38928384,fusionCoordinateVisits:1179648});
export const CALIBRATION_GRID=Object.freeze({minSimilarity:Object.freeze(Array.from({length:15},(_,i)=>Number((.70+.02*i).toFixed(2)))),
 minRivalMargin:Object.freeze([0,.005,.01,.02,.03,.05]),minNegativeMargin:Object.freeze([0,.01,.03]),minSupport:2,minimumAcceptedPositiveGroups:3});
const L=CALIBRATION_LIMITS; // No durable handles or authority.
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export class NativeDetailCalibrationError extends TypeError{constructor(code){super('Invalid native detail calibration: '+code);this.name='NativeDetailCalibrationError';this.code=code;}}
const bad=(code='contract')=>{throw new NativeDetailCalibrationError(code);};
function record(v,keys){if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)bad();
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();out[k]=d.value;}return out;}
function array(v,max){if(!v||typeof v!=='object'||types.isProxy(v)||!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype)bad();
 const n=Object.getOwnPropertyDescriptor(v,'length').value;if(n>max)bad('capacity');if(Reflect.ownKeys(v).length!==n+1)bad();
 return Array.from({length:n},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();return d.value;});}
function id(v,max=160){if(typeof v!=='string'||!v.length||v.length>max||!v.isWellFormed()||v.trim()!==v||/[\p{Cc}\p{Cf}]/u.test(v))bad();return v;}
function language(v){id(v,32);if(!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(v))bad();return v;}
function observationRecord(v){if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype)bad();
 const d=Object.getOwnPropertyDescriptor(v,'status');if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();
 return record(v,d.value==='available'?['status','nativeInput']:['status']);}
function vector(v){const a=array(v,384);if(a.length!==384)bad();let norm=0;for(const x of a){if(typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>1)bad();norm+=x*x;}
 if(Math.abs(norm-1)>1e-5)bad();return Object.freeze(a);}
function bits(v){const b=new ArrayBuffer(384*8),d=new DataView(b);for(let i=0;i<384;i++)d.setFloat64(i*8,v[i],true);
 return createHash('sha256').update('native-detail-calibration-vector/binary64-le/384/v1\0').update(new Uint8Array(b)).digest('hex');}
function freeze(v){const todo=[v];while(todo.length){const x=todo.pop();if(!x||typeof x!=='object'||Object.isFrozen(x))continue;for(const c of Object.values(x))if(c&&typeof c==='object')todo.push(c);Object.freeze(x);}return v;}
// Only owner-validated artifact DTOs reach this bounded descriptor copy. Query
// records/vectors use exact schema-specific copies below instead.
function copyArtifact(value,budget={left:L.copyUnits},depth=0){
 if(--budget.left<0||depth>12)bad('copy-capacity');if(value===null||typeof value!=='object'){
  if(value!==null&&!['string','number','boolean'].includes(typeof value))bad();return value;}
 if(types.isProxy(value))bad();if(Array.isArray(value))return array(value,512).map(x=>copyArtifact(x,budget,depth+1));
 if(Object.getPrototypeOf(value)!==Object.prototype)bad();const keys=Reflect.ownKeys(value);if(keys.length>64)bad('copy-capacity');const out={};
 for(const k of keys){if(typeof k!=='string')bad();const d=Object.getOwnPropertyDescriptor(value,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();
  Object.defineProperty(out,k,{value:copyArtifact(d.value,budget,depth+1),enumerable:true,writable:true,configurable:true});}return out;
}
function integer(v,max,min=0){if(!Number.isSafeInteger(v)||Object.is(v,-0)||v<min||v>max)bad('capacity');return v;}
export function calibrationWorkPreflight(input){
 const a=record(input,['nodes','views','groups','references','rootHeads','localScoringUpperBound','localCompileUnits']);
 integer(a.nodes,12,1);integer(a.views,96);integer(a.groups,48);integer(a.references,512,1);integer(a.rootHeads,16,2);
 integer(a.localScoringUpperBound,4000000);integer(a.localCompileUnits,12000000);
 const gridUnits=a.nodes*(271*(a.views*36+a.groups*12+32)+a.groups*32); //270 cuts + disabled audit, ranking and cached truth.
 const coordinateProducts=2*a.views*(a.rootHeads+a.references)*384,fusionCoordinateVisits=2*a.views*6144;
 const assessmentUnits=128+18*(a.rootHeads+a.nodes)+96*a.views+2*48;
 const totalUnits=gridUnits+2*a.views*(a.localScoringUpperBound+a.rootHeads*384+64+6144)+3*a.localCompileUnits+assessmentUnits;
 if(gridUnits>L.gridUnits||totalUnits>L.totalUnits||coordinateProducts>L.coordinateProducts||fusionCoordinateVisits>L.fusionCoordinateVisits)bad('work-capacity');
 return freeze({gridUnits,totalUnits,coordinateProducts,fusionCoordinateVisits,assessmentUnits,localScoringUpperBound:a.localScoringUpperBound});
}
const INPUT_KEYS=['sourceId','sourceVersion','producerId','producerProfileHash','inputConstructionHash','extractorVersion','fieldBindings','nativeWitness',
 'rightsEvidenceHash','sourceInputHash','bodyVector','titleVector'];
const ARTIFACT_KEYS=['schema','representation','representationHash','inputConstructionHash','taxonomyVersion','evidenceVersion','calibrationVersion','calibrationStatus','nodes','examples','nodePolicies'];
function uniqueIds(raw,max){const values=array(raw,max).map(v=>id(v)),set=new Set(values);if(set.size!==values.length)bad('duplicate-provenance');return values;}
function counter(limit){return {units:0,add(n=1){this.units+=n;if(this.units>limit)bad('work-capacity');}};}
const prefix=(p,q)=>p.length<=q.length&&p.every((v,i)=>v===q[i]);
function nodeTruth(gold,path){if(gold.kind==='outside')return false;if(gold.path.includes(path.at(-1)))return true;
 return gold.kind==='prefix'&&prefix(gold.path,path)?null:false;}

// Scalar rule predicates only; trusted local owner supplies all actual features.
// No accepted-path, ancestor removal or LCA decoder is duplicated here.
function eligible(feature,similarities,cut,work){
 let support=0;for(const g of similarities){work.add();if(g.similarity>=cut.minSimilarity)support++;}
 work.add(6);const best=similarities[0]?.similarity??null;
 return best!==null&&support>=2&&(feature.negativeSimilarity===null||best>feature.negativeSimilarity&&best-feature.negativeSimilarity>=cut.minNegativeMargin)&&
  (feature.bestIncompatiblePositive===null||best-feature.bestIncompatiblePositive>=cut.minRivalMargin);
}
function auditCut(groups,node,cut,work,enabled=true){
 const out={groups:groups.length,allAcceptedGroups:0,acceptedPositiveGroups:0,knownWrongGroups:0,uncheckedAcceptedGroups:0,
  groupsWithUnavailableViews:0,groupsWithZeroFusionViews:0,stopAnyAcceptedGroups:0,stopEndpointGroups:0,stopKnownDescendantGroups:0,
  stopWrongGroups:0,stopUncheckedGroups:0};
 for(const group of groups){work.add(8);const truth=group.truth;let anyMember=false,anyStop=false,allMember=true,allStop=true,unavailable=false,zero=false;
  for(const row of group.rows){work.add(4);const f=row.features?.get(node.id);
   if(!f){allMember=allStop=false;unavailable||=row.observation.status==='unavailable';zero||=row.zeroFusion;continue;}
   const member=enabled&&eligible(f,f.positiveSimilarities,cut,work),stop=enabled&&eligible(f,f.stopSimilarities,cut,work);
   anyMember||=member;anyStop||=stop;allMember&&=member;allStop&&=stop;
  }
  if(unavailable)out.groupsWithUnavailableViews++;if(zero)out.groupsWithZeroFusionViews++;
  const accepted=anyMember||anyStop;if(accepted)out.allAcceptedGroups++;
  if(truth===true&&allMember)out.acceptedPositiveGroups++;
  if(truth===false&&accepted)out.knownWrongGroups++;
  if(truth===null&&accepted)out.uncheckedAcceptedGroups++;
  if(anyStop){out.stopAnyAcceptedGroups++;if(truth===false)out.stopWrongGroups++;if(truth===null)out.stopUncheckedGroups++;
   if(group.knownDescendant)out.stopKnownDescendantGroups++;}
  if(allStop&&group.completeEndpoint)out.stopEndpointGroups++;
 }
 return {...out,determinateAcceptedGroups:out.allAcceptedGroups-out.uncheckedAcceptedGroups,
  allAcceptedFullySupportedFraction:out.allAcceptedGroups?out.acceptedPositiveGroups/out.allAcceptedGroups:null,
  validatedPrecision:null,uncheckedTruthIsNotCorrect:true};
}
const rank=(audit,cut)=>[audit.acceptedPositiveGroups,audit.stopEndpointGroups,-audit.stopKnownDescendantGroups,
 cut.minSimilarity,cut.minRivalMargin,cut.minNegativeMargin];
function higher(a,b){for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;}

export function fitNativeLocalDetailCalibration(input){
 if(arguments.length!==1)bad();const a=record(input,['schema','rootCandidate','detailTemplate','trainingCaseIds','trainingGroupIds','cases']);
 if(a.schema!=='native-local-detail-calibration/v1')bad();const t=record(a.detailTemplate,['artifact','inputDefinition','supportedRootIds']),artifact=record(t.artifact,ARTIFACT_KEYS);
 array(artifact.nodes,12);array(artifact.examples,512);const rawRows=array(a.cases,96);if(!rawRows.length)bad();
 const trainIds=uniqueIds(a.trainingCaseIds,512),trainGroups=uniqueIds(a.trainingGroupIds,48);
 // Owner validation before the private artifact copy; no query scoring yet.
 const root=compileNativeRootRankCandidate(a.rootCandidate),r=describeNativeRootRankCandidate(root);
 const seed=compileHierarchyLocalEvidence(t.artifact),local=describeHierarchyLocalEvidence(seed),paired=compilePairedE5Input(t.inputDefinition),p=describePairedE5Input(paired);
 const templateCopy=copyArtifact(t.artifact),rootCopy=copyArtifact(a.rootCandidate),definition=copyArtifact(t.inputDefinition),supported=uniqueIds(t.supportedRootIds,16);
 // Delegate all composition/namespace/subset checks, without query execution.
 compileNativeRootLocalDetailTransfer({schema:'native-root-local-detail-transfer/v1',rootCandidate:rootCopy,detail:{artifact:templateCopy,inputDefinition:definition,supportedRootIds:supported}});
 const referenceGroups=[...new Set(templateCopy.examples.map(e=>e.groupId))].sort();
 if(digest(referenceGroups)!==digest([...trainGroups].sort()))bad('training-groups');
 const forbiddenIds=new Set([...trainIds,...templateCopy.examples.map(e=>e.id)]),forbiddenGroups=new Set(trainGroups),caseIds=new Set(),groupMap=new Map();
 const fullNodes=r.nodeIds.map(id=>({id,parentId:null}));for(const n of templateCopy.nodes){const prior=fullNodes.find(v=>v.id===n.id);
  if(prior){if(prior.parentId!==n.parentId)bad('taxonomy');}else fullNodes.push({...n});}
 const byId=new Map(fullNodes.map(n=>[n.id,n])),paths=new Map();for(const n of fullNodes){let cur=n;const path=[];while(cur){if(path.includes(cur.id)||path.length>=8)bad('taxonomy');path.unshift(cur.id);
  cur=cur.parentId===null?null:byId.get(cur.parentId);if(cur===undefined)bad('taxonomy');}paths.set(n.id,path);}
 const rows=rawRows.map(raw=>{
  const c=record(raw,['id','groupId','language','gold','observation']);id(c.id);id(c.groupId);language(c.language);
  if(caseIds.has(c.id)||forbiddenIds.has(c.id)||forbiddenGroups.has(c.groupId))bad('split-overlap');caseIds.add(c.id);
  const g=record(c.gold,['kind','path']);if(!['complete','prefix','outside'].includes(g.kind))bad('gold');const path=array(g.path,8).map(v=>id(v));
  if(g.kind==='outside'?path.length!==0:!path.length||digest(path)!==digest(paths.get(path.at(-1))??null))bad('gold-path');
  const gold={kind:g.kind,path},prior=groupMap.get(c.groupId);if(prior&&digest(prior.gold)!==digest(gold))bad('group-truth');
  if(!prior){if(groupMap.size>=48)bad('capacity');groupMap.set(c.groupId,{groupId:c.groupId,gold,rows:[]});}
  const tag=observationRecord(c.observation);
  let observation;if(tag.status==='available'){
   const native=record(tag.nativeInput,INPUT_KEYS),{sourceInputHash,bodyVector,titleVector,...metadata}=native,prepared=prepareNativeRootInput(root,metadata);
   if(native.sourceId!==c.id||sourceInputHash!==prepared.sourceInputHash)bad('native-case-binding');
   observation={status:'available',nativeInput:freeze({...prepared,bodyVector:vector(bodyVector),titleVector:vector(titleVector)})};
  }else if(tag.status==='unavailable')observation={status:'unavailable'};else bad('observation-status');
  const row={id:c.id,groupId:c.groupId,language:c.language,gold,observation,features:null,zeroFusion:false};groupMap.get(c.groupId).rows.push(row);return row;
 });
 const groups=[...groupMap.values()],preflight=calibrationWorkPreflight({nodes:local.nodes.length,views:rows.length,groups:groups.length,
  references:local.examples,rootHeads:r.nodeIds.length,localScoringUpperBound:local.scoringPreflightUpperBound,localCompileUnits:local.compileWork});
 const gridWork=counter(preflight.gridUnits),totalWork=counter(preflight.totalUnits);
 let coordinateProducts=0,fusionCoordinateVisits=0,rawLocalUnits=0,rawLocalDots=0,rawAvailable=0,zeroFusion=0,rootAssigned=0,rootUnresolved=0;
 const associations=[],gridHash=digest(CALIBRATION_GRID),templateHash=local.artifactHash;
 const chargeRoot=decision=>{coordinateProducts+=decision.work.headScalarProducts;fusionCoordinateVisits+=decision.work.fusionCoordinateVisitUpperBound;
  totalWork.add(decision.work.headScalarProducts+decision.work.rankComparisonWork+decision.work.fusionCoordinateVisitUpperBound);};
 for(const row of rows){
  const base={id:row.id,groupId:row.groupId,language:row.language,gold:row.gold};
  if(row.observation.status==='unavailable'){associations.push({...base,observation:{status:'unavailable'}});continue;}
  const native=row.observation.nativeInput,rootDecision=classifyNativeRootRankCandidate(root,native);chargeRoot(rootDecision);
  rootDecision.status==='candidate'?rootAssigned++:rootUnresolved++;
  const fused=applyPairedE5Input(paired,{sourceId:native.sourceId,sourceVersion:native.sourceVersion,bodyVector:native.bodyVector,titleVector:native.titleVector});
  fusionCoordinateVisits+=3072;totalWork.add(3072);
  const binding={...base,nativeSourceInputHash:native.sourceInputHash,rootSemanticWitnessHash:rootDecision.semanticWitnessHash,
   nativeWitnessHash:rootDecision.witness.nativeWitnessHash,rightsEvidenceHash:native.rightsEvidenceHash,vectorBindings:rootDecision.vectorBindings,
   detailDerivedVectorHash:fused.status==='available'?bits(fused.vector):null,templateArtifactHash:templateHash};
  let rawFeatureHash=null;if(fused.status==='available'){
   const queryHash=digest({schema:'native-detail-raw-calibration-query/v1',binding});
   const features=scoreHierarchyLocalEvidence(seed,{sourceId:'numeric-cal-'+queryHash,sourceVersion:'numeric-policy-'+templateHash,
    representation:p.representation,representationHash:p.representationHash,inputConstructionHash:local.inputConstructionHash,vector:fused.vector});
   row.features=new Map(features.nodes.map(n=>[n.nodeId,n]));rawAvailable++;rawFeatureHash=digest(features.nodes);
   rawLocalUnits+=features.work.countedUnits;rawLocalDots+=features.work.dotProducts;coordinateProducts+=features.work.coordinateProducts;totalWork.add(features.work.countedUnits);
  }else{row.zeroFusion=true;zeroFusion++;}
  associations.push({...base,observation:{status:'available',...binding,nativeSourceInputHash:native.sourceInputHash,rawFeatureHash,
   rawDetailStatus:row.zeroFusion?'zero-fusion':'scored',rootGate:{status:rootDecision.status,supportedPath:rootDecision.supportedPath,reason:rootDecision.reason}}});
 }
 const featureCalibrationHash=digest({schema:'native-detail-feature-calibration-identity/v1',templateArtifactHash:templateHash,
  originalInputConstructionHash:local.inputConstructionHash,representationHash:local.representationHash,detailFusionDefinition:p.definition,
  rootTransferHash:r.transferHash,gridHash,trainingCaseIds:trainIds,trainingGroupIds:trainGroups,orderedAssociations:associations});
 const nodePolicies=[],nodeAudits=[];
 for(const node of local.nodes){let best=null,maximumZeroKnownWrongPositiveGroups=0;const path=paths.get(node.id);
  const nodeGroups=groups.map(g=>{gridWork.add(32);return {...g,truth:nodeTruth(g.gold,path),
   knownDescendant:g.gold.kind!=='outside'&&g.gold.path.includes(node.id)&&g.gold.path.at(-1)!==node.id,
   completeEndpoint:g.gold.kind==='complete'&&g.gold.path.at(-1)===node.id};});
  for(const minSimilarity of CALIBRATION_GRID.minSimilarity)for(const minRivalMargin of CALIBRATION_GRID.minRivalMargin)for(const minNegativeMargin of CALIBRATION_GRID.minNegativeMargin){
   const cut={minSupport:2,minSimilarity,minRivalMargin,minNegativeMargin},audit=auditCut(nodeGroups,node,cut,gridWork);gridWork.add(8);
   if(audit.knownWrongGroups===0)maximumZeroKnownWrongPositiveGroups=Math.max(maximumZeroKnownWrongPositiveGroups,audit.acceptedPositiveGroups);
   if(audit.knownWrongGroups||audit.stopWrongGroups||audit.acceptedPositiveGroups<3)continue;
   const ranking=rank(audit,cut);if(!best||higher(ranking,best.ranking))best={cut,audit,ranking};
  }
  const cut=best?.cut??{minSupport:2,minSimilarity:1,minRivalMargin:2,minNegativeMargin:2};
  nodePolicies.push({nodeId:node.id,enabled:best!==null,...cut});
  nodeAudits.push({nodeId:node.id,enabled:best!==null,selectedCut:best?.cut??null,maximumZeroKnownWrongPositiveGroups,
   selectedPolicyAudit:best?.audit??auditCut(nodeGroups,node,cut,gridWork,false),directStopEndpointSupportIndependentOfNodeSupport:true});
 }
 totalWork.add(gridWork.units);
 const calibratedArtifact={...templateCopy,calibrationVersion:'native-detail-cal-'+featureCalibrationHash,nodePolicies};
 const composite=compileNativeRootLocalDetailTransfer({schema:'native-root-local-detail-transfer/v1',rootCandidate:rootCopy,
  detail:{artifact:calibratedArtifact,inputDefinition:definition,supportedRootIds:supported}}),identity=describeNativeRootLocalDetailTransfer(composite);
 let finalLocalUnits=0,finalLocalDots=0,finalLocalEvaluated=0;
 const predictions=rows.map(row=>{
  if(row.observation.status==='unavailable')return {id:row.id,status:'unavailable',selectedPath:[]};
  const d=classifyNativeRootLocalDetailTransfer(composite,row.observation.nativeInput);
  coordinateProducts+=d.work.rootHeadCoordinateProducts+d.work.detailCoordinateProducts;fusionCoordinateVisits+=d.work.fusionCoordinateVisitUpperBound;
  totalWork.add(d.work.rootHeadCoordinateProducts+d.work.rootRankComparisons+d.work.localCountedUnits+d.work.fusionCoordinateVisitUpperBound);
  finalLocalUnits+=d.work.localCountedUnits;finalLocalDots+=d.work.detailDotProducts;if(d.detailEvaluated)finalLocalEvaluated++;
  return {id:row.id,status:d.status==='candidate'?'assigned':'unresolved',selectedPath:d.supportedPath};
 });
 const assessment=assessCompleteHierarchyPredictions({nodes:fullNodes,cases:rows.map(c=>({id:c.id,groupId:c.groupId,language:c.language,gold:c.gold})),
  predictions,trainingGroupIds:trainGroups,calibrationGroupIds:[]});
 totalWork.add(3*local.compileWork+assessment.work.membershipOperations);
 if(coordinateProducts>preflight.coordinateProducts||fusionCoordinateVisits>preflight.fusionCoordinateVisits)bad('work-capacity');
 return freeze({schema:'native-local-detail-calibration-result/v1',calibratedArtifact,artifactHash:identity.originalDetailArtifactHash,transferHash:identity.transferHash,
  templateArtifactHash:templateHash,originalInputConstructionHash:local.inputConstructionHash,representationHash:local.representationHash,
  featureCalibrationHash,gridHash,calibrationAssociationsHash:digest(associations),nodeAudits,
  goldTaxonomyScope:'approved-native-root-IDs-union-local-forest-only',goldTaxonomyHash:digest(fullNodes),fullHouseTaxonomyClaim:false,
  availability:{cases:rows.length,groups:groups.length,inputAvailable:rows.filter(v=>v.observation.status==='available').length,
   inputUnavailable:rows.filter(v=>v.observation.status==='unavailable').length,rawDetailScored:rawAvailable,rawDetailZeroFusion:zeroFusion},
  rootGate:{accepted:rootAssigned,unresolved:rootUnresolved,rootCutsRetuned:false,rawDetailIncludesRootRejected:true},
  finalCalibrationAudit:{phase:'calibration-resubstitution-not-independent-validation',detailEvaluated:finalLocalEvaluated,assessment},
  work:{preflight,gridUnits:gridWork.units,totalScopedUnits:totalWork.units,coordinateProducts,fusionCoordinateVisits,
   rawLocalUnits,finalLocalUnits,rawLocalDotProducts:rawLocalDots,finalLocalDotProducts:finalLocalDots,localCompileUnits:3*local.compileWork,localCompileCalls:3,
   scope:'charged rule/group loops, trusted query scoring, scoped fusion, three local compiles and final assessment; not root compile or all validation/copy/hash/serialization or encoding'},
  provenanceScope:'supplied-ordered-metadata-and-binary64-bindings-not-native-or-editorial-attestation',queryVectorsReturned:false,
  experimental:true,developmentOnly:true,independentValidation:false,productionValidated:false,assignmentAuthority:false});
}
