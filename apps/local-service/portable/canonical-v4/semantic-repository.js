// Unregistered production foundation. No IO at import, model execution, native
// attestation, queue creation, canonical destination selection or feed authority.
import {randomUUID,createHash} from 'node:crypto';
import {types} from 'node:util';
import {ServiceError} from '../../src/domain/errors.js';
import {readId,readText,readExpectedVersion,frozenClone} from '../../src/domain/validation.js';
import {BROWSER_MODEL_ID,compatibleExtractor,readLearnedUrl} from '../../src/domain/learned-sources.js';
import {sourceStamp,operationDigestFor} from '../../src/domain/source-threads.js';
import {qualifyRetainedTopicContext} from '../../src/domain/guarded-body-topic-planner.js';
import {RIDGE_PARAMETER_SHA256} from '../../src/domain/ridge-topic-adapter.js';
import {describeRootedHierarchyMatcher} from '../../src/domain/hierarchy-rooted-matcher.js';
import {readIngestionOutcome} from '../../../../spikes/topic-resolution/browser/core/local-service-contract.js';

const invalid=()=>{throw new TypeError('Invalid canonical semantic input');};
const sha=text=>createHash('sha256').update(text).digest('hex');
function record(value,keys){
 if(!value||typeof value!=='object'||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length)invalid();
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[key]=d.value;}return out;
}
function list(value,maximum){
 if(!value||types.isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>maximum||Reflect.ownKeys(value).length!==value.length+1)invalid();
 const out=[];for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out.push(d.value);}return out;
}
function hash(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/u.test(value))invalid();return value;}
function vector(value){
 const out=list(value,384);if(out.length!==384||out.some(n=>typeof n!=='number'||!Number.isFinite(n))||Math.abs(Math.hypot(...out)-1)>1e-6)invalid();return out;
}
const arrayWire=values=>'{'+values.map(n=>Object.is(n,-0)?'-0':String(n)).join(',')+'}';
function claimed(value){
 const a=record(value,['operationId','operationDigest','requestMaterial','input','jobClass','ordinal','attempts','leaseToken','leaseUntil','authorityUntil']);
 const q=record(a.input,['expected','operationId','url','title','embedding','extractorVersion']);
 const expected=readExpectedVersion(record(q.expected,['generation','revision'])),embedding=record(q.embedding,['modelId','values']);
 const input={expected,operationId:readId(q.operationId),url:readLearnedUrl(q.url),title:readText(q.title,200),
  embedding:{modelId:embedding.modelId,values:vector(embedding.values)},extractorVersion:q.extractorVersion};
 if(input.url!==q.url||embedding.modelId!==BROWSER_MODEL_ID||!compatibleExtractor(q.extractorVersion)||input.operationId!==readId(a.operationId)||
  typeof a.requestMaterial!=='string'||Buffer.byteLength(a.requestMaterial,'utf8')>65536)invalid();
 const material=JSON.stringify({url:input.url,title:input.title,embedding:input.embedding,extractorVersion:input.extractorVersion});
 if(material!==a.requestMaterial||operationDigestFor(input)!==hash(a.operationDigest))invalid();
 return {input,digest:a.operationDigest,leaseToken:readId(a.leaseToken)};
}
function prepared(value,claim){
 const p=record(value,['schema','operationId','operationDigest','sourceId','sourceVersion','matcherIdentityHash','titleEmbedding','decision',
  'numericPreparedOnly','nativeObservation','productionValidated','assignmentAuthority']);
 const e=record(p.titleEmbedding,['modelId','values']),d=record(p.decision,['schema','status','semanticPath','rootPath','reason','rootReason',
  'acceptedDetailPaths','maximalDetailPaths','evaluatedDetailNodes','provenance','nativeObservation','productionValidated','assignmentAuthority']);
 if(p.schema!=='hierarchy-prepared-ingestion/v1'||p.operationId!==claim.input.operationId||p.sourceId!==p.operationId||
  p.operationDigest!==claim.digest||p.sourceVersion!==claim.digest||p.numericPreparedOnly!==true||
  p.nativeObservation!==false||p.productionValidated!==false||p.assignmentAuthority!==false||e.modelId!==BROWSER_MODEL_ID||
  d.schema!=='rooted-hierarchy-match/v1'||!['accepted','abstained'].includes(d.status)||
  d.nativeObservation!==false||d.productionValidated!==false||d.assignmentAuthority!==false)invalid();
 const path=list(d.semanticPath,8).map(id=>readText(id,160)),root=list(d.rootPath,1).map(id=>readText(id,160));
 if(new Set(path).size!==path.length||(path.length>0)!==(d.status==='accepted')||
  (path.length?root.length!==1||root[0]!==path[0]:root.length!==0))invalid();
 return {matcherHash:hash(p.matcherIdentityHash),title:vector(e.values),path};
}
function storageFailure(error){
 if(error instanceof ServiceError)return error;
 if(error?.code==='P1201'||error?.code==='P1211'||error?.code==='23505'||error?.code==='23503')return new ServiceError('conflict','Semantic ingestion changed');
 if(error?.code==='P1203'||error?.code==='P1213')return new ServiceError('invalid','Invalid semantic ingestion');
 if(error?.code==='P1204'||error?.code==='P1214')return new ServiceError('storage-corrupt','Invalid semantic ingestion state');
 return new ServiceError('storage-failure','Canonical semantic ingestion failed');
}

export function createCanonicalV4SemanticRepository({database,nextId=kind=>`${kind}-${randomUUID()}`,now=()=>new Date().toISOString()}={}){
 if(!database||typeof database.query!=='function'||typeof nextId!=='function'||typeof now!=='function')invalid();
 return Object.freeze({
  // Invoke these two methods only with an owner-role database. SQL grants no
  // registration/activation capability to app, submitter or worker roles.
  // The owner registration port must use READ COMMITTED (ordinary autocommit
  // default). SQL rejects stronger isolation; this adapter never changes it.
  async registerMatcher(matcher){
   const identityText=JSON.stringify(describeRootedHierarchyMatcher(matcher));if(Buffer.byteLength(identityText,'utf8')>524288)invalid();
   const matcherIdentityHash=sha(identityText);
   try{const {rows}=await database.query('SELECT canonical_v4.semantic_register_matcher($1) AS matcher_hash',[identityText]);
    if(rows.length!==1||rows[0].matcher_hash!==matcherIdentityHash)throw new ServiceError('storage-corrupt','Invalid semantic registration result');
    return Object.freeze({matcherIdentityHash,registered:true,activated:false});
   }catch(error){throw storageFailure(error);}
  },
  async activateMatcher(value){
   const a=record(value,['matcherIdentityHash','expectedRevision']);hash(a.matcherIdentityHash);
   if(!Number.isSafeInteger(a.expectedRevision)||a.expectedRevision<0)invalid();
   try{const {rows}=await database.query('SELECT canonical_v4.semantic_activate_matcher($1,$2) AS revision',[a.matcherIdentityHash,a.expectedRevision]);
    const revision=rows.length===1?Number(rows[0].revision):NaN;
    if(!Number.isSafeInteger(revision)||revision!==a.expectedRevision+1)throw new ServiceError('storage-corrupt','Invalid semantic activation result');
    return Object.freeze({matcherIdentityHash:a.matcherIdentityHash,revision});
   }catch(error){throw storageFailure(error);}
  },
  async apply(value,options){
   const claim=claimed(value),a=record(options,['representedValues','preparation']),p=prepared(a.preparation,claim),input=claim.input;
   const eligible=qualifyRetainedTopicContext({url:input.url,title:input.title})===null;
   const represented=eligible?vector(a.representedValues):null;if(!eligible&&a.representedValues!==null)invalid();
   const sourceId=readId(nextId('source')),topicId=readId(nextId('topic')),discussionId=readId(nextId('discussion')),createdAt=readText(now(),64);
   // One database.query invokes one SQL transaction. The SQL function obtains
   // CURRENT -> lane -> job and calls legacy apply on that same physical backend;
   // semantic recording failure rolls back its canonical writes and job receipt.
   try{const {rows}=await database.query(`SELECT * FROM canonical_v4.semantic_ingest_apply(
    $1,$2,$3,$4::double precision[],$5,$6,$7,$8,$9,$10,$11,$12,$13::double precision[],$14::text[]
   )`,[input.operationId,claim.digest,claim.leaseToken,represented===null?null:arrayWire(represented),RIDGE_PARAMETER_SHA256,
    sourceId,topicId,discussionId,createdAt,sourceStamp(input),true,p.matcherHash,arrayWire(p.title),eligible?p.path:[]]);
    if(rows.length!==1||rows[0].terminal_code!==null||typeof rows[0].response_text!=='string'){
     if(rows.length===1&&rows[0].terminal_code==='source-changed')throw new ServiceError('conflict','State changed');
     throw new ServiceError('storage-corrupt','Invalid semantic ingestion result');
    }
    return frozenClone(readIngestionOutcome(JSON.parse(rows[0].response_text)));
   }catch(error){throw storageFailure(error);}
  },
 });
}
