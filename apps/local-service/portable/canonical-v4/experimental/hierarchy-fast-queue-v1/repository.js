// Owner-only prepared-evidence queue. No worker/router registration or authority mint.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { prepareFastAdmission } from '../hierarchy-fast-admission-v1/repository.js';
const NS='hierarchy_fast_queue_v1';
const invalid=()=>{throw new TypeError('Invalid experimental fast queue contract');};
const conflict=()=>{throw new Error('Fast queue identity/state conflict');};
const sha=v=>createHash('sha256').update(v).digest('hex');
function record(v,keys){
 if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)invalid();
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[k]=d.value;}return out;
}
function id(v){if(typeof v!=='string'||!v.length||v.length>128||!v.isWellFormed()||/[\p{Cc}\p{Cf}]/u.test(v))invalid();return v;}
function hash(v){if(typeof v!=='string'||!/^[a-f0-9]{64}$/u.test(v))invalid();return v;}
function seconds(v,max){if(!Number.isInteger(v)||v<1||v>max)invalid();return v;}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
function view(j){return freeze({schema:'source-local-fast-queue-receipt/v1',policyVersion:'source-local-canonical-container/v1',
 operationId:j.operation_id,actorId:j.actor_id,commandHash:j.command_hash,state:j.state,attempts:j.attempts,
 receipt:j.receipt,experimental:true,productionValidated:false,assignmentAuthority:false});}
async function lock(tx){await tx.query('SELECT pg_advisory_xact_lock(914092008,1)');}
async function job(tx,a){
 const j=(await tx.query('SELECT * FROM '+NS+'.jobs WHERE operation_id=$1 FOR UPDATE',[a.operationId])).rows[0];
 if(!j||j.actor_id!==a.actorId||j.command_hash!==a.commandHash)conflict();
 const runtime=(await tx.query('SELECT generation FROM canonical_v4.runtime_state WHERE singleton FOR SHARE')).rows[0];
 if(runtime.generation!==j.generation)conflict();return j;
}
async function expire(tx,j){
 if(!['pending','leased'].includes(j.state))return j;
 return (await tx.query(`UPDATE ${NS}.jobs SET state='expired',parameters=NULL,source_url=NULL,worker_id=NULL,lease_token=NULL,lease_until=NULL
 WHERE operation_id=$1 AND deadline<=clock_timestamp() RETURNING *`,[j.operation_id])).rows[0]??j;
}
function identity(v,extra=[]){const a=record(v,['actorId','operationId','commandHash',...extra]);id(a.actorId);id(a.operationId);hash(a.commandHash);return a;}
function leaseIdentity(v){const a=identity(v,['workerId','leaseToken']);id(a.workerId);id(a.leaseToken);return a;}
function held(j,a){if(j.state!=='leased'||j.worker_id!==a.workerId||j.lease_token!==a.leaseToken)conflict();}
export async function initializeFastQueuePrototype(db){
 if(db?.dialect!=='pglite')invalid();
 await db.transaction(async tx=>{await tx.exec(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));});
}
export function prepareFastQueueCommand(value){
 const a=record(value,['schema','policyVersion','actorId','admission']);
 if(a.schema!=='source-local-fast-queue-command/v1'||a.policyVersion!=='source-local-canonical-container/v1')invalid();id(a.actorId);
 const prepared=prepareFastAdmission(a.admission);
 // Includes allocations, expected generation/revision and initial node, unlike
 // the underlying admission's representation-only replay identity. SQL vector
 // strings preserve signed zero across persistent JSON round trips.
 const material=JSON.stringify({schema:a.schema,policyVersion:a.policyVersion,actorId:a.actorId,parameters:prepared.parameters});
 if(Buffer.byteLength(material)>65536)invalid();
 return freeze({actorId:a.actorId,operationId:prepared.parameters[2],commandHash:sha(material),parameters:prepared.parameters,
 generation:prepared.parameters[0],url:JSON.parse(prepared.parameters[3]).url});
}
export async function enqueueFastAdmission(db,value){
 const a=record(value,['command','authoritySeconds']);seconds(a.authoritySeconds,30);const c=prepareFastQueueCommand(a.command);
 return db.transaction(async tx=>{
  await lock(tx);
  const prior=(await tx.query('SELECT * FROM '+NS+'.jobs WHERE operation_id=$1 FOR UPDATE',[c.operationId])).rows[0];
  if(prior){if(prior.actor_id!==c.actorId||prior.command_hash!==c.commandHash)conflict();return view(await expire(tx,await job(tx,c)));}
  const runtime=(await tx.query('SELECT * FROM canonical_v4.runtime_state WHERE singleton FOR SHARE')).rows[0];
  if(runtime.generation!==c.generation||Number(runtime.revision)<c.parameters[1]||Number(runtime.source_absence_revision)>c.parameters[1])conflict();
  if((await tx.query(`SELECT 1 FROM canonical_v4.ingestion_jobs WHERE operation_id=$1 OR source_url=$2 AND state IN('pending','leased')
   UNION ALL SELECT 1 FROM canonical_v4.operation_receipts WHERE operation_id=$1
   UNION ALL SELECT 1 FROM canonical_v4.sources WHERE url=$2
   UNION ALL SELECT 1 FROM hierarchy_fast_admission_v1.receipts WHERE operation_id=$1`,[c.operationId,c.url])).rows.length)conflict();
  if(Number((await tx.query(`SELECT count(*) AS n FROM ${NS}.jobs WHERE state IN('pending','leased')`)).rows[0].n)>=8)conflict();
  const j=(await tx.query(`INSERT INTO ${NS}.jobs(operation_id,actor_id,command_hash,generation,source_url,parameters,state,deadline)
   VALUES($1,$2,$3,$4,$5,$6::jsonb,'pending',clock_timestamp()+$7*interval '1 second') RETURNING *`,
   [c.operationId,c.actorId,c.commandHash,c.generation,c.url,JSON.stringify(c.parameters),a.authoritySeconds])).rows[0];return view(j);
 });
}
export async function claimFastAdmission(db,value){
 const a=identity(value,['workerId','leaseToken','leaseSeconds']);id(a.workerId);id(a.leaseToken);seconds(a.leaseSeconds,10);
 return db.transaction(async tx=>{
  await lock(tx);let j=await expire(tx,await job(tx,a));
  if(j.state==='leased'){
   const live=(await tx.query('SELECT lease_until>clock_timestamp() AS live FROM '+NS+'.jobs WHERE operation_id=$1',[a.operationId])).rows[0].live;
   if(live){held(j,a);return view(j);}
   if(j.lease_token===a.leaseToken)conflict();
  }else if(j.state!=='pending')return view(j);
  if(j.attempts>=3){j=(await tx.query(`UPDATE ${NS}.jobs SET state='expired',parameters=NULL,source_url=NULL,worker_id=NULL,lease_token=NULL,lease_until=NULL WHERE operation_id=$1 RETURNING *`,[a.operationId])).rows[0];return view(j);}
  j=(await tx.query(`UPDATE ${NS}.jobs SET state='leased',attempts=attempts+1,worker_id=$2,lease_token=$3,
   lease_until=least(deadline,clock_timestamp()+$4*interval '1 second') WHERE operation_id=$1 RETURNING *`,[a.operationId,a.workerId,a.leaseToken,a.leaseSeconds])).rows[0];return view(j);
 });
}
export async function heartbeatFastAdmission(db,value){
 const a=identity(value,['workerId','leaseToken','leaseSeconds']);id(a.workerId);id(a.leaseToken);seconds(a.leaseSeconds,10);
 return db.transaction(async tx=>{await lock(tx);const j=await job(tx,a);held(j,a);
  const rows=(await tx.query(`UPDATE ${NS}.jobs SET lease_until=least(deadline,clock_timestamp()+$4*interval '1 second')
   WHERE operation_id=$1 AND worker_id=$2 AND lease_token=$3 AND deadline>clock_timestamp() AND lease_until>clock_timestamp() RETURNING *`,
   [a.operationId,a.workerId,a.leaseToken,a.leaseSeconds])).rows;if(rows.length!==1)conflict();return view(rows[0]);});
}
export async function completeFastAdmission(db,value){
 const a=leaseIdentity(value);
 return db.transaction(async tx=>{await lock(tx);const j=await job(tx,a);
  const leaseHash=sha(JSON.stringify([a.workerId,a.leaseToken]));
  if(j.state==='complete'){if(j.completed_lease_hash!==leaseHash)conflict();return view(j);}held(j,a);
  if(!(await tx.query(`SELECT 1 FROM ${NS}.jobs WHERE operation_id=$1 AND deadline>clock_timestamp() AND lease_until>clock_timestamp()`,[a.operationId])).rows.length)conflict();
  const args=j.parameters;
  const receipt=(await tx.query('SELECT hierarchy_fast_admission_v1.admit_new('+args.map((_,i)=>'$'+(i+1)).join(',')+') AS receipt',args)).rows[0].receipt;
  // Recheck after canonical work; failure rolls back BOTH admission and receipt.
  const rows=(await tx.query(`UPDATE ${NS}.jobs SET state='complete',parameters=NULL,source_url=NULL,worker_id=NULL,lease_token=NULL,lease_until=NULL,
   result_source_id=$2,receipt=$3::jsonb,completed_lease_hash=$4 WHERE operation_id=$1 AND deadline>clock_timestamp() AND lease_until>clock_timestamp() RETURNING *`,
   [a.operationId,receipt.sourceId,JSON.stringify(receipt),leaseHash])).rows;if(rows.length!==1)conflict();return view(rows[0]);
 });
}
export async function cancelFastAdmission(db,value){
 const a=identity(value);return db.transaction(async tx=>{await lock(tx);let j=await job(tx,a);
  if(['pending','leased'].includes(j.state))j=(await tx.query(`UPDATE ${NS}.jobs SET state='cancelled',parameters=NULL,source_url=NULL,worker_id=NULL,lease_token=NULL,lease_until=NULL WHERE operation_id=$1 RETURNING *`,[a.operationId])).rows[0];return view(j);});
}
