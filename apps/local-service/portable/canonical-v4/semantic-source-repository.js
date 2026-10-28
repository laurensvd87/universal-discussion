// Ordinary stored-material ports. Import performs no IO. Returned candidates
// are mirrors for independent verification, never capture/queue authority.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {ServiceError} from '../../src/domain/errors.js';
import {readId,readText} from '../../src/domain/validation.js';
import {readLearnedUrl,compatibleExtractor,BROWSER_MODEL_ID} from '../../src/domain/learned-sources.js';
import {sourceStamp} from '../../src/domain/source-threads.js';
import {qualifyRetainedTopicContext} from '../../src/domain/guarded-body-topic-planner.js';
import {decodeEmbeddingBase64Array} from './embedding-binary-wire.js';

export const STORED_SOURCE_LIMITS=Object.freeze({batch:50,bytes:4194304,sourcePayload:65536,embeddingPayload:32768,dimensions:384});
const L=STORED_SOURCE_LIMITS,MAX=9223372036854775807n;
const invalid=()=>{throw new TypeError('Invalid stored semantic Source request');};
const corrupt=()=>{throw new ServiceError('storage-corrupt','Invalid stored semantic Source response');};
const sha=value=>createHash('sha256').update(value).digest('hex');
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
function record(value,keys){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)invalid();
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[key]=d.value;}return out;
}
function list(value,max){
 if(!value||types.isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>max||Reflect.ownKeys(value).length!==value.length+1)invalid();
 return Array.from({length:value.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();return d.value;});
}
function counter(value){if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,18})$/u.test(value)||BigInt(value)>MAX)invalid();return value;}
function hash(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/u.test(value))invalid();return value;}
function blob(value,max){if(typeof value!=='string'||value.length>max||Buffer.byteLength(value,'utf8')>max)invalid();return value;}
function text(value,max){return readText(value,max);}
const nullableText=(value,max)=>value===null?null:text(value,max);
function vector(value){const a=list(value,384);if(a.length!==384||a.some(n=>typeof n!=='number'||!Number.isFinite(n))||Math.abs(Math.hypot(...a)-1)>1e-6)invalid();return a;}
function wireBytes(value){const bytes=Buffer.alloc(20+384*12);for(const [offset,n] of [[0,1],[4,0],[8,701],[12,384],[16,1]])bytes.writeInt32BE(n,offset);
 for(let i=0;i<384;i++){bytes.writeInt32BE(8,20+i*12);bytes.writeDoubleBE(value[i],24+i*12);}return bytes;}
const wireText=value=>'{'+value.map(n=>Object.is(n,-0)?'-0':String(n)).join(',')+'}';
function decoded(value){blob(value,6200);const values=decodeEmbeddingBase64Array(value);if(values.length!==384)invalid();return values;}
function scope(value,fields){const a=record(value,['generation','matcherIdentityHash',...fields]);readId(a.generation);hash(a.matcherIdentityHash);return a;}
function candidate(value,a){
 const c=record(value,['sourceId','ordinal','sourceVersion','generation','matcherIdentityHash','url','title','provenance','extractorVersion','policyVersion',
  'operationId','hasEmbedding','sourcePayload','embedding','receipt','stamp','reuse']);
 readId(c.sourceId);counter(c.ordinal);counter(c.sourceVersion);
 if(c.generation!==a.generation||c.matcherIdentityHash!==a.matcherIdentityHash||c.provenance!=='owner-local-page-embedding/v1'||typeof c.hasEmbedding!=='boolean')invalid();
 text(c.url,2048);text(c.title,200);nullableText(c.extractorVersion,160);nullableText(c.policyVersion,128);nullableText(c.operationId,128);blob(c.sourcePayload,L.sourcePayload);
 const e=record(c.embedding,['sourceId','modelId','dimensions','payload','valuesBase64']);readId(e.sourceId);text(e.modelId,128);blob(e.payload,L.embeddingPayload);
 if(e.sourceId!==c.sourceId||e.dimensions!==384)invalid();const values=decoded(e.valuesBase64);
 const r=record(c.receipt,['sourceId','operationId','operationDigest']);readId(r.operationId);hash(r.operationDigest);
 const s=record(c.stamp,['sourceId','stamp','postable']);hash(s.stamp);
 if(r.sourceId!==c.sourceId||s.sourceId!==c.sourceId||typeof s.postable!=='boolean')invalid();
 let reuse=null,wireReuse=null;
 if(c.reuse!==null){const old=record(c.reuse,['matcherIdentityHash','encoderHash','representationHash','operationDigest','bodyWireHash','titleValuesBase64']);
  for(const key of ['matcherIdentityHash','encoderHash','representationHash','operationDigest','bodyWireHash'])hash(old[key]);
  reuse={...old,titleValues:decoded(old.titleValuesBase64)};wireReuse=old;
 }
 const wire={...c,embedding:e,receipt:r,stamp:s,reuse:wireReuse};
 return {value:{...c,embedding:{...e,values},receipt:r,stamp:s,reuse},bytes:Buffer.byteLength(JSON.stringify(wire),'utf8')};
}
const sourceKeys=['generation','matcherIdentityHash','sourceId','sourceVersion','operationId','operationDigest','requestMaterial','sourceStamp','bodyWireHash'];
function item(value,a,adoption){
 const row=record(value,[...sourceKeys,...(adoption?['rootId','rootVersion','topicId','discussionId']:['titleValues','supportedPath','semanticEligible'])]);
 if(row.generation!==a.generation||row.matcherIdentityHash!==a.matcherIdentityHash)invalid();
 readId(row.sourceId);counter(row.sourceVersion);readId(row.operationId);hash(row.operationDigest);hash(row.sourceStamp);hash(row.bodyWireHash);blob(row.requestMaterial,65536);
 const material=record(JSON.parse(row.requestMaterial),['url','title','embedding','extractorVersion']),embedding=record(material.embedding,['modelId','values']);
 const body=vector(embedding.values);if(embedding.modelId!==BROWSER_MODEL_ID||!compatibleExtractor(material.extractorVersion)||readLearnedUrl(material.url)!==material.url)invalid();text(material.title,200);
 const exact=JSON.stringify({url:material.url,title:material.title,embedding:{modelId:embedding.modelId,values:body},extractorVersion:material.extractorVersion});
 if(exact!==row.requestMaterial||sha(exact)!==row.operationDigest||sourceStamp({url:material.url,embedding:{modelId:embedding.modelId,values:body},extractorVersion:material.extractorVersion})!==row.sourceStamp||sha(wireBytes(body))!==row.bodyWireHash)invalid();
 if(adoption){readId(row.rootId);counter(row.rootVersion);readId(row.topicId);readId(row.discussionId);return row;}
 const title=vector(row.titleValues),path=list(row.supportedPath,8).map(n=>text(n,160));
 if(new Set(path).size!==path.length||typeof row.semanticEligible!=='boolean'||!row.semanticEligible&&path.length||
  row.semanticEligible&&qualifyRetainedTopicContext({url:material.url,title:material.title})!==null)invalid();
 return {...row,titleValues:wireText(title),supportedPath:path};
}
function batch(value,adoption){
 const a=scope(value,['items']),items=list(a.items,L.batch);if(!items.length)invalid();
 const rows=items.map(v=>item(v,a,adoption)),ids=new Set();
 for(const row of rows){const id=adoption?row.rootId:row.sourceId;if(ids.has(id))invalid();ids.add(id);}
 const wire=JSON.stringify(rows);if(Buffer.byteLength(wire,'utf8')>L.bytes)invalid();return {a,rows,wire};
}
function storage(error){if(error instanceof ServiceError)return error;
 if(['P1231','40001','23505'].includes(error?.code))return new ServiceError('conflict','Stored Source state changed');
 if(['P1233','P1203'].includes(error?.code))return new ServiceError('invalid','Invalid stored Source operation');
 if(error?.code==='P1234')return new ServiceError('storage-corrupt','Stored Source mirrors disagree');
 return new ServiceError('storage-failure','Stored Source operation failed');}

export function createCanonicalV4SemanticSourceRepository({database}={}){
 if(!database||typeof database.query!=='function')invalid();
 return Object.freeze({
  async requested(value){
   const a=scope(value,[]);
   try{const result=await database.query('SELECT * FROM canonical_v4.semantic_take_source_preparation_request($1,$2)',[a.generation,a.matcherIdentityHash]);
    let rows;try{rows=list(result.rows,1);}catch{corrupt();}
    const out=rows.map(raw=>{try{return candidate(record(raw,['candidate']).candidate,a);}catch{corrupt();}});
    if(out.some(row=>row.bytes>L.bytes))corrupt();
    return freeze({generation:a.generation,matcherIdentityHash:a.matcherIdentityHash,candidates:out.map(row=>row.value)});
   }catch(error){throw storage(error);}
  },
  async candidates(value){
   const a=scope(value,['afterOrdinal','limit']);if(a.afterOrdinal!==null)counter(a.afterOrdinal);
   if(!Number.isInteger(a.limit)||a.limit<1||a.limit>L.batch)invalid();
   try{const result=await database.query('SELECT * FROM canonical_v4.semantic_read_source_candidates($1,$2,$3::bigint,$4)',[a.generation,a.matcherIdentityHash,a.afterOrdinal,a.limit]);
    let rows;try{rows=list(result.rows,a.limit);}catch{corrupt();}let bytes=0,previous=a.afterOrdinal;const ids=new Set(),out=[];
    for(const raw of rows){let parsed;try{parsed=candidate(record(raw,['candidate']).candidate,a);}catch{corrupt();}
     const c=parsed.value;bytes+=parsed.bytes;if(bytes>L.bytes||ids.has(c.sourceId)||previous!==null&&BigInt(c.ordinal)<=BigInt(previous))corrupt();
     ids.add(c.sourceId);previous=c.ordinal;out.push(c);
    }
    return freeze({generation:a.generation,matcherIdentityHash:a.matcherIdentityHash,candidates:out});
   }catch(error){throw storage(error);}
  },
  async reclassify(value){
   let checked;try{checked=batch(value,false);}catch{invalid();}const {a,rows,wire}=checked;
   try{const result=await database.query('SELECT * FROM canonical_v4.semantic_reclassify_stored_sources($1,$2,$3::jsonb)',[a.generation,a.matcherIdentityHash,wire]);
    let found;try{found=list(result.rows,rows.length);}catch{corrupt();}if(found.length!==rows.length)corrupt();const seen=new Set();
    const out=found.map(raw=>{let r;try{r=record(raw,['source_id','source_version','status']);readId(r.source_id);counter(r.source_version);}catch{corrupt();}
     const expected=rows.find(row=>row.sourceId===r.source_id);if(!expected||expected.sourceVersion!==r.source_version||seen.has(r.source_id)||!['recorded','reused'].includes(r.status))corrupt();
     seen.add(r.source_id);return {sourceId:r.source_id,sourceVersion:r.source_version,status:r.status};});return freeze(out);
   }catch(error){throw storage(error);}
  },
  // Owner-role port only; worker/app/submitter cannot execute adoption SQL.
  async adoptLegacyRoots(value){
   let checked;try{checked=batch(value,true);}catch{invalid();}const {a,rows,wire}=checked;
   try{const result=await database.query('SELECT * FROM canonical_v4.semantic_adopt_legacy_roots($1,$2,$3::jsonb)',[a.generation,a.matcherIdentityHash,wire]);
    let found;try{found=list(result.rows,rows.length);}catch{corrupt();}if(found.length!==rows.length)corrupt();const seen=new Set();
    const out=found.map(raw=>{let r;try{r=record(raw,['root_id','status']);readId(r.root_id);}catch{corrupt();}
     if(!rows.some(row=>row.rootId===r.root_id)||seen.has(r.root_id)||!['adopted','existing'].includes(r.status))corrupt();seen.add(r.root_id);return {rootId:r.root_id,status:r.status};});return freeze(out);
   }catch(error){throw storage(error);}
  },
 });
}
