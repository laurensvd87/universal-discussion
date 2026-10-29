// Worker-only opt-in. Uses already protected body/title vectors. Import and
// construction do no IO; no model, identity creation or canonical post writes.
import {types} from 'node:util';
import {singleSourceTopicFocus,SINGLE_SOURCE_TOPIC_POLICY_HASH} from '../../src/application/single-source-topic-focus.js';
import {ServiceError} from '../../src/domain/errors.js';
const bad=()=>{throw new TypeError('Invalid single page topic request');};
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(v),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v);
const count=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/u.test(v)&&BigInt(v)<=9223372036854775807n;
function fields(v,keys){if(!v||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)bad();
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();out[k]=d.value;}return out;}
function scalar(raw){if(!raw||types.isProxy(raw))bad();const d=Object.getOwnPropertyDescriptor(raw,'rows');
 if(!d||!Object.hasOwn(d,'value')||!Array.isArray(d.value)||types.isProxy(d.value)||d.value.length!==1||Reflect.ownKeys(d.value).length!==2)bad();
 const row=Object.getOwnPropertyDescriptor(d.value,'0');if(!row||!Object.hasOwn(row,'value'))bad();return fields(row.value,['result']).result;}
function storage(e){if(e instanceof ServiceError)return e;return new ServiceError(['P1321','40001','40P01','23505'].includes(e?.code)?'conflict':e?.code==='P1323'?'invalid':'storage-failure','Single page topic matching unavailable');}
const result=(status,subjectId=null,candidates=0)=>Object.freeze({status,subjectId,candidates});
export function createSingleSourceTopicRepository({database}={}){
 if(!database||typeof database.query!=='function')bad();
 return Object.freeze({async match(raw){
  if(typeof raw!=='string'||Buffer.byteLength(raw)>1024)bad();let a;try{a=fields(JSON.parse(raw),['generation','matcherHash','sourceId']);}catch{bad();}
  if(!id(a.generation)||!hash(a.matcherHash)||!id(a.sourceId))bad();
  try{
   const first=await database.query('SELECT canonical_v4.named_read_single_source($1,$2,$3) AS result',[a.generation,a.matcherHash,a.sourceId]);let w,probes;
   try{w=scalar(first);if(w===null)return result('retired');w=fields(w,['sourceId','sourceVersion','operationId','operationDigest','sourceStamp','title']);
    if(w.sourceId!==a.sourceId||!count(w.sourceVersion)||!id(w.operationId)||!hash(w.operationDigest)||!hash(w.sourceStamp))bad();probes=singleSourceTopicFocus(w.title);
   }catch{throw new ServiceError('storage-corrupt','Invalid single page topic material');}
   if(probes.status==='capacity')return result('capacity');if(!probes.focusKeys.length)return result('unresolved');
   const response=await database.query('SELECT canonical_v4.named_match_single_source($1,$2,$3::jsonb,$4::jsonb,$5) AS result',
    [a.generation,a.matcherHash,JSON.stringify(w),JSON.stringify(probes.focusKeys),SINGLE_SOURCE_TOPIC_POLICY_HASH]);
   try{const r=fields(scalar(response),['status','subjectId','candidates']);
    if(!['matched','retained','unresolved','capacity','busy','retired'].includes(r.status)||!Number.isSafeInteger(r.candidates)||r.candidates<0||r.candidates>65||
     (['matched','retained'].includes(r.status)?!uuid(r.subjectId):r.subjectId!==null))bad();return result(r.status,r.subjectId,r.candidates);
   }catch{throw new ServiceError('storage-corrupt','Invalid single page topic result');}
  }catch(e){throw storage(e);}
 }});
}
