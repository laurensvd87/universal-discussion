// Generic numeric membership task. The one-node model is NOT a root taxonomy.
// Pure functions only: no encoding, acquisition, IO or assignment authority.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {trainHierarchyLinearHeads,compileHierarchyLinearHeads} from './hierarchical-e5-paired-linear-heads.js';
import {calibrateHierarchyHeadPolicy,compileHierarchyHeadAssignment,classifyHierarchyHeads} from './hierarchical-e5-observed-head-policy.js';

export const BINARY_DETAIL_LIMITS=Object.freeze({dimensions:384,trainingRows:384,calibrationRows:128,pathDepth:8,copyValues:100000,
 minimumTrainingPositiveGroups:2,minimumTrainingNegativeGroups:2,minimumCalibrationPositiveGroups:3,minimumCalibrationNegativeGroups:3,lambda:.1});
const L=BINARY_DETAIL_LIMITS,SCHEMA='hierarchy-binary-detail/v1',SCOPE='membership-not-root-taxonomy',handles=new WeakMap();
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=()=>{throw new TypeError('Invalid binary hierarchy detail task');};
function copy(value,budget={left:L.copyValues},depth=0){
 if(--budget.left<0||depth>16)fail();
 if(value===null||typeof value==='boolean')return value;
 if(typeof value==='number'){if(!Number.isFinite(value))fail();return value;}
 if(typeof value==='string'){if(value.length>1024||!value.isWellFormed())fail();return value;}
 if(!value||typeof value!=='object'||types.isProxy(value))fail();
 const array=Array.isArray(value);if(Object.getPrototypeOf(value)!==(array?Array.prototype:Object.prototype))fail();
 const keys=Reflect.ownKeys(value),result=array?[]:{};
 if(array){const length=Object.getOwnPropertyDescriptor(value,'length').value;if(length>4096||keys.length!==length+1)fail();
  for(let i=0;i<length;i++){const field=Object.getOwnPropertyDescriptor(value,String(i));if(!field?.enumerable||!Object.hasOwn(field,'value'))fail();result.push(copy(field.value,budget,depth+1));}
 }else for(const key of keys){if(typeof key!=='string'||key==='__proto__'||key==='constructor'||key==='prototype')fail();const field=Object.getOwnPropertyDescriptor(value,key);if(!field?.enumerable||!Object.hasOwn(field,'value'))fail();result[key]=copy(field.value,budget,depth+1);}
 return result;
}
function record(value,fields){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==fields.length||fields.some(key=>!Object.hasOwn(value,key)))fail();return value;}
function id(value){if(typeof value!=='string'||!value.length||value.length>160||value.trim()!==value||/[\p{Cc}\p{Cf}]/u.test(value))fail();return value;}
function sha(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/u.test(value))fail();return value;}
function list(value,max){if(!Array.isArray(value)||value.length>max)fail();return value;}
function vector(value){const v=list(value,384);if(v.length!==384)fail();let norm=0;for(const coordinate of v){if(typeof coordinate!=='number'||!Number.isFinite(coordinate)||Math.abs(coordinate)>1)fail();norm+=coordinate*coordinate;}if(Math.abs(norm-1)>1e-5)fail();return v;}
function metadata(a){
 id(a.nodeId);id(a.trainingVersion);sha(a.representationHash);if(a.representation!=='paired-raw-e5-body-title-v1')fail();
 list(a.canonicalPath,L.pathDepth).forEach(id);if(a.canonicalPath.length<2||a.canonicalPath.at(-1)!==a.nodeId||new Set(a.canonicalPath).size!==a.canonicalPath.length)fail();
}
function rosterRows(rows,calibration,ids,groups){
 const raw=list(rows,calibration?L.calibrationRows:L.trainingRows),roster=[],known=[];
 for(const value of raw){const r=record(value,calibration?['id','groupId','vector','label','language']:['id','groupId','vector','label']);id(r.id);id(r.groupId);vector(r.vector);if(calibration)id(r.language);
  if(r.label!==null&&typeof r.label!=='boolean'||ids.has(r.id)||groups.has(r.groupId))fail();ids.add(r.id);groups.add(r.groupId);
  roster.push({idHash:hash(r.id),groupHash:hash(r.groupId),label:r.label});if(r.label!==null)known.push(r);
 }
 return {roster,known};
}
function counts(roster){return {positiveGroups:roster.filter(r=>r.label===true).length,negativeGroups:roster.filter(r=>r.label===false).length,
 unknownGroups:roster.filter(r=>r.label===null).length,omittedIdHashes:roster.filter(r=>r.label===null).map(r=>r.idHash).sort(),omittedGroupHashes:roster.filter(r=>r.label===null).map(r=>r.groupHash).sort()};}
function expectedState(cohorts,policy){
 const training=counts(cohorts.training),calibration=counts(cohorts.calibration),trainEnough=training.positiveGroups>=2&&training.negativeGroups>=2,calEnough=calibration.positiveGroups>=3&&calibration.negativeGroups>=3;
 const rule=policy?.rules[0],eligible=trainEnough&&calEnough&&rule?.enabled===true;
 const reason=!trainEnough?'insufficient-known-training-support':!calEnough?'insufficient-known-calibration-support':eligible?'development-calibration-cut-accepted':'no-error-free-calibration-cut';
 return {eligible,reason,audit:{training,calibration:{...calibration,acceptedKnownPositiveGroups:rule?.correctGroups??0,acceptedKnownNegativeGroups:rule?(rule.acceptedGroups-rule.correctGroups):0},
  minimumTrainingPositiveGroups:2,minimumTrainingNegativeGroups:2,minimumCalibrationPositiveGroups:3,minimumCalibrationNegativeGroups:3,unknownRowsOmittedNotNegative:true,validatedPrecision:null}};
}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}

/** Null labels are explicitly omitted and audited, never negative targets. */
export function trainBinaryHierarchyDetail(input){
 if(arguments.length!==1)fail();const a=record(copy(input),['nodeId','canonicalPath','representation','representationHash','trainingVersion','trainingRows','calibrationRows']);metadata(a);
 const ids=new Set(),groups=new Set(),training=rosterRows(a.trainingRows,false,ids,groups),calibration=rosterRows(a.calibrationRows,true,ids,groups),cohorts={training:training.roster,calibration:calibration.roster};
 let model=null,policy=null;const initial=expectedState(cohorts,null);
 if(initial.audit.training.positiveGroups>=2&&initial.audit.training.negativeGroups>=2){
  model=trainHierarchyLinearHeads({nodes:[{id:a.nodeId,parentId:null}],rows:training.known.map(r=>({id:r.id,groupId:r.groupId,split:'training',expectedTopicId:r.label?a.nodeId:null,vector:r.vector})),
   representation:a.representation,representationHash:a.representationHash,trainingVersion:a.trainingVersion,lambda:L.lambda});
  if(initial.audit.calibration.positiveGroups>=3&&initial.audit.calibration.negativeGroups>=3)policy=calibrateHierarchyHeadPolicy({model,
   rows:calibration.known.map(r=>({id:r.id,groupId:r.groupId,split:'calibration',language:r.language,expectedTopicId:r.label?a.nodeId:null,vector:r.vector})),minimumAcceptedGroups:3,targetPrecision:1});
 }
 const state=expectedState(cohorts,policy),body={schema:SCHEMA,taskScope:SCOPE,nodeId:a.nodeId,canonicalPath:a.canonicalPath,representation:a.representation,representationHash:a.representationHash,
  trainingVersion:a.trainingVersion,cohorts,model,policy,...state,developmentOptimizationOnly:true,independentValidation:false,productionValidated:false,assignmentAuthority:false};
 return freeze({...body,artifactHash:digest(body)});
}

function roster(input,max,ids,groups){
 return list(input,max).map(value=>{const row=record(value,['idHash','groupHash','label']);sha(row.idHash);sha(row.groupHash);if(row.label!==null&&typeof row.label!=='boolean'||ids.has(row.idHash)||groups.has(row.groupHash))fail();ids.add(row.idHash);groups.add(row.groupHash);return row;});
}
const knownHashes=(rows,key)=>rows.filter(row=>row.label!==null).map(row=>row[key]).sort();
/** Validates numeric provenance joins, not real-world editorial independence. */
export function compileBinaryHierarchyDetail(input){
 if(arguments.length!==1)fail();const raw=copy(input),a=record(raw,['schema','taskScope','nodeId','canonicalPath','representation','representationHash','trainingVersion','cohorts','model','policy','eligible','reason','audit','developmentOptimizationOnly','independentValidation','productionValidated','assignmentAuthority','artifactHash']);metadata(a);
 const {artifactHash,...body}=a;sha(artifactHash);if(a.schema!==SCHEMA||a.taskScope!==SCOPE||a.developmentOptimizationOnly!==true||a.independentValidation!==false||a.productionValidated!==false||a.assignmentAuthority!==false||digest(body)!==artifactHash)fail();
 record(a.cohorts,['training','calibration']);const ids=new Set(),groups=new Set();roster(a.cohorts.training,L.trainingRows,ids,groups);roster(a.cohorts.calibration,L.calibrationRows,ids,groups);
 const training=counts(a.cohorts.training),calibration=counts(a.cohorts.calibration),trainEnough=training.positiveGroups>=2&&training.negativeGroups>=2,calEnough=calibration.positiveGroups>=3&&calibration.negativeGroups>=3;
 if((a.model!==null)!==trainEnough||(a.policy!==null)!==(trainEnough&&calEnough))fail();
 let assignment=null;
 if(a.model){
  compileHierarchyLinearHeads(a.model);
  if(a.model.nodes.length!==1||a.model.nodes[0].id!==a.nodeId||a.model.nodes[0].parentId!==null||a.model.heads.length!==1||a.model.heads[0].positiveGroups!==training.positiveGroups||a.model.heads[0].negativeGroups!==training.negativeGroups||
   a.model.lambda!==L.lambda||a.model.trainingVersion!==a.trainingVersion||a.model.representation!==a.representation||a.model.representationHash!==a.representationHash||
   digest(a.model.trainingIdHashes)!==digest(knownHashes(a.cohorts.training,'idHash'))||digest(a.model.trainingGroupHashes)!==digest(knownHashes(a.cohorts.training,'groupHash')))fail();
 }
 if(a.policy){
  assignment=compileHierarchyHeadAssignment({model:a.model,policy:a.policy});
  if(a.policy.minimumAcceptedGroups!==3||a.policy.targetPrecision!==1||a.policy.rules[0].correctGroups>calibration.positiveGroups||digest(a.policy.calibrationIdHashes)!==digest(knownHashes(a.cohorts.calibration,'idHash'))||digest(a.policy.calibrationGroupHashes)!==digest(knownHashes(a.cohorts.calibration,'groupHash')))fail();
 }
 const expected=expectedState(a.cohorts,a.policy);if(a.eligible!==expected.eligible||a.reason!==expected.reason||digest(a.audit)!==digest(expected.audit))fail();
 const identity=freeze({schema:SCHEMA,taskScope:SCOPE,nodeId:a.nodeId,canonicalPath:a.canonicalPath,representation:a.representation,representationHash:a.representationHash,artifactHash:a.artifactHash,
  eligible:a.eligible,reason:a.reason,audit:a.audit,developmentOptimizationOnly:true,independentValidation:false,productionValidated:false,assignmentAuthority:false});
 const handle=Object.freeze({});handles.set(handle,{assignment,identity});return handle;
}
export function describeBinaryHierarchyDetail(handle){const state=handles.get(handle);if(!state)fail();return state.identity;}

export function classifyBinaryHierarchyDetail(handle,input){
 if(arguments.length!==2)fail();const state=handles.get(handle);if(!state)fail();
 const q=record(copy(input),['sourceId','sourceVersion','representation','representationHash','vector','independentRootPath']);id(q.sourceId);id(q.sourceVersion);vector(q.vector);
 const root=list(q.independentRootPath,1);root.forEach(id);if(q.representation!==state.identity.representation||q.representationHash!==state.identity.representationHash)fail();
 let path=[...root],reason=!root.length?'independent-root-abstained':root[0]!==state.identity.canonicalPath[0]?'independent-root-mismatch':!state.identity.eligible?'binary-disabled':'binary-abstained',binaryEvaluated=false,detailAccepted=false;
 if(root.length&&root[0]===state.identity.canonicalPath[0]&&state.identity.eligible){
  binaryEvaluated=true;const decision=classifyHierarchyHeads(state.assignment,{sourceId:q.sourceId,sourceVersion:q.sourceVersion,representation:q.representation,representationHash:q.representationHash,vector:q.vector});
  if(decision.status==='assigned'&&decision.primaryNodeId===state.identity.nodeId&&decision.paths.length===1&&decision.paths[0].length===1&&decision.paths[0][0]===state.identity.nodeId){path=[...state.identity.canonicalPath];reason='binary-member-with-independent-root';detailAccepted=true;}
 }
 return freeze({schema:'hierarchy-binary-detail-decision/v1',taskScope:SCOPE,artifactHash:state.identity.artifactHash,status:path.length?'accepted':'abstained',rootId:path[0]??null,path,
  reason,binaryEvaluated,detailAccepted,independentRootPath:[...root],developmentOptimizationOnly:true,independentValidation:false,productionValidated:false,assignmentAuthority:false});
}
