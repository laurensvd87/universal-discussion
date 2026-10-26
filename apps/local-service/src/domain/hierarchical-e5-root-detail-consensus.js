// Experimental independent root gate + explicitly identified detail refinement.
// No fusion, training, owner projection, probabilities or canonical authority.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {compileHierarchyHeadAssignment as compileRoot,classifyHierarchyHeads as classifyRoot,
  describeHierarchyHeadAssignment as describeRoot} from './hierarchical-e5-observed-head-policy.js';
import {compileHierarchyHeadAssignment as compileFixed,classifyHierarchyHeads as classifyFixed,
  describeHierarchyHeadAssignment as describeFixed} from './hierarchical-e5-paired-head-policy.js';

export const ROOT_DETAIL_CONSENSUS_LIMITS=Object.freeze({maxRoots:16,maxDetailNodes:128,dimensions:384,
  maxDotProducts:144,maxScalarProducts:55296});
const handles=new WeakMap(),SCHEMA='hierarchy-root-detail-consensus/v1';
const invalid=()=>{throw new TypeError('Invalid experimental root/detail consensus');};
const lexical=(a,b)=>a<b?-1:a>b?1:0;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function record(value,fields){
  if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||
      Reflect.ownKeys(value).length!==fields.length)invalid();
  const result={};for(const field of fields){const d=Object.getOwnPropertyDescriptor(value,field);
    if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();result[field]=d.value;}
  return result;
}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function detailPolicyOwner(policy){
  if(!policy||typeof policy!=='object'||types.isProxy(policy)||Object.getPrototypeOf(policy)!==Object.prototype)invalid();
  const schema=Object.getOwnPropertyDescriptor(policy,'schema');
  if(!schema?.enumerable||!Object.hasOwn(schema,'value'))invalid();
  if(schema.value==='hierarchical-e5-paired-head-policy-v1')return {mode:'fixed',compile:compileFixed,classify:classifyFixed,describe:describeFixed};
  if(schema.value==='hierarchical-e5-observed-head-policy-v1')return {mode:'observed',compile:compileRoot,classify:classifyRoot,describe:describeRoot};
  invalid();
}

export function compileHierarchyRootDetailConsensus(input){
  if(arguments.length!==1)invalid();
  const a=record(input,['rootModel','rootPolicy','detailModel','detailPolicy']);
  // These separate owners validate and privately copy all coefficients, rules,
  // provenance, paired namespaces and identities. No caller features are used.
  const owner=detailPolicyOwner(a.detailPolicy);
  const root=compileRoot({model:a.rootModel,policy:a.rootPolicy}),detail=owner.compile({model:a.detailModel,policy:a.detailPolicy});
  const r=describeRoot(root),d=owner.describe(detail);
  if(!r.nodes.length||r.nodes.length>16||r.nodes.some(n=>n.parentId!==null)||d.nodes.length>128||
      r.representation!=='paired-raw-e5-body-title-v1'||d.representation!==r.representation||d.representationHash!==r.representationHash)invalid();
  const rootIds=r.nodes.map(n=>n.id).sort(lexical),detailRoots=d.nodes.filter(n=>n.parentId===null).map(n=>n.id).sort(lexical);
  if(rootIds.length!==detailRoots.length||rootIds.some((id,i)=>id!==detailRoots[i]))invalid();
  const definition={schema:SCHEMA,algorithm:'independent-root-required-detail-same-root-only/v1',detailPolicyMode:owner.mode,
    representation:r.representation,representationHash:r.representationHash,rootIds,
    rootModelArtifactHash:r.modelArtifactHash,rootPolicyHash:r.policyHash,
    detailModelArtifactHash:d.modelArtifactHash,detailPolicyHash:d.policyHash};
  const identity=freeze({...definition,consensusHash:digest(definition),rootNodes:r.nodes.length,detailNodes:d.nodes.length,
    maximumDotProducts:r.nodes.length+d.nodes.length,maximumScalarProducts:(r.nodes.length+d.nodes.length)*384,
    experimental:true,productionValidated:false,assignmentAuthority:false});
  const handle=Object.freeze({});handles.set(handle,{root,detail,classifyDetail:owner.classify,identity});return handle;
}

export function describeHierarchyRootDetailConsensus(handle){
  const state=handles.get(handle);if(!state)invalid();return state.identity;
}

export function classifyHierarchyRootDetailConsensus(handle,witness){
  if(arguments.length!==2)invalid();const state=handles.get(handle);if(!state)invalid();
  const root=classifyRoot(state.root,witness),work={dotProducts:root.work.dotProducts,scalarProducts:root.work.scalarProducts};
  let supportedPath=[],reason='independent-root-unresolved',detailEvaluated=false;
  const rootPath=root.paths.length===1?root.paths[0]:[];
  if(root.status==='assigned'&&rootPath.length===1&&root.primaryNodeId===rootPath[0]){
    supportedPath=[root.primaryNodeId];
    const detail=state.classifyDetail(state.detail,witness);detailEvaluated=true;
    work.dotProducts+=detail.work.dotProducts;work.scalarProducts+=detail.work.scalarProducts;
    const detailPath=detail.paths.length===1?detail.paths[0]:[];
    if(detail.status==='assigned'&&detailPath.length>1&&detailPath[0]===root.primaryNodeId){
      supportedPath=[...detailPath];reason='independent-root-and-detail-agree';
    }else reason=detail.status==='unresolved'?'independent-root-detail-unresolved':
      detailPath[0]===root.primaryNodeId?'independent-root-only':'independent-root-detail-disagreement';
  }
  if(!Number.isSafeInteger(work.dotProducts)||!Number.isSafeInteger(work.scalarProducts)||
      work.dotProducts<0||work.scalarProducts<0||work.dotProducts>state.identity.maximumDotProducts||
      work.scalarProducts>state.identity.maximumScalarProducts)invalid();
  return freeze({schema:'hierarchy-root-detail-consensus-decision/v1',consensusHash:state.identity.consensusHash,
    detailPolicyMode:state.identity.detailPolicyMode,
    representation:root.representation,representationHash:root.representationHash,sourceId:root.sourceId,sourceVersion:root.sourceVersion,
    rootModelArtifactHash:state.identity.rootModelArtifactHash,rootPolicyHash:state.identity.rootPolicyHash,
    detailModelArtifactHash:state.identity.detailModelArtifactHash,detailPolicyHash:state.identity.detailPolicyHash,
    status:supportedPath.length?'candidate':'unresolved',primaryNodeId:supportedPath.at(-1)??null,
    supportedPath,paths:supportedPath.length?[[...supportedPath]]:[],independentRootId:root.primaryNodeId,
    detailEvaluated,reason,work,experimental:true,productionValidated:false,assignmentAuthority:false});
}
