// Opt-in memory-only queued canonical prototype. No registration or production authority.
import { createPGliteDatabase } from '../../../src/database.js';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { sourceStamp } from '../../../../src/domain/source-threads.js';
import { inspectPageUrl } from '../../../../../../spikes/topic-resolution/browser/core/page-content-policy.js';

const fixtures=new WeakSet();
/** Creates only a new memory engine; caller applies the canonical fixture explicitly. */
export async function createInputVersionFixtureDatabase(){const raw=await createPGliteDatabase();
 const tx={dialect:'pglite',query:(...a)=>raw.query(...a),exec:(...a)=>raw.exec(...a)};
 const db={...tx,close:()=>raw.close(),transaction:async(fn,commit='COMMIT')=>{
  await raw.exec('BEGIN');
  try{const result=await fn(tx);await raw.exec(commit);return result;}
  catch(e){try{await raw.exec('ROLLBACK');}catch{}throw e;}
 }};
 fixtures.add(db);return db;}
const SCHEMA='hierarchy_scoped_ingestion_v1';
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
async function call(db,name,args){
 const run=async tx=>{const {rows}=await tx.query('SELECT '+SCHEMA+'.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') AS result',args);
 if(rows.length!==1)invalid();return freeze(rows[0].result);};return db.transaction?db.transaction(run):run(db);
}
export async function initializeFastAdmissionPrototype(db){
 // Requires an explicitly disposable canonical schema already initialized by its owner.
 if(!fixtures.has(db)||db?.dialect!=='pglite')invalid();
 const {rows}=await db.query("SELECT (SELECT count(*) FROM canonical_v4.schema_migrations) AS migrations,to_regnamespace('hierarchy_fast_admission_v1') AS admission,to_regnamespace('hierarchy_fast_queue_v1') AS queue,to_regnamespace('hierarchy_fast_input_versions_v1') AS versions");
 if(Number(rows[0].migrations)!==9||rows[0].admission||rows[0].queue||rows[0].versions)invalid();
 fixtures.delete(db);
 const sql=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
 await db.transaction(async tx=>{await tx.exec(sql);await tx.exec(await readFile(new URL('./boundary.sql',import.meta.url),'utf8'));});
}
export async function publishFastAdmissionArtifact(db,value){
 const a=record(value,['builderHash','encoderHash','representationHash','modelHash','policyHash','modelId','nodes']);
 for(const k of ['builderHash','encoderHash','representationHash','modelHash','policyHash'])hash(a[k]);if(a.modelId!=='e5-small-q8-browser-main-prefix-v1')invalid();
 if(!Array.isArray(a.nodes)||types.isProxy(a.nodes)||Object.getPrototypeOf(a.nodes)!==Array.prototype||a.nodes.length<1||a.nodes.length>128||Reflect.ownKeys(a.nodes).length!==a.nodes.length+1)invalid();
 const nodes=[];for(let i=0;i<a.nodes.length;i++){const d=Object.getOwnPropertyDescriptor(a.nodes,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();nodes.push(text(d.value));}
 if(new Set(nodes).size!==nodes.length)invalid();const {nodes:ignored,...identity}=a;
 return call(db,'publish',[JSON.stringify(identity),JSON.stringify(nodes)]);
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
export async function admitFastNewSource(db,value){return executePrepared(db,'admission',prepareFastAdmission(value).parameters);}
export async function createFastRoot(db,value){
 const a=record(value,['actorId','requestId','generation','topicId','body','sourceId','rootId','createdAt','witnessHash','decisionHash']);
 for(const k of ['actorId','requestId','generation','topicId','sourceId','rootId','createdAt'])text(a[k]);hash(a.witnessHash);hash(a.decisionHash);
 if(typeof a.body!=='string'||!a.body.trim()||a.body.length>8000||!a.body.isWellFormed())invalid();
 const material=JSON.stringify({generation:a.generation,command:{type:'create-root',topicId:a.topicId,body:a.body,originSourceId:a.sourceId}});
 const raw=await call(db,'create_root',[a.actorId,a.requestId,sha(material),material,a.generation,a.topicId,a.body,a.sourceId,a.rootId,a.createdAt,a.witnessHash,a.decisionHash]);
 return freeze(JSON.parse(raw));
}
export async function reclassifyFastSource(db,value){
 const a=record(value,['sourceId','witnessHash','decisionHash','nodeId']);text(a.sourceId);hash(a.witnessHash);hash(a.decisionHash);if(a.nodeId!==null)text(a.nodeId);
 return call(db,'reclassify',[a.sourceId,a.witnessHash,a.decisionHash,a.nodeId]);
}
export async function forgetFastSource(db,value){
 const a=record(value,['generation','sourceId']);text(a.generation);text(a.sourceId);return freeze(JSON.parse(await call(db,'forget_local',[a.generation,a.sourceId])));
}
/** Owner-only IDs projection. Not native, write, provider or Source authority. */
export async function readFastRootFeed(db,value){
 const a=record(value,['nodeId','expectedFeedVersion','afterRootId','limit']);text(a.nodeId);if(a.afterRootId!==null)text(a.afterRootId);
 if(a.expectedFeedVersion!==null&&(typeof a.expectedFeedVersion!=='string'||!/^(?:0|[1-9][0-9]{0,18})$/u.test(a.expectedFeedVersion)))invalid();
 if(a.afterRootId!==null&&a.expectedFeedVersion===null||!Number.isInteger(a.limit)||a.limit<1||a.limit>100)invalid();
 return db.transaction(async tx=>{
  const {rows:versions}=await tx.query('SELECT (feed_version+coalesce((SELECT delta FROM '+SCHEMA+'.feed_dirty WHERE tx=pg_catalog.txid_current() AND node_id=$1),0))::text AS version FROM '+SCHEMA+'.nodes WHERE node_id=$1 FOR SHARE',[a.nodeId]);
  if(versions.length!==1)return freeze({status:'missing-node',rootRefs:[]});const version=versions[0].version;
  if(a.expectedFeedVersion!==null&&a.expectedFeedVersion!==version)return freeze({status:'stale-feed',feedVersion:version,rootRefs:[]});
  const {rows}=await tx.query('SELECT s.root_id AS "rootId",s.topic_id AS "topicId",s.discussion_id AS "discussionId" FROM '+SCHEMA+'.root_snapshots s JOIN canonical_v4.contributions c ON c.id=s.root_id JOIN canonical_v4.discussions d ON d.id=c.discussion_id AND d.topic_id=s.topic_id WHERE s.node_id=$1 AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility=\'local-public\' AND c.discussion_id=s.discussion_id AND ($2::text IS NULL OR s.root_id COLLATE "C">$2 COLLATE "C") ORDER BY s.root_id COLLATE "C" LIMIT $3',[a.nodeId,a.afterRootId,a.limit+1]);
  return freeze({status:'ready',feedVersion:version,rootRefs:rows.slice(0,a.limit),nextAfterRootId:rows.length>a.limit?rows[a.limit-1].rootId:null,assignmentAuthority:false});
 });
}


/** Exact addressed prior identity; the paired admission material is validated before SQL. */
export async function updateFastSource(db,value){
 const a=record(value,['admission','prior']);
 const prior=record(a.prior,['sourceVersion','witnessHash','decisionHash']);
 if(typeof prior.sourceVersion!=='string'||!/^[1-9][0-9]{0,15}$/u.test(prior.sourceVersion))invalid();
 hash(prior.witnessHash);hash(prior.decisionHash);
 const prepared=prepareFastAdmission(a.admission);
 return executePrepared(db,'update',[...prepared.parameters,prior.sourceVersion,prior.witnessHash,prior.decisionHash]);
}


const FIXTURE_PRINCIPAL='account-11111111-1111-4111-8111-111111111111';
function queueMetadata(a){
 if(!['actor','crawler'].includes(a.originKind)||!['admission','update'].includes(a.mode))invalid();
 text(a.principal);hash(a.producerProofHash);if(!Number.isInteger(a.authoritySeconds)||a.authoritySeconds<1||a.authoritySeconds>30)invalid();
}
function queueIdentity(value,keys){
 if(!value||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)invalid();
 const a={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();a[key]=d.value;
  if(['epoch','leaseSeconds','limit'].includes(key)){if(!Number.isInteger(a[key])||a[key]<1)invalid();}
  else if(key==='commandHash')hash(a[key]);else text(a[key]);}
 return keys.map(k=>a[k]);
}
export async function enqueueScoped(db,value){
 const a=record(value,['originKind','principal','mode','parameters','authoritySeconds','producerProofHash']);
 queueMetadata(a);
 const p=a.parameters,n=a.mode==='admission'?12:15;
 if(!Array.isArray(p)||types.isProxy(p)||Object.getPrototypeOf(p)!==Array.prototype||p.length!==n||Reflect.ownKeys(p).length!==n+1)invalid();
 const safe=[];for(let i=0;i<n;i++){const d=Object.getOwnPropertyDescriptor(p,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();
  const v=d.value;if(i===1)integer(v);else if(i===11&&v===null){}else if([3,9,10].includes(i)){
   if(typeof v!=='string'||!v.isWellFormed()||Buffer.byteLength(v)<1||Buffer.byteLength(v)>(i===3?32768:16384))invalid();
  }else if([8,13,14].includes(i))hash(v);else if(i===12){
   if(typeof v!=='string'||!(/^[1-9][0-9]{0,15}$/u).test(v)||BigInt(v)>9007199254740991n)invalid();
  }else text(v,i===7?64:128);safe.push(v);}
 const budget=[...safe];budget[9]=null;budget[10]=null;
 // jsonb::text uses comma-space separators; include that server encoding cost.
 if(Buffer.byteLength(JSON.stringify(budget))+n-1>49152)invalid();
 return call(db,'enqueue',[a.originKind,a.principal,a.mode,JSON.stringify(safe),a.authoritySeconds,a.producerProofHash]);
}
export async function claimScoped(db,a){return call(db,'claim',queueIdentity(a,['generation','operationId','principal','commandHash','worker','token','leaseSeconds']));}
export async function completeScoped(db,a){return call(db,'complete',queueIdentity(a,['generation','operationId','principal','commandHash','worker','token','epoch']));}
export async function heartbeatScoped(db,a){return call(db,'heartbeat',queueIdentity(a,['generation','operationId','principal','commandHash','worker','token','epoch','leaseSeconds']));}
/** Revocation commits separately; cleanup is a separate explicit call. */
export async function revokeScoped(db,a){return call(db,'revoke',queueIdentity(a,['generation','operationId','principal','commandHash']));}
export async function cleanupScoped(db,a){return call(db,'cleanup',queueIdentity(a,['generation','operationId','principal','commandHash']));}
export async function listScoped(db,a){return call(db,'list_jobs',queueIdentity(a,['generation','principal','limit']));}
/** Explicit separate transaction, at most 100 prior finalized proofs; never automatic postcommit cleanup. */
export async function cleanupFinalizations(db){return call(db,'cleanup_finalizations',[]);}
/** Server allocation seam: existing operations are reconciled before callbacks. */
export async function enqueueObservation(db,value,dependencies){
 const a=record(value,['originKind','principal','admission','authoritySeconds','producerProofHash']);
 const {allocate,now}=record(dependencies,['allocate','now']);if(typeof allocate!=='function'||typeof now!=='function')invalid();
 queueMetadata({...a,mode:'admission'});
 const input=record(a.admission,['expected','operationId','url','title','extractorVersion','modelId','bodyHash','builderHash','encoderHash','representationHash','documentHash','bodyVector','titleVector','nodeId']);
 const provisional=prepareFastAdmission({...input,sourceId:'unallocated-source',topicId:'unallocated-topic',discussionId:'unallocated-discussion',createdAt:'unallocated-time'});
 const existing=(await db.query('SELECT 1 FROM '+SCHEMA+'.jobs WHERE generation=$1 AND operation_id=$2',[provisional.parameters[0],provisional.parameters[2]])).rows.length;
 if(existing)return enqueueScoped(db,{originKind:a.originKind,principal:a.principal,mode:'admission',parameters:provisional.parameters,authoritySeconds:a.authoritySeconds,producerProofHash:a.producerProofHash});
 const ids=record(allocate(),['sourceId','topicId','discussionId']);
 const prepared=prepareFastAdmission({...input,...ids,createdAt:now()});
 return enqueueScoped(db,{originKind:a.originKind,principal:a.principal,mode:'admission',parameters:prepared.parameters,authoritySeconds:a.authoritySeconds,producerProofHash:a.producerProofHash});
}
async function executePrepared(db,mode,parameters){
 const queued=await enqueueScoped(db,{originKind:'actor',principal:FIXTURE_PRINCIPAL,mode,parameters,authoritySeconds:30,producerProofHash:'a'.repeat(64)});
 const identity={generation:parameters[0],operationId:parameters[2],principal:FIXTURE_PRINCIPAL,commandHash:queued.commandHash??queued.command_hash,
 worker:'fixture-worker',token:'fixture-token-'+parameters[2],leaseSeconds:15};
 if(queued.state==='complete')return queued.receipt;
 const leased=await claimScoped(db,identity);
 return completeScoped(db,{...identity,epoch:leased.epoch});
}
