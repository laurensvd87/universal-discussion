// Owner-wide presentation policy over an already supported semantic path.
// This module cannot classify content, change confidence or retarget a reply.
import {types} from 'node:util';

const policies=new WeakMap();
const invalid=()=>{throw new TypeError('Invalid semantic grouping policy');};
function record(value,keys){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)invalid();
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[key]=d.value;}return out;
}
function array(value,max){
 if(types.isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)invalid();
 const n=Object.getOwnPropertyDescriptor(value,'length').value;if(n>max||Reflect.ownKeys(value).length!==n+1)invalid();
 return Array.from({length:n},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();return d.value;});
}
function id(value){if(typeof value!=='string'||!value.length||value.length>160||!value.isWellFormed()||value.trim()!==value||/[\p{Cc}\p{Cf}]/u.test(value))invalid();return value;}
function depth(value){if(!Number.isInteger(value)||value<1||value>8)invalid();return value;}
function state(handle){if(!policies.has(handle))invalid();return policies.get(handle);}
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};

export function compileSemanticTopicGrouping(value){
 if(arguments.length!==1)invalid();const a=record(value,['nodes','policy']),nodes=new Map();
 for(const item of array(a.nodes,512)){
  const n=record(item,['id','parentId']);id(n.id);if(n.parentId!==null)id(n.parentId);
  if(nodes.has(n.id))invalid();nodes.set(n.id,n);
 }
 if(nodes.size<2)invalid();const paths=new Map();let roots=0;
 for(const node of nodes.values()){
  let cursor=node;const reverse=[],seen=new Set();
  while(cursor){if(seen.has(cursor.id)||reverse.length===8)invalid();seen.add(cursor.id);reverse.push(cursor.id);
   if(cursor.parentId===null)break;if(!nodes.has(cursor.parentId))invalid();cursor=nodes.get(cursor.parentId);
  }
  if(node.parentId===null)roots++;paths.set(node.id,Object.freeze(reverse.reverse()));
 }
 if(roots<2||roots>16)invalid();
 const p=record(a.policy,['revision','defaultMaxDepth','overrides']);
 if(!Number.isSafeInteger(p.revision)||p.revision<0)invalid();depth(p.defaultMaxDepth);
 const rules=new Map(),overrides=array(p.overrides,512).map(item=>{
  const r=record(item,['nodeId','maxDepth']);id(r.nodeId);depth(r.maxDepth);
  if(!paths.has(r.nodeId)||rules.has(r.nodeId)||r.maxDepth<paths.get(r.nodeId).length)invalid();
  rules.set(r.nodeId,r.maxDepth);return r;
 }).sort((x,y)=>x.nodeId<y.nodeId?-1:x.nodeId>y.nodeId?1:0);
 const policy=freeze({revision:p.revision,defaultMaxDepth:p.defaultMaxDepth,overrides});
 const handle=Object.freeze({});policies.set(handle,{paths,rules,policy});return handle;
}

export function describeSemanticTopicGrouping(handle){if(arguments.length!==1)invalid();return state(handle).policy;}

export function groupSupportedSemanticPath(handle,value){
 if(arguments.length!==2)invalid();const s=state(handle),supportedPath=array(value,8).map(id);
 if(supportedPath.length){const expected=s.paths.get(supportedPath.at(-1));
  if(!expected||expected.length!==supportedPath.length||supportedPath.some((nodeId,i)=>nodeId!==expected[i]))invalid();
 }
 let maxDepth=s.policy.defaultMaxDepth;
 // The deepest matching subtree rule wins; unsupported descendants are never
 // considered. A rule cannot broaden above its own subtree's root.
 for(const nodeId of supportedPath)if(s.rules.has(nodeId))maxDepth=s.rules.get(nodeId);
 const selectedPath=supportedPath.slice(0,maxDepth);
 return freeze({policyRevision:s.policy.revision,supportedPath,selectedPath,
  nodeId:selectedPath.at(-1)??null,deepestSupportedNodeId:supportedPath.at(-1)??null});
}
