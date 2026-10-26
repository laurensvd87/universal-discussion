// Opt-in owner-only canonical prototype. No registration, classifier or authority mint.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { sourceStamp } from '../../../../src/domain/source-threads.js';
import { inspectPageUrl } from '../../../../../../spikes/topic-resolution/browser/core/page-content-policy.js';

const SCHEMA='hierarchy_fast_admission_v1';
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
 const {rows}=await db.query('SELECT '+SCHEMA+'.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') AS result',args);
 if(rows.length!==1)invalid();return freeze(rows[0].result);
}
export async function initializeFastAdmissionPrototype(db){
 // Requires an explicitly disposable canonical schema already initialized by its owner.
 if(db?.dialect!=='pglite')invalid();
 const sql=await readFile(new URL('./schema.sql',import.meta.url),'utf8');await db.transaction(tx=>tx.exec(sql));
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
export async function admitFastNewSource(db,value){return call(db,'admit_new',prepareFastAdmission(value).parameters);}
export async function createFastRoot(db,value){
 const a=record(value,['actorId','requestId','generation','topicId','body','sourceId','rootId','createdAt','witnessHash']);
 for(const k of ['actorId','requestId','generation','topicId','sourceId','rootId','createdAt'])text(a[k]);hash(a.witnessHash);
 if(typeof a.body!=='string'||!a.body.trim()||a.body.length>8000||!a.body.isWellFormed())invalid();
 const material=JSON.stringify({generation:a.generation,command:{type:'create-root',topicId:a.topicId,body:a.body,originSourceId:a.sourceId}});
 const raw=await call(db,'create_root',[a.actorId,a.requestId,sha(material),material,a.generation,a.topicId,a.body,a.sourceId,a.rootId,a.createdAt,a.witnessHash]);
 return freeze(JSON.parse(raw));
}
export async function reclassifyFastSource(db,value){
 const a=record(value,['sourceId','witnessHash','nodeId']);text(a.sourceId);hash(a.witnessHash);if(a.nodeId!==null)text(a.nodeId);
 return call(db,'reclassify',[a.sourceId,a.witnessHash,a.nodeId]);
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
  const {rows:versions}=await tx.query('SELECT feed_version::text AS version FROM '+SCHEMA+'.nodes WHERE node_id=$1 FOR SHARE',[a.nodeId]);
  if(versions.length!==1)return freeze({status:'missing-node',rootRefs:[]});const version=versions[0].version;
  if(a.expectedFeedVersion!==null&&a.expectedFeedVersion!==version)return freeze({status:'stale-feed',feedVersion:version,rootRefs:[]});
  const {rows}=await tx.query('SELECT s.root_id AS "rootId",s.topic_id AS "topicId",s.discussion_id AS "discussionId" FROM '+SCHEMA+'.root_snapshots s JOIN canonical_v4.contributions c ON c.id=s.root_id JOIN canonical_v4.discussions d ON d.id=c.discussion_id AND d.topic_id=s.topic_id WHERE s.node_id=$1 AND c.root_id IS NULL AND NOT c.withdrawn AND c.visibility=\'local-public\' AND c.discussion_id=s.discussion_id AND ($2::text IS NULL OR s.root_id COLLATE "C">$2 COLLATE "C") ORDER BY s.root_id COLLATE "C" LIMIT $3',[a.nodeId,a.afterRootId,a.limit+1]);
  return freeze({status:'ready',feedVersion:version,rootRefs:rows.slice(0,a.limit),nextAfterRootId:rows.length>a.limit?rows[a.limit-1].rootId:null,assignmentAuthority:false});
 });
}
