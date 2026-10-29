// Explicit worker-only derived retrieval ports. No IO on import, model/capture,
// canonical queue claim, identity publication, role grant or startup DDL.
import {types} from 'node:util';
import {ServiceError} from '../../src/domain/errors.js';
import {automaticSubjectTitleTerms} from '../../src/application/automatic-subject-cohort.js';
const bad=()=>{throw new TypeError('Invalid named retrieval request');};
const corrupt=()=>{throw new ServiceError('storage-corrupt','Invalid named retrieval result');};
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(v),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v);
const counter=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/u.test(v)&&BigInt(v)<=9223372036854775807n;
const positive=v=>counter(v)&&v!=='0';
function fields(v,keys){if(!v||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)bad();
 const r={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();r[k]=d.value;}return r;}
function parsed(raw,max=8192){if(typeof raw!=='string'||Buffer.byteLength(raw)>max)bad();try{return JSON.parse(raw);}catch{bad();}}
function scope(raw,extra=[]){const a=fields(parsed(raw),['generation','matcherHash',...extra]);if(!id(a.generation)||!hash(a.matcherHash))bad();return a;}
function row(raw){const rows=raw.rows;if(!Array.isArray(rows)||types.isProxy(rows)||rows.length!==1)bad();return fields(rows[0],['result']).result;}
function snapshot(raw,sourceId){if(raw===null)return null;const s=fields(raw,['sourceId','sourceVersion','operationId','operationDigest','sourceStamp','title']);
 if(s.sourceId!==sourceId||!counter(s.sourceVersion)||!id(s.operationId)||!hash(s.operationDigest)||!hash(s.sourceStamp)||
    typeof s.title!=='string'||!s.title.isWellFormed()||s.title.length>200||!s.title.trim()||/[\u0000-\u001f\u007f]/u.test(s.title))bad();return s;}
const freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
function storage(e){if(e instanceof ServiceError)return e;if(['P1291','40001','23505'].includes(e?.code))return new ServiceError('conflict','Named retrieval material changed');
 if(e?.code==='P1293')return new ServiceError('invalid','Invalid named retrieval request');return new ServiceError('storage-failure','Named retrieval unavailable');}

export function createAutomaticSubjectRetrievalRepository({database}={}){
 if(!database||typeof database.query!=='function')bad();
 async function readList(raw,discovery){
  const a=scope(raw),fn=discovery?'named_discovery_tasks':'named_index_tasks';
  try{const r=await database.query('SELECT canonical_v4.'+fn+'($1,$2)::text AS result',[a.generation,a.matcherHash]);
   try{const values=parsed(row(r),16384);if(!Array.isArray(values)||values.length>(discovery?4:8))bad();const seen=new Set();
    return freeze(values.map(v=>{const t=fields(v,discovery?['sourceId','indexOrdinal']:['sourceId','queueOrdinal','snapshot']);
     if(!id(t.sourceId)||seen.has(t.sourceId)||!positive(t[discovery?'indexOrdinal':'queueOrdinal']))bad();seen.add(t.sourceId);
     if(!discovery)t.snapshot=snapshot(t.snapshot,t.sourceId);return t;
    }));
   }catch{corrupt();}
  }catch(e){throw storage(e);}
 }
 return Object.freeze({
  indexTasks:raw=>readList(raw,false),discoveryTasks:raw=>readList(raw,true),
  async index(raw){
   const a=scope(raw,['task']),t=fields(a.task,['sourceId','queueOrdinal','snapshot']);if(!id(t.sourceId)||!positive(t.queueOrdinal))bad();
   const s=snapshot(t.snapshot,t.sourceId),terms=s?automaticSubjectTitleTerms(s.title):[];
   try{const r=await database.query('SELECT canonical_v4.named_index_source($1,$2,$3,$4::bigint,$5::jsonb,$6::jsonb) AS result',
     [a.generation,a.matcherHash,t.sourceId,t.queueOrdinal,JSON.stringify(s),JSON.stringify(terms)]);
    const value=row(r);if(!['indexed','zero-paired-norm','obsolete','retired'].includes(value))corrupt();return value;
   }catch(e){throw storage(e);}
  },
  async neighbours(raw){
   const a=scope(raw,['sourceId','indexOrdinal']);if(!id(a.sourceId)||!positive(a.indexOrdinal))bad();
   try{const r=await database.query('SELECT canonical_v4.named_neighbours($1,$2,$3,$4::bigint)::text AS result',[a.generation,a.matcherHash,a.sourceId,a.indexOrdinal]);
    try{const value=row(r);if(value===null)return null;const rows=parsed(value,4194304);if(!Array.isArray(rows)||rows.length>128)bad();return freeze(rows);}catch{corrupt();}
   }catch(e){throw storage(e);}
  },
  async complete(raw){
   const a=scope(raw,['sourceId','indexOrdinal']);if(!id(a.sourceId)||!positive(a.indexOrdinal))bad();
   try{const r=await database.query('SELECT canonical_v4.named_complete_discovery($1,$2,$3,$4::bigint) AS result',[a.generation,a.matcherHash,a.sourceId,a.indexOrdinal]);
    const value=row(r);if(typeof value!=='boolean')corrupt();return value;
   }catch(e){throw storage(e);}
  },
 });
}
