// Pure unregistered numeric transfer. No IO, fitting, capture or write authority.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {compileNativeRootRankCandidate,describeNativeRootRankCandidate,prepareNativeRootInput,
 classifyNativeRootRankCandidate} from '../../../../experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js';
import {compileHierarchyLocalEvidence,describeHierarchyLocalEvidence,classifyHierarchyLocalEvidence} from '../../hierarchical-e5-local-evidence.js';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../../hierarchical-e5-paired-input.js';

export const NATIVE_LOCAL_DETAIL_LIMITS=Object.freeze({dimensions:384,roots:16,detailNodes:128,detailReferences:512,depth:8,
 localPreflightUnits:4000000,dotProducts:528,coordinateProducts:202752,rootRankComparisons:64,fusionCoordinateVisits:6144});
const SCHEMA='native-root-local-detail-transfer/v1',handles=new WeakMap(),L=NATIVE_LOCAL_DETAIL_LIMITS;
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export class NativeRootLocalDetailError extends TypeError{
 constructor(code){super('Invalid native root/local-detail transfer: '+code);this.name='NativeRootLocalDetailError';this.code=code;}
}
const bad=(code='contract')=>{throw new NativeRootLocalDetailError(code);};
function record(v,keys){
 if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)bad();
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();out[k]=d.value;}return out;
}
function array(v,max){
 if(!v||typeof v!=='object'||types.isProxy(v)||!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype)bad();
 const n=Object.getOwnPropertyDescriptor(v,'length').value;if(n>max)bad('capacity');if(Reflect.ownKeys(v).length!==n+1)bad();
 return Array.from({length:n},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();return d.value;});
}
function id(v){if(typeof v!=='string'||v.length<1||v.length>160||!v.isWellFormed()||v.trim()!==v||/[\p{Cc}\p{Cf}]/u.test(v))bad();return v;}
function vector(v){const a=array(v,384);if(a.length!==384)bad();let norm=0;
 for(const x of a){if(typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>1)bad();norm+=x*x;}if(Math.abs(norm-1)>1e-5)bad();return Object.freeze(a);}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
function derivedHash(v){const b=new ArrayBuffer(384*8),view=new DataView(b);for(let i=0;i<384;i++)view.setFloat64(i*8,v[i],true);
 return createHash('sha256').update('native-local-detail-derived-vector/binary64-le/384/v1\0').update(new Uint8Array(b)).digest('hex');}
function stateFor(handle){if(!handles.has(handle))bad('handle');return handles.get(handle);}
const ARTIFACT_FIELDS=['schema','representation','representationHash','inputConstructionHash','taxonomyVersion','evidenceVersion',
 'calibrationVersion','calibrationStatus','nodes','examples','nodePolicies'];
const INPUT_FIELDS=['sourceId','sourceVersion','producerId','producerProfileHash','inputConstructionHash','extractorVersion',
 'fieldBindings','nativeWitness','rightsEvidenceHash','sourceInputHash','bodyVector','titleVector'];

export function compileNativeRootLocalDetailTransfer(input){
 if(arguments.length!==1)bad();const a=record(input,['schema','rootCandidate','detail']);if(a.schema!==SCHEMA)bad();
 const detail=record(a.detail,['artifact','inputDefinition','supportedRootIds']),artifact=record(detail.artifact,ARTIFACT_FIELDS);
 // Refuse this adapter's stricter finite scope BEFORE compiling/scoring local
 // reference vectors. Trusted local owner performs all remaining validation.
 array(artifact.nodes,L.detailNodes);array(artifact.examples,L.detailReferences);
 const roots=array(detail.supportedRootIds,L.roots).map(id).sort();if(!roots.length||new Set(roots).size!==roots.length)bad('detail-roots');
 const root=compileNativeRootRankCandidate(a.rootCandidate),r=describeNativeRootRankCandidate(root);
 const local=compileHierarchyLocalEvidence(detail.artifact),d=describeHierarchyLocalEvidence(local);
 const paired=compilePairedE5Input(detail.inputDefinition),p=describePairedE5Input(paired);
 if(p.definition.encoderHash!==r.encoderHash||d.representation!==p.representation||d.representationHash!==p.representationHash)bad('representation');
 if(d.inputConstructionHash===r.targetProfiles[0].inputConstructionHash)bad('target-is-artifact-namespace');
 if(d.scoringPreflightUpperBound>L.localPreflightUnits)bad('capacity');
 const detailRoots=d.nodes.filter(n=>n.parentId===null).map(n=>n.id).sort();
 if(detailRoots.length!==roots.length||detailRoots.some((n,i)=>n!==roots[i])||roots.some(n=>!r.nodeIds.includes(n))||
  d.nodes.some(n=>r.nodeIds.includes(n.id)&&n.parentId!==null))bad('detail-roots');
 const policyNamespace={schema:'original-local-numerical-policy-namespace/v1',representation:d.representation,representationHash:d.representationHash,
  originalArtifactInputConstructionHash:d.inputConstructionHash,nativeCaptureBuilderClaim:false,trainingSourceProvenanceClaim:false};
 const body={schema:SCHEMA,algorithm:'independent-native-root-then-same-root-local-evidence/v1',rootTransferHash:r.transferHash,
  rootTransferIdentity:r,originalDetailArtifactHash:d.artifactHash,localBuilderHash:d.builderHash,
  originalDetailIdentity:{taxonomyVersion:d.taxonomyVersion,evidenceVersion:d.evidenceVersion,calibrationVersion:d.calibrationVersion},
  originalNumericalPolicyNamespace:policyNamespace,detailFusionDefinition:p.definition,detailRepresentationHash:p.representationHash,
  actualNativeTargetProfile:r.targetProfiles[0],supportedRootIds:roots,detailNodes:d.nodes.length,detailReferences:d.examples,
  localPreflightUpperBound:d.scoringPreflightUpperBound,limits:L,
  noRefitPerformedByAdapter:true,noRetunePerformedByAdapter:true,transferValidationStatus:'unvalidated',detailQualityValidated:false,
  identityScope:'supplied-program-artifact-identities-not-file-bytes-or-training-attestation',experimental:true,developmentOnly:true,
  productionValidated:false,assignmentAuthority:false};
 const identity=freeze({...body,transferHash:digest(body)}),handle=Object.freeze({});
 handles.set(handle,{root,local,paired,identity,supported:new Set(roots)});return handle;
}
export function describeNativeRootLocalDetailTransfer(handle){if(arguments.length!==1)bad();return stateFor(handle).identity;}
/** Convenience delegation only. No detail scoring or new capture authority. */
export function prepareNativeRootLocalDetailInput(handle,metadata){if(arguments.length!==2)bad();return prepareNativeRootInput(stateFor(handle).root,metadata);}

export function classifyNativeRootLocalDetailTransfer(handle,input){
 if(arguments.length!==2)bad();const s=stateFor(handle),a=record(input,INPUT_FIELDS);
 // The SAME private exact-bit pair is used by both independent fusions. There
 // are no awaits or caller callbacks between validation/copy and either owner.
 const body=vector(a.bodyVector),title=vector(a.titleVector);
 const root=classifyNativeRootRankCandidate(s.root,{...a,bodyVector:body,titleVector:title});
 const work={rootHeadDotProducts:root.work.headDotProducts,rootHeadCoordinateProducts:root.work.headScalarProducts,
  rootRankComparisons:root.work.rankComparisonWork,detailDotProducts:0,detailCoordinateProducts:0,detailQueryNormProducts:0,
  localCountedUnits:0,localPreflightUpperBound:s.identity.localPreflightUpperBound,
  fusionCoordinateVisitUpperBound:root.work.fusionCoordinateVisitUpperBound};
 let supportedPath=[],reason='independent-root-unresolved',detailEvaluated=false,detailFusionEvaluated=false;
 let detailDerivedVectorHash=null,numericQuery=null,localOutcome=null,localOutcomeHash=null;
 if(root.status==='candidate'&&root.supportedPath.length===1){
  supportedPath=[...root.supportedPath];reason='accepted-root-outside-detail-scope';
  if(s.supported.has(supportedPath[0])){
   detailFusionEvaluated=true;work.fusionCoordinateVisitUpperBound+=384*8;
   const fused=applyPairedE5Input(s.paired,{sourceId:root.witness.sourceId,sourceVersion:root.witness.sourceVersion,bodyVector:body,titleVector:title});
   reason='detail-fusion-unavailable';
   if(fused.status==='available'){
    detailDerivedVectorHash=derivedHash(fused.vector);
    const binding={schema:'native-local-detail-numeric-query-binding/v1',transferHash:s.identity.transferHash,
     rootTransferHash:s.identity.rootTransferHash,nativeSourceInputHash:root.witness.sourceInputHash,
     rootSemanticWitnessHash:root.semanticWitnessHash,originalDetailArtifactHash:s.identity.originalDetailArtifactHash,
     originalDetailRepresentationHash:s.identity.detailRepresentationHash,detailDerivedVectorHash};
    const queryBindingHash=digest(binding),sourceId='numeric-detail-'+queryBindingHash,
     sourceVersion='numeric-policy-'+s.identity.originalDetailArtifactHash;
    if([root.witness.sourceId,root.witness.sourceVersion].includes(sourceId)||[root.witness.sourceId,root.witness.sourceVersion].includes(sourceVersion))bad('numeric-identity-collision');
    numericQuery={schema:'internal-local-numerical-query/v1',sourceId,sourceVersion,queryBindingHash,
     namespace:s.identity.originalNumericalPolicyNamespace,nativeSourceIdentity:false};
    const d=classifyHierarchyLocalEvidence(s.local,{sourceId,sourceVersion,representation:fused.representation,representationHash:fused.representationHash,
     inputConstructionHash:s.identity.originalNumericalPolicyNamespace.originalArtifactInputConstructionHash,vector:fused.vector});
    detailEvaluated=true;work.detailDotProducts=d.work.dotProducts;work.detailCoordinateProducts=d.work.coordinateProducts;
    work.detailQueryNormProducts=d.work.queryNormProducts;work.localCountedUnits=d.work.countedUnits;
    // Preserve ACTUAL local accepted-path/LCA/STOP outcome without mislabelling
    // its synthetic source identity as native Source provenance.
    localOutcome={schema:d.schema,status:d.status,selectedPath:[...d.selectedPath],primaryNodeId:d.primaryNodeId,reason:d.reason,
     plausiblePaths:d.plausiblePaths,artifactHash:d.artifactHash,builderHash:d.builderHash};localOutcomeHash=digest(localOutcome);
    reason=d.status==='unresolved'?'local-detail-unresolved':'local-detail-conflict';
    if(d.status==='assigned'&&d.selectedPath[0]===supportedPath[0]){
     supportedPath=[...d.selectedPath];reason=supportedPath.length>1?'independent-root-local-detail-refinement':'independent-root-local-root-only';
    }
   }
  }
 }
 if(work.rootHeadDotProducts+work.detailDotProducts>L.dotProducts||work.rootHeadCoordinateProducts+work.detailCoordinateProducts>L.coordinateProducts||
  work.rootRankComparisons>L.rootRankComparisons||work.fusionCoordinateVisitUpperBound>L.fusionCoordinateVisits||
  work.localCountedUnits>L.localPreflightUnits||work.localCountedUnits>work.localPreflightUpperBound)bad('capacity');
 const semanticBinding={schema:'native-root-local-detail-semantic-witness/v1',transferHash:s.identity.transferHash,
  rootSemanticWitnessHash:root.semanticWitnessHash,nativeSourceInputHash:root.witness.sourceInputHash,
  originalDetailArtifactHash:s.identity.originalDetailArtifactHash,originalDetailRepresentationHash:s.identity.detailRepresentationHash,
  detailDerivedVectorHash,numericQueryBindingHash:numericQuery?.queryBindingHash??null,localOutcomeHash,supportedPath,reason};
 return freeze({schema:'native-root-local-detail-decision/v1',transferHash:s.identity.transferHash,rootTransferHash:s.identity.rootTransferHash,
  originalDetailArtifactHash:s.identity.originalDetailArtifactHash,status:supportedPath.length?'candidate':'unresolved',supportedPath,
  primaryNodeId:supportedPath.at(-1)??null,independentlySupportedRootId:root.supportedPath[0]??null,reason,detailEvaluated,detailFusionEvaluated,
  witness:root.witness,vectorBindings:root.vectorBindings,rootSemanticWitnessHash:root.semanticWitnessHash,
  detailDerivedVectorHash,internalNumericQuery:numericQuery,localOutcome,localOutcomeHash,
  semanticWitnessHash:digest(semanticBinding),semanticWitnessVersion:semanticBinding.schema,work,
  transferValidationStatus:'unvalidated',detailQualityValidated:false,inputIdentityClaims:'caller-declared-not-attested',
  experimental:true,developmentOnly:true,productionValidated:false,assignmentAuthority:false});
}
