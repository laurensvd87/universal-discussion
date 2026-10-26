// Unregistered ADR143 ROOT-ONLY transfer candidate. No fitting, IO or runtime hooks.
// Caller input/document/source IDs are claims, NOT canonical freshness, native
// document, rights or write attestations. Vector hashes bind actual validated
// binary64 input bits; they do not attest which producer created those vectors.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../../../src/domain/hierarchical-e5-paired-input.js';
import {compileHierarchyLinearHeads,scoreHierarchyLinearHeads} from '../../../src/domain/hierarchical-e5-paired-linear-heads.js';
import {compilePooledRootRankPolicy,rankRootScores} from '../hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js';

export const BUILDER_ROOT_RANK_LIMITS=Object.freeze({dimensions:384,maxRoots:16,maxTargetProfiles:2,maxExtractorVersions:2,
 maxStringUnits:160,maxCompileCopyItems:16384,maxHeadScalarProducts:6144,maxRankComparisonWork:64});
export class BuilderScopedRootRankError extends TypeError{
 constructor(code,message){super(message);this.name='BuilderScopedRootRankError';this.code=code;}
}
const bad=message=>{throw new BuilderScopedRootRankError('invalid-input',message);};
const capacity=message=>{throw new BuilderScopedRootRankError('capacity',message);};
const HEX=/^[a-f0-9]{64}$/u,handles=new WeakMap(),lex=(a,b)=>a<b?-1:a>b?1:0;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const MODEL_FIELDS=['schema','representation','representationHash','trainingVersion','trainingHash','taxonomyHash','settingsHash','parameterHash',
 'lambda','dimensions','trainingIdHashes','trainingGroupHashes','provenanceHash','experimental','productionValidated','assignmentAuthority','nodes','heads','trainingWork'];
const POLICY_FIELDS=['schema','modelHash','representationHash','inputConstructionHash','nodeIds','calibrationHash','minimumAcceptedGroups','enabled',
 'minWinnerScore','minWinnerGap','acceptedGroups','correctGroups','work','developmentOnly','perClassPrecisionGuaranteed','productionValidated','assignmentAuthority','policyHash'];
const INPUT_FIELDS=['sourceId','sourceVersion','sourceIncarnation','producerId','producerProfileHash','inputConstructionHash','extractorVersion','inputHash',
 'documentWitness','bodyVector','titleVector'];
function record(v,keys){
 if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype)bad('Expected plain data record');
 if(Reflect.ownKeys(v).length!==keys.length)bad('Unexpected record fields');
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(v,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad('Expected enumerable data fields');out[key]=d.value;}return out;
}
function list(v,max){
 if(!v||typeof v!=='object'||types.isProxy(v)||!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype)bad('Expected plain dense array');
 const n=Object.getOwnPropertyDescriptor(v,'length').value;if(n>max)capacity('Array capacity exceeded');
 if(Reflect.ownKeys(v).length!==n+1)bad('Sparse or extended array');
 return Array.from({length:n},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))bad('Expected array data fields');return d.value;});
}
function id(v){
 if(typeof v!=='string'||!v.length||v.trim()!==v||!v.isWellFormed()||/[\u0000-\u001f\u007f]/u.test(v))bad('Invalid identifier');
 if(v.length>160)capacity('Identifier capacity exceeded');return v;
}
function sha(v){if(typeof v!=='string'||!HEX.test(v))bad('Expected lowercase SHA-256');return v;}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
function copyValidated(v,budget={left:16384},depth=0){
 if(--budget.left<0||depth>8)capacity('Compile copy capacity exceeded');
 if(v===null||typeof v!=='object'){if(!['string','number','boolean'].includes(typeof v)&&v!==null)bad('Non-data artifact');return v;}
 if(types.isProxy(v))bad('Proxy artifact');
 if(Array.isArray(v))return list(v,384).map(x=>copyValidated(x,budget,depth+1));
 if(Object.getPrototypeOf(v)!==Object.prototype)bad('Non-plain artifact');
 const out={};for(const key of Reflect.ownKeys(v)){
  if(typeof key!=='string')bad('Symbol artifact key');
  const d=Object.getOwnPropertyDescriptor(v,key);if(!d.enumerable||!Object.hasOwn(d,'value'))bad('Accessor artifact');
  out[key]=copyValidated(d.value,budget,depth+1);
 }return out;
}
function vector(v){
 const out=list(v,384);if(out.length!==384)bad('Expected 384 coordinates');let norm=0;
 for(const n of out){if(typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1)bad('Invalid finite unit coordinate');norm+=n*n;}
 if(Math.abs(norm-1)>1e-5)bad('Expected unit vector without implicit renormalization');return out;
}
function vectorHash(v){
 const buffer=new ArrayBuffer(384*8),view=new DataView(buffer);
 for(let i=0;i<384;i++)view.setFloat64(i*8,v[i],true);
 return createHash('sha256').update('builder-root-input-vector/binary64-le/384/v1\0').update(new Uint8Array(buffer)).digest('hex');
}
function profile(input){
 const p=record(input,['producerId','inputConstructionHash','extractorVersions']);id(p.producerId);sha(p.inputConstructionHash);
 const expected=p.producerId==='current-static'?['crawler-static-html-prefix/v1']:
  p.producerId==='browser-current'?['article-container-prefix/v1','main-text-prefix/v1']:null;
 if(!expected)bad('Undeclared producer kind');
 const versions=list(p.extractorVersions,2).map(id).sort(lex);
 if(versions.length!==expected.length||versions.some((v,i)=>v!==expected[i]))bad('Producer extractor contract mismatch');
 const body={schema:'root-rank-target-producer-profile/v1',producerId:p.producerId,inputConstructionHash:p.inputConstructionHash,extractorVersions:versions};
 return freeze({...body,producerProfileHash:digest(body)});
}
function document(input,producerId){
 const keys=producerId==='current-static'?['kind','finalUrlHash','responseWitnessHash']:
  ['kind','finalUrlHash','frameId','loaderId','navigationId','documentId'];
 const d=record(input,keys);
 if(d.kind!==(producerId==='current-static'?'static-response':'browser-document'))bad('Producer/document kind mismatch');
 sha(d.finalUrlHash);if(producerId==='current-static')sha(d.responseWitnessHash);
 else for(const key of ['frameId','loaderId','navigationId','documentId'])id(d[key]);
 return d;
}
/** modelJsonHash uses the frozen policy's program JSON.stringify serialization,
 * preserving declared artifact property order. It is NOT JCS, file-byte SHA,
 * coefficient-bit attestation or proof of actual training/calibration quality. */
export function compileBuilderScopedRootRankCandidate(input){
 if(arguments.length!==1)bad('Expected one compile record');
 const a=record(input,['schema','inputDefinition','rootModel','rootPolicy','trainingInputConstructionHash','targetProfiles']);
 if(a.schema!=='builder-scoped-root-rank-candidate/v1')bad('Unknown candidate schema');sha(a.trainingInputConstructionHash);
 const model=record(a.rootModel,MODEL_FIELDS),nodeRecords=list(model.nodes,16).map(n=>record(n,['id','parentId']));
 if(nodeRecords.length<2)bad('At least two approved roots are required');
 for(const n of nodeRecords){id(n.id);if(n.parentId!==null)bad('Root-only taxonomy required');}
 const nodeIds=nodeRecords.map(n=>n.id).sort(lex);
 if(new Set(nodeIds).size!==nodeIds.length)bad('Duplicate root');
 const headRecords=list(model.heads,16);
 const compiledModel=compileHierarchyLinearHeads(a.rootModel);
 for(const h of headRecords)if(Object.getOwnPropertyDescriptor(h,'enabled').value!==true)bad('Every root head requires independent training support');
 const modelCopy=copyValidated(a.rootModel),modelJsonHash=digest(modelCopy);
 const policyRecord=record(a.rootPolicy,POLICY_FIELDS);
 compilePooledRootRankPolicy(a.rootPolicy); // Frozen validation retains development-only semantics.
 const policy=copyValidated(a.rootPolicy),policyIds=[...policy.nodeIds].sort(lex);
 if(policyRecord.modelHash!==modelJsonHash||policyRecord.inputConstructionHash!==a.trainingInputConstructionHash||
  policyIds.length!==nodeIds.length||policyIds.some((id,i)=>id!==nodeIds[i]))bad('Model/policy/training owner mismatch');
 const adapter=compilePairedE5Input(a.inputDefinition),paired=describePairedE5Input(adapter);
 if(model.representation!==paired.representation||model.representationHash!==paired.representationHash||
  policy.representationHash!==paired.representationHash)bad('Paired representation mismatch');
 const profiles=list(a.targetProfiles,2).map(profile).sort((x,y)=>lex(x.producerId,y.producerId));
 if(profiles.length!==2||profiles[0].producerId!=='browser-current'||profiles[1].producerId!=='current-static')bad('Exactly both target producers required');
 const builders=new Set(profiles.map(p=>p.inputConstructionHash));
 if(builders.size!==2||builders.has(a.trainingInputConstructionHash))bad('Targets must not relabel the training builder');
 const body={schema:a.schema,modelJsonHash,modelJsonHashConvention:'sha256-JSON.stringify-artifact-property-order-not-JCS-or-file-bytes/v1',
  policyHash:policy.policyHash,originalPolicySchema:policy.schema,trainingInputConstructionHash:a.trainingInputConstructionHash,
  representation:paired.representation,representationHash:paired.representationHash,encoderHash:paired.definition.encoderHash,
  bodyWeight:paired.definition.bodyWeight,titleWeight:paired.definition.titleWeight,nodeIds,targetProfiles:profiles,
  experimental:true,developmentOnly:true,perClassPrecisionGuaranteed:false,transferValidationStatus:'unvalidated',
  productionValidated:false,assignmentAuthority:false,inputIdentityClaims:'caller-declared-not-attested'};
 const identity=freeze({...body,transferHash:digest(body)}),handle=Object.freeze({});
 handles.set(handle,{compiledModel,adapter,policy:freeze(policy),profiles:new Map(profiles.map(p=>[p.producerId,p])),identity});
 return handle;
}
export function describeBuilderScopedRootRankCandidate(handle){
 if(arguments.length!==1||!handles.has(handle))bad('Expected private compiled candidate');return handles.get(handle).identity;
}
export function classifyBuilderScopedRootRankCandidate(handle,input){
 if(arguments.length!==2||!handles.has(handle))bad('Expected private compiled candidate');
 const state=handles.get(handle),a=record(input,INPUT_FIELDS),profile=state.profiles.get(a.producerId);
 for(const key of ['sourceId','sourceVersion','sourceIncarnation','producerId','extractorVersion'])id(a[key]);
 for(const key of ['producerProfileHash','inputConstructionHash','inputHash'])sha(a[key]);
 if(!profile||a.producerProfileHash!==profile.producerProfileHash||a.inputConstructionHash!==profile.inputConstructionHash||
  !profile.extractorVersions.includes(a.extractorVersion))bad('Producer profile/extractor mismatch');
 const doc=document(a.documentWitness,a.producerId),body=vector(a.bodyVector),title=vector(a.titleVector);
 const witness=freeze({sourceId:a.sourceId,sourceVersion:a.sourceVersion,sourceIncarnation:a.sourceIncarnation,producerId:a.producerId,
  producerProfileHash:a.producerProfileHash,inputConstructionHash:a.inputConstructionHash,extractorVersion:a.extractorVersion,inputHash:a.inputHash,documentWitness:doc});
 const vectorBindings=freeze({encoding:'ieee754-binary64-little-endian/384/v1',bodyVectorHash:vectorHash(body),titleVectorHash:vectorHash(title)});
 const semanticWitnessHash=digest({schema:'builder-scoped-root-rank-semantic-witness/v1',transferHash:state.identity.transferHash,witness,vectorBindings});
 const fused=applyPairedE5Input(state.adapter,{sourceId:a.sourceId,sourceVersion:a.sourceVersion,bodyVector:body,titleVector:title});
 let supportedPath=[],reason='zero-fused-norm',headDotProducts=0,headScalarProducts=0,rankComparisonWork=0;
 if(fused.status==='available'){
  const scored=scoreHierarchyLinearHeads(state.compiledModel,{sourceId:a.sourceId,sourceVersion:a.sourceVersion,
   representation:fused.representation,representationHash:fused.representationHash,vector:fused.vector});
  headDotProducts=scored.work.dotProducts;headScalarProducts=scored.work.scalarProducts;
  const ranked=rankRootScores({nodeIds:state.identity.nodeIds,scores:scored.scores.map(({nodeId,score})=>({nodeId,score}))});
  rankComparisonWork=ranked.comparisonWork;
  // Exactly the frozen pooled classifier's numeric predicates. No browser
  // Source witness is ever relabelled with policy.inputConstructionHash.
  const accepted=state.policy.enabled&&!ranked.tied&&ranked.winnerScore>=state.policy.minWinnerScore&&ranked.winnerGap>=state.policy.minWinnerGap;
  if(accepted)supportedPath=[ranked.winnerId];
  reason=ranked.tied?'rank-tie':!state.policy.enabled?'disabled':accepted?'accepted':'below-pooled-cut';
 }
 if(headScalarProducts>6144||rankComparisonWork>64)capacity('Runtime work exceeded root bound');
 return freeze({schema:'builder-scoped-root-rank-transfer-decision/v1',status:supportedPath.length?'candidate':'unresolved',reason,supportedPath,
  witness,vectorBindings,semanticWitnessHash,identity:state.identity,
  // Scoped numeric counters + adapter-fusion bound only, not all wrapper
  // validation/copy/hash/native-hypot/serialization CPU or embedding latency.
  work:{headDotProducts,headScalarProducts,rankComparisonWork,fusionCoordinateVisitUpperBound:384*8},
  experimental:true,developmentOnly:true,transferValidationStatus:'unvalidated',productionValidated:false,assignmentAuthority:false});
}
