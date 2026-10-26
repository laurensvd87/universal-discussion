// Unregistered synchronous projection over actual ADR190 private jobs. No IO.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {compileNativeScopedPreparation,describeNativeScopedPreparation,
 prepareNativeScopedObservation,describeNativeScopedObservation} from '../native-scoped-preparation-v1/preparation.js';

const contexts=new WeakMap(),preparedTokens=new WeakMap(),groupings=new WeakMap(),jobs=new WeakMap();
const invalid=()=>{throw new TypeError('Invalid native owner grouping');};
const hash=value=>createHash('sha256').update(JSON.stringify(value),'utf8').digest('hex');
const lex=(a,b)=>a<b?-1:a>b?1:0;
function record(value,keys){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)invalid();
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[key]=d.value;}return out;
}
function own(value,key){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)invalid();
 const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();return d.value;
}
function list(value,max,keys){
 if(types.isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)invalid();
 const n=Object.getOwnPropertyDescriptor(value,'length').value;if(n>max||Reflect.ownKeys(value).length!==n+1)invalid();
 return Array.from({length:n},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();return record(d.value,keys);});
}
function id(value){if(typeof value!=='string'||!value.length||value.length>160||!value.isWellFormed()||value.trim()!==value||/[\p{Cc}\p{Cf}]/u.test(value))invalid();return value;}
function depth(value){if(!Number.isInteger(value)||value<1||value>8)invalid();return value;}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function state(map,handle){if(!map.has(handle))invalid();return map.get(handle);}

export function compileNativeOwnerPreparation(input){
 if(arguments.length!==1)invalid();const a=record(input,['schema','candidate']);if(a.schema!=='native-owner-preparation/v1')invalid();
 // The actual compiler validates this SAME descriptor-only candidate first.
 // No caller callback or asynchronous gap exists before detached topology copy.
 const preparation=compileNativeScopedPreparation({schema:'native-scoped-preparation/v1',candidate:a.candidate});
 const classifierIdentity=describeNativeScopedPreparation(preparation);
 const rootModel=own(own(a.candidate,'rootCandidate'),'rootModel'),artifact=own(own(a.candidate,'detail'),'artifact');
 const roots=list(own(rootModel,'nodes'),16,['id','parentId']),details=list(own(artifact,'nodes'),128,['id','parentId']);
 const nodes=new Map();
 function add(rows,rootOnly){const seen=new Set();for(const n of rows){id(n.id);if(n.parentId!==null)id(n.parentId);if(rootOnly&&n.parentId!==null||seen.has(n.id))invalid();seen.add(n.id);
  if(nodes.has(n.id)){if(nodes.get(n.id).parentId!==n.parentId)invalid();}else nodes.set(n.id,n);}}
 add(roots,true);add(details,false);if(nodes.size>144)invalid();
 const depths=new Map();for(const node of nodes.values()){const seen=new Set();let cursor=node,n=0;
  while(cursor){if(seen.has(cursor.id)||++n>8)invalid();seen.add(cursor.id);if(cursor.parentId===null)break;if(!nodes.has(cursor.parentId))invalid();cursor=nodes.get(cursor.parentId);}depths.set(node.id,n);}
 const topology=freeze([...nodes.values()].sort((x,y)=>lex(x.id,y.id))),topologyHash=hash({schema:'native-owner-topology/v1',nodes:topology});
 const context=Object.freeze({}),token=Object.freeze({});
 contexts.set(context,{preparation,classifierIdentity,topology,topologyHash,depths,token});return context;
}

export function prepareNativeOwnerObservation(context,observation){
 if(arguments.length!==2)invalid();const s=state(contexts,context),job=prepareNativeScopedObservation(s.preparation,observation);
 // Token is empty data, with no reverse link to context or numerical state.
 preparedTokens.set(job,s.token);return job;
}

export function compileNativeOwnerGrouping(context,ownerGrouping){
 if(arguments.length!==2)invalid();const s=state(contexts,context),a=record(ownerGrouping,['revision','defaultMaxDepth','overrides']);
 id(a.revision);depth(a.defaultMaxDepth);const rules=new Map();
 const overrides=list(a.overrides,144,['nodeId','maxDepth']).map(rule=>{id(rule.nodeId);depth(rule.maxDepth);
  if(!s.depths.has(rule.nodeId)||rules.has(rule.nodeId)||rule.maxDepth<s.depths.get(rule.nodeId))invalid();rules.set(rule.nodeId,rule.maxDepth);return rule;}).sort((x,y)=>lex(x.nodeId,y.nodeId));
 const grouping=freeze({revision:a.revision,defaultMaxDepth:a.defaultMaxDepth,overrides}),ownerGroupingHash=hash(grouping);
 const binding={schema:'native-owner-grouping-identity/v1',semanticTransferHash:s.classifierIdentity.transferHash,topologyHash:s.topologyHash,ownerGroupingHash};
 const identity=freeze({...binding,groupIdentityHash:hash(binding),ownerGrouping:grouping,
  experimental:true,productionValidated:false,assignmentAuthority:false,canonicalAuthority:false,queueAuthority:false});
 const handle=Object.freeze({});
 // A grouping policy keeps detached data/token only, not the compiled context.
 groupings.set(handle,{identity,rules,token:s.token});return handle;
}

export function groupNativeOwnerObservation(groupingHandle,preparedJob){
 if(arguments.length!==2)invalid();const s=state(groupings,groupingHandle);
 if(!preparedTokens.has(preparedJob)||preparedTokens.get(preparedJob)!==s.token)invalid();
 const preparedObservation=describeNativeScopedObservation(preparedJob),decision=preparedObservation.decision;
 if(preparedObservation.classifierIdentity.transferHash!==s.identity.semanticTransferHash||decision.transferHash!==s.identity.semanticTransferHash)invalid();
 const supportedPath=[...decision.supportedPath];let maxDepth=s.identity.ownerGrouping.defaultMaxDepth;
 for(const nodeId of supportedPath)if(s.rules.has(nodeId))maxDepth=s.rules.get(nodeId);
 const selectedPath=supportedPath.slice(0,maxDepth);
 const projection={status:decision.status,reason:selectedPath.length<supportedPath.length?'owner-depth-cut':decision.reason,
  supportedPath,selectedPath,deepestSupportedNodeId:supportedPath.at(-1)??null,primaryNodeId:selectedPath.at(-1)??null};
 const description=freeze({schema:'native-owner-grouped-observation/v1',preparedObservation,groupingIdentity:s.identity,projection});
 const job=Object.freeze({});jobs.set(job,description);return job;
}

export function describeNativeOwnerGrouping(handle){if(arguments.length!==1)invalid();return state(groupings,handle).identity;}
export function describeNativeOwnerGroupedObservation(job){if(arguments.length!==1)invalid();return state(jobs,job);}
