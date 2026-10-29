// General-web registry adapter. Imports are inert. Publication recomputes the
// explicit v2 planner from prepared material; it never accepts a caller's plan.
// SQL atomically verifies current protected Sources/candidates/revisions. Neither
// port grants canonical posting authority or provider/network/model capability.
import {types} from 'node:util';
import {createHash} from 'node:crypto';
import {planAutomaticNamedSubjectsV2} from '../../src/application/automatic-named-subject-plan.js';
import {ServiceError} from '../../src/domain/errors.js';
const bad=()=>{throw new TypeError('Invalid automatic subject request');};
const corrupt=()=>{throw new ServiceError('storage-corrupt','Invalid automatic subject result');};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(v);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v);
const count=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/u.test(v)&&BigInt(v)<=9223372036854775807n;
const freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
function fields(v,keys){
 if(!v||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)bad();
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();out[k]=d.value;}return out;
}
function list(v,max){
 if(!v||types.isProxy(v)||!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>max||Reflect.ownKeys(v).length!==v.length+1)bad();
 return Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();return d.value;});
}
function parsed(raw,max=1048576){if(typeof raw!=='string'||Buffer.byteLength(raw)>max)bad();try{return JSON.parse(raw);}catch{bad();}}
function result(raw){const rows=list(raw.rows,1);if(rows.length!==1)bad();return fields(rows[0],['result']).result;}
function storage(error){if(error instanceof ServiceError)return error;
 if(['P1281','40001','23505'].includes(error?.code))return new ServiceError('conflict','Automatic subject state changed');
 if(error?.code==='P1283')return new ServiceError('invalid','Invalid automatic subject publication');
 return new ServiceError('storage-failure','Automatic subject storage unavailable');}

export function createAutomaticNamedSubjectRepository({database}={}){
 if(!database||typeof database.query!=='function')bad();
 return Object.freeze({
  async publish(rawJson){
   const plan=planAutomaticNamedSubjectsV2(rawJson),input=JSON.parse(rawJson);
   if(plan.proposalStatus==='capacity')return freeze({status:'capacity',subjects:[],selections:[]});
   if(!plan.commitWitnesses.length)return freeze({status:'no-material',subjects:[],selections:[]});
   if(plan.updates.some(u=>/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(u.label)))bad();
   for(const w of plan.commitWitnesses){
    const expected=createHash('sha256').update(JSON.stringify([w.sourceId,w.sourceVersion,w.operationId,w.operationDigest,w.sourceStamp])).digest('hex');
    if(input.observations.find(o=>o.sourceId===w.sourceId)?.inputHash!==expected)bad();
   }
   const command={generation:plan.generation,policyHash:plan.policyHash,matcherHash:plan.matcherHash,representationHash:plan.representationHash,
    updates:plan.updates,selections:plan.selections,witnesses:plan.commitWitnesses,
    candidates:input.candidates.map(c=>({subjectId:c.subjectId,revision:c.revision,focusKey:c.focusKey,contextRootId:c.contextRootId}))};
   const wire=JSON.stringify(command);if(Buffer.byteLength(wire)>4194304)bad();
   try{
    const raw=await database.query('SELECT canonical_v4.named_publish($1::jsonb) AS result',[wire]);
    let r,subjects,selections;try{
     r=fields(result(raw),['generation','policyHash','subjects','selections']);
     if(r.generation!==plan.generation||r.policyHash!==plan.policyHash)bad();
     const seen=new Set();subjects=list(r.subjects,128).map(value=>{
      const row=fields(value,['subjectId','revision']),expected=plan.updates.find(u=>u.subjectId===row.subjectId);
      if(!expected||seen.has(row.subjectId)||!count(row.revision)||BigInt(row.revision)!==(expected.expectedRevision===null?1n:BigInt(expected.expectedRevision)+1n))bad();
      seen.add(row.subjectId);return row;
     });if(subjects.length!==plan.updates.length)bad();
     selections=list(r.selections,64).map(v=>fields(v,['sourceId','sourceVersion','subjectId','reason']));
     if(selections.length!==plan.selections.length)bad();
     for(let i=0;i<selections.length;i++){
      const actual=selections[i],expected=plan.selections[i];
      if(JSON.stringify(actual)===JSON.stringify(expected))continue;
      if(expected.subjectId!==null||actual.sourceId!==expected.sourceId||actual.sourceVersion!==expected.sourceVersion||
       !uuid(actual.subjectId)||actual.reason!=='retained-supported-subject')bad();
     }
    }catch{corrupt();}
    return freeze({status:'published',subjects,selections});
   }catch(error){throw storage(error);}
  },
  async candidates(rawJson){
   const a=fields(parsed(rawJson,32768),['generation','representationHash','scopes']);
   if(!id(a.generation)||!hash(a.representationHash))bad();const scopes=list(a.scopes,128);if(!scopes.length)bad();
   for(const v of scopes){const c=fields(v,['focusKey','contextRootId']);if(!hash(c.focusKey)||c.contextRootId!==null&&!id(c.contextRootId))bad();}
   try{
    const raw=await database.query('SELECT canonical_v4.named_candidates($1,$2,$3::jsonb) AS result',[a.generation,a.representationHash,JSON.stringify(scopes)]);
    try{
     const seen=new Set(),rows=list(result(raw),64).map(v=>{
      const c=fields(v,['subjectId','revision','focusKey','contextRootId','prototypeValues','representationHash','parentId']);
      const vector=list(c.prototypeValues,384);
      if(!uuid(c.subjectId)||seen.has(c.subjectId)||!count(c.revision)||c.revision==='0'||!hash(c.focusKey)||c.contextRootId!==null&&!id(c.contextRootId)||
       c.representationHash!==a.representationHash||c.parentId!==null&&(!uuid(c.parentId)||c.parentId===c.subjectId)||vector.length!==384||
       vector.some(x=>typeof x!=='number'||!Number.isFinite(x))||Math.abs(Math.hypot(...vector)-1)>1e-5||
       !scopes.some(s=>s.focusKey===c.focusKey&&s.contextRootId===c.contextRootId))bad();
      seen.add(c.subjectId);return {...c,prototypeValues:vector};
     });return freeze(rows);
    }catch{corrupt();}
   }catch(error){throw storage(error);}
  },
  async source(rawJson){
   const a=fields(parsed(rawJson,1024),['generation','sourceId']);if(!id(a.generation)||!id(a.sourceId))bad();
   try{
    const raw=await database.query('SELECT canonical_v4.named_read_source($1,$2) AS result',[a.generation,a.sourceId]);
    try{
     const value=result(raw);if(value===null)return null;
     const r=fields(value,['generation','sourceId','sourceVersion','pageTitle','subject']);
     if(r.generation!==a.generation||r.sourceId!==a.sourceId||!count(r.sourceVersion)||typeof r.pageTitle!=='string'||r.pageTitle.length>200)bad();
     if(r.subject!==null){const s=fields(r.subject,['id','revision','title','parentId','ancestorPath']);
      if(!uuid(s.id)||!count(s.revision)||s.revision==='0'||typeof s.title!=='string'||!s.title.trim()||s.title.length>160||
       s.parentId!==null&&!uuid(s.parentId)||list(s.ancestorPath,8).some(v=>!id(v)))bad();r.subject=s;
     }return freeze(r);
    }catch{corrupt();}
   }catch(error){throw storage(error);}
  },
 });
}
