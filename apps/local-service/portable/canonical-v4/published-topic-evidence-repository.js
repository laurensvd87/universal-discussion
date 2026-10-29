// Execute-only worker ports. Public text is independently bound by SQL; these
// ports neither reuse an identity nor authorize posting or canonical routing.
import {types} from 'node:util';
import {publishedTopicInput,PUBLISHED_TOPIC_INPUT_HASH} from '../../src/application/published-topic-evidence.js';
import {ServiceError} from '../../src/domain/errors.js';
const bad=()=>{throw new TypeError('Invalid public topic evidence request');};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v),id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(v);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v);
const count=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/u.test(v)&&BigInt(v)<=9223372036854775807n;
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
function fields(v,keys){if(!v||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)bad();
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();out[k]=d.value;}return out;}
function list(v,max){if(types.isProxy(v)||!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>max||Reflect.ownKeys(v).length!==v.length+1)bad();
 return Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();return d.value;});}
function parsed(v,max=262144){if(typeof v!=='string'||Buffer.byteLength(v)>max)bad();try{return JSON.parse(v);}catch{bad();}}
function scalar(raw){if(!raw||types.isProxy(raw))bad();const d=Object.getOwnPropertyDescriptor(raw,'rows');if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();
 const rows=list(d.value,1);if(rows.length!==1)bad();return fields(rows[0],['result']).result;}
function vector(v){const a=list(v,384);if(a.length!==384||a.some(n=>typeof n!=='number'||!Number.isFinite(n))||Math.abs(Math.hypot(...a)-1)>1e-5)bad();return a;}
function witness(v){const w=fields(v,['rootId','topicId','caption','body','rootVersion','publicDigest']);
 const input=publishedTopicInput(JSON.stringify({rootId:w.rootId,topicId:w.topicId,caption:w.caption,body:w.body}));
 if(!uuid(w.topicId)||!count(w.rootVersion)||w.publicDigest!==input.publicDigest)bad();return {w,input};}
function scope(v){const a=fields(parsed(v),['generation','matcherHash']);if(!id(a.generation)||!hash(a.matcherHash))bad();return a;}
const storage=error=>error instanceof ServiceError?error:new ServiceError(['P1311','40001','40P01'].includes(error?.code)?'conflict':error?.code==='P1313'?'invalid':'storage-failure','Public topic evidence unavailable');
function output(read){try{return read();}catch{throw new ServiceError('storage-corrupt','Invalid public topic evidence result');}}

export function createPublishedTopicEvidenceRepository({database}={}){
 if(!database||typeof database.query!=='function')bad();
 return Object.freeze({
  async tasks(raw){const a=scope(raw);try{
   const rows=await database.query('SELECT canonical_v4.named_public_tasks($1,$2) AS result',[a.generation,a.matcherHash]);
   return output(()=>{const seen=new Set();return freeze(list(scalar(rows),2).map(v=>{
    const r=fields(v,['eventId','kind','scopeId','witness','skipEncoding']);if(!count(r.eventId)||r.eventId==='0'||seen.has(r.eventId)||!uuid(r.scopeId)||
      !['root','scope'].includes(r.kind)||typeof r.skipEncoding!=='boolean')bad();seen.add(r.eventId);
    if(r.kind==='scope'&&(r.witness!==null||!r.skipEncoding))bad();
    if(r.witness!==null){const {w}=witness(r.witness);if(r.kind!=='root'||w.topicId!==r.scopeId)bad();r.witness=w;}
    else if(!r.skipEncoding)bad();return r;
   }));});
  }catch(e){throw storage(e);}},
  async repair(raw){const a=fields(parsed(raw),['generation','matcherHash','eventId']);if(!id(a.generation)||!hash(a.matcherHash)||!count(a.eventId)||a.eventId==='0')bad();
   try{const r=await database.query('SELECT canonical_v4.named_repair_public_scope($1,$2,$3::bigint) AS result',[a.generation,a.matcherHash,a.eventId]);
    return output(()=>{const s=scalar(r);if(!['completed','advanced','busy','retired'].includes(s))bad();return s;});
   }catch(e){throw storage(e);}},
  async defer(raw){const a=fields(parsed(raw),['generation','eventId']);if(!id(a.generation)||!count(a.eventId)||a.eventId==='0')bad();
   try{const r=await database.query('SELECT canonical_v4.named_defer_public_evidence($1,$2::bigint) AS result',[a.generation,a.eventId]);
    return output(()=>{const s=scalar(r);if(typeof s!=='boolean')bad();return s;});
   }catch(e){throw storage(e);}},
  async store(raw){const a=fields(parsed(raw),['generation','matcherHash','eventId','witness','prepared']);if(!id(a.generation)||!hash(a.matcherHash)||!count(a.eventId)||a.eventId==='0')bad();
   let focus=null,body=null,title=null,exclusion=null;
   const w=a.witness===null?null:witness(a.witness);
   if(a.prepared!==null){if(!w)bad();const p=fields(a.prepared,['bodyValues','titleValues','exclusion']);
    if(p.exclusion!==null){if(p.exclusion!=='insufficient-public-text'||w.input.meaningful||p.bodyValues!==null||p.titleValues!==null)bad();exclusion=p.exclusion;}
    else{if(!w.input.meaningful)bad();focus=w.input.focusKey;body=vector(p.bodyValues);title=vector(p.titleValues);}
   }
   try{const r=await database.query('SELECT canonical_v4.named_store_public_evidence($1,$2,$3::bigint,$4::jsonb,$5,$6::double precision[],$7::double precision[],$8,$9) AS result',
    [a.generation,a.matcherHash,a.eventId,w===null?null:JSON.stringify(w.w),focus,body,title,exclusion,PUBLISHED_TOPIC_INPUT_HASH]);
    return output(()=>{const s=scalar(r);if(!['stored','retained','excluded','busy','retired'].includes(s))bad();return s;});
   }catch(e){throw storage(e);}},
  async candidates(raw){const a=fields(parsed(raw,32768),['generation','representationHash','focusKeys']);if(!id(a.generation)||!hash(a.representationHash))bad();
   const keys=list(a.focusKeys,128);if(!keys.length||keys.some(k=>!hash(k))||new Set(keys).size!==keys.length)bad();
   try{const rows=await database.query('SELECT canonical_v4.named_public_candidates($1,$2,$3::jsonb) AS result',[a.generation,a.representationHash,JSON.stringify(keys)]);
    return output(()=>{const seen=new Set();return freeze(list(scalar(rows),64).map(v=>{
     const r=fields(v,['rootId','topicId','caption','body','rootVersion','publicDigest','representationHash','focusKey','inputHash','vector','identityRevision','headPresent']);
     const {input}=witness(Object.fromEntries(['rootId','topicId','caption','body','rootVersion','publicDigest'].map(k=>[k,r[k]])));
     if(r.representationHash!==a.representationHash||r.inputHash!==PUBLISHED_TOPIC_INPUT_HASH||r.focusKey!==input.focusKey||!keys.includes(r.focusKey)||
       !count(r.identityRevision)||r.identityRevision==='0'||typeof r.headPresent!=='boolean'||seen.has(r.topicId))bad();seen.add(r.topicId);r.vector=vector(r.vector);return r;
    }));});
   }catch(e){throw storage(e);}},
 });
}
