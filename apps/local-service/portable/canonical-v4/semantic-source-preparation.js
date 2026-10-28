// Verify stored canonical material before local numerical work. No IO at import,
// native capture claim, canonical mutation or permission to publish a result.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {decodeEmbeddingBase64Array} from './embedding-binary-wire.js';
import {BROWSER_MODEL_ID,LEARNED_SOURCE_PROVENANCE,compatibleExtractor,readLearnedUrl} from '../../src/domain/learned-sources.js';
import {readId,readText} from '../../src/domain/validation.js';
import {sourceStamp,operationDigestFor} from '../../src/domain/source-threads.js';
import {qualifyRetainedTopicContext} from '../../src/domain/guarded-body-topic-planner.js';
import {describeRootedHierarchyMatcher,classifyRootedHierarchyMatcher} from '../../src/domain/hierarchy-rooted-matcher.js';

const invalid=()=>{throw new TypeError('Invalid stored semantic Source');};
const unavailable=()=>Object.assign(new Error('Stored semantic preparation unavailable'),{code:'unavailable'});
const sha=value=>createHash('sha256').update(value).digest('hex');
const MAX=65536;
function record(value,keys){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)invalid();
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[key]=d.value;}return out;
}
function hash(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/u.test(value))invalid();return value;}
function counter(value){if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,18})$/u.test(value)||BigInt(value)>9223372036854775807n)invalid();return value;}
function json(value){if(typeof value!=='string'||Buffer.byteLength(value)>MAX)invalid();let out;
 try{out=JSON.parse(value);}catch{invalid();}if(!out||typeof out!=='object'||Array.isArray(out))invalid();return out;}
function vector(value,typed=false){
 if(!value||types.isProxy(value)||!(Array.isArray(value)||typed&&value instanceof Float64Array)||
  ![Array.prototype,Float64Array.prototype].includes(Object.getPrototypeOf(value))||value.length!==384||
  Reflect.ownKeys(value).length!==(Array.isArray(value)?385:384))invalid();
 const out=[];for(let i=0;i<384;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));
  if(!d?.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='number'||!Number.isFinite(d.value))invalid();out.push(d.value);}
 if(Math.abs(Math.hypot(...out)-1)>1e-6)invalid();return out;
}
function equalVector(left,right){if(left.length!==right.length||left.some((n,i)=>!Object.is(n,right[i])))invalid();}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}

export function verifyStoredSourceCandidate(value){
 try{
  const a=record(value,['sourceId','ordinal','sourceVersion','generation','matcherIdentityHash','url','title','provenance','extractorVersion','policyVersion',
   'operationId','hasEmbedding','sourcePayload','embedding','receipt','stamp','reuse']);
  readId(a.sourceId);counter(a.ordinal);counter(a.sourceVersion);readId(a.generation);hash(a.matcherIdentityHash);readId(a.operationId);
  if(a.provenance!==LEARNED_SOURCE_PROVENANCE||a.hasEmbedding!==true||!compatibleExtractor(a.extractorVersion)||
   readLearnedUrl(a.url)!==a.url||readText(a.title,200)!==a.title||readText(a.policyVersion,160)!==a.policyVersion)invalid();
  const e=record(a.embedding,['sourceId','modelId','dimensions','payload','valuesBase64','values']);
  if(e.sourceId!==a.sourceId||e.modelId!==BROWSER_MODEL_ID||e.dimensions!==384)invalid();
  const body=vector(decodeEmbeddingBase64Array(e.valuesBase64));equalVector(body,vector(e.values));
  const ep=json(e.payload),sp=json(a.sourcePayload);
  if(ep.modelId!==e.modelId)invalid();equalVector(body,vector(ep.values));
  if(sp.id!==a.sourceId||sp.url!==a.url||sp.title!==a.title||sp.provenance!==a.provenance||sp.extractorVersion!==a.extractorVersion||
   sp.policyVersion!==a.policyVersion||sp.operationId!==a.operationId)invalid();
  // Normalized imports deliberately store embeddings in their own table.
  // If a later writer includes a duplicate, it must match the verified wire.
  if(Object.hasOwn(sp,'embedding')){
   const duplicate=record(sp.embedding,['modelId','values']);if(duplicate.modelId!==e.modelId)invalid();
   equalVector(body,vector(duplicate.values));
  }
  const receipt=record(a.receipt,['sourceId','operationId','operationDigest']),stamp=record(a.stamp,['sourceId','stamp','postable']);
  if(receipt.sourceId!==a.sourceId||receipt.operationId!==a.operationId||stamp.sourceId!==a.sourceId||typeof stamp.postable!=='boolean')invalid();
  const input={url:a.url,title:a.title,embedding:{modelId:e.modelId,values:body},extractorVersion:a.extractorVersion};
  const requestMaterial=JSON.stringify(input),digest=operationDigestFor(input),computedStamp=sourceStamp(input);
  if(Buffer.byteLength(requestMaterial)>MAX||hash(receipt.operationDigest)!==digest||sp.operationDigest!==digest||hash(stamp.stamp)!==computedStamp)invalid();
  const bodyWireHash=sha(Buffer.from(e.valuesBase64,'base64'));
  let reuse=null;
  if(a.reuse!==null){
   const r=record(a.reuse,['matcherIdentityHash','encoderHash','representationHash','operationDigest','bodyWireHash','titleValuesBase64','titleValues']);
   hash(r.matcherIdentityHash);hash(r.encoderHash);hash(r.representationHash);hash(r.operationDigest);hash(r.bodyWireHash);
   const title=vector(decodeEmbeddingBase64Array(r.titleValuesBase64));equalVector(title,vector(r.titleValues));
   if(r.operationDigest!==digest||r.bodyWireHash!==bodyWireHash)invalid();
   reuse={encoderHash:r.encoderHash,representationHash:r.representationHash,titleValues:title};
  }
  return freeze({sourceId:a.sourceId,sourceVersion:a.sourceVersion,generation:a.generation,matcherIdentityHash:a.matcherIdentityHash,
   operationId:a.operationId,operationDigest:digest,requestMaterial,sourceStamp:computedStamp,bodyWireHash,
   title:a.title,bodyValues:body,semanticEligible:stamp.postable&&qualifyRetainedTopicContext({url:a.url,title:a.title})===null,reuse});
 }catch{invalid();}
}

export function createStoredSourceHierarchyPreparation({matcher,embedTitle}={}){
 if(typeof embedTitle!=='function')invalid();const identity=describeRootedHierarchyMatcher(matcher),matcherIdentityHash=sha(JSON.stringify(identity));
 const cache=new Map(),pending=new Map();let closed=false,tail=Promise.resolve(),closing=null;
 function bind(checked,titleValues){
  const decision=classifyRootedHierarchyMatcher(matcher,{sourceId:checked.sourceId,sourceVersion:checked.sourceVersion,
   bodyVector:checked.bodyValues,titleVector:titleValues});
  return freeze({generation:checked.generation,matcherIdentityHash,sourceId:checked.sourceId,sourceVersion:checked.sourceVersion,operationId:checked.operationId,
   operationDigest:checked.operationDigest,requestMaterial:checked.requestMaterial,sourceStamp:checked.sourceStamp,bodyWireHash:checked.bodyWireHash,
   titleValues:[...titleValues],supportedPath:[...decision.semanticPath],semanticEligible:true});
 }
 return Object.freeze({
  async prepare(value){
   if(closed)throw unavailable();let checked=verifyStoredSourceCandidate(value);
   if(checked.matcherIdentityHash!==matcherIdentityHash)invalid();
   // Excluded material is neither encoded nor dressed up as a numeric title.
   if(!checked.semanticEligible)return null;
   const digest=checked.operationDigest;
   if(checked.reuse?.encoderHash===identity.inputDefinition.encoderHash&&checked.reuse.representationHash===identity.representationHash)
    return bind(checked,checked.reuse.titleValues);
   if(cache.has(digest)){const title=cache.get(digest);cache.delete(digest);cache.set(digest,title);return bind(checked,title);}
   let work=pending.get(digest);
   if(!work){
    if(pending.size>=8)throw unavailable();let title=checked.title;
    work=tail.then(async()=>{try{
     if(closed)throw unavailable();const encoded=record(await embedTitle(title),['modelId','values']);
     if(encoded.modelId!==BROWSER_MODEL_ID)invalid();const values=Object.freeze(vector(encoded.values,true));
     if(closed)throw unavailable();cache.set(digest,values);if(cache.size>32)cache.delete(cache.keys().next().value);return values;
    }catch{throw unavailable();}finally{title=null;}});
    pending.set(digest,work);tail=work.then(()=>undefined,()=>undefined);void work.then(()=>pending.delete(digest),()=>pending.delete(digest));
   }
   // The bounded shared work retains a title, not this full stored candidate.
   const titleValues=await work;if(closed)throw unavailable();return bind(checked,titleValues);
  },
  close(){if(!closing){closed=true;cache.clear();closing=tail.then(()=>undefined);}return closing;},
 });
}
