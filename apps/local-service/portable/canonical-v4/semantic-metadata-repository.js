// Bounded public projections, not capture, classification or posting authority.
// No IO at import. Use the caller's RR transaction for policy/context/topology.
import {types} from 'node:util';
import {ServiceError} from '../../src/domain/errors.js';
import {readId} from '../../src/domain/validation.js';

const MAX_BYTES=524288,MAX_NODES=512,MAX_DEPTH=8;
const invalid=()=>{throw new TypeError('Invalid semantic metadata request');};
const corrupt=()=>{throw new ServiceError('storage-corrupt','Invalid semantic metadata');};
function record(value,keys){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)invalid();
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[key]=d.value;}return out;
}
function list(value,max){
 if(!value||types.isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>max||Reflect.ownKeys(value).length!==value.length+1)invalid();
 const out=[];for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out.push(d.value);}return out;
}
function nodeId(value){if(typeof value!=='string'||!value.length||value.length>160||!value.isWellFormed()||value.trim()!==value||/[\p{Cc}\p{Cf}]/u.test(value))invalid();return value;}
function matcherHash(value){if(value!==null&&(typeof value!=='string'||!/^[a-f0-9]{64}$/u.test(value)))invalid();return value;}
function position(value){if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,18})$/u.test(value)||BigInt(value)>9223372036854775807n)invalid();return value;}
function path(value){const ids=list(value,MAX_DEPTH).map(nodeId);if(new Set(ids).size!==ids.length)invalid();return ids;}
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function storage(error){
 if(error instanceof ServiceError)return error;
 if(error?.code==='P1241')return new ServiceError('conflict','Semantic generation changed');
 if(error?.code==='P1242')return new ServiceError('not-found','Source unavailable');
 if(error?.code==='P1243')return new ServiceError('invalid','Invalid semantic metadata request');
 if(error?.code==='P1244')return new ServiceError('storage-corrupt','Invalid semantic metadata');
 return new ServiceError('storage-failure','Semantic metadata unavailable');
}
function topology(value,generation){
 const a=record(value,['generation','matcherIdentityHash','nodes']);if(a.generation!==generation)invalid();matcherHash(a.matcherIdentityHash);
 const nodes=list(a.nodes,MAX_NODES).map(value=>{
  const n=record(value,['id','parentId','path']),ids=path(n.path);nodeId(n.id);if(n.parentId!==null)nodeId(n.parentId);
  if(!ids.length||ids.at(-1)!==n.id||((ids.length===1)!==(n.parentId===null))||ids.length>1&&ids.at(-2)!==n.parentId)invalid();
  return {id:n.id,parentId:n.parentId,path:ids};
 });
 if((a.matcherIdentityHash===null)!==(nodes.length===0))invalid();
 const byId=new Map();let previous=null;
 for(const n of nodes){
  if(previous!==null&&Buffer.compare(Buffer.from(previous),Buffer.from(n.id))>=0||byId.has(n.id))invalid();
  previous=n.id;byId.set(n.id,n);
 }
 for(const n of nodes)if(n.parentId!==null){const parent=byId.get(n.parentId);if(!parent||!same(parent.path,n.path.slice(0,-1)))invalid();}
 const result={generation,matcherIdentityHash:a.matcherIdentityHash,nodes};if(Buffer.byteLength(JSON.stringify(result))>MAX_BYTES)invalid();return freeze(result);
}
function sourceContext(value,expected){
 const a=record(value,['generation','matcherIdentityHash','sourceId','sourceVersion','status','supportedPath']);
 if(a.generation!==expected.generation||a.sourceId!==expected.sourceId)invalid();matcherHash(a.matcherIdentityHash);position(a.sourceVersion);
 if(!['pending','classified','excluded'].includes(a.status))invalid();const ids=path(a.supportedPath);
 if(a.status!=='classified'&&ids.length||a.status!=='pending'&&a.matcherIdentityHash===null)invalid();
 return freeze({...a,supportedPath:ids});
}
export function createCanonicalV4SemanticMetadataRepository({database}={}){
 if(!database||typeof database.query!=='function')invalid();
 async function read(sql,parameters,decode){
  try{
   const response=await database.query(sql,parameters);let value;
   try{const rows=list(response.rows,1);if(rows.length!==1)invalid();value=decode(record(rows[0],['metadata']).metadata);}catch{corrupt();}
   return value;
  }catch(error){throw storage(error);}
 }
 return Object.freeze({
  topics(value){const a=record(value,['generation']);readId(a.generation);
   return read('SELECT canonical_v4.semantic_read_topic_nodes($1) AS metadata',[a.generation],v=>topology(v,a.generation));},
  sourceContext(value){const a=record(value,['generation','sourceId']);readId(a.generation);readId(a.sourceId);
   return read('SELECT canonical_v4.semantic_read_source_context($1,$2) AS metadata',[a.generation,a.sourceId],v=>sourceContext(v,a));},
 });
}
