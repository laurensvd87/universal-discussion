// Stored Source -> public subject association only. No inference, provider IO,
// public registry mutation, author intent or contribution routing authority.
import {types} from 'node:util';
import {readId} from '../../src/domain/validation.js';
const invalid=()=>{throw new TypeError('Invalid public Source subject request');};
const counter=v=>{if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,18})$/u.test(v)||BigInt(v)>9223372036854775807n)invalid();return v;};
const hash=v=>{if(typeof v!=='string'||!/^[a-f0-9]{64}$/u.test(v))invalid();return v;};
const uuid=v=>{if(typeof v!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v))invalid();return v;};
const freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
function record(value,keys){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)invalid();
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[key]=d.value;}return out;
}
function list(value,max){
 if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype)invalid();
 const n=Object.getOwnPropertyDescriptor(value,'length').value;if(n>max||Reflect.ownKeys(value).length!==n+1)invalid();
 return Array.from({length:n},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();return d.value;});
}
const witnessKeys=['generation','sourceId','sourceVersion','operationId','operationDigest','sourceStamp'];
function witness(value,withOrdinal=false){
 const v=record(value,[...witnessKeys,...(withOrdinal?['ordinal']:[])]);readId(v.generation);readId(v.sourceId);readId(v.operationId);
 counter(v.sourceVersion);hash(v.operationDigest);hash(v.sourceStamp);if(withOrdinal)counter(v.ordinal);return v;
}
async function result(database,sql,parameters){const response=await database.query(sql,parameters),rows=list(response.rows,1);if(rows.length!==1)invalid();return record(rows[0],['result']).result;}
function text(v,max){if(typeof v!=='string'||!v||v.length>max||!v.isWellFormed()||v.trim()!==v||/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(v))invalid();return v;}
function subject(value){const s=record(value,['subjectId','providerKey','revision','articleTitle','label','labelLanguage','description','descriptionLanguage']);
 uuid(s.subjectId);if(typeof s.providerKey!=='string'||!/^Q[1-9][0-9]{0,10}$/u.test(s.providerKey))invalid();counter(s.revision);if(s.revision==='0')invalid();
 text(s.articleTitle,200);text(s.label,200);if(![null,'en','de','nl','mul'].includes(s.labelLanguage)||![null,'en','de','nl'].includes(s.descriptionLanguage))invalid();
 if(s.description!==null)text(s.description,400);if((s.description===null)!==(s.descriptionLanguage===null))invalid();return s;}

export function createPublicSubjectSourceRepository({database}={}){
 if(!database||typeof database.query!=='function')invalid();
 return Object.freeze({
  async candidates(value){
   const v=record(value,['generation','afterOrdinal','limit']);readId(v.generation);if(v.afterOrdinal!==null)counter(v.afterOrdinal);
   if(!Number.isInteger(v.limit)||v.limit<1||v.limit>50)invalid();
   const raw=await result(database,'SELECT canonical_v4.subject_binding_candidates($1,$2::bigint,$3) AS result',[v.generation,v.afterOrdinal,v.limit]);
   const rows=list(raw,v.limit),seen=new Set();let previous=v.afterOrdinal;
   const parsed=rows.map(row=>{const r=witness(row,true);if(r.generation!==v.generation||seen.has(r.sourceId)||previous!==null&&BigInt(r.ordinal)<=BigInt(previous))invalid();seen.add(r.sourceId);previous=r.ordinal;return r;});
   return freeze(parsed);
  },
  async bind(value){
   const v=witness(value),raw=await result(database,'SELECT canonical_v4.subject_bind_source($1,$2,$3::bigint,$4,$5,$6) AS result',
    [v.generation,v.sourceId,v.sourceVersion,v.operationId,v.operationDigest,v.sourceStamp]);
   const r=record(raw,['status','sourceId','sourceVersion','subjectId','subjectRevision']);
   if(r.sourceId!==v.sourceId||r.sourceVersion!==v.sourceVersion||!['bound','unresolved','ineligible'].includes(r.status))invalid();
   if(r.status==='bound'){uuid(r.subjectId);counter(r.subjectRevision);if(r.subjectRevision==='0')invalid();}
   else if(r.subjectId!==null||r.subjectRevision!==null)invalid();return freeze(r);
  },
  async context(value){
   const v=record(value,['generation','sourceId','language']);readId(v.generation);readId(v.sourceId);if(!['en','de','nl'].includes(v.language))invalid();
   const raw=await result(database,'SELECT canonical_v4.subject_read_source($1,$2,$3) AS result',[v.generation,v.sourceId,v.language]);
   const r=record(raw,['status','sourceId','sourceVersion','subject']);counter(r.sourceVersion);
   if(r.sourceId!==v.sourceId||!['bound','pending','ineligible'].includes(r.status))invalid();
   if(r.status==='bound')r.subject=subject(r.subject);else if(r.subject!==null)invalid();return freeze(r);
  },
 });
}
