// Native PostgreSQL fixture SOURCE boundary derived from immutable ADR220.
// Import opens no DB; only the private owned proof scope can mint a fixture.
import {readHierarchySchemaSources} from './hierarchy-schema-source.js';
import {createHash,randomUUID} from 'node:crypto';
import {types} from 'node:util';
import {sourceStamp} from '../../src/domain/source-threads.js';
import {inspectPageUrl} from '../../../../spikes/topic-resolution/browser/core/page-content-policy.js';
const fixtures=new WeakSet(),initialized=new WeakSet();
const initializationFailures=new WeakMap();
const RPC_NAMES=Object.freeze(['install_publication','install_attestation','set_owner_policy','control_publication','issue_command','enqueue_issued',
 'claim','complete','heartbeat','revoke','cleanup','list_jobs','cleanup_finalizations','revoke_attestation','expire_issued','create_root',
 'forget_local','read_native_feed','lookup_operation','resolve_native_source']);
const BOOTSTRAP_STAGES=Object.freeze(['canonical-fixture-seed','hierarchy-schema-load','hierarchy-schema-install','hierarchy-boundary-install']);
// Exact argument type spellings from the immutable schema, deliberately finite.
const CONTEXT_SIGNATURES=Object.freeze({
 active_artifact_hash:'',
 admit_new:'text,bigint,text,text,text,text,text,text,text,double precision[],double precision[],text',
 assert_issued:'text,text',
 assert_publication:'text,text',
 assert_witness:'text,text',
 attach_native_decision:'text,text,jsonb',
 before_publish:'',
 claim:'text,text,text,text,text,text,integer',
 cleanup:'text,text,text,text',
 cleanup_finalizations:'',
 clear_container_incarnation:'',
 complete:'text,text,text,text,text,text,integer',
 control_publication:'text,bigint,text',
 create_root:'text,text,text,text,text,text,text,text,text,text,text,text',
 dirty_feed:'text',
 enqueue:'text,text,text,jsonb,integer,text',
 enqueue_issued:'text,text,text,text',
 enter_gate:'boolean',
 erasure_hook:'',
 exact_keys:'jsonb,text[]',
 expire_issued:'',
 finalize_commit:'',
 flush_feed:'',
 forget_local:'text,text',
 guard_legacy_queue:'',
 guard_source_update:'',
 heartbeat:'text,text,text,text,text,text,integer,integer',
 install_attestation:'jsonb',
 install_publication:'jsonb,jsonb,text',
 issue_command:'jsonb,jsonb',
 job_summary:'hierarchy_native_scoped_ingestion_v2.jobs',
 list_jobs:'text,text,integer',
 lock_issued_enqueue:'text,text,text,jsonb',
 lookup_operation:'text,text,text,text',
 native_live:'text,text',
 native_root_edges:'',
 native_source_erasure:'',
 publish:'jsonb,jsonb',
 queue_source_erasure:'',
 read_native_feed:'text,text,bigint,bigint,text,integer',
 reclassify:'text,text,text,text',
 reject_update:'',
 resolve_native_source:'text,text',
 retire_jobs:'text[],text,boolean,text[]',
 retire_native_issued:'text[],text,boolean,text[]',
 retire_source_operations:'',
 revoke:'text,text,text,text',
 revoke_attestation:'text',
 root_hook:'',
 scoped_forget:'text,text',
 scrub_job:'text,text,text,text',
 scrub_native_job:'',
 set_owner_policy:'text,text,bigint,jsonb,text,text',
 sha:'text',
 update_source:'text,bigint,text,text,text,text,text,text,text,double precision[],double precision[],text,bigint,text,text',
 validate_params:'text,jsonb',
 wire_hash:'double precision[]',
});
function diagnosticStage(stage){return typeof stage==='string'&&(BOOTSTRAP_STAGES.includes(stage)||stage.startsWith('rpc:')&&RPC_NAMES.includes(stage.slice(4)));}
function ownDiagnostic(error,key){const field=Object.getOwnPropertyDescriptor(error,key);return field&&Object.hasOwn(field,'value')?field.value:undefined;}
function diagnosticPosition(value,max){return typeof value==='string'&&/^[1-9][0-9]{0,6}$/u.test(value)&&Number(value)<=max?value:null;}
/** Pure data projection cannot register an error or confer fixture authority.
 * A matched context frame is an observation, never an assertion of root cause.
 */
export function projectHierarchyFixtureFailure(error,stage){
 if(!diagnosticStage(stage)||!error||typeof error!=='object'||types.isProxy(error))return null;
 const code=ownDiagnostic(error,'code'),position=diagnosticPosition(ownDiagnostic(error,'position'),1000000),
  internalPosition=diagnosticPosition(ownDiagnostic(error,'internalPosition'),1000000);
 const sqlState=typeof code==='string'&&/^[A-Z0-9]{5}$/u.test(code)?code:null;
 let functionName=null,functionLine=null;
 const where=ownDiagnostic(error,'where');
 if(typeof where==='string'&&where.length<=8192){
  const lines=where.split('\n');
  if(lines.length<=64)for(const line of lines){
   const frame=/^PL\/pgSQL function hierarchy_native_scoped_ingestion_v2\.([a-z_]+)\(([^()]*)\) line ([1-9][0-9]{0,5}) at (?:SQL statement|RAISE|assignment|IF|RETURN|PERFORM|EXECUTE|FOR over SELECT rows)$/u.exec(line);
   if(frame&&Object.hasOwn(CONTEXT_SIGNATURES,frame[1])&&CONTEXT_SIGNATURES[frame[1]]===frame[2]&&Number(frame[3])<=100000){functionName=frame[1];functionLine=frame[3];break;}
  }
 }
 return Object.freeze({stage,sqlState,position,internalPosition,functionName,functionLine});
}
// Diagnostics grant no authority and retain no error text or SQL content.
function noteInitializationFailure(error,stage){
 try{
  if(!error||typeof error!=='object'||types.isProxy(error)||initializationFailures.has(error))return;
  initializationFailures.set(error,null); // A failed first projection stays final.
  initializationFailures.set(error,projectHierarchyFixtureFailure(error,stage));
 }catch{} // Diagnostics must never replace the original thrown value.
}
export function describeHierarchyFixtureFailure(error){
 if(!error||typeof error!=='object'||types.isProxy(error))return null;
 return initializationFailures.get(error)??null;
}
const SCHEMA='hierarchy_native_scoped_ingestion_v2';
const invalid=()=>{throw new TypeError('Invalid experimental fast admission contract');};
const sha=v=>createHash('sha256').update(v).digest('hex');
function record(v,keys){
 if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)invalid();
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[k]=d.value;}return out;
}
function text(v,max=128){if(typeof v!=='string'||!v.length||!v.isWellFormed()||v.length>max||/[\p{Cc}\p{Cf}]/u.test(v))invalid();return v;}
function hash(v){text(v,64);if(!/^[a-f0-9]{64}$/u.test(v))invalid();return v;}
function integer(v){if(!Number.isSafeInteger(v)||v<0)invalid();return v;}
function vector(v){
 if(!Array.isArray(v)||types.isProxy(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length!==384||Reflect.ownKeys(v).length!==385)invalid();
 const out=[];for(let i=0;i<384;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='number'||!Number.isFinite(d.value))invalid();out.push(d.value);}
 if(Math.abs(Math.hypot(...out)-1)>1e-9)invalid();return out;
}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
/** Exact PostgreSQL array_send; preserves binary64 signed zero, no renormalization. */
export function pairedVectorWire(value){
 const values=vector(value),bytes=Buffer.alloc(20+384*12);
 for(const [offset,n] of [[0,1],[4,0],[8,701],[12,384],[16,1]])bytes.writeInt32BE(n,offset);
 for(let i=0;i<384;i++){bytes.writeInt32BE(8,20+i*12);bytes.writeDoubleBE(values[i],24+i*12);}
 return freeze({sqlArray:'{'+values.map(x=>Object.is(x,-0)?'-0':String(x)).join(',')+'}',wireHash:sha(bytes)});
}

export function prepareFastAdmission(value){
 const a=record(value,['expected','operationId','sourceId','topicId','discussionId','createdAt','url','title','extractorVersion','modelId','bodyHash','builderHash','encoderHash','representationHash','documentHash','bodyVector','titleVector','nodeId']);
 const expected=record(a.expected,['generation','revision']);text(expected.generation);integer(expected.revision);
 for(const k of ['operationId','sourceId','topicId','discussionId','createdAt','extractorVersion','modelId'])text(a[k]);text(a.title,200);text(a.url,2048);
 const inspected=inspectPageUrl(a.url);if(!inspected.supported||inspected.url!==a.url||!a.url.startsWith('https://'))invalid();
 if(a.modelId!=='e5-small-q8-browser-main-prefix-v1'||!['main-text-prefix/v1','article-container-prefix/v1','crawler-static-html-prefix/v1'].includes(a.extractorVersion))invalid();
 for(const k of ['bodyHash','builderHash','encoderHash','representationHash','documentHash'])hash(a[k]);if(a.nodeId!==null)text(a.nodeId);
 const body=vector(a.bodyVector),title=vector(a.titleVector),bodyWire=pairedVectorWire(body),titleWire=pairedVectorWire(title);
 const material=JSON.stringify({url:a.url,title:a.title,extractorVersion:a.extractorVersion,modelId:a.modelId,bodyHash:a.bodyHash,titleHash:sha(a.title),
  builderHash:a.builderHash,encoderHash:a.encoderHash,representationHash:a.representationHash,documentHash:a.documentHash,bodyWireHash:bodyWire.wireHash,titleWireHash:titleWire.wireHash});
 return freeze({parameters:[expected.generation,expected.revision,a.operationId,material,a.sourceId,a.topicId,a.discussionId,a.createdAt,
  sourceStamp({url:a.url,embedding:{modelId:a.modelId,values:body},extractorVersion:a.extractorVersion}),bodyWire.sqlArray,titleWire.sqlArray,a.nodeId],inputHash:sha(material)});
}

function fixture(db){if(!fixtures.has(db)||!initialized.has(db))invalid();}
async function call(db,name,args){
 fixture(db);if(!RPC_NAMES.includes(name))invalid();
 try{return await db.transaction(async tx=>{
  const {rows}=await tx.query('SELECT '+SCHEMA+'.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') AS result',args);
  if(rows.length!==1)invalid();return freeze(rows[0].result);
 });}catch(error){noteInitializationFailure(error,'rpc:'+name);throw error;}
}
/** No caller DB/options/path. Actual canonical001-009 synthetic fixture ONLY.
 * Creating it is a separately gated database execution, not a pure-test step. */
export async function createInputVersionFixtureDatabase(){
 if(arguments.length!==0)invalid();
 const {acquireNativeFixture}=await import('../integration/hierarchy-native-context.js');
 const {seedCanonicalV4RuntimeFixture}=await import('../test/canonical-v4-runtime-fixture.js');
 const raw=await acquireNativeFixture();
 const db={dialect:'pg',query:(...args)=>raw.query(...args),exec:(...args)=>raw.exec(...args),
  transaction:(...args)=>raw.transaction(...args),
  close:async()=>{fixtures.delete(db);initialized.delete(db);await raw.close();}};
 fixtures.add(db);
 try{
  let seeded;
  try{seeded=await seedCanonicalV4RuntimeFixture(db);}catch(error){noteInitializationFailure(error,'canonical-fixture-seed');throw error;}
  Object.defineProperty(db,'fixture',{value:seeded,enumerable:true});
  await initializeFastAdmissionPrototype(db);return db;
 }catch(error){try{await db.close();}catch{}throw error;}
}
export async function initializeFastAdmissionPrototype(db){
 if(!fixtures.has(db)||initialized.has(db)||db.dialect!=='pg')invalid();
 const {rows}=await db.query("SELECT count(*) AS n FROM canonical_v4.schema_migrations");
 if(rows.length!==1||Number(rows[0].n)!==9)invalid();
 const {rows:existing}=await db.query("SELECT nspname FROM pg_namespace WHERE nspname IN('hierarchy_scoped_ingestion_v1','hierarchy_native_scoped_ingestion_v2','hierarchy_fast_admission_v1','hierarchy_fast_queue_v1','hierarchy_fast_input_versions_v1')");
 if(existing.length)invalid();
 let schema,boundary;
 try{({schema,boundary}=await readHierarchySchemaSources());}catch(error){noteInitializationFailure(error,'hierarchy-schema-load');throw error;}
 await db.transaction(async t=>{
  try{await t.exec(schema);}catch(error){noteInitializationFailure(error,'hierarchy-schema-install');throw error;}
  try{await t.exec(boundary);}catch(error){noteInitializationFailure(error,'hierarchy-boundary-install');throw error;}
 });initialized.add(db);
}
/** Protected FABRICATED owner-fixture installers, never serving endpoints. */
export async function installFixturePublication(db,value){
 fixture(db);const a=record(value,['record','head','lineageId']);text(a.lineageId,160);
 return call(db,'install_publication',[JSON.stringify(a.record),JSON.stringify(a.head),a.lineageId]);
}
export async function installFixtureAttestation(db,value){
 fixture(db);return call(db,'install_attestation',[JSON.stringify(value)]);
}
export async function setFixtureOwnerPolicy(db,value){
 const a=record(value,['ownerPrincipal','lineageId','expectedRevision','settings','groupingHash','recordHash']);
 text(a.ownerPrincipal);text(a.lineageId,160);integer(a.expectedRevision);hash(a.groupingHash);hash(a.recordHash);
 return call(db,'set_owner_policy',[a.ownerPrincipal,a.lineageId,a.expectedRevision,JSON.stringify(a.settings),a.groupingHash,a.recordHash]);
}
export async function controlFixturePublication(db,value){
 const a=record(value,['publicationId','expectedHeadRevision','status']);text(a.publicationId,160);integer(a.expectedHeadRevision);
 if(!['accepted','revoked'].includes(a.status))invalid();return call(db,'control_publication',[a.publicationId,a.expectedHeadRevision,a.status]);
}
export async function issueFixtureNativeCommand(db,value){
 fixture(db);const a=record(value,['id','attestationId','description','ownerPolicyRevision','requestHash','parameters']);
 text(a.id);text(a.attestationId);integer(a.ownerPolicyRevision);hash(a.requestHash);
 const issued={schema:'native-scoped-issued-command/v1',id:a.id,attestationId:a.attestationId,description:a.description,ownerPolicyRevision:a.ownerPolicyRevision,requestHash:a.requestHash};
 return call(db,'issue_command',[JSON.stringify(issued),JSON.stringify(a.parameters)]);
}
export async function enqueueIssued(db,value){
 const a=record(value,['generation','operationId','principal','issuedId']);for(const v of Object.values(a))text(v);
 return call(db,'enqueue_issued',[a.generation,a.operationId,a.principal,a.issuedId]);
}
function queueIdentity(value,keys){const a=record(value,keys);
 for(const k of keys){if(['epoch','leaseSeconds','limit'].includes(k)){if(!Number.isInteger(a[k])||a[k]<1)invalid();}
 else if(k==='commandHash')hash(a[k]);else text(a[k]);}return keys.map(k=>a[k]);}
export async function claimScoped(db,v){return call(db,'claim',queueIdentity(v,['generation','operationId','principal','commandHash','worker','token','leaseSeconds']));}
export async function completeScoped(db,v){return call(db,'complete',queueIdentity(v,['generation','operationId','principal','commandHash','worker','token','epoch']));}
export async function heartbeatScoped(db,v){return call(db,'heartbeat',queueIdentity(v,['generation','operationId','principal','commandHash','worker','token','epoch','leaseSeconds']));}
export async function revokeScoped(db,v){return call(db,'revoke',queueIdentity(v,['generation','operationId','principal','commandHash']));}
export async function cleanupScoped(db,v){return call(db,'cleanup',queueIdentity(v,['generation','operationId','principal','commandHash']));}
export async function listScoped(db,v){return call(db,'list_jobs',queueIdentity(v,['generation','principal','limit']));}
export async function cleanupFinalizations(db){return call(db,'cleanup_finalizations',[]);}
export async function revokeFixtureAttestation(db,id){text(id);return call(db,'revoke_attestation',[id]);}
export async function expireFixtureIssued(db){return call(db,'expire_issued',[]);}
export async function createFastRoot(db,value){
 const a=record(value,['actorId','requestId','generation','topicId','body','sourceId','rootId','createdAt','witnessHash','decisionHash']);
 for(const k of ['actorId','requestId','generation','topicId','sourceId','rootId','createdAt'])text(a[k]);hash(a.witnessHash);hash(a.decisionHash);
 if(typeof a.body!=='string'||!a.body.trim()||a.body.length>8000||!a.body.isWellFormed())invalid();
 const material=JSON.stringify({generation:a.generation,command:{type:'create-root',topicId:a.topicId,body:a.body,originSourceId:a.sourceId}});
 const raw=await call(db,'create_root',[a.actorId,a.requestId,sha(material),material,a.generation,a.topicId,a.body,a.sourceId,a.rootId,a.createdAt,a.witnessHash,a.decisionHash]);
 return freeze(JSON.parse(raw));
}

export async function forgetFastSource(db,value){const a=record(value,['generation','sourceId']);text(a.generation);text(a.sourceId);return freeze(JSON.parse(await call(db,'forget_local',[a.generation,a.sourceId])));}
export async function readNativeRootFeed(db,value){
 const a=record(value,['lineageId','nodeId','expectedEpoch','expectedFeedVersion','afterRootId','limit']);text(a.lineageId,160);text(a.nodeId);
 for(const k of ['expectedEpoch','expectedFeedVersion'])if(a[k]!==null&&(typeof a[k]!=='string'||!/^(?:0|[1-9][0-9]{0,18})$/u.test(a[k])))invalid();
 if(a.afterRootId!==null){text(a.afterRootId);if(a.expectedEpoch===null||a.expectedFeedVersion===null)invalid();}
 if(!Number.isInteger(a.limit)||a.limit<1||a.limit>100)invalid();
 return call(db,'read_native_feed',[a.lineageId,a.nodeId,a.expectedEpoch,a.expectedFeedVersion,a.afterRootId,a.limit]);
}
export async function lookupNativeOperation(db,value){
 const a=record(value,['generation','operationId','principal','requestHash']);text(a.generation);text(a.operationId);text(a.principal);hash(a.requestHash);
 const result=await call(db,'lookup_operation',[a.generation,a.operationId,a.principal,a.requestHash]);
 if(result===null)return null;
 return freeze({requestHash:result.requestHash,...(result.result.state==='issued'?{issuedId:result.issuedId}:{}),result:result.result});
}
export async function resolveNativeSource(db,value){
 const a=record(value,['generation','url']);text(a.generation);text(a.url,2048);return call(db,'resolve_native_source',[a.generation,a.url]);
}
/** Normalize actual SQL job responses for the bounded ingress result channel. */
export function nativeQueueResult(raw){
 if(!raw||typeof raw!=='object'||types.isProxy(raw)||Object.getPrototypeOf(raw)!==Object.prototype)invalid();
 const own=(key,optional=false)=>{const d=Object.getOwnPropertyDescriptor(raw,key);if(optional&&!d)return undefined;if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();return d.value;};
 const state=own('state'),direct=own('commandHash',true),commandHash=direct===undefined?own('command_hash',true):direct;
 text(state,32);if(state==='issued'){if(commandHash!==null)invalid();}
 else if(commandHash===null){if(!['expired','cancelled','erased'].includes(state))invalid();}else hash(commandHash);
 let nodes=0,bytes=0;
 function copy(v,depth=0){
  if(++nodes>2048||depth>8)invalid();
  if(v===null||typeof v==='boolean')return v;
  if(typeof v==='number'){if(!Number.isFinite(v))invalid();return v;}
  if(typeof v==='string'){if(!v.isWellFormed()||v.length>4096||(bytes+=Buffer.byteLength(v))>16384)invalid();return v;}
  if(!v||typeof v!=='object'||types.isProxy(v))invalid();
  if(Array.isArray(v)){if(Object.getPrototypeOf(v)!==Array.prototype)invalid();const n=Object.getOwnPropertyDescriptor(v,'length').value;
   if(n>512||Reflect.ownKeys(v).length!==n+1)invalid();const out=[];for(let i=0;i<n;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out.push(copy(d.value,depth+1));}return out;}
  if(Object.getPrototypeOf(v)!==Object.prototype)invalid();const keys=Reflect.ownKeys(v);if(keys.length>32)invalid();const out={};
  for(const k of keys){if(typeof k!=='string'||k==='__proto__'||k.length>160)invalid();const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[k]=copy(d.value,depth+1);}return out;
 }
 const result=copy({state,commandHash,receipt:own('receipt',true)??null,code:own('code',true)??null});
 if(Buffer.byteLength(JSON.stringify(result))>16384)invalid();return freeze(result);
}
/** Fixed-fixture async issuer/queue ports only; genuine native issuance absent. */
export function createFixtureIssuerPorts(db){
 fixture(db);
 return Object.freeze({
  issue:async context=>{
   const issuedId='issued-'+randomUUID();
   await issueFixtureNativeCommand(db,{id:issuedId,attestationId:context.attestationId,description:context.description,
    ownerPolicyRevision:context.ownerPolicyRevision,requestHash:context.requestHash,parameters:context.parameters});
   return freeze({generation:context.auth.generation,operationId:context.operationId,principal:context.auth.principal,issuedId});
  },
  enqueue:async ref=>nativeQueueResult(await enqueueIssued(db,ref)),
  lookupOperation:async context=>lookupNativeOperation(db,{generation:context.generation,operationId:context.operationId,principal:context.principal,requestHash:context.requestHash})
 });
}
