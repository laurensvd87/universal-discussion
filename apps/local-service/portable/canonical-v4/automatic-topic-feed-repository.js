// Explicit hierarchy18 read/derived-worker adapter. Import starts no IO; no
// Source assignment, canonical retargeting, model or current-page dependency.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {ServiceError} from '../../src/domain/errors.js';
const bad=()=>{throw new ServiceError('invalid','Invalid topic feed request');};
const corrupt=()=>{throw new ServiceError('storage-corrupt','Invalid topic feed result');};
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v);
const unsafe=/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const ordinal=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/u.test(v)&&BigInt(v)<=9223372036854775807n;
const freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
function fields(v,keys){if(!v||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)bad();
 const r={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();r[k]=d.value;}return r;}
function parsed(raw,max=8192){if(typeof raw!=='string'||Buffer.byteLength(raw)>max)bad();try{return JSON.parse(raw);}catch{bad();}}
function input(raw,extra=[]){const a=fields(parsed(raw),['generation',...extra]);if(!id(a.generation))bad();return a;}
function one(r){if(!Array.isArray(r?.rows)||r.rows.length!==1)bad();return fields(r.rows[0],['result']).result;}
function route(kind,key){if(kind==='semantic')return searchRoute('fixed',key,true);
 if(!['page','named'].includes(kind)||!id(key)||kind==='named'&&!uuid(key))bad();return (kind==='named'?'subject-':'page-')+key;}
function scope(nodeId){if(typeof nodeId!=='string')bad();const kind=nodeId.startsWith('subject-')?'named':nodeId.startsWith('page-')?'page':null;
 const key=nodeId.slice(kind==='named'?8:5);if(route(kind,key)!==nodeId)bad();return {kind,key};}
export function isAutomaticTopicRoute(value){try{scope(value);return true;}catch{return false;}}
export function isLegacyTopicRoute(value){return typeof value==='string'&&value.startsWith('legacy-')&&id(value.slice(7));}
function searchRoute(kind,key,unified){
 if(unified&&kind==='legacy'){if(!id(key))bad();return 'legacy-'+key;}
 if(unified&&kind==='fixed'){if(typeof key!=='string'||!key.trim()||!key.isWellFormed()||key.length>160||unsafe.test(key)||/^(subject|page|legacy)-/u.test(key))bad();return key;}
 return route(kind,key);
}
function storage(e){if(e instanceof ServiceError)return e;
 if(['P1301','40001','23503','23505'].includes(e?.code))return new ServiceError('conflict','Topics changed; retry this view');
 if(e?.code==='P1303')return new ServiceError('invalid','Invalid topic feed request');
 return new ServiceError('storage-failure','Topic feed unavailable');}
function terms(query){if(typeof query!=='string'||query.length>256||!query.isWellFormed()||unsafe.test(query))bad();
 const normalized=query.normalize('NFKC').toLowerCase(),tokens=normalized.match(/[\p{L}\p{N}]+/gu)??[];
 if(normalized.length>1024||tokens.length>8||tokens.some(t=>t.length>64)||query.trim()&&tokens.length===0)bad();return [...new Set(tokens)];}
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function publicBreadcrumbs(value,row){
 const v=fields(value,['fixed','topic']);
 const group=(items,fixed)=>{
  if(!Array.isArray(items)||items.length>8)bad();
  return items.map(raw=>{const item=fields(raw,['nodeId','label']);
   if(fixed)searchRoute('fixed',item.nodeId,true);
   else if(row.scope_kind==='named'){if(scope(item.nodeId).kind!=='named')bad();}
   else if(item.nodeId!==row.nodeId)bad();
   if(typeof item.label!=='string'||!item.label.trim()||!item.label.isWellFormed()||item.label.length>200||unsafe.test(item.label))bad();
   return item;
  });
 };
 const fixed=group(v.fixed,true),topic=group(v.topic,false),all=[...fixed,...topic];
 if(!all.length||new Set(all.map(x=>x.nodeId)).size!==all.length||all.at(-1).nodeId!==row.nodeId||all.at(-1).label!==row.caption)bad();
 if(row.scope_kind==='fixed'){
  if(topic.length||JSON.stringify(fixed.map(x=>x.nodeId))!==JSON.stringify(row.path))bad();
 }else{
  if(!topic.length)bad();
  if(row.scope_kind==='named'){
   if(topic.length!==1&&JSON.stringify(topic.map(x=>x.nodeId))!==JSON.stringify(row.path))bad();
   if(topic.length===1&&row.path.length>1&&fixed.length)bad();
  }else if(fixed.length||topic.length!==1)bad();
 }
 return {fixed,topic};
}
function position(value,binding,unified=false){if(value===null)return null;
 if(typeof value!=='string'||value.length>2048||!/^[A-Za-z0-9_-]+$/u.test(value))bad();const bytes=Buffer.from(value,'base64url');
 if(bytes.toString('base64url')!==value)bad();const c=fields(parsed(bytes.toString('utf8'),1536),['schema','binding','after']);
 if(c.schema!==(unified?'unified-topic-search/v1':'named-topic-search/v1'))bad();if(c.binding!==binding)throw new ServiceError('conflict','Topic search changed');
 const a=fields(c.after,['human','ordinal','kind','id']);if(typeof a.human!=='boolean'||!ordinal(a.ordinal))bad();searchRoute(a.kind,a.id,unified);return a;}

export function createAutomaticTopicFeedRepository({database,unifiedSearch=false,breadcrumbs=false}={}){
 if(!database||typeof database.query!=='function'||typeof unifiedSearch!=='boolean'||typeof breadcrumbs!=='boolean'||breadcrumbs&&!unifiedSearch)throw new TypeError('Invalid topic feed dependencies');
 return Object.freeze({
  async tasks(raw){const a=input(raw);try{
   const r=one(await database.query('SELECT canonical_v4.named_feed_tasks($1) AS result',[a.generation]));
   try{if(!Array.isArray(r)||r.length>8||r.some(v=>!ordinal(v)||v==='0')||new Set(r).size!==r.length)bad();return freeze(r);}catch{corrupt();}
  }catch(e){throw storage(e);}},
  async process(raw){const a=input(raw,['eventId']);if(!ordinal(a.eventId)||a.eventId==='0')bad();try{
   const r=one(await database.query('SELECT canonical_v4.named_process_feed_event($1,$2::bigint) AS result',[a.generation,a.eventId]));
   if(!['completed','advanced','busy','retired'].includes(r))corrupt();return r;
  }catch(e){throw storage(e);}},
  async feedReferences(raw){const a=input(raw,['nodeId','beforeOrdinal','limit']),legacy=unifiedSearch&&isLegacyTopicRoute(a.nodeId),s=legacy?{key:a.nodeId.slice(7)}:scope(a.nodeId);
   if(a.beforeOrdinal!==null&&!ordinal(a.beforeOrdinal)||!Number.isInteger(a.limit)||a.limit<1||a.limit>100)bad();
   try{const r=await database.query(legacy?'SELECT * FROM canonical_v4.unified_read_legacy_feed($1,$2,$3::bigint,$4)':'SELECT * FROM canonical_v4.named_read_feed($1,$2,$3,$4::bigint,$5)',
    legacy?[a.generation,s.key,a.beforeOrdinal,a.limit]:[a.generation,s.kind,s.key,a.beforeOrdinal,a.limit]);
    try{if(!Array.isArray(r.rows)||r.rows.length>a.limit)bad();let previous=a.beforeOrdinal;const seen=new Set();
     const references=r.rows.map(raw=>{const v=fields(raw,['root_id','discussion_id','topic_id','root_ordinal']);
      if(!id(v.root_id)||!id(v.discussion_id)||!id(v.topic_id)||!ordinal(v.root_ordinal)||previous!==null&&BigInt(v.root_ordinal)>=BigInt(previous)||seen.has(v.root_id))bad();
      previous=v.root_ordinal;seen.add(v.root_id);return {rootId:v.root_id,discussionId:v.discussion_id,topicId:v.topic_id,ordinal:v.root_ordinal};});
     return freeze({generation:a.generation,nodeId:a.nodeId,references});
    }catch{corrupt();}
   }catch(e){throw storage(e);}
  },
  async contains(raw){const a=input(raw,['nodeId','rootId']);scope(a.nodeId);if(!id(a.rootId))bad();try{
   const r=one(await database.query('SELECT canonical_v4.named_root_in_scope($1,$2,$3) AS result',[a.generation,a.nodeId,a.rootId]));
   if(typeof r!=='boolean')corrupt();return r;
  }catch(e){throw storage(e);}},
  async rootContexts(raw){const a=input(raw,['rootIds']);if(!Array.isArray(a.rootIds)||a.rootIds.length>100||a.rootIds.some(v=>!id(v))||new Set(a.rootIds).size!==a.rootIds.length)bad();
   try{const result=one(await database.query('SELECT canonical_v4.named_read_root_contexts($1,$2::text[]) AS result',[a.generation,a.rootIds]));
    try{if(!Array.isArray(result)||result.length>a.rootIds.length)bad();const seen=new Set();const rows=result.map(raw=>{
     const v=fields(raw,['rootId','scope']),s=fields(v.scope,['kind','id','caption']);route(s.kind,s.id);
     if(!a.rootIds.includes(v.rootId)||seen.has(v.rootId)||typeof s.caption!=='string'||!s.caption.trim()||!s.caption.isWellFormed()||s.caption.length>200||unsafe.test(s.caption))bad();
     seen.add(v.rootId);return {rootId:v.rootId,scope:s};});return freeze(rows);
    }catch{corrupt();}
   }catch(e){throw storage(e);}
  },
  async search(raw){const a=input(raw,['query','limit','cursor']),tokens=terms(a.query);
   if(!Number.isInteger(a.limit)||a.limit<1||a.limit>50)bad();
   const schema=unifiedSearch?'unified-topic-search/v1':'named-topic-search/v1',binding=digest([schema,a.generation,tokens,a.limit]),after=position(a.cursor,binding,unifiedSearch);
   try{const r=await database.query(breadcrumbs?'SELECT * FROM canonical_v4.combined_search_topics($1,$2::text[],$3::jsonb,$4)':unifiedSearch?'SELECT * FROM canonical_v4.unified_search_topics($1,$2::text[],$3::jsonb,$4)':'SELECT * FROM canonical_v4.named_search_topics($1,$2::text[],$3::jsonb,$4)',
     [a.generation,tokens,after===null?null:JSON.stringify(after),a.limit+1]);
    try{if(!Array.isArray(r.rows)||r.rows.length>a.limit+1)bad();const seen=new Set();
     const rows=r.rows.map(raw=>{const v=fields(raw,['scope_kind','scope_id','caption','path','human','root_ordinal','occupied',...(breadcrumbs?['breadcrumbs']:[])]),nodeId=searchRoute(v.scope_kind,v.scope_id,unifiedSearch);
      if(typeof v.caption!=='string'||!v.caption.trim()||!v.caption.isWellFormed()||v.caption.length>200||unsafe.test(v.caption)||
        typeof v.human!=='boolean'||typeof v.occupied!=='boolean'||v.human&&!v.occupied||!ordinal(v.root_ordinal)||
        !Array.isArray(v.path)||v.path.length<1||v.path.length>8||v.path.at(-1)!==nodeId||new Set(v.path).size!==v.path.length||seen.has(nodeId))bad();
      for(const p of v.path){if(unifiedSearch&&v.scope_kind==='fixed')searchRoute('fixed',p,true);else if(unifiedSearch&&v.scope_kind==='legacy'){if(v.path.length!==1)bad();}else scope(p);}
      seen.add(nodeId);return {...v,nodeId,...(breadcrumbs?{breadcrumbs:publicBreadcrumbs(v.breadcrumbs,{...v,nodeId})}:{})};});
     const selected=rows.slice(0,a.limit),last=selected.at(-1),nextCursor=rows.length>a.limit?Buffer.from(JSON.stringify({schema,binding,
      after:{human:last.human,ordinal:last.root_ordinal,kind:last.scope_kind,id:last.scope_id}})).toString('base64url'):null;
     return freeze({generation:a.generation,topics:selected.map(v=>({nodeId:v.nodeId,label:v.caption,path:v.path,occupied:v.occupied,human:v.human,...(breadcrumbs?{breadcrumbs:v.breadcrumbs}:{})})),nextCursor});
    }catch{corrupt();}
   }catch(e){throw storage(e);}
  },
 });
}
