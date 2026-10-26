// Isolated experimental composition; no IO, fitting, registration or authority.
// One caller-declared capture supplies the SAME raw body/title vectors to both
// trusted scorers. Root transfer and detail training/target bindings stay distinct.
// Detail can refine an accepted root, never rescue abstention or change branches.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {compileBuilderScopedRootRankCandidate as compileRoot,describeBuilderScopedRootRankCandidate as describeRoot,
 classifyBuilderScopedRootRankCandidate as classifyRoot} from '../../../../experiments/topic-encoder/builder-scoped-root-rank-candidate-v1/scorer.js';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../../hierarchical-e5-paired-input.js';
import {compileHierarchyHeadAssignment as compileFixed,describeHierarchyHeadAssignment as describeFixed,
 classifyHierarchyHeads as classifyFixed} from '../../hierarchical-e5-paired-head-policy.js';
import {compileHierarchyHeadAssignment as compileObserved,describeHierarchyHeadAssignment as describeObserved,
 classifyHierarchyHeads as classifyObserved} from '../../hierarchical-e5-observed-head-policy.js';

const SCHEMA='hierarchy-root-detail-transfer-adapter/v1',handles=new WeakMap();
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const bad=()=>{throw new TypeError('Invalid experimental root/detail transfer adapter');};
function record(v,fields){
 if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==fields.length)bad();
 const out={};for(const key of fields){const d=Object.getOwnPropertyDescriptor(v,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();out[key]=d.value;}return out;
}
function hash(v){if(typeof v!=='string'||!/^[a-f0-9]{64}$/u.test(v))bad();return v;}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
function detailOwner(policy){
 if(!policy||typeof policy!=='object'||types.isProxy(policy)||Object.getPrototypeOf(policy)!==Object.prototype)bad();
 const d=Object.getOwnPropertyDescriptor(policy,'schema');if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();
 if(d.value==='hierarchical-e5-paired-head-policy-v1')return {mode:'fixed',compile:compileFixed,describe:describeFixed,classify:classifyFixed};
 if(d.value==='hierarchical-e5-observed-head-policy-v1')return {mode:'observed',compile:compileObserved,describe:describeObserved,classify:classifyObserved};
 bad();
}
function derivedHash(vector){
 const bytes=new ArrayBuffer(384*8),view=new DataView(bytes);for(let i=0;i<384;i++)view.setFloat64(i*8,vector[i],true);
 return createHash('sha256').update('root-detail-derived-vector/binary64-le/384/v1\0').update(new Uint8Array(bytes)).digest('hex');
}
export function compileRootDetailTransferAdapter(input){
 if(arguments.length!==1)bad();const a=record(input,['schema','rootCandidate','detail']);if(a.schema!==SCHEMA)bad();
 const detail=record(a.detail,['inputDefinition','model','policy','trainingInputConstructionHash']);hash(detail.trainingInputConstructionHash);
 const root=compileRoot(a.rootCandidate),r=describeRoot(root),owner=detailOwner(detail.policy);
 const detailHandle=owner.compile({model:detail.model,policy:detail.policy}),d=owner.describe(detailHandle);
 const adapter=compilePairedE5Input(detail.inputDefinition),paired=describePairedE5Input(adapter);
 if(paired.definition.encoderHash!==r.encoderHash||d.representation!==paired.representation||d.representationHash!==paired.representationHash||d.nodes.length>128)bad();
 const roots=d.nodes.filter(n=>n.parentId===null).map(n=>n.id).sort();
 if(roots.length!==r.nodeIds.length||roots.some((id,i)=>id!==r.nodeIds[i])||
  r.targetProfiles.some(p=>p.inputConstructionHash===detail.trainingInputConstructionHash))bad();
 const detailBinding={schema:'root-detail-independent-detail-transfer/v1',detailPolicyMode:owner.mode,
  modelArtifactHash:d.modelArtifactHash,policyHash:d.policyHash,representation:d.representation,representationHash:d.representationHash,
  encoderHash:paired.definition.encoderHash,bodyWeight:paired.definition.bodyWeight,titleWeight:paired.definition.titleWeight,
  trainingInputConstructionHash:detail.trainingInputConstructionHash,targetProfiles:r.targetProfiles,
  transferValidationStatus:'unvalidated',productionValidated:false,assignmentAuthority:false};
 const body={schema:SCHEMA,algorithm:'unique-root-required-detail-same-root-only/v1',rootTransferHash:r.transferHash,
  rootTransferIdentity:r,detailTransferIdentity:detailBinding,detailTransferHash:digest(detailBinding),
  roots,detailNodes:d.nodes.length,maximumHeadDotProducts:roots.length+d.nodes.length,maximumHeadScalarProducts:(roots.length+d.nodes.length)*384,
  identityScope:'program-JSON-identities-not-file-byte-or-training-attestation',experimental:true,developmentOnly:true,
  detailQualityValidated:false,productionValidated:false,assignmentAuthority:false};
 const identity=freeze({...body,adapterHash:digest(body)}),handle=Object.freeze({});
 handles.set(handle,{root,detail:detailHandle,adapter,classifyDetail:owner.classify,identity});return handle;
}
export function describeRootDetailTransferAdapter(handle){if(arguments.length!==1||!handles.has(handle))bad();return handles.get(handle).identity;}
export function classifyRootDetailTransferAdapter(handle,input){
 if(arguments.length!==2||!handles.has(handle))bad();const state=handles.get(handle);
 const a=record(input,['sourceId','sourceVersion','sourceIncarnation','producerId','producerProfileHash','inputConstructionHash','extractorVersion','inputHash',
  'documentWitness','bodySha256','titleSha256','bodyVector','titleVector']);hash(a.bodySha256);hash(a.titleSha256);
 const {bodySha256,titleSha256,...rootInput}=a;
 // Delegation validates/copies source, producer, document and BOTH raw arrays
 // before scoring. No caller scores, paths, callbacks or alternate detail input.
 const root=classifyRoot(state.root,rootInput),work={rootHeadDotProducts:root.work.headDotProducts,rootHeadScalarProducts:root.work.headScalarProducts,
  rootRankComparisonWork:root.work.rankComparisonWork,detailHeadDotProducts:0,detailHeadScalarProducts:0,
  fusionCoordinateVisitUpperBound:root.work.fusionCoordinateVisitUpperBound};
 const captureWitness={...root.witness,bodySha256,titleSha256};
 const captureWitnessHash=digest({schema:'root-detail-common-capture-witness/v1',witness:captureWitness,vectorBindings:root.vectorBindings});
 let supportedPath=[],reason='independent-root-unresolved',detailEvaluated=false,detailDerivedVectorHash=null;
 if(root.status==='candidate'&&root.supportedPath.length===1){
  supportedPath=[...root.supportedPath];
  // Synchronous trusted numeric functions cannot call into caller data between
  // validation and this second private copy. Each fusion uses its OWN identity.
  const fused=applyPairedE5Input(state.adapter,{sourceId:root.witness.sourceId,sourceVersion:root.witness.sourceVersion,
   bodyVector:a.bodyVector,titleVector:a.titleVector});work.fusionCoordinateVisitUpperBound+=384*8;
  reason='independent-root-detail-input-unavailable';
  if(fused.status==='available'){
   detailDerivedVectorHash=derivedHash(fused.vector);
   const detail=state.classifyDetail(state.detail,{sourceId:fused.sourceId,sourceVersion:fused.sourceVersion,
    representation:fused.representation,representationHash:fused.representationHash,vector:fused.vector});detailEvaluated=true;
   work.detailHeadDotProducts=detail.work.dotProducts;work.detailHeadScalarProducts=detail.work.scalarProducts;
   const path=detail.paths.length===1?detail.paths[0]:[];
   if(detail.status==='assigned'&&path[0]===supportedPath[0]){
    if(path.length>1){supportedPath=[...path];reason='independent-root-detail-agree';}else reason='independent-root-only';
   }else reason=detail.status==='unresolved'?'independent-root-detail-unresolved':'independent-root-detail-conflict';
  }
 }
 if(work.rootHeadDotProducts+work.detailHeadDotProducts>state.identity.maximumHeadDotProducts||
  work.rootHeadScalarProducts+work.detailHeadScalarProducts>state.identity.maximumHeadScalarProducts||
  work.rootRankComparisonWork>64||work.fusionCoordinateVisitUpperBound>6144)bad();
 return freeze({schema:'hierarchy-root-detail-transfer-decision/v1',adapterHash:state.identity.adapterHash,
  rootTransferHash:state.identity.rootTransferHash,detailTransferHash:state.identity.detailTransferHash,
  status:supportedPath.length?'candidate':'unresolved',supportedPath,primaryNodeId:supportedPath.at(-1)??null,
  independentlySupportedRootId:root.supportedPath[0]??null,reason,detailEvaluated,
  witness:captureWitness,vectorBindings:root.vectorBindings,captureWitnessHash,rootSemanticWitnessHash:root.semanticWitnessHash,detailDerivedVectorHash,
  work,experimental:true,developmentOnly:true,detailQualityValidated:false,transferValidationStatus:'unvalidated',
  inputIdentityClaims:'caller-declared-not-attested',productionValidated:false,assignmentAuthority:false});
}
