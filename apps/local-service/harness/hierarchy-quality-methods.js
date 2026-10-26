// Pure offline numeric comparison. No artifact IO, fitting, encoding or authority.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';
import {compileHierarchyLinearHeads,describeHierarchyLinearHeads,scoreHierarchyLinearHeads} from '../src/domain/hierarchical-e5-paired-linear-heads.js';
import {compileHierarchyLocalEvidence,describeHierarchyLocalEvidence,classifyHierarchyLocalEvidence} from '../src/domain/hierarchical-e5-local-evidence.js';
import {compilePooledRootRankPolicy,classifyPooledRootRankPolicy} from '../experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js';

const fail=()=>{throw new TypeError('Invalid hierarchy quality method bundle or query');};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function record(value,fields){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==fields.length)fail();
 const out={};for(const key of fields){const field=Object.getOwnPropertyDescriptor(value,key);if(!field?.enumerable||!Object.hasOwn(field,'value'))fail();out[key]=field.value;}return out;
}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
const rootIds=nodes=>nodes.filter(node=>node.parentId===null).map(node=>node.id).sort();
const sameIds=(a,b)=>a.length===b.length&&a.every((id,index)=>id===b[index]);
function outcome(path,reason,provenance){return {status:path.length?'accepted':'abstained',rootId:path[0]??null,path:[...path],reason,provenance,productionValidated:false,assignmentAuthority:false};}

/** Artifacts and provenance are explicit caller inputs, not authenticated files.
 * Compile once before the cohort; this module never selects or fits a candidate.
 */
export function compileHierarchyQualityMethods(bundle){
 if(arguments.length!==1)fail();
 const a=record(bundle,['rootModel','rootPolicy','rootInputDefinition','realRootArtifact','detailArtifact','localInputDefinition']);
 const rootModel=compileHierarchyLinearHeads(a.rootModel),rootDescription=describeHierarchyLinearHeads(rootModel),rootPolicy=compilePooledRootRankPolicy(a.rootPolicy);
 const rootPair=compilePairedE5Input(a.rootInputDefinition),rootPairDescription=describePairedE5Input(rootPair),
  localPair=compilePairedE5Input(a.localInputDefinition),localPairDescription=describePairedE5Input(localPair);
 const realLocal=compileHierarchyLocalEvidence(a.realRootArtifact),realDescription=describeHierarchyLocalEvidence(realLocal),
  detailLocal=compileHierarchyLocalEvidence(a.detailArtifact),detailDescription=describeHierarchyLocalEvidence(detailLocal);
 const roots=rootIds(rootDescription.nodes),modelHash=digest(a.rootModel),policyConstruction=a.rootPolicy.inputConstructionHash,policyHash=a.rootPolicy.policyHash;
 if(roots.length<2||roots.length>16||rootDescription.nodes.length!==roots.length||a.rootModel.heads.some(head=>!head.enabled)||
  !sameIds(roots,[...a.rootPolicy.nodeIds].sort())||a.rootPolicy.modelHash!==modelHash||
  rootDescription.representation!==rootPairDescription.representation||rootDescription.representationHash!==rootPairDescription.representationHash||
  a.rootPolicy.representationHash!==rootPairDescription.representationHash||
  realDescription.nodes.length!==roots.length||!sameIds(rootIds(realDescription.nodes),roots)||!sameIds(rootIds(detailDescription.nodes),roots)||
  detailDescription.nodes.length>128||detailDescription.examples>512||
  realDescription.representation!==localPairDescription.representation||detailDescription.representation!==localPairDescription.representation||
  realDescription.representationHash!==localPairDescription.representationHash||detailDescription.representationHash!==localPairDescription.representationHash||
  rootPairDescription.definition.encoderHash!==localPairDescription.definition.encoderHash)fail();
 const identity=freeze({schema:'hierarchy-quality-methods/v1',rootModelJsonHash:modelHash,rootPolicyHash:policyHash,
  rootRepresentationHash:rootPairDescription.representationHash,localRepresentationHash:localPairDescription.representationHash,
  realRootArtifactHash:realDescription.artifactHash,syntheticDetailArtifactHash:detailDescription.artifactHash,
  roots,provenance:'caller-supplied-artifacts-not-file-or-producer-attestation',
  detailControl:'real-root-plus-synthetic-detail-development-references',productionValidated:false,assignmentAuthority:false});
 function localQuery(description,q,vector){
  // Preserve the reference artifact's numerical namespace without relabelling
  // the evaluated page as that historical producer or as a native observation.
  return {sourceId:'quality-numeric-'+digest({sourceId:q.sourceId,sourceVersion:q.sourceVersion,artifactHash:description.artifactHash}),
   sourceVersion:'artifact-'+description.artifactHash,representation:description.representation,representationHash:description.representationHash,
   inputConstructionHash:description.inputConstructionHash,vector};
 }
 function classify(query){
  if(arguments.length!==1)fail();
  const q=record(query,['sourceId','sourceVersion','bodyVector','titleVector']);
  const rootFused=applyPairedE5Input(rootPair,q),localFused=rootPairDescription.representationHash===localPairDescription.representationHash?rootFused:applyPairedE5Input(localPair,q);
  let acceptedRoot=[],rootReason='zero-paired-vector';
  if(rootFused.status==='available'){
   const scores=scoreHierarchyLinearHeads(rootModel,{sourceId:q.sourceId,sourceVersion:q.sourceVersion,representation:rootPairDescription.representation,
    representationHash:rootPairDescription.representationHash,vector:rootFused.vector}).scores.map(({nodeId,score})=>({nodeId,score}));
   const ranked=classifyPooledRootRankPolicy(rootPolicy,{modelHash,representationHash:rootPairDescription.representationHash,inputConstructionHash:policyConstruction,
    sourceId:q.sourceId,sourceVersion:q.sourceVersion,scores});acceptedRoot=ranked.selectedPath;rootReason=ranked.reason;
  }
  const realDecision=localFused.status==='available'?classifyHierarchyLocalEvidence(realLocal,localQuery(realDescription,q,localFused.vector)):null;
  let joinedPath=[...acceptedRoot],joinedReason='root-abstained',detailEvaluated=false;
  if(acceptedRoot.length){
   joinedReason='detail-zero-paired-vector';
   if(localFused.status==='available'){
    detailEvaluated=true;const detail=classifyHierarchyLocalEvidence(detailLocal,localQuery(detailDescription,q,localFused.vector));
    if(detail.selectedPath.length&&detail.selectedPath[0]===acceptedRoot[0]){joinedPath=detail.selectedPath;joinedReason=joinedPath.length>1?'same-root-local-detail':'same-root-local-coarsening';}
    else joinedReason=detail.selectedPath.length?'detail-root-disagreement':'detail-abstained';
   }
  }
  return freeze({schema:'hierarchy-quality-comparison/v1',
   rootLinear:outcome(acceptedRoot,rootReason,'selected-stored-linear-model-and-pooled-cuts'),
   realRootReferences:outcome(realDecision?.selectedPath??[],realDecision?.reason??'zero-paired-vector','caller-declared-real-root-reference-control'),
   rootWithSyntheticDetail:{...outcome(joinedPath,joinedReason,'real-root-plus-synthetic-detail-development-control'),detailEvaluated,syntheticDetailReferences:true},
   productionValidated:false,assignmentAuthority:false});
 }
 return Object.freeze({identity,classify});
}
