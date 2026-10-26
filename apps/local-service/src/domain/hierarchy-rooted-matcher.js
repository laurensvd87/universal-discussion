// Cached numeric composition over a declared hierarchy. No IO, producer
// attestation, registry registration or canonical assignment authority.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from './hierarchical-e5-paired-input.js';
import {compileHierarchyLinearHeads,describeHierarchyLinearHeads,scoreHierarchyLinearHeads} from './hierarchical-e5-paired-linear-heads.js';
import {compilePooledRootRankPolicy,classifyPooledRootRankPolicy} from '../../experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js';
import {compileBinaryHierarchyDetail,describeBinaryHierarchyDetail,classifyBinaryHierarchyDetail} from './hierarchy-binary-detail.js';

export const ROOTED_MATCHER_LIMITS=Object.freeze({nodes:512,depth:8,rootHeads:16,detailArtifacts:128,dimensions:384});
const L=ROOTED_MATCHER_LIMITS,handles=new WeakMap(),digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=()=>{throw new TypeError('Invalid rooted hierarchy matcher');};
function record(value,fields){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==fields.length)fail();
 const result={};for(const key of fields){const field=Object.getOwnPropertyDescriptor(value,key);if(!field?.enumerable||!Object.hasOwn(field,'value'))fail();result[key]=field.value;}return result;
}
function field(value,key){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)fail();
 const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))fail();return descriptor.value;
}
function list(value,max){
 if(!value||typeof value!=='object'||types.isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)fail();
 const length=Object.getOwnPropertyDescriptor(value,'length').value;if(length>max||Reflect.ownKeys(value).length!==length+1)fail();
 const result=[];for(let i=0;i<length;i++){const item=Object.getOwnPropertyDescriptor(value,String(i));if(!item?.enumerable||!Object.hasOwn(item,'value'))fail();result.push(item.value);}return result;
}
function id(value){if(typeof value!=='string'||!value.length||value.length>160||!value.isWellFormed()||value.trim()!==value||/[\p{Cc}\p{Cf}]/u.test(value))fail();return value;}
const same=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
const prefix=(a,b)=>a.length<=b.length&&a.every((value,index)=>value===b[index]);
function tree(value){
 const nodes=list(value,L.nodes).map(node=>record(node,['id','parentId']));if(!nodes.length)fail();const byId=new Map(),paths=new Map();
 for(const node of nodes){id(node.id);if(node.parentId!==null)id(node.parentId);if(byId.has(node.id))fail();byId.set(node.id,node);}
 for(const node of nodes){let cursor=node;const path=[],seen=new Set();
  while(cursor){if(seen.has(cursor.id)||path.length>=L.depth)fail();seen.add(cursor.id);path.unshift(cursor.id);if(cursor.parentId===null)break;cursor=byId.get(cursor.parentId);if(!cursor)fail();}
  paths.set(node.id,path);
 }
 nodes.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);return {nodes,paths,roots:nodes.filter(node=>node.parentId===null).map(node=>node.id)};
}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}

/** Existing owners validate/copy model bodies. This composition copies only
 * bounded metadata and the tree, avoiding an extra whole-artifact DTO clone.
 */
export function compileRootedHierarchyMatcher(input){
 if(arguments.length!==1)fail();const a=record(input,['rootModel','rootPolicy','inputDefinition','nodes','detailArtifacts']);
 const declaredRootNodes=list(field(a.rootModel,'nodes'),L.rootHeads).map(node=>record(node,['id','parentId'])),heads=list(field(a.rootModel,'heads'),L.rootHeads);
 if(declaredRootNodes.length<2||declaredRootNodes.some(node=>node.parentId!==null)||heads.some(head=>field(head,'enabled')!==true))fail();
 const model=compileHierarchyLinearHeads(a.rootModel),rootDescription=describeHierarchyLinearHeads(model),policy=compilePooledRootRankPolicy(a.rootPolicy),
  paired=compilePairedE5Input(a.inputDefinition),pairedDescription=describePairedE5Input(paired),hierarchy=tree(a.nodes);
 const rootIds=rootDescription.nodes.map(node=>node.id).sort(),modelHash=digest(a.rootModel),policyIds=list(field(a.rootPolicy,'nodeIds'),L.rootHeads).map(id).sort(),
  policyConstruction=field(a.rootPolicy,'inputConstructionHash'),policyHash=field(a.rootPolicy,'policyHash');
 if(!same(rootIds,hierarchy.roots)||!same(rootIds,policyIds)||field(a.rootPolicy,'modelHash')!==modelHash||
  rootDescription.representation!==pairedDescription.representation||rootDescription.representationHash!==pairedDescription.representationHash||field(a.rootPolicy,'representationHash')!==pairedDescription.representationHash||
  pairedDescription.definition.bodyWeight!==.75||pairedDescription.definition.titleWeight!==.25)fail();
 const details=[],seen=new Set(),byRoot=new Map(rootIds.map(root=>[root,[]]));
 for(const artifact of list(a.detailArtifacts,L.detailArtifacts)){
  const handle=compileBinaryHierarchyDetail(artifact),description=describeBinaryHierarchyDetail(handle),path=hierarchy.paths.get(description.nodeId);
  if(seen.has(description.nodeId)||!path||path.length<2||!same(path,description.canonicalPath)||description.representation!==pairedDescription.representation||description.representationHash!==pairedDescription.representationHash)fail();
  seen.add(description.nodeId);const detail={handle,nodeId:description.nodeId,canonicalPath:[...path],artifactHash:description.artifactHash,eligible:description.eligible};details.push(detail);
  if(description.eligible)byRoot.get(path[0]).push(detail);
 }
 details.sort((a,b)=>a.nodeId<b.nodeId?-1:a.nodeId>b.nodeId?1:0);for(const underRoot of byRoot.values())underRoot.sort((a,b)=>a.nodeId<b.nodeId?-1:a.nodeId>b.nodeId?1:0);
 const identity=freeze({schema:'rooted-hierarchy-matcher/v1',rootModelJsonHash:modelHash,rootModelHashScope:'JSON.stringify-artifact-property-order',rootPolicyHash:policyHash,
  representation:pairedDescription.representation,representationHash:pairedDescription.representationHash,inputDefinition:pairedDescription.definition,
  nodes:hierarchy.nodes,roots:rootIds,detailArtifacts:details.map(({nodeId,canonicalPath,artifactHash,eligible})=>({nodeId,canonicalPath,artifactHash,eligible})),
  limits:L,provenance:'caller-declared-numeric-tree-and-artifacts',nativeObservation:false,productionValidated:false,assignmentAuthority:false});
 const handle=Object.freeze({});handles.set(handle,{model,policy,paired,byRoot,identity,modelHash,policyConstruction});return handle;
}
export function describeRootedHierarchyMatcher(handle){const state=handles.get(handle);if(!state)fail();return state.identity;}

export function classifyRootedHierarchyMatcher(handle,input){
 if(arguments.length!==2)fail();const state=handles.get(handle);if(!state)fail();const q=record(input,['sourceId','sourceVersion','bodyVector','titleVector']);
 const fused=applyPairedE5Input(state.paired,q),acceptedDetailPaths=[],evaluatedDetailNodes=[];let rootPath=[],semanticPath=[],maximalDetailPaths=[],reason='zero-paired-vector',rootReason='zero-paired-vector';
 if(fused.status==='available'){
  const scores=scoreHierarchyLinearHeads(state.model,{sourceId:q.sourceId,sourceVersion:q.sourceVersion,representation:state.identity.representation,representationHash:state.identity.representationHash,vector:fused.vector}).scores.map(({nodeId,score})=>({nodeId,score}));
  const root=classifyPooledRootRankPolicy(state.policy,{modelHash:state.modelHash,representationHash:state.identity.representationHash,inputConstructionHash:state.policyConstruction,sourceId:q.sourceId,sourceVersion:q.sourceVersion,scores});
  rootPath=[...root.selectedPath];semanticPath=[...rootPath];rootReason=root.reason;reason=rootPath.length?'root-only-no-supported-detail':'root-'+root.reason;
  if(rootPath.length){
   for(const detail of state.byRoot.get(rootPath[0])){
    const decision=classifyBinaryHierarchyDetail(detail.handle,{sourceId:q.sourceId,sourceVersion:q.sourceVersion,representation:state.identity.representation,representationHash:state.identity.representationHash,vector:fused.vector,independentRootPath:rootPath});
    if(!decision.binaryEvaluated)fail();evaluatedDetailNodes.push(detail.nodeId);
    if(decision.detailAccepted){if(!same(decision.path,detail.canonicalPath))fail();acceptedDetailPaths.push([...decision.path]);}
   }
   // Membership heads have independent scales. Resolve sets of accepted paths,
   // never an argmax of their affine scores or learned thresholds.
   maximalDetailPaths=acceptedDetailPaths.filter(path=>!acceptedDetailPaths.some(other=>other.length>path.length&&prefix(path,other))).map(path=>[...path]);
   if(maximalDetailPaths.length){
    semanticPath=[...maximalDetailPaths[0]];
    for(const path of maximalDetailPaths.slice(1)){let common=0;while(common<semanticPath.length&&common<path.length&&semanticPath[common]===path[common])common++;semanticPath=semanticPath.slice(0,common);}
    if(!semanticPath.length||semanticPath[0]!==rootPath[0])fail();
    reason=maximalDetailPaths.length===1?'supported-detail-path':semanticPath.length>1?'detail-common-ancestor':'detail-conflict-root-only';
   }
  }
 }
 return freeze({schema:'rooted-hierarchy-match/v1',status:semanticPath.length?'accepted':'abstained',semanticPath,rootPath,reason,rootReason,
  acceptedDetailPaths,maximalDetailPaths,evaluatedDetailNodes,provenance:'numeric-classification-not-producer-or-canonical-authority',nativeObservation:false,productionValidated:false,assignmentAuthority:false});
}
