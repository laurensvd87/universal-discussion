// Numeric preparation of one durable ingestion payload; no DB or capture authority.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {BROWSER_MODEL_ID,compatibleExtractor,readLearnedUrl} from '../domain/learned-sources.js';
import {readId,readText,readExpectedVersion} from '../domain/validation.js';
import {describeRootedHierarchyMatcher,classifyRootedHierarchyMatcher} from '../domain/hierarchy-rooted-matcher.js';

export const HIERARCHY_PREPARATION_LIMITS=Object.freeze({cachedResults:32,pendingDigests:8,materialBytes:65536,dimensions:384});
const L=HIERARCHY_PREPARATION_LIMITS;
const invalid=()=>{throw new TypeError('Invalid hierarchy ingestion claim');};
const unavailable=()=>Object.assign(new Error('Hierarchy ingestion preparation unavailable'),{code:'unavailable'});
const hash=text=>createHash('sha256').update(text).digest('hex');
function record(value,keys){
 if(!value||typeof value!=='object'||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length)invalid();
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[key]=d.value;}return out;
}
function vector(value,allowTyped=false){
 if(!value||types.isProxy(value)||!(Array.isArray(value)||allowTyped&&value instanceof Float64Array)||![Array.prototype,Float64Array.prototype].includes(Object.getPrototypeOf(value))||
  Reflect.ownKeys(value).length!==(Array.isArray(value)?385:384)||value.length!==L.dimensions)invalid();
 const out=[];for(let i=0;i<L.dimensions;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='number'||!Number.isFinite(d.value))invalid();out.push(d.value);}
 if(Math.abs(Math.hypot(...out)-1)>1e-6)invalid();return out;
}
function claim(value){
 try{
  const a=record(value,['operationId','operationDigest','requestMaterial','input']),q=record(a.input,['expected','operationId','url','title','embedding','extractorVersion']);
  const expected=record(q.expected,['generation','revision']);readExpectedVersion(expected);
  const embedding=record(q.embedding,['modelId','values']);
  if(embedding.modelId!==BROWSER_MODEL_ID||!compatibleExtractor(q.extractorVersion)||typeof a.operationDigest!=='string'||!/^[a-f0-9]{64}$/u.test(a.operationDigest)||
   typeof a.requestMaterial!=='string'||a.requestMaterial.length>L.materialBytes||Buffer.byteLength(a.requestMaterial,'utf8')>L.materialBytes)invalid();
  const operationId=readId(a.operationId);if(readId(q.operationId)!==operationId)invalid();
  const url=readLearnedUrl(q.url),title=readText(q.title,200),bodyVector=vector(embedding.values);
  if(url!==q.url)invalid();
  // No normalization: these coordinates were canonicalized at admission.
  const material=JSON.stringify({url,title,embedding:{modelId:embedding.modelId,values:bodyVector},extractorVersion:q.extractorVersion});
  if(material!==a.requestMaterial||hash(material)!==a.operationDigest)invalid();
  return {operationId,digest:a.operationDigest,title,bodyVector};
 }catch{invalid();}
}
function titleEmbedding(value){
 const a=record(value,['modelId','values']);if(a.modelId!==BROWSER_MODEL_ID)invalid();
 return Object.freeze({modelId:a.modelId,values:Object.freeze(vector(a.values,true))});
}

export function createHierarchyIngestionPreparation(options){
 if(arguments.length!==1)invalid();const {matcher,embedTitle}=record(options,['matcher','embedTitle']);if(typeof embedTitle!=='function')invalid();
 const matcherIdentityHash=hash(JSON.stringify(describeRootedHierarchyMatcher(matcher))),cache=new Map(),pending=new Map();
 const identity=Object.freeze({schema:'hierarchy-ingestion-preparation/v1',matcherIdentityHash,modelId:BROWSER_MODEL_ID,limits:L,
  numericPreparedOnly:true,nativeObservation:false,productionValidated:false,assignmentAuthority:false});
 let closed=false,tail=Promise.resolve(),closing=null;
 function output(operationId,digest,result){return Object.freeze({schema:'hierarchy-prepared-ingestion/v1',operationId,operationDigest:digest,
  sourceId:operationId,sourceVersion:digest,matcherIdentityHash,titleEmbedding:result.titleEmbedding,decision:result.decision,
  numericPreparedOnly:true,nativeObservation:false,productionValidated:false,assignmentAuthority:false});}
 return Object.freeze({describe:()=>identity,
  async prepare(value){
   if(closed)throw unavailable();let checked=claim(value);
   const {operationId,digest}=checked;
   if(cache.has(digest)){const result=cache.get(digest);cache.delete(digest);cache.set(digest,result);return output(operationId,digest,result);}
   let work=pending.get(digest);
   if(!work){
    if(pending.size>=L.pendingDigests)throw unavailable();
    // Queue at most8 distinct payloads; the installed encoder is single-flight.
    let payload=checked;
    work=tail.then(async()=>{
     try{
      if(closed)throw unavailable();
      const title=titleEmbedding(await embedTitle(payload.title));
      if(closed)throw unavailable();
      const decision=classifyRootedHierarchyMatcher(matcher,{sourceId:operationId,sourceVersion:digest,bodyVector:payload.bodyVector,titleVector:title.values});
      const result=Object.freeze({titleEmbedding:title,decision});
      if(closed)throw unavailable();
      cache.set(digest,result);if(cache.size>L.cachedResults)cache.delete(cache.keys().next().value);
      return result;
     }catch{throw unavailable();}finally{payload=null;}
    });
    pending.set(digest,work);tail=work.then(()=>undefined,()=>undefined);
    void work.then(()=>{pending.delete(digest);},()=>{pending.delete(digest);});
   }
   checked=null;
   const result=await work;if(closed)throw unavailable();return output(operationId,digest,result);
  },
  close(){if(!closing){closed=true;cache.clear();closing=tail.then(()=>undefined);}return closing;},
 });
}
